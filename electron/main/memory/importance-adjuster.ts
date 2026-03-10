/**
 * Memory Importance Adjuster Service
 * Automatically adjusts memory importance based on usage patterns and feedback
 */

import type { Database } from 'better-sqlite3';

export interface ImportanceAdjustmentOptions {
  boostFactor?: number; // How much to boost per access
  decayFactor?: number; // How much to decay per day of inactivity
  minImportance?: number; // Minimum importance floor
  maxImportance?: number; // Maximum importance ceiling
  decayPeriodDays?: number; // Days before decay starts
}

export interface MemoryAccessStats {
  memoryId: string;
  accessCount: number;
  lastAccessed: number;
  lastRetrieved: number;
  averageRetrievalRank: number; // Average position in retrieval results
  daysSinceLastAccess: number;
  retrievalSuccessRate: number; // How often it's retrieved when relevant
}

export interface AdjustmentResult {
  memoryId: string;
  oldImportance: number;
  newImportance: number;
  reason: string;
}

/**
 * Track memory access for importance adjustment
 */
export function trackMemoryAccess(
  db: Database,
  memoryId: string,
  accessType: 'retrieved' | 'viewed' | 'edited' | 'referenced',
  context?: {
    retrievalRank?: number; // Position in retrieval results
    retrievalCount?: number; // Total memories in retrieval
    sessionId?: string;
    query?: string;
  }
): void {
  const now = Date.now();

  // Check if memory_access_tracking table exists, if not create it
  const tableExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='memory_access_tracking'`)
    .get() as { name: string } | undefined;

  if (!tableExists) {
    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS memory_access_tracking (
        id TEXT PRIMARY KEY,
        memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
        access_type TEXT NOT NULL CHECK(access_type IN ('retrieved', 'viewed', 'edited', 'referenced')),
        retrieval_rank INTEGER,
        retrieval_count INTEGER,
        session_id TEXT,
        query TEXT,
        timestamp INTEGER NOT NULL,
        INDEX idx_memory_access (memory_id, timestamp),
        INDEX idx_access_type (access_type, timestamp)
      )
    `
    ).run();
  }

  // Log the access
  const id = `${memoryId}-${now}-${Math.random().toString(36).substr(2, 9)}`;
  db.prepare(
    `INSERT INTO memory_access_tracking (id, memory_id, access_type, retrieval_rank, retrieval_count, session_id, query, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    memoryId,
    accessType,
    context?.retrievalRank || null,
    context?.retrievalCount || null,
    context?.sessionId || null,
    context?.query || null,
    now
  );
}

/**
 * Get memory access statistics
 */
export function getMemoryAccessStats(db: Database, memoryId: string): MemoryAccessStats {
  const accesses = db
    .prepare(
      `SELECT access_type, retrieval_rank, timestamp
       FROM memory_access_tracking
       WHERE memory_id = ?
       ORDER BY timestamp DESC`
    )
    .all(memoryId) as Array<{
    access_type: string;
    retrieval_rank: number | null;
    timestamp: number;
  }>;

  if (accesses.length === 0) {
    return {
      memoryId,
      accessCount: 0,
      lastAccessed: 0,
      lastRetrieved: 0,
      averageRetrievalRank: 0,
      daysSinceLastAccess: 0,
      retrievalSuccessRate: 0,
    };
  }

  const retrieved = accesses.filter((a) => a.access_type === 'retrieved');
  const ranks = retrieved.map((a) => a.retrieval_rank).filter((r): r is number => r !== null);

  return {
    memoryId,
    accessCount: accesses.length,
    lastAccessed: accesses[0].timestamp,
    lastRetrieved: retrieved.length > 0 ? retrieved[0].timestamp : 0,
    averageRetrievalRank: ranks.length > 0 ? ranks.reduce((a, b) => a + b, 0) / ranks.length : 0,
    daysSinceLastAccess: (Date.now() - accesses[0].timestamp) / (24 * 60 * 60 * 1000),
    retrievalSuccessRate: retrieved.length / accesses.length,
  };
}

/**
 * Adjust memory importance based on access patterns
 */
export function adjustMemoryImportance(
  db: Database,
  memoryId: string,
  options: ImportanceAdjustmentOptions = {}
): AdjustmentResult | null {
  const {
    boostFactor = 0.05,
    decayFactor = 0.01,
    minImportance = 0.1,
    maxImportance = 1.0,
    decayPeriodDays = 30,
  } = options;

  // Get current importance
  const memory = db
    .prepare('SELECT importance, created_at FROM memories WHERE id = ?')
    .get(memoryId) as
    | {
        importance: number;
        created_at: number;
      }
    | undefined;

  if (!memory) {
    return null;
  }

  const oldImportance = memory.importance;
  let newImportance = oldImportance;
  const reasons: string[] = [];

  // Get access stats
  const stats = getMemoryAccessStats(db, memoryId);

  // Boost based on recent access
  if (stats.accessCount > 0 && stats.daysSinceLastAccess < 7) {
    // Recent access - boost importance
    const boost = boostFactor * (1 - stats.daysSinceLastAccess / 7);
    newImportance += boost;
    reasons.push(`Recent access boost: +${boost.toFixed(3)}`);
  }

  // Boost based on retrieval success rate
  if (stats.retrievalSuccessRate > 0.7 && stats.accessCount >= 3) {
    const boost = boostFactor * 0.5 * stats.retrievalSuccessRate;
    newImportance += boost;
    reasons.push(`High retrieval success: +${boost.toFixed(3)}`);
  }

  // Boost based on good retrieval rank (being selected often)
  if (stats.averageRetrievalRank > 0 && stats.averageRetrievalRank <= 3 && stats.accessCount >= 3) {
    const boost = boostFactor * 0.3;
    newImportance += boost;
    reasons.push(`High retrieval rank: +${boost.toFixed(3)}`);
  }

  // Decay for old, unused memories
  const memoryAge = (Date.now() - memory.created_at) / (24 * 60 * 60 * 1000);
  if (memoryAge > decayPeriodDays && stats.daysSinceLastAccess > 14) {
    const daysSinceDecayStart = memoryAge - decayPeriodDays;
    const decay = Math.min(decayFactor * (daysSinceDecayStart / 30), 0.3); // Max 30% decay
    newImportance -= decay;
    reasons.push(`Age decay: -${decay.toFixed(3)}`);
  }

  // Apply min/max bounds
  newImportance = Math.max(minImportance, Math.min(maxImportance, newImportance));

  // Update if changed significantly (more than 1%)
  if (Math.abs(newImportance - oldImportance) > 0.01) {
    db.prepare('UPDATE memories SET importance = ?, updated_at = ? WHERE id = ?').run(
      newImportance,
      Date.now(),
      memoryId
    );

    return {
      memoryId,
      oldImportance,
      newImportance,
      reason: reasons.join(', ') || 'No adjustment needed',
    };
  }

  return null;
}

/**
 * Batch adjust importance for all memories of an agent
 */
export function batchAdjustImportance(
  db: Database,
  agentId: string,
  options: ImportanceAdjustmentOptions = {}
): AdjustmentResult[] {
  const memories = db.prepare('SELECT id FROM memories WHERE agent_id = ?').all(agentId) as Array<{
    id: string;
  }>;

  const results: AdjustmentResult[] = [];

  for (const memory of memories) {
    const result = adjustMemoryImportance(db, memory.id, options);
    if (result) {
      results.push(result);
    }
  }

  return results;
}

/**
 * Apply user feedback to memory importance
 */
export function applyUserFeedback(
  db: Database,
  memoryId: string,
  feedback: 'positive' | 'negative' | 'neutral',
  options: { positiveBoost?: number; negativePenalty?: number } = {}
): AdjustmentResult | null {
  const { positiveBoost = 0.2, negativePenalty = 0.3 } = options;

  const memory = db.prepare('SELECT importance FROM memories WHERE id = ?').get(memoryId) as
    | {
        importance: number;
      }
    | undefined;

  if (!memory) {
    return null;
  }

  const oldImportance = memory.importance;
  let newImportance = oldImportance;

  if (feedback === 'positive') {
    newImportance = Math.min(1.0, oldImportance + positiveBoost);
  } else if (feedback === 'negative') {
    newImportance = Math.max(0.1, oldImportance - negativePenalty);
  }

  if (Math.abs(newImportance - oldImportance) > 0.01) {
    db.prepare('UPDATE memories SET importance = ?, updated_at = ? WHERE id = ?').run(
      newImportance,
      Date.now(),
      memoryId
    );

    return {
      memoryId,
      oldImportance,
      newImportance,
      reason: `User feedback: ${feedback}`,
    };
  }

  return null;
}

/**
 * Get memories that need importance adjustment
 */
export function getMemoriesNeedingAdjustment(
  db: Database,
  agentId: string,
  options: { daysSinceLastAdjustment?: number; limit?: number } = {}
): Array<{ id: string; content: string; importance: number; lastAccessed: number }> {
  const { daysSinceLastAdjustment = 7, limit = 50 } = options;

  const cutoffTime = Date.now() - daysSinceLastAdjustment * 24 * 60 * 60 * 1000;

  const memories = db
    .prepare(
      `SELECT m.id, m.content, m.importance, m.updated_at,
              MAX(mat.timestamp) as last_accessed
       FROM memories m
       LEFT JOIN memory_access_tracking mat ON m.id = mat.memory_id
       WHERE m.agent_id = ? AND m.updated_at < ?
       GROUP BY m.id
       ORDER BY m.updated_at ASC
       LIMIT ?`
    )
    .all(agentId, cutoffTime, limit) as Array<{
    id: string;
    content: string;
    importance: number;
    last_accessed: number | null;
    updated_at: number;
  }>;

  return memories.map((m) => ({
    id: m.id,
    content: m.content,
    importance: m.importance,
    lastAccessed: m.last_accessed || m.updated_at,
  }));
}

/**
 * Clean up old access tracking records
 */
export function cleanupAccessTracking(
  db: Database,
  options: { olderThanDays?: number; keepRecentPerMemory?: number } = {}
): number {
  const { olderThanDays = 90, keepRecentPerMemory = 100 } = options;

  const cutoffDate = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;

  // Delete old records, but keep recent ones for each memory
  const result = db
    .prepare(
      `DELETE FROM memory_access_tracking
       WHERE id NOT IN (
         SELECT id FROM memory_access_tracking
         WHERE timestamp >= ?
         ORDER BY timestamp DESC
         LIMIT ?
       )`
    )
    .run(cutoffDate, keepRecentPerMemory);

  return result.changes;
}

/**
 * Get importance adjustment statistics
 */
export function getAdjustmentStatistics(
  db: Database,
  agentId: string
): {
  totalMemories: number;
  memoriesWithTracking: number;
  averageImportance: number;
  highImportanceCount: number;
  lowImportanceCount: number;
  averageDaysSinceAccess: number;
} {
  const stats = db
    .prepare(
      `SELECT
         COUNT(*) as total,
         AVG(m.importance) as avg_importance,
         SUM(CASE WHEN m.importance >= 0.7 THEN 1 ELSE 0 END) as high_count,
         SUM(CASE WHEN m.importance < 0.3 THEN 1 ELSE 0 END) as low_count
       FROM memories m
       WHERE m.agent_id = ?`
    )
    .get(agentId) as {
    total: number;
    avg_importance: number;
    high_count: number;
    low_count: number;
  };

  const trackingStats = db
    .prepare(
      `SELECT COUNT(DISTINCT memory_id) as with_tracking,
              AVG(CAST((? - MAX(mat.timestamp)) AS REAL) / 86400000) as avg_days_since
       FROM memory_access_tracking mat
       JOIN memories m ON mat.memory_id = m.id
       WHERE m.agent_id = ?`
    )
    .get(Date.now(), agentId) as { with_tracking: number; avg_days_since: number | null };

  return {
    totalMemories: stats.total || 0,
    memoriesWithTracking: trackingStats?.with_tracking || 0,
    averageImportance: stats.avg_importance || 0,
    highImportanceCount: stats.high_count || 0,
    lowImportanceCount: stats.low_count || 0,
    averageDaysSinceAccess: trackingStats?.avg_days_since || 0,
  };
}
