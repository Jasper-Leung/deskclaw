/**
 * Tool Execution Monitor
 * Tracks and monitors tool execution for analytics and debugging
 */

import type { Database } from 'better-sqlite3';
import { randomUUID } from 'crypto';

export type ExecutionStatus = 'success' | 'error' | 'blocked';

export interface ToolExecutionLog {
  id: string;
  toolId: string;
  agentId?: string;
  sessionId?: string;
  parametersJson: string;
  resultJson?: string;
  errorText?: string;
  executionTimeMs: number;
  status: ExecutionStatus;
  timestamp: number;
}

export interface ExecutionMetrics {
  totalExecutions: number;
  successRate: number;
  avgExecutionTime: number;
  errorRate: number;
  blockRate: number;
}

export interface ToolUsageStats {
  toolId: string;
  toolName: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  blockedExecutions: number;
  avgExecutionTime: number;
  lastUsed: number;
}

/**
 * Log a tool execution
 */
export function logToolExecution(
  db: Database,
  execution: Omit<ToolExecutionLog, 'id' | 'timestamp'>
): ToolExecutionLog {
  const id = randomUUID();
  const timestamp = Date.now();

  db.prepare(
    `INSERT INTO tool_executions (id, tool_id, agent_id, session_id, parameters_json, result_json, error_text, execution_time_ms, status, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    execution.toolId,
    execution.agentId || null,
    execution.sessionId || null,
    execution.parametersJson,
    execution.resultJson || null,
    execution.errorText || null,
    execution.executionTimeMs,
    execution.status,
    timestamp
  );

  return {
    ...execution,
    id,
    timestamp,
  };
}

/**
 * Get execution logs for a tool
 */
export function getToolExecutionLogs(
  db: Database,
  toolId: string,
  limit: number = 100,
  offset: number = 0
): ToolExecutionLog[] {
  const results = db
    .prepare(
      `SELECT * FROM tool_executions
       WHERE tool_id = ?
       ORDER BY timestamp DESC
       LIMIT ? OFFSET ?`
    )
    .all(toolId, limit, offset) as any[];

  return results.map(mapRowToExecutionLog);
}

/**
 * Get execution logs for an agent
 */
export function getAgentExecutionLogs(
  db: Database,
  agentId: string,
  limit: number = 100,
  offset: number = 0
): ToolExecutionLog[] {
  const results = db
    .prepare(
      `SELECT * FROM tool_executions
       WHERE agent_id = ?
       ORDER BY timestamp DESC
       LIMIT ? OFFSET ?`
    )
    .all(agentId, limit, offset) as any[];

  return results.map(mapRowToExecutionLog);
}

/**
 * Get execution logs for a session
 */
export function getSessionExecutionLogs(
  db: Database,
  sessionId: string,
  limit: number = 100,
  offset: number = 0
): ToolExecutionLog[] {
  const results = db
    .prepare(
      `SELECT * FROM tool_executions
       WHERE session_id = ?
       ORDER BY timestamp DESC
       LIMIT ? OFFSET ?`
    )
    .all(sessionId, limit, offset) as any[];

  return results.map(mapRowToExecutionLog);
}

/**
 * Get execution metrics for a tool
 */
export function getToolMetrics(
  db: Database,
  toolId: string,
  timeRange: number = 24 * 60 * 60 * 1000 // Default 24 hours
): ExecutionMetrics {
  const since = Date.now() - timeRange;

  const result = db
    .prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors,
        SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as blocked,
        AVG(execution_time_ms) as avg_time
       FROM tool_executions
       WHERE tool_id = ? AND timestamp > ?`
    )
    .get(toolId, since) as any;

  const total = result.total || 0;
  const successful = result.successful || 0;
  const errors = result.errors || 0;
  const blocked = result.blocked || 0;
  const avgTime = result.avg_time || 0;

  return {
    totalExecutions: total,
    successRate: total > 0 ? (successful / total) * 100 : 0,
    avgExecutionTime: avgTime,
    errorRate: total > 0 ? (errors / total) * 100 : 0,
    blockRate: total > 0 ? (blocked / total) * 100 : 0,
  };
}

/**
 * Get tool usage statistics (all tools)
 */
export function getToolUsageStats(
  db: Database,
  timeRange: number = 24 * 60 * 60 * 1000,
  limit: number = 20
): ToolUsageStats[] {
  const since = Date.now() - timeRange;

  const results = db
    .prepare(
      `SELECT
        te.tool_id,
        t.name as tool_name,
        COUNT(*) as total,
        SUM(CASE WHEN te.status = 'success' THEN 1 ELSE 0 END) as successful,
        SUM(CASE WHEN te.status = 'error' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN te.status = 'blocked' THEN 1 ELSE 0 END) as blocked,
        AVG(te.execution_time_ms) as avg_time,
        MAX(te.timestamp) as last_used
       FROM tool_executions te
       LEFT JOIN tools t ON te.tool_id = t.id
       WHERE te.timestamp > ?
       GROUP BY te.tool_id
       ORDER BY total DESC
       LIMIT ?`
    )
    .all(since, limit) as any[];

  return results.map((row) => ({
    toolId: row.tool_id,
    toolName: row.tool_name || row.tool_id,
    totalExecutions: row.total,
    successfulExecutions: row.successful,
    failedExecutions: row.failed,
    blockedExecutions: row.blocked,
    avgExecutionTime: row.avg_time || 0,
    lastUsed: row.last_used,
  }));
}

/**
 * Get recent execution logs across all tools
 */
export function getRecentExecutions(
  db: Database,
  limit: number = 50,
  offset: number = 0
): ToolExecutionLog[] {
  const results = db
    .prepare(
      `SELECT te.*, t.name as tool_name
       FROM tool_executions te
       LEFT JOIN tools t ON te.tool_id = t.id
       ORDER BY te.timestamp DESC
       LIMIT ? OFFSET ?`
    )
    .all(limit, offset) as any[];

  return results.map(mapRowToExecutionLog);
}

/**
 * Get execution logs with filters
 */
export function queryExecutionLogs(
  db: Database,
  filters: {
    toolId?: string;
    agentId?: string;
    sessionId?: string;
    status?: ExecutionStatus;
    startTime?: number;
    endTime?: number;
    limit?: number;
    offset?: number;
  }
): ToolExecutionLog[] {
  let query =
    'SELECT te.*, t.name as tool_name FROM tool_executions te LEFT JOIN tools t ON te.tool_id = t.id WHERE 1=1';
  const params: any[] = [];

  if (filters.toolId) {
    query += ' AND te.tool_id = ?';
    params.push(filters.toolId);
  }

  if (filters.agentId) {
    query += ' AND te.agent_id = ?';
    params.push(filters.agentId);
  }

  if (filters.sessionId) {
    query += ' AND te.session_id = ?';
    params.push(filters.sessionId);
  }

  if (filters.status) {
    query += ' AND te.status = ?';
    params.push(filters.status);
  }

  if (filters.startTime) {
    query += ' AND te.timestamp >= ?';
    params.push(filters.startTime);
  }

  if (filters.endTime) {
    query += ' AND te.timestamp <= ?';
    params.push(filters.endTime);
  }

  query += ' ORDER BY te.timestamp DESC';

  if (filters.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);

    if (filters.offset) {
      query += ' OFFSET ?';
      params.push(filters.offset);
    }
  }

  const results = db.prepare(query).all(...params) as any[];
  return results.map(mapRowToExecutionLog);
}

/**
 * Delete old execution logs (cleanup)
 */
export function cleanupOldLogs(
  db: Database,
  olderThan: number = 30 * 24 * 60 * 60 * 1000 // Default 30 days
): number {
  const cutoff = Date.now() - olderThan;
  const result = db.prepare('DELETE FROM tool_executions WHERE timestamp < ?').run(cutoff);
  return result.changes;
}

/**
 * Get execution count by time interval (for charts)
 */
export function getExecutionCountByInterval(
  db: Database,
  interval: 'hour' | 'day' | 'week',
  timeRange: number = 7 * 24 * 60 * 60 * 1000 // Default 7 days
): Array<{ timestamp: number; count: number; success: number; error: number }> {
  const since = Date.now() - timeRange;

  let intervalMs: number;
  switch (interval) {
    case 'hour':
      intervalMs = 60 * 60 * 1000;
      break;
    case 'day':
      intervalMs = 24 * 60 * 60 * 1000;
      break;
    case 'week':
      intervalMs = 7 * 24 * 60 * 60 * 1000;
      break;
  }

  const results = db
    .prepare(
      `SELECT
        (timestamp / ?) * ? as bucket,
        COUNT(*) as count,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error
       FROM tool_executions
       WHERE timestamp > ?
       GROUP BY bucket
       ORDER BY bucket ASC`
    )
    .all(intervalMs, intervalMs, since) as any[];

  return results.map((row) => ({
    timestamp: row.bucket,
    count: row.count,
    success: row.success,
    error: row.error,
  }));
}

/**
 * Map database row to ExecutionLog interface
 */
function mapRowToExecutionLog(row: any): ToolExecutionLog {
  return {
    id: row.id,
    toolId: row.tool_id,
    agentId: row.agent_id,
    sessionId: row.session_id,
    parametersJson: row.parameters_json,
    resultJson: row.result_json,
    errorText: row.error_text,
    executionTimeMs: row.execution_time_ms,
    status: row.status,
    timestamp: row.timestamp,
  };
}

/**
 * Get error logs only
 */
export function getErrorLogs(
  db: Database,
  limit: number = 50,
  offset: number = 0
): ToolExecutionLog[] {
  const results = db
    .prepare(
      `SELECT te.*, t.name as tool_name
       FROM tool_executions te
       LEFT JOIN tools t ON te.tool_id = t.id
       WHERE te.status = 'error'
       ORDER BY te.timestamp DESC
       LIMIT ? OFFSET ?`
    )
    .all(limit, offset) as any[];

  return results.map(mapRowToExecutionLog);
}

/**
 * Get top tools by execution count
 */
export function getTopTools(
  db: Database,
  timeRange: number = 24 * 60 * 60 * 1000,
  limit: number = 10
): Array<{ toolId: string; toolName: string; count: number }> {
  const since = Date.now() - timeRange;

  const results = db
    .prepare(
      `SELECT
        te.tool_id,
        t.name as tool_name,
        COUNT(*) as count
       FROM tool_executions te
       LEFT JOIN tools t ON te.tool_id = t.id
       WHERE te.timestamp > ?
       GROUP BY te.tool_id
       ORDER BY count DESC
       LIMIT ?`
    )
    .all(since, limit) as any[];

  return results.map((row) => ({
    toolId: row.tool_id,
    toolName: row.tool_name || row.tool_id,
    count: row.count,
  }));
}
