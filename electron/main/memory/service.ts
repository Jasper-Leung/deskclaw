/**
 * Enhanced Memory Service
 * Provides memory retrieval, semantic search, and LLM injection
 */

import type { Database } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import * as embeddings from '../embeddings/service.js';
import * as vectorStore from '../embeddings/vector-store.js';
import { memoryLogger } from '../lib/logger.js';

export interface Memory {
  id: string;
  agentId: string;
  content: string;
  embedding?: number[];
  importance: number;
  createdAt: number;
  updatedAt?: number;
  metadata?: Record<string, unknown>;
}

export interface MemorySearchOptions {
  limit?: number;
  minImportance?: number;
  useSemanticSearch?: boolean;
  minSimilarity?: number;
}

export interface MemoryContext {
  memories: Memory[];
  formattedForLLM: string;
  retrievalMethod: 'semantic' | 'recent' | 'importance';
  totalMemories: number;
}

/**
 * Create a new memory
 */
export function createMemory(
  db: Database,
  agentId: string,
  content: string,
  importance: number = 1.0,
  metadata?: Record<string, unknown>
): Memory {
  const id = randomUUID();
  const now = Date.now();

  db.prepare(
    `INSERT INTO memories (id, agent_id, content, importance, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, agentId, content, importance, now);

  return {
    id,
    agentId,
    content,
    importance,
    createdAt: now,
    metadata,
  };
}

/**
 * Get memory by ID
 */
export function getMemory(db: Database, memoryId: string): Memory | undefined {
  const result = db.prepare('SELECT * FROM memories WHERE id = ?').get(memoryId) as any;
  if (!result) return undefined;

  return {
    id: result.id,
    agentId: result.agent_id,
    content: result.content,
    importance: result.importance,
    createdAt: result.created_at,
  };
}

/**
 * Get all memories for an agent
 */
export function getAgentMemories(db: Database, agentId: string, limit?: number): Memory[] {
  let query = 'SELECT * FROM memories WHERE agent_id = ? ORDER BY importance DESC, created_at DESC';
  const params: any[] = [agentId];

  if (limit) {
    query += ' LIMIT ?';
    params.push(limit);
  }

  const results = db.prepare(query).all(...params) as any[];

  return results.map((row) => ({
    id: row.id,
    agentId: row.agent_id,
    content: row.content,
    importance: row.importance,
    createdAt: row.created_at,
  }));
}

/**
 * Update memory
 */
export function updateMemory(
  db: Database,
  memoryId: string,
  updates: Partial<Pick<Memory, 'content' | 'importance' | 'metadata'>>
): Memory | undefined {
  const existing = getMemory(db, memoryId);
  if (!existing) return undefined;

  const fields: string[] = [];
  const values: any[] = [];

  if (updates.content !== undefined) {
    fields.push('content = ?');
    values.push(updates.content);
  }
  if (updates.importance !== undefined) {
    fields.push('importance = ?');
    values.push(updates.importance);
  }

  if (fields.length === 0) return existing;

  values.push(memoryId);
  db.prepare(`UPDATE memories SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  return getMemory(db, memoryId);
}

/**
 * Delete memory
 */
export function deleteMemory(db: Database, memoryId: string): boolean {
  const result = db.prepare('DELETE FROM memories WHERE id = ?').run(memoryId);
  return result.changes > 0;
}

/**
 * Search memories by content (keyword search)
 */
export function searchMemories(
  db: Database,
  agentId: string,
  query: string,
  options: MemorySearchOptions = {}
): Memory[] {
  const { limit = 20, minImportance = 0 } = options;

  const results = db
    .prepare(
      `SELECT * FROM memories
       WHERE agent_id = ? AND importance >= ? AND content LIKE ?
       ORDER BY importance DESC, created_at DESC
       LIMIT ?`
    )
    .all(agentId, minImportance, `%${query}%`, limit) as any[];

  return results.map((row) => ({
    id: row.id,
    agentId: row.agent_id,
    content: row.content,
    importance: row.importance,
    createdAt: row.created_at,
  }));
}

/**
 * Semantically search memories
 */
export async function semanticSearchMemories(
  db: Database,
  agentId: string,
  query: string,
  options: MemorySearchOptions = {}
): Promise<Array<Memory & { similarity: number }>> {
  const { limit = 10, minSimilarity = 0.6, minImportance = 0 } = options;

  // First get memories meeting importance criteria
  const memories = db
    .prepare(
      `SELECT * FROM memories
       WHERE agent_id = ? AND importance >= ?
       ORDER BY importance DESC`
    )
    .all(agentId, minImportance) as Memory[];

  if (memories.length === 0) {
    return [];
  }

  // Generate query embedding
  const queryEmbedding = await embeddings.generateEmbedding(query);

  // Calculate similarity for each memory
  const results: Array<Memory & { similarity: number }> = [];

  for (const memory of memories) {
    // Check if memory has embedding in semantic_index
    const indexResult = db
      .prepare('SELECT embedding FROM semantic_index WHERE content_id = ? AND content_type = ?')
      .get(memory.id, 'memory') as { embedding: string } | undefined;

    let embedding: number[];

    if (indexResult) {
      embedding = indexResult.embedding.split(',').map(Number);
    } else {
      // Generate embedding on-the-fly
      embedding = await embeddings.generateEmbedding(memory.content);
      // Save to semantic index for future use
      await embeddings.generateSemanticIndexEmbedding(db, 'memory', memory.id, memory.content);
    }

    const similarity = embeddings.cosineSimilarity(queryEmbedding, embedding);

    if (similarity >= minSimilarity) {
      results.push({ ...memory, similarity });
    }
  }

  // Sort by similarity and limit
  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, limit);
}

/**
 * Retrieve relevant memories for LLM context
 */
export async function retrieveMemoriesForLLM(
  db: Database,
  agentId: string,
  query: string,
  conversationContext?: string,
  options: {
    maxMemories?: number;
    minImportance?: number;
    useSemantic?: boolean;
    includeRecent?: boolean;
  } = {}
): Promise<MemoryContext> {
  const {
    maxMemories = 5,
    minImportance = 0.5,
    useSemantic = true,
    includeRecent = true,
  } = options;

  let memories: Memory[] = [];
  let retrievalMethod: MemoryContext['retrievalMethod'] = 'importance';

  if (useSemantic) {
    // Try semantic search first
    try {
      const semanticResults = await semanticSearchMemories(db, agentId, query, {
        limit: maxMemories,
        minImportance,
        minSimilarity: 0.5,
      });

      if (semanticResults.length > 0) {
        memories = semanticResults.map(({ similarity, ...memory }) => memory);
        retrievalMethod = 'semantic';
      }
    } catch (error) {
      console.error('Semantic search failed, falling back to importance:', error);
    }
  }

  // If semantic search didn't yield results, fall back to importance
  if (memories.length === 0) {
    memories = getAgentMemories(db, agentId, maxMemories).filter(
      (m) => m.importance >= minImportance
    );
    retrievalMethod = 'importance';
  }

  // Include recent high-importance memories if requested
  if (includeRecent && memories.length < maxMemories) {
    const recentMemories = db
      .prepare(
        `SELECT * FROM memories
         WHERE agent_id = ? AND importance >= ?
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(agentId, minImportance, maxMemories - memories.length) as any[];

    for (const recent of recentMemories) {
      if (!memories.find((m) => m.id === recent.id)) {
        memories.push({
          id: recent.id,
          agentId: recent.agent_id,
          content: recent.content,
          importance: recent.importance,
          createdAt: recent.created_at,
        });
      }
    }
  }

  // Get total memory count
  const totalCount =
    (
      db.prepare('SELECT COUNT(*) as count FROM memories WHERE agent_id = ?').get(agentId) as {
        count: number;
      }
    ).count || 0;

  // Track memory access for importance adjustment
  try {
    const { trackMemoryAccess } = await import('./importance-adjuster.js');
    for (let i = 0; i < memories.length; i++) {
      trackMemoryAccess(db, memories[i].id, 'retrieved', {
        retrievalRank: i + 1,
        retrievalCount: memories.length,
        query: query.substring(0, 200),
      });
    }
  } catch (error) {
    // Silently fail if tracking is not available
    console.debug('Failed to track memory access:', error);
  }

  return {
    memories,
    formattedForLLM: formatMemoriesForLLM(memories, retrievalMethod),
    retrievalMethod,
    totalMemories: totalCount,
  };
}

/**
 * Format memories for LLM consumption
 */
function formatMemoriesForLLM(
  memories: Memory[],
  retrievalMethod: MemoryContext['retrievalMethod']
): string {
  if (memories.length === 0) {
    return '';
  }

  let formatted = `[Relevant Memories (${retrievalMethod})]\n`;

  for (let i = 0; i < memories.length; i++) {
    const memory = memories[i];
    formatted += `[${i + 1}] ${memory.content}`;

    if (memory.importance > 0.8) {
      formatted += ' (high importance)';
    }

    formatted += '\n';
  }

  return formatted;
}

/**
 * Inject memories into message list for LLM
 */
export async function injectMemoriesIntoMessages(
  db: Database,
  agentId: string,
  messages: Array<{ role: string; content: string }>,
  options: {
    maxMemories?: number;
    minImportance?: number;
    useSemantic?: boolean;
  } = {}
): Promise<Array<{ role: string; content: string }>> {
  // Get the last user message as query
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');

  if (!lastUserMessage) {
    return messages;
  }

  // Extract query from message
  const query = lastUserMessage.content.substring(0, 500); // Limit query length

  // Retrieve memories
  const memoryContext = await retrieveMemoriesForLLM(db, agentId, query, undefined, options);

  if (!memoryContext.formattedForLLM) {
    return messages;
  }

  // Find the system message position
  const systemIndex = messages.findIndex((m) => m.role === 'system');

  if (systemIndex >= 0) {
    // Inject after system message
    const newMessages = [...messages];
    newMessages.splice(systemIndex + 1, 0, {
      role: 'system',
      content: memoryContext.formattedForLLM,
    });
    return newMessages;
  } else {
    // No system message, add at beginning
    return [{ role: 'system', content: memoryContext.formattedForLLM }, ...messages];
  }
}

/**
 * Get memory statistics
 */
export function getMemoryStats(
  db: Database,
  agentId?: string
): {
  totalMemories: number;
  avgImportance: number;
  memoriesWithEmbeddings: number;
} {
  let query = 'SELECT COUNT(*) as count, AVG(importance) as avg_importance FROM memories';
  const params: any[] = [];

  if (agentId) {
    query += ' WHERE agent_id = ?';
    params.push(agentId);
  }

  const stats = db.prepare(query).get(...params) as { count: number; avg_importance: number };

  // Count memories with embeddings
  let embeddingQuery =
    'SELECT COUNT(DISTINCT content_id) as count FROM semantic_index WHERE content_type = ?';
  const embeddingParams = ['memory'];

  if (agentId) {
    embeddingQuery += ` AND content_id IN (SELECT id FROM memories WHERE agent_id = ?)`;
    embeddingParams.push(agentId);
  }

  const embeddingStats = db.prepare(embeddingQuery).get(...embeddingParams) as { count: number };

  return {
    totalMemories: stats.count || 0,
    avgImportance: stats.avg_importance || 0,
    memoriesWithEmbeddings: embeddingStats.count || 0,
  };
}

/**
 * Batch create memories from conversation
 */
export function createMemoriesFromConversation(
  db: Database,
  agentId: string,
  conversation: Array<{ role: string; content: string }>,
  options: {
    minImportance?: number;
    extractFacts?: boolean;
  } = {}
): Memory[] {
  const { minImportance = 0.3, extractFacts = false } = options;
  const memories: Memory[] = [];

  for (const message of conversation) {
    if (message.role === 'assistant' && message.content.length > 50) {
      // Create memory from assistant responses
      const importance = Math.min(1.0, message.content.length / 500);

      if (importance >= minImportance) {
        const memory = createMemory(db, agentId, message.content, importance, {
          source: 'conversation',
          originalMessage: message.content,
        });
        memories.push(memory);
      }
    }
  }

  return memories;
}

/**
 * Update memory importance based on usage
 */
export function updateMemoryImportance(
  db: Database,
  memoryId: string,
  delta: number
): Memory | undefined {
  const memory = getMemory(db, memoryId);
  if (!memory) return undefined;

  const newImportance = Math.max(0, Math.min(1, memory.importance + delta));
  return updateMemory(db, memoryId, { importance: newImportance });
}

/**
 * Clean up old/unimportant memories
 */
export function cleanupMemories(
  db: Database,
  agentId: string,
  options: {
    olderThan?: number;
    maxCount?: number;
    minImportance?: number;
  } = {}
): number {
  const {
    olderThan = Date.now() - 90 * 24 * 60 * 60 * 1000,
    maxCount = 1000,
    minImportance = 0.2,
  } = options;

  // Get current count
  const count =
    (
      db.prepare('SELECT COUNT(*) as count FROM memories WHERE agent_id = ?').get(agentId) as {
        count: number;
      }
    ).count || 0;

  if (count <= maxCount) {
    return 0;
  }

  // Delete old/unimportant memories
  const result = db
    .prepare(
      `DELETE FROM memories
       WHERE agent_id = ?
         AND (created_at < ? OR importance < ?)
         AND id NOT IN (
           SELECT id FROM memories
           WHERE agent_id = ?
           ORDER BY importance DESC
           LIMIT ?
         )`
    )
    .run(agentId, olderThan, minImportance, agentId, maxCount);

  return result.changes;
}

/**
 * Get memories by importance range
 */
export function getMemoriesByImportance(
  db: Database,
  agentId: string,
  minImportance: number,
  maxImportance: number,
  limit?: number
): Memory[] {
  let query = `SELECT * FROM memories
              WHERE agent_id = ? AND importance BETWEEN ? AND ?
              ORDER BY importance DESC, created_at DESC`;
  const params: any[] = [agentId, minImportance, maxImportance];

  if (limit) {
    query += ' LIMIT ?';
    params.push(limit);
  }

  const results = db.prepare(query).all(...params) as any[];

  return results.map((row) => ({
    id: row.id,
    agentId: row.agent_id,
    content: row.content,
    importance: row.importance,
    createdAt: row.created_at,
  }));
}
