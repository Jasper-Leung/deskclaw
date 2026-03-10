/**
 * IPC Handlers for Enhanced Memory Service
 */

import type { Database } from 'better-sqlite3';
import * as memory from '../memory/service.js';

// ============================================================================
// BASIC MEMORY HANDLERS (backward compatible with existing)
// ============================================================================

export const memoryList = (db: Database) => {
  return db
    .prepare(
      'SELECT id, agent_id, content, importance, created_at FROM memories ORDER BY importance DESC, created_at DESC'
    )
    .all();
};

export const memoryCreate = (
  db: Database,
  data: { agentId: string; content: string; importance?: number }
) => {
  return memory.createMemory(db, data.agentId, data.content, data.importance);
};

export const memoryUpdate = (
  db: Database,
  id: string,
  data: { content?: string; importance?: number }
) => {
  return memory.updateMemory(db, id, data);
};

export const memoryDelete = (db: Database, id: string) => {
  return memory.deleteMemory(db, id);
};

// ============================================================================
// ENHANCED MEMORY HANDLERS
// ============================================================================

export const memoryGet = (db: Database, memoryId: string) => {
  return memory.getMemory(db, memoryId);
};

export const memoryGetAgentMemories = (db: Database, agentId: string, limit?: number) => {
  return memory.getAgentMemories(db, agentId, limit);
};

export const memorySearch = (
  db: Database,
  agentId: string,
  query: string,
  options?: memory.MemorySearchOptions
) => {
  return memory.searchMemories(db, agentId, query, options);
};

export const memorySemanticSearch = async (
  db: Database,
  agentId: string,
  query: string,
  options?: memory.MemorySearchOptions
) => {
  return await memory.semanticSearchMemories(db, agentId, query, options);
};

export const memoryRetrieveForLLM = async (
  db: Database,
  agentId: string,
  query: string,
  conversationContext?: string,
  options?: {
    maxMemories?: number;
    minImportance?: number;
    useSemantic?: boolean;
    includeRecent?: boolean;
  }
) => {
  return await memory.retrieveMemoriesForLLM(db, agentId, query, conversationContext, options);
};

export const memoryInjectIntoMessages = async (
  db: Database,
  agentId: string,
  messages: Array<{ role: string; content: string }>,
  options?: {
    maxMemories?: number;
    minImportance?: number;
    useSemantic?: boolean;
  }
) => {
  return await memory.injectMemoriesIntoMessages(db, agentId, messages, options);
};

export const memoryGetStats = (db: Database, agentId?: string) => {
  return memory.getMemoryStats(db, agentId);
};

export const memoryCreateFromConversation = (
  db: Database,
  agentId: string,
  conversation: Array<{ role: string; content: string }>,
  options?: {
    minImportance?: number;
    extractFacts?: boolean;
  }
) => {
  return memory.createMemoriesFromConversation(db, agentId, conversation, options);
};

export const memoryUpdateImportance = (db: Database, memoryId: string, delta: number) => {
  return memory.updateMemoryImportance(db, memoryId, delta);
};

export const memoryCleanup = (
  db: Database,
  agentId: string,
  options?: {
    olderThan?: number;
    maxCount?: number;
    minImportance?: number;
  }
) => {
  return memory.cleanupMemories(db, agentId, options);
};

export const memoryGetByImportance = (
  db: Database,
  agentId: string,
  minImportance: number,
  maxImportance: number,
  limit?: number
) => {
  return memory.getMemoriesByImportance(db, agentId, minImportance, maxImportance, limit);
};

export const memoryBatchDelete = (db: Database, memoryIds: string[]) => {
  let deleted = 0;
  for (const id of memoryIds) {
    if (memory.deleteMemory(db, id)) {
      deleted++;
    }
  }
  return { deleted };
};

export const memoryGetAllAgents = (db: Database) => {
  return db.prepare('SELECT DISTINCT agent_id FROM memories ORDER BY agent_id').all() as Array<{
    agent_id: string;
  }>;
};

export const memoryExportAgent = (db: Database, agentId: string) => {
  return memory.getAgentMemories(db, agentId);
};

export const memoryImportAgent = (
  db: Database,
  agentId: string,
  memories: Array<{ content: string; importance?: number }>
) => {
  const imported: Array<{ id: string; content: string; importance: number }> = [];

  for (const mem of memories) {
    const created = memory.createMemory(db, agentId, mem.content, mem.importance);
    imported.push({
      id: created.id,
      content: created.content,
      importance: created.importance,
    });
  }

  return { imported, count: imported.length };
};
