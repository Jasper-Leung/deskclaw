/**
 * RAG (Retrieval Augmented Generation) Service
 * Provides context retrieval and caching for LLM queries
 */

import type { Database } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import * as vectorStore from '../embeddings/vector-store.js';
import * as embeddings from '../embeddings/service.js';

export interface RAGContext {
  content: string;
  source: string;
  relevanceScore: number;
  metadata?: Record<string, unknown>;
}

export interface RAGOptions {
  maxContexts?: number;
  minRelevance?: number;
  includeMetadata?: boolean;
  useCache?: boolean;
  cacheTTL?: number;
}

export interface RAGResult {
  query: string;
  contexts: RAGContext[];
  cached: boolean;
  retrievalTime: number;
}

/**
 * Generate hash for query caching
 */
function generateQueryHash(query: string): string {
  // Simple hash function (in production, use proper crypto hash)
  let hash = 0;
  for (let i = 0; i < query.length; i++) {
    const char = query.charCodeAt(i);
    hash = ((hash << 5) - hash + char) & 0xffffffff;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Retrieve contexts for a query using RAG
 */
export async function retrieveContexts(
  db: Database,
  query: string,
  options: RAGOptions = {}
): Promise<RAGResult> {
  const startTime = Date.now();
  const {
    maxContexts = 5,
    minRelevance = 0.6,
    includeMetadata = false,
    useCache = true,
    cacheTTL = 24 * 60 * 60 * 1000, // 24 hours
  } = options;

  // Check cache first
  const queryHash = generateQueryHash(query);

  if (useCache) {
    const cachedResult = db
      .prepare(
        'SELECT retrieved_contexts_json FROM rag_context_cache WHERE query_hash = ? AND last_accessed > ?'
      )
      .get(queryHash, Date.now() - cacheTTL) as { retrieved_contexts_json: string } | undefined;

    if (cachedResult) {
      // Update cache hit count and last accessed
      db.prepare(
        'UPDATE rag_context_cache SET cache_hit_count = cache_hit_count + 1, last_accessed = ? WHERE query_hash = ?'
      ).run(Date.now(), queryHash);

      return {
        query,
        contexts: JSON.parse(cachedResult.retrieved_contexts_json),
        cached: true,
        retrievalTime: Date.now() - startTime,
      };
    }
  }

  // Perform semantic search
  const searchResults = await vectorStore.vectorSearch(db, query, {
    limit: maxContexts,
    threshold: minRelevance,
  });

  // Convert to RAG contexts
  const contexts: RAGContext[] = [];

  for (const result of searchResults) {
    const context: RAGContext = {
      content: result.content,
      source: `${result.contentType}:${result.contentId}`,
      relevanceScore: result.similarity,
    };

    if (includeMetadata) {
      // Fetch additional metadata based on content type
      context.metadata = await fetchMetadata(db, result.contentType, result.contentId);
    }

    contexts.push(context);
  }

  // Cache the results
  if (contexts.length > 0) {
    try {
      const cacheId = randomUUID();
      db.prepare(
        `INSERT INTO rag_context_cache (id, query_hash, retrieved_contexts_json, cache_hit_count, created_at, last_accessed)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(cacheId, queryHash, JSON.stringify(contexts), 0, Date.now(), Date.now());
    } catch (error) {
      console.error('Error caching RAG contexts:', error);
    }
  }

  return {
    query,
    contexts,
    cached: false,
    retrievalTime: Date.now() - startTime,
  };
}

/**
 * Fetch metadata for a content item
 */
async function fetchMetadata(
  db: Database,
  contentType: string,
  contentId: string
): Promise<Record<string, unknown> | undefined> {
  try {
    switch (contentType) {
      case 'message': {
        const message = db
          .prepare('SELECT channel_id, peer_id, timestamp FROM channel_messages WHERE id = ?')
          .get(contentId) as any;
        return message
          ? {
              channelId: message.channel_id,
              peerId: message.peer_id,
              timestamp: message.timestamp,
            }
          : undefined;
      }

      case 'memory': {
        const memory = db
          .prepare('SELECT agent_id, importance, created_at FROM memories WHERE id = ?')
          .get(contentId) as any;
        return memory
          ? {
              agentId: memory.agent_id,
              importance: memory.importance,
              createdAt: memory.created_at,
            }
          : undefined;
      }

      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
}

/**
 * Build augmented prompt with RAG contexts
 */
export function buildAugmentedPrompt(
  basePrompt: string,
  query: string,
  ragResult: RAGResult,
  options: { includeRelevanceScores?: boolean; maxContextLength?: number } = {}
): string {
  const { includeRelevanceScores = false, maxContextLength = 2000 } = options;

  if (ragResult.contexts.length === 0) {
    return `${basePrompt}\n\nUser: ${query}`;
  }

  let contextSection = 'Context:\n';

  let currentLength = contextSection.length;

  for (const context of ragResult.contexts) {
    let contextText = `\n[${context.source}]`;

    if (includeRelevanceScores) {
      contextText += ` (relevance: ${(context.relevanceScore * 100).toFixed(1)}%)`;
    }

    contextText += `\n${context.content}\n`;

    if (currentLength + contextText.length > maxContextLength) {
      contextText = contextText.substring(0, maxContextLength - currentLength) + '...\n';
      contextSection += contextText;
      break;
    }

    contextSection += contextText;
    currentLength += contextText.length;
  }

  return `${basePrompt}\n\n${contextSection}\nUser: ${query}`;
}

/**
 * Hybrid RAG (vector + keyword search)
 */
export async function hybridRetrieveContexts(
  db: Database,
  query: string,
  options: RAGOptions & { keywordWeight?: number; vectorWeight?: number } = {}
): Promise<RAGResult> {
  const startTime = Date.now();
  const { keywordWeight = 0.3, vectorWeight = 0.7, ...ragOptions } = options;

  // Perform hybrid search
  const searchResults = await vectorStore.hybridSearch(db, query, {
    limit: ragOptions.maxContexts || 5,
    threshold: ragOptions.minRelevance || 0.5,
    keywordWeight,
    vectorWeight,
  });

  // Convert to RAG contexts
  const contexts: RAGContext[] = searchResults.map((result) => ({
    content: result.content,
    source: `${result.contentType}:${result.contentId}`,
    relevanceScore: result.similarity,
    metadata: result.metadata,
  }));

  return {
    query,
    contexts,
    cached: false,
    retrievalTime: Date.now() - startTime,
  };
}

/**
 * Clear RAG cache
 */
export function clearCache(db: Database, olderThan?: number): number {
  let sql = 'DELETE FROM rag_context_cache';
  const params: any[] = [];

  if (olderThan) {
    sql += ' WHERE last_accessed < ?';
    params.push(olderThan);
  }

  const result = db.prepare(sql).run(...params);
  return result.changes;
}

/**
 * Get cache statistics
 */
export function getCacheStats(db: Database): {
  totalEntries: number;
  totalHits: number;
  avgHitCount: number;
  oldestEntry: number;
  newestEntry: number;
  hitRate: number;
} {
  const stats = db
    .prepare(
      `SELECT
        COUNT(*) as total_entries,
        SUM(cache_hit_count) as total_hits,
        AVG(cache_hit_count) as avg_hit_count,
        MIN(created_at) as oldest_entry,
        MAX(last_accessed) as newest_entry
       FROM rag_context_cache`
    )
    .get() as any;

  return {
    totalEntries: stats.total_entries || 0,
    totalHits: stats.total_hits || 0,
    avgHitCount: stats.avg_hit_count || 0,
    oldestEntry: stats.oldest_entry || 0,
    newestEntry: stats.newest_entry || 0,
    hitRate: stats.total_entries > 0 ? (stats.total_hits || 0) / stats.total_entries : 0,
  };
}

/**
 * Prefetch contexts for a query
 */
export async function prefetchContexts(
  db: Database,
  queries: string[],
  options: RAGOptions = {}
): Promise<void> {
  for (const query of queries) {
    try {
      await retrieveContexts(db, query, options);
    } catch (error) {
      console.error(`Error prefetching contexts for query "${query}":`, error);
    }
  }
}

/**
 * Get RAG statistics
 */
export function getRAGStats(db: Database): {
  totalCacheEntries: number;
  avgRetrievalTime: number;
  cacheHitRate: number;
  totalContextsRetrieved: number;
} {
  const cacheStats = getCacheStats(db);

  const retrievalTimes = db
    .prepare('SELECT metadata_json FROM rag_context_cache WHERE metadata_json IS NOT NULL')
    .all() as Array<{ metadata_json: string }>;

  let totalRetrievalTime = 0;
  let count = 0;

  for (const row of retrievalTimes) {
    try {
      const metadata = JSON.parse(row.metadata_json);
      if (metadata.retrievalTime) {
        totalRetrievalTime += metadata.retrievalTime;
        count++;
      }
    } catch {
      // Skip invalid entries
    }
  }

  return {
    totalCacheEntries: cacheStats.totalEntries,
    avgRetrievalTime: count > 0 ? totalRetrievalTime / count : 0,
    cacheHitRate: cacheStats.hitRate,
    totalContextsRetrieved: cacheStats.totalHits,
  };
}

/**
 * Update cache entry metadata
 */
export function updateCacheMetadata(
  db: Database,
  queryHash: string,
  metadata: Record<string, unknown>
): boolean {
  const result = db
    .prepare('UPDATE rag_context_cache SET metadata_json = ? WHERE query_hash = ?')
    .run(JSON.stringify(metadata), queryHash);

  return result.changes > 0;
}

/**
 * Delete specific cache entry
 */
export function deleteCacheEntry(db: Database, query: string): boolean {
  const queryHash = generateQueryHash(query);
  const result = db.prepare('DELETE FROM rag_context_cache WHERE query_hash = ?').run(queryHash);
  return result.changes > 0;
}

/**
 * Export cache entries
 */
export function exportCacheEntries(
  db: Database,
  limit: number = 100
): Array<{
  queryHash: string;
  contexts: RAGContext[];
  hitCount: number;
  createdAt: number;
  lastAccessed: number;
}> {
  const results = db
    .prepare(
      `SELECT query_hash, retrieved_contexts_json, cache_hit_count, created_at, last_accessed
       FROM rag_context_cache
       ORDER BY cache_hit_count DESC
       LIMIT ?`
    )
    .all(limit) as any[];

  return results.map((row) => ({
    queryHash: row.query_hash,
    contexts: JSON.parse(row.retrieved_contexts_json),
    hitCount: row.cache_hit_count,
    createdAt: row.created_at,
    lastAccessed: row.last_accessed,
  }));
}
