/**
 * Agent Coordinator
 * Coordinates multi-agent conversations, handoffs, and collaboration
 */

import type { Database } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import * as agentRouter from './agent-router.js';

export interface AgentHandoff {
  id: string;
  sessionId: string;
  fromAgentId?: string;
  toAgentId?: string;
  reason: string;
  contextJson: string;
  timestamp: number;
}

export interface HandoffContext {
  conversationSummary: string;
  keyPoints: string[];
  userIntent: string;
  pendingTasks: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Record an agent handoff
 */
export function recordHandoff(
  db: Database,
  handoff: Omit<AgentHandoff, 'id' | 'timestamp'>
): AgentHandoff {
  const id = randomUUID();
  const timestamp = Date.now();

  db.prepare(
    `INSERT INTO agent_handoffs (id, session_id, from_agent_id, to_agent_id, reason, context_json, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    handoff.sessionId,
    handoff.fromAgentId || null,
    handoff.toAgentId || null,
    handoff.reason,
    handoff.contextJson,
    timestamp
  );

  return {
    ...handoff,
    id,
    timestamp,
  };
}

/**
 * Get handoffs for a session
 */
export function getSessionHandoffs(db: Database, sessionId: string): AgentHandoff[] {
  const results = db
    .prepare('SELECT * FROM agent_handoffs WHERE session_id = ? ORDER BY timestamp ASC')
    .all(sessionId) as Array<{
    id: string;
    session_id: string;
    from_agent_id: string | null;
    to_agent_id: string | null;
    reason: string;
    context_json: string;
    timestamp: number;
  }>;

  return results.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    fromAgentId: row.from_agent_id || undefined,
    toAgentId: row.to_agent_id || undefined,
    reason: row.reason,
    contextJson: row.context_json,
    timestamp: row.timestamp,
  }));
}

/**
 * Get handoffs for an agent
 */
export function getAgentHandoffs(db: Database, agentId: string): AgentHandoff[] {
  const results = db
    .prepare(
      'SELECT * FROM agent_handoffs WHERE from_agent_id = ? OR to_agent_id = ? ORDER BY timestamp DESC'
    )
    .all(agentId, agentId) as Array<{
    id: string;
    session_id: string;
    from_agent_id: string | null;
    to_agent_id: string | null;
    reason: string;
    context_json: string;
    timestamp: number;
  }>;

  return results.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    fromAgentId: row.from_agent_id || undefined,
    toAgentId: row.to_agent_id || undefined,
    reason: row.reason,
    contextJson: row.context_json,
    timestamp: row.timestamp,
  }));
}

/**
 * Get recent handoffs
 */
export function getRecentHandoffs(
  db: Database,
  limit: number = 50,
  offset: number = 0
): AgentHandoff[] {
  const results = db
    .prepare('SELECT * FROM agent_handoffs ORDER BY timestamp DESC LIMIT ? OFFSET ?')
    .all(limit, offset) as Array<{
    id: string;
    session_id: string;
    from_agent_id: string | null;
    to_agent_id: string | null;
    reason: string;
    context_json: string;
    timestamp: number;
  }>;

  return results.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    fromAgentId: row.from_agent_id || undefined,
    toAgentId: row.to_agent_id || undefined,
    reason: row.reason,
    contextJson: row.context_json,
    timestamp: row.timestamp,
  }));
}

/**
 * Execute agent handoff
 */
export async function executeHandoff(
  db: Database,
  sessionId: string,
  fromAgentId: string,
  toAgentId: string,
  reason: string,
  context: HandoffContext
): Promise<AgentHandoff> {
  // Record the handoff
  const handoff = recordHandoff(db, {
    sessionId,
    fromAgentId,
    toAgentId,
    reason,
    contextJson: JSON.stringify(context),
  });

  // Update session to use new agent
  db.prepare('UPDATE sessions SET agent_id = ?, updated_at = ? WHERE id = ?').run(
    toAgentId,
    Date.now(),
    sessionId
  );

  return handoff;
}

/**
 * Suggest agent handoff based on conversation analysis
 */
export function suggestHandoff(
  db: Database,
  sessionId: string,
  currentAgentId: string,
  messageContent: string
): { shouldHandoff: boolean; suggestedAgentId?: string; reason: string } {
  // Get routing rules to find a better agent
  const routing = agentRouter.routeMessage(db, { content: messageContent });

  if (routing.agentId && routing.agentId !== currentAgentId && routing.confidence > 0.7) {
    return {
      shouldHandoff: true,
      suggestedAgentId: routing.agentId,
      reason: routing.reason,
    };
  }

  return {
    shouldHandoff: false,
    reason: 'No better agent found for this message',
  };
}

/**
 * Get handoff statistics
 */
export function getHandoffStats(
  db: Database,
  timeRange: number = 24 * 60 * 60 * 1000
): {
  totalHandoffs: number;
  handoffsByAgent: Record<string, number>;
  commonReasons: Array<{ reason: string; count: number }>;
  avgHandoffsPerSession: number;
} {
  const since = Date.now() - timeRange;

  const total = db
    .prepare('SELECT COUNT(*) as count FROM agent_handoffs WHERE timestamp > ?')
    .get(since) as { count: number };

  const byAgent = db
    .prepare(
      `SELECT to_agent_id, COUNT(*) as count
       FROM agent_handoffs
       WHERE timestamp > ?
       GROUP BY to_agent_id
       ORDER BY count DESC`
    )
    .all(since) as Array<{ to_agent_id: string; count: number }>;

  const handoffsByAgent: Record<string, number> = {};
  for (const row of byAgent) {
    handoffsByAgent[row.to_agent_id] = row.count;
  }

  const reasons = db
    .prepare(
      `SELECT reason, COUNT(*) as count
       FROM agent_handoffs
       WHERE timestamp > ?
       GROUP BY reason
       ORDER BY count DESC
       LIMIT 10`
    )
    .all(since) as Array<{ reason: string; count: number }>;

  const sessionsWithHandoffs = db
    .prepare(
      `SELECT COUNT(DISTINCT session_id) as count
       FROM agent_handoffs
       WHERE timestamp > ?`
    )
    .get(since) as { count: number };

  return {
    totalHandoffs: total.count,
    handoffsByAgent,
    commonReasons: reasons,
    avgHandoffsPerSession:
      sessionsWithHandoffs.count > 0 ? total.count / sessionsWithHandoffs.count : 0,
  };
}

/**
 * Create handoff context from conversation
 */
export function createHandoffContext(
  messages: Array<{ role: string; content: string }>,
  maxMessages: number = 10
): HandoffContext {
  const recentMessages = messages.slice(-maxMessages);

  // Generate conversation summary
  const conversationSummary = recentMessages.map((m) => `${m.role}: ${m.content}`).join('\n');

  // Extract key points (simple heuristic-based extraction)
  const keyPoints: string[] = [];
  for (const msg of recentMessages) {
    if (msg.role === 'user' && msg.content.length > 20) {
      // Extract sentences that might be key points
      const sentences = msg.content.split(/[.!?]+/);
      for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if (trimmed.length > 30 && trimmed.length < 200) {
          keyPoints.push(trimmed);
          if (keyPoints.length >= 5) break;
        }
      }
    }
    if (keyPoints.length >= 5) break;
  }

  // Infer user intent from recent user messages
  const userMessages = recentMessages.filter((m) => m.role === 'user');
  const userIntent = userMessages.length > 0 ? userMessages[userMessages.length - 1].content : '';

  // Identify pending tasks (simple keyword matching)
  const pendingTasks: string[] = [];
  const taskKeywords = ['todo', 'task', 'need to', 'should', 'will', 'plan to'];
  for (const msg of recentMessages) {
    const lower = msg.content.toLowerCase();
    for (const keyword of taskKeywords) {
      if (lower.includes(keyword)) {
        pendingTasks.push(msg.content);
        break;
      }
    }
  }

  return {
    conversationSummary,
    keyPoints,
    userIntent,
    pendingTasks,
  };
}

/**
 * Get handoff chain for a session
 */
export function getHandoffChain(db: Database, sessionId: string): AgentHandoff[] {
  const handoffs = getSessionHandoffs(db, sessionId);

  // Filter to only successful handoffs (both from and to agents specified)
  return handoffs.filter((h) => h.fromAgentId && h.toAgentId);
}

/**
 * Get current agent for a session
 */
export function getCurrentAgent(db: Database, sessionId: string): string | null {
  const result = db.prepare('SELECT agent_id FROM sessions WHERE id = ?').get(sessionId) as
    | { agent_id: string }
    | undefined;

  return result?.agent_id || null;
}

/**
 * Check if session has had multiple agents
 */
export function hasMultipleAgents(db: Database, sessionId: string): boolean {
  const handoffs = getSessionHandoffs(db, sessionId);
  return handoffs.length > 0;
}

/**
 * Get agent collaboration network
 */
export function getCollaborationNetwork(
  db: Database,
  timeRange: number = 7 * 24 * 60 * 60 * 1000
): Array<{
  fromAgentId: string;
  toAgentId: string;
  count: number;
  lastHandoff: number;
}> {
  const since = Date.now() - timeRange;

  const results = db
    .prepare(
      `SELECT
        from_agent_id,
        to_agent_id,
        COUNT(*) as count,
        MAX(timestamp) as last_handoff
       FROM agent_handoffs
       WHERE timestamp > ? AND from_agent_id IS NOT NULL AND to_agent_id IS NOT NULL
       GROUP BY from_agent_id, to_agent_id
       ORDER BY count DESC`
    )
    .all(since) as Array<{
    from_agent_id: string | null;
    to_agent_id: string | null;
    count: number;
    last_handoff: number;
  }>;

  return results
    .filter((row) => row.from_agent_id !== null && row.to_agent_id !== null)
    .map((row) => ({
      fromAgentId: row.from_agent_id as string,
      toAgentId: row.to_agent_id as string,
      count: row.count,
      lastHandoff: row.last_handoff,
    }));
}

/**
 * Delete old handoff records (cleanup)
 */
export function cleanupOldHandoffs(
  db: Database,
  olderThan: number = 90 * 24 * 60 * 60 * 1000 // Default 90 days
): number {
  const cutoff = Date.now() - olderThan;
  const result = db.prepare('DELETE FROM agent_handoffs WHERE timestamp < ?').run(cutoff);
  return result.changes;
}
