/**
 * IPC Handlers for Smart Memory Features
 * Provides intelligent memory creation, deduplication, and importance adjustment
 */

import type { Database } from 'better-sqlite3';
import * as evaluator from '../memory/evaluator.js';
import * as deduplication from '../memory/deduplication.js';
import * as importanceAdjuster from '../memory/importance-adjuster.js';
import { createMemory, getMemory } from '../memory/service.js';

// ============================================================================
// SMART MEMORY CREATION
// ============================================================================

export interface SmartMemoryCreateOptions {
  autoEvaluate?: boolean;
  checkDuplicates?: boolean;
  similarityThreshold?: number;
  trackCreation?: boolean;
}

/**
 * Intelligently create a memory with evaluation and deduplication
 */
export async function smartCreateMemory(
  db: Database,
  agentId: string,
  content: string,
  options: SmartMemoryCreateOptions = {}
): Promise<{
  success: boolean;
  memory?: { id: string; content: string; importance: number };
  reason: string;
  evaluation?: evaluator.MemoryEvaluationResult;
  duplicateCheck?: deduplication.DuplicateCheckResult;
}> {
  const {
    autoEvaluate = true,
    checkDuplicates = true,
    similarityThreshold = 0.85,
    trackCreation = true,
  } = options;

  // Step 1: Evaluate content
  let evaluation: evaluator.MemoryEvaluationResult | undefined;
  if (autoEvaluate) {
    const lastMemory = db
      .prepare(
        'SELECT created_at FROM memories WHERE agent_id = ? ORDER BY created_at DESC LIMIT 1'
      )
      .get(agentId) as { created_at: number } | undefined;

    const totalMemoryCount =
      (
        db.prepare('SELECT COUNT(*) as count FROM memories WHERE agent_id = ?').get(agentId) as {
          count: number;
        }
      ).count || 0;

    const recentMemoryCount =
      (
        db
          .prepare('SELECT COUNT(*) as count FROM memories WHERE agent_id = ? AND created_at > ?')
          .get(agentId, Date.now() - 24 * 60 * 60 * 1000) as { count: number }
      ).count || 0;

    const context: evaluator.EvaluationContext = {
      agentId,
      role: 'user', // Default to user, can be overridden
      conversationLength: 1,
      timeSinceLastMemory: lastMemory ? Date.now() - lastMemory.created_at : Infinity,
      recentMemoryCount,
      totalMemoryCount,
    };

    evaluation = evaluator.evaluateContentForMemory(db, content, context);

    if (!evaluation.shouldSave) {
      return {
        success: false,
        reason: `Evaluation rejected: ${evaluation.reason}`,
        evaluation,
      };
    }
  }

  // Step 2: Check for duplicates
  let duplicateCheck: deduplication.DuplicateCheckResult | undefined;
  if (checkDuplicates) {
    duplicateCheck = await deduplication.checkForDuplicateMemories(db, agentId, content, {
      similarityThreshold,
    });

    if (duplicateCheck.isDuplicate) {
      return {
        success: false,
        reason: `Duplicate detected: ${duplicateCheck.reason}`,
        evaluation,
        duplicateCheck,
      };
    }
  }

  // Step 3: Create memory with evaluated importance
  const importance = evaluation?.suggestedImportance ?? 0.5;
  const finalContent = evaluation?.extractedContent ?? content;

  const memory = createMemory(db, agentId, finalContent, importance, {
    evaluated: true,
    evaluation,
  });

  // Step 4: Track creation for importance adjustment
  if (trackCreation) {
    importanceAdjuster.trackMemoryAccess(db, memory.id, 'retrieved', {
      retrievalRank: 1,
      retrievalCount: 1,
    });
  }

  return {
    success: true,
    memory: {
      id: memory.id,
      content: memory.content,
      importance: memory.importance,
    },
    reason: 'Memory created successfully',
    evaluation,
    duplicateCheck,
  };
}

/**
 * Batch create memories from conversation with smart filtering
 */
export async function smartCreateMemoriesFromConversation(
  db: Database,
  agentId: string,
  messages: Array<{ role: string; content: string }>,
  options: SmartMemoryCreateOptions & { maxMemories?: number } = {}
): Promise<{
  created: number;
  skipped: number;
  results: Array<{
    message: string;
    result: ReturnType<typeof smartCreateMemory> extends Promise<infer T> ? T : never;
  }>;
}> {
  const { maxMemories = 5 } = options;

  // Evaluate all messages first
  const evaluations = evaluator.evaluateBatchForMemory(db, messages, agentId);

  // Sort by confidence and importance
  const sorted = evaluations
    .map((e, i) => ({ ...e, index: i }))
    .sort((a, b) => {
      const scoreA = a.result.confidence * a.result.suggestedImportance;
      const scoreB = b.result.confidence * b.result.suggestedImportance;
      return scoreB - scoreA;
    });

  // Take top candidates
  const candidates = sorted.slice(0, maxMemories);
  const results: Array<{
    message: string;
    result: Awaited<ReturnType<typeof smartCreateMemory>>;
  }> = [];

  let created = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    const message = messages[candidate.index];
    const result = await smartCreateMemory(db, agentId, message.content, options);
    results.push({ message: message.content, result });

    if (result.success) {
      created++;
    } else {
      skipped++;
    }
  }

  return { created, skipped, results };
}

// ============================================================================
// MEMORY DEDUPLICATION IPC
// ============================================================================

export const memoryCheckDuplicate = async (
  db: Database,
  agentId: string,
  content: string,
  similarityThreshold: number = 0.85
) => {
  return await deduplication.checkForDuplicateMemories(db, agentId, content, {
    similarityThreshold,
  });
};

export const memoryFindAndMergeDuplicates = async (
  db: Database,
  agentId: string,
  similarityThreshold: number = 0.9,
  mergeStrategy: 'highest_importance' | 'most_recent' | 'combined' = 'highest_importance'
) => {
  return await deduplication.findAndMergeDuplicateMemories(db, agentId, {
    similarityThreshold,
    mergeStrategy,
  });
};

export const memoryGetDuplicateStats = async (
  db: Database,
  agentId: string,
  similarityThreshold: number = 0.85
) => {
  return await deduplication.getDuplicateStatistics(db, agentId, similarityThreshold);
};

export const memorySuggestDuplicateReview = async (
  db: Database,
  agentId: string,
  limit: number = 20
) => {
  return await deduplication.suggestDuplicateReview(db, agentId, limit);
};

// ============================================================================
// MEMORY IMPORTANCE ADJUSTMENT IPC
// ============================================================================

export const memoryTrackAccess = (
  db: Database,
  memoryId: string,
  accessType: 'retrieved' | 'viewed' | 'edited' | 'referenced',
  context?: {
    retrievalRank?: number;
    retrievalCount?: number;
    sessionId?: string;
    query?: string;
  }
) => {
  return importanceAdjuster.trackMemoryAccess(db, memoryId, accessType, context);
};

export const memoryGetAccessStats = (db: Database, memoryId: string) => {
  return importanceAdjuster.getMemoryAccessStats(db, memoryId);
};

export const memoryAdjustImportance = (
  db: Database,
  memoryId: string,
  options?: import('../memory/importance-adjuster.js').ImportanceAdjustmentOptions
) => {
  return importanceAdjuster.adjustMemoryImportance(db, memoryId, options);
};

export const memoryBatchAdjustImportance = (
  db: Database,
  agentId: string,
  options?: import('../memory/importance-adjuster.js').ImportanceAdjustmentOptions
) => {
  return importanceAdjuster.batchAdjustImportance(db, agentId, options);
};

export const memoryApplyFeedback = (
  db: Database,
  memoryId: string,
  feedback: 'positive' | 'negative' | 'neutral',
  options?: { positiveBoost?: number; negativePenalty?: number }
) => {
  return importanceAdjuster.applyUserFeedback(db, memoryId, feedback, options);
};

export const memoryGetAdjustmentStats = (db: Database, agentId: string) => {
  return importanceAdjuster.getAdjustmentStatistics(db, agentId);
};

export const memoryGetMemoriesNeedingAdjustment = (
  db: Database,
  agentId: string,
  daysSinceLastAdjustment: number = 7,
  limit: number = 50
) => {
  return importanceAdjuster.getMemoriesNeedingAdjustment(db, agentId, {
    daysSinceLastAdjustment,
    limit,
  });
};

export const memoryCleanupTracking = (
  db: Database,
  olderThanDays: number = 90,
  keepRecentPerMemory: number = 100
) => {
  return importanceAdjuster.cleanupAccessTracking(db, { olderThanDays, keepRecentPerMemory });
};

// ============================================================================
// MEMORY EVALUATION IPC
// ============================================================================

export const memoryEvaluateContent = (
  db: Database,
  agentId: string,
  content: string,
  context: Partial<evaluator.EvaluationContext> = {}
) => {
  const defaultContext: evaluator.EvaluationContext = {
    agentId,
    role: 'user',
    conversationLength: 1,
    timeSinceLastMemory: Infinity,
    recentMemoryCount: 0,
    totalMemoryCount: 0,
    ...context,
  };

  return evaluator.evaluateContentForMemory(db, content, defaultContext);
};

export const memoryBatchEvaluate = (
  db: Database,
  messages: Array<{ role: string; content: string }>,
  agentId: string
) => {
  return evaluator.evaluateBatchForMemory(db, messages, agentId);
};
