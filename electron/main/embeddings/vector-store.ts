/**
 * Vector Store
 * Manages vector storage and similarity search
 */

import type { Database } from 'better-sqlite3';
import * as embeddings from './service.js';

export interface SearchResult {
  contentId: string;
  contentType: 'message' | 'memory' | 'document';
  content: string;
  similarity: number;
  metadata?: Record<string, unknown>;
}

export interface VectorSearchOptions {
  limit?: number;
  threshold?: number;
  contentType?: Array<'message' | 'memory' | 'document'>;
}

/**
 * Search for similar content using vector similarity
 */
export async function vectorSearch(
  db: Database,
  query: string,
  options: VectorSearchOptions = {}
): Promise<SearchResult[]> {
  const { limit = 10, threshold = 0.5, contentType } = options;

  // Generate embedding for query
  const queryEmbedding = await embeddings.generateEmbedding(query);

  // Get all embeddings from semantic index
  let sql = 'SELECT * FROM semantic_index WHERE 1=1';
  const params: any[] = [];

  if (contentType && contentType.length > 0) {
    sql += ` AND content_type IN (${contentType.map(() => '?').join(',')})`;
    params.push(...contentType);
  }

  const results = db.prepare(sql).all(...params) as any[];

  // Calculate similarity for each result
  const searchResults: SearchResult[] = [];

  for (const row of results) {
    const embedding = row.embedding.split(',').map(Number);
    const similarity = embeddings.cosineSimilarity(queryEmbedding, embedding);

    if (similarity >= threshold) {
      searchResults.push({
        contentId: row.content_id,
        contentType: row.content_type,
        content: row.chunk_text,
        similarity,
      });
    }
  }

  // Sort by similarity (descending) and limit results
  searchResults.sort((a, b) => b.similarity - a.similarity);
  return searchResults.slice(0, limit);
}

/**
 * Add content to semantic index
 */
export async function addToSemanticIndex(
  db: Database,
  contentType: 'message' | 'memory' | 'document',
  contentId: string,
  text: string,
  chunkSize: number = 500,
  overlap: number = 50
): Promise<string[]> {
  const entryIds: string[] = [];

  // Split text into chunks
  const chunks = splitTextIntoChunks(text, chunkSize, overlap);

  for (const chunk of chunks) {
    const entryId = await embeddings.generateSemanticIndexEmbedding(
      db,
      contentType,
      contentId,
      chunk
    );
    entryIds.push(entryId);
  }

  return entryIds;
}

/**
 * Search similar messages
 */
export async function searchSimilarMessages(
  db: Database,
  query: string,
  limit: number = 10,
  threshold: number = 0.5
): Promise<Array<{ messageId: string; content: string; similarity: number }>> {
  const results = await vectorSearch(db, query, {
    limit,
    threshold,
    contentType: ['message'],
  });

  return results.map((r) => ({
    messageId: r.contentId,
    content: r.content,
    similarity: r.similarity,
  }));
}

/**
 * Search similar memories
 */
export async function searchSimilarMemories(
  db: Database,
  query: string,
  limit: number = 10,
  threshold: number = 0.5
): Promise<Array<{ memoryId: string; content: string; similarity: number }>> {
  const results = await vectorSearch(db, query, {
    limit,
    threshold,
    contentType: ['memory'],
  });

  return results.map((r) => ({
    memoryId: r.contentId,
    content: r.content,
    similarity: r.similarity,
  }));
}

/**
 * Hybrid search (vector + keyword)
 */
export async function hybridSearch(
  db: Database,
  query: string,
  options: VectorSearchOptions & { keywordWeight?: number; vectorWeight?: number } = {}
): Promise<SearchResult[]> {
  const { keywordWeight = 0.3, vectorWeight = 0.7, ...vectorOptions } = options;

  // Get vector search results
  const vectorResults = await vectorSearch(db, query, vectorOptions);

  // Get keyword search results (simple LIKE search)
  const keywordResults = db
    .prepare(
      `SELECT
        si.content_id,
        si.content_type,
        si.chunk_text as content
       FROM semantic_index si
       WHERE si.chunk_text LIKE ?
       LIMIT ?`
    )
    .all(`%${query}%`, vectorOptions.limit || 10) as Array<{
    content_id: string;
    content_type: string;
    content: string;
  }>;

  // Combine and score results
  const combinedScores = new Map<string, SearchResult>();

  // Add vector results
  for (const result of vectorResults) {
    const key = `${result.contentType}:${result.contentId}`;
    combinedScores.set(key, {
      ...result,
      similarity: result.similarity * vectorWeight,
    });
  }

  // Add keyword results
  for (const result of keywordResults) {
    const key = `${result.content_type}:${result.content_id}`;
    const existing = combinedScores.get(key);

    if (existing) {
      existing.similarity += keywordWeight;
    } else {
      combinedScores.set(key, {
        contentId: result.content_id,
        contentType: result.content_type as any,
        content: result.content,
        similarity: keywordWeight,
      });
    }
  }

  // Convert to array and sort
  const results = Array.from(combinedScores.values())
    .filter((r) => r.similarity >= (options.threshold || 0.5))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, options.limit || 10);

  return results;
}

/**
 * Get semantic index statistics
 */
export function getSemanticIndexStats(db: Database): {
  totalEntries: number;
  entriesByType: Record<string, number>;
  avgChunkSize: number;
} {
  const totalEntries =
    (db.prepare('SELECT COUNT(*) as count FROM semantic_index').get() as { count: number }).count ||
    0;

  const byType = db
    .prepare('SELECT content_type, COUNT(*) as count FROM semantic_index GROUP BY content_type')
    .all() as Array<{ content_type: string; count: number }>;

  const entriesByType: Record<string, number> = {};
  for (const row of byType) {
    entriesByType[row.content_type] = row.count;
  }

  const avgChunkSize =
    (
      db.prepare('SELECT AVG(LENGTH(chunk_text)) as avg FROM semantic_index').get() as {
        avg: number;
      }
    )?.avg || 0;

  return {
    totalEntries,
    entriesByType,
    avgChunkSize,
  };
}

/**
 * Clear semantic index
 */
export function clearSemanticIndex(db: Database, contentType?: string): number {
  let sql = 'DELETE FROM semantic_index';
  const params: any[] = [];

  if (contentType) {
    sql += ' WHERE content_type = ?';
    params.push(contentType);
  }

  const result = db.prepare(sql).run(...params);
  return result.changes;
}

/**
 * Delete content from semantic index
 */
export function deleteFromSemanticIndex(db: Database, contentId: string): number {
  const result = db.prepare('DELETE FROM semantic_index WHERE content_id = ?').run(contentId);
  return result.changes;
}

/**
 * Rebuild semantic index for content type
 */
export async function rebuildSemanticIndex(
  db: Database,
  contentType: 'message' | 'memory' | 'document',
  options: { chunkSize?: number; overlap?: number; model?: embeddings.EmbeddingModel } = {}
): Promise<number> {
  const { chunkSize = 500, overlap = 50, model = 'local' } = options;

  // Clear existing index for this content type
  clearSemanticIndex(db, contentType);

  let indexed = 0;

  // Index based on content type
  if (contentType === 'message') {
    const messages = db
      .prepare('SELECT id, content FROM channel_messages WHERE content IS NOT NULL LIMIT 1000')
      .all() as Array<{ id: string; content: string }>;

    for (const message of messages) {
      try {
        await embeddings.generateSemanticIndexEmbedding(db, 'message', message.id, message.content);
        indexed++;
      } catch (error) {
        console.error(`Error indexing message ${message.id}:`, error);
      }
    }
  } else if (contentType === 'memory') {
    const memories = db
      .prepare('SELECT id, content FROM memories WHERE content IS NOT NULL')
      .all() as Array<{ id: string; content: string }>;

    for (const memory of memories) {
      try {
        await addToSemanticIndex(db, 'memory', memory.id, memory.content, chunkSize, overlap);
        indexed++;
      } catch (error) {
        console.error(`Error indexing memory ${memory.id}:`, error);
      }
    }
  }

  return indexed;
}

/**
 * Split text into chunks for embedding
 */
function splitTextIntoChunks(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    let chunk = text.substring(start, end);

    // Try to break at word boundary
    if (end < text.length) {
      const lastSpace = chunk.lastIndexOf(' ');
      if (lastSpace > chunkSize * 0.8) {
        chunk = chunk.substring(0, lastSpace);
      }
    }

    chunks.push(chunk.trim());
    start += chunk.length - overlap;
  }

  return chunks.filter((c) => c.length > 0);
}

/**
 * Get embedding cache statistics
 */
export function getCacheStats(db: Database): {
  totalCacheEntries: number;
  totalHits: number;
  avgHitCount: number;
  oldestEntry: number;
  newestEntry: number;
} {
  const totalEntries =
    (db.prepare('SELECT COUNT(*) as count FROM rag_context_cache').get() as { count: number })
      .count || 0;

  const hits =
    (
      db.prepare('SELECT SUM(cache_hit_count) as total FROM rag_context_cache').get() as {
        total: number;
      }
    )?.total || 0;

  const avgHitCount = totalEntries > 0 ? hits / totalEntries : 0;

  const oldestEntry =
    (
      db.prepare('SELECT MIN(created_at) as oldest FROM rag_context_cache').get() as {
        oldest: number;
      }
    )?.oldest || 0;

  const newestEntry =
    (
      db.prepare('SELECT MAX(last_accessed) as newest FROM rag_context_cache').get() as {
        newest: number;
      }
    )?.newest || 0;

  return {
    totalCacheEntries: totalEntries,
    totalHits: hits,
    avgHitCount,
    oldestEntry,
    newestEntry,
  };
}

/**
 * Clear RAG cache
 */
export function clearRAGCache(db: Database, olderThan?: number): number {
  let sql = 'DELETE FROM rag_context_cache';
  const params: any[] = [];

  if (olderThan) {
    sql += ' WHERE last_accessed < ?';
    params.push(olderThan);
  }

  const result = db.prepare(sql).run(...params);
  return result.changes;
}
