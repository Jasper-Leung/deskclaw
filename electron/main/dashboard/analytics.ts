/**
 * Dashboard Analytics Engine
 * Provides advanced analytics and reporting capabilities
 */

import type { Database } from 'better-sqlite3';

export interface ActivityFeedItem {
  id: string;
  activityType: 'message' | 'agent_action' | 'workflow_execution' | 'system_event' | 'error';
  sourceType: 'channel' | 'agent' | 'workflow' | 'system';
  sourceId: string;
  description: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export interface AnalyticsReport {
  period: { start: number; end: number };
  metrics: {
    totalMessages: number;
    totalAgentActions: number;
    totalWorkflowExecutions: number;
    totalErrors: number;
  };
  topChannels: Array<{ channelId: string; channelName: string; messageCount: number }>;
  topAgents: Array<{ agentId: string; agentName: string; actionCount: number }>;
  topWorkflows: Array<{ workflowId: string; workflowName: string; executionCount: number }>;
  errorsByType: Record<string, number>;
  activityTrend: Array<{ timestamp: number; count: number }>;
}

/**
 * Add item to activity feed
 */
export function addActivityFeedItem(
  db: Database,
  item: Omit<ActivityFeedItem, 'id'>
): ActivityFeedItem {
  const id = Date.now().toString() + Math.random().toString(36).substring(2);

  db.prepare(
    `INSERT INTO activity_feed (id, activity_type, source_type, source_id, description, metadata_json, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    item.activityType,
    item.sourceType,
    item.sourceId,
    item.description,
    item.metadata ? JSON.stringify(item.metadata) : null,
    item.timestamp
  );

  return {
    ...item,
    id,
  };
}

/**
 * Get activity feed
 */
export function getActivityFeed(
  db: Database,
  limit: number = 50,
  offset: number = 0,
  filters?: {
    activityType?: ActivityFeedItem['activityType'];
    sourceType?: ActivityFeedItem['sourceType'];
    sourceId?: string;
    since?: number;
  }
): ActivityFeedItem[] {
  let query = 'SELECT * FROM activity_feed WHERE 1=1';
  const params: any[] = [];

  if (filters?.activityType) {
    query += ' AND activity_type = ?';
    params.push(filters.activityType);
  }

  if (filters?.sourceType) {
    query += ' AND source_type = ?';
    params.push(filters.sourceType);
  }

  if (filters?.sourceId) {
    query += ' AND source_id = ?';
    params.push(filters.sourceId);
  }

  if (filters?.since) {
    query += ' AND timestamp > ?';
    params.push(filters.since);
  }

  query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const results = db.prepare(query).all(...params) as any[];

  return results.map((row) => ({
    id: row.id,
    activityType: row.activity_type,
    sourceType: row.source_type,
    sourceId: row.source_id,
    description: row.description,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
    timestamp: row.timestamp,
  }));
}

/**
 * Log message to audit log
 */
export function logMessageAudit(
  db: Database,
  messageId: string,
  channelId: string,
  sessionId: string | undefined,
  agentId: string | undefined,
  actionType: 'received' | 'processed' | 'responded' | 'error' | 'blocked',
  details?: Record<string, unknown>
): void {
  const id = Date.now().toString() + Math.random().toString(36).substring(2);

  db.prepare(
    `INSERT INTO message_audit_log (id, message_id, channel_id, session_id, agent_id, action_type, details_json, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    messageId,
    channelId,
    sessionId || null,
    agentId || null,
    actionType,
    details ? JSON.stringify(details) : null,
    Date.now()
  );
}

/**
 * Get message audit log
 */
export function getMessageAuditLog(
  db: Database,
  limit: number = 100,
  offset: number = 0,
  filters?: {
    messageId?: string;
    channelId?: string;
    sessionId?: string;
    agentId?: string;
    actionType?: string;
    since?: number;
  }
): Array<{
  id: string;
  messageId: string;
  channelId: string;
  sessionId: string | undefined;
  agentId: string | undefined;
  actionType: string;
  details: Record<string, unknown> | undefined;
  timestamp: number;
}> {
  let query = 'SELECT * FROM message_audit_log WHERE 1=1';
  const params: any[] = [];

  if (filters?.messageId) {
    query += ' AND message_id = ?';
    params.push(filters.messageId);
  }

  if (filters?.channelId) {
    query += ' AND channel_id = ?';
    params.push(filters.channelId);
  }

  if (filters?.sessionId) {
    query += ' AND session_id = ?';
    params.push(filters.sessionId);
  }

  if (filters?.agentId) {
    query += ' AND agent_id = ?';
    params.push(filters.agentId);
  }

  if (filters?.actionType) {
    query += ' AND action_type = ?';
    params.push(filters.actionType);
  }

  if (filters?.since) {
    query += ' AND timestamp > ?';
    params.push(filters.since);
  }

  query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const results = db.prepare(query).all(...params) as any[];

  return results.map((row) => ({
    id: row.id,
    messageId: row.message_id,
    channelId: row.channel_id,
    sessionId: row.session_id,
    agentId: row.agent_id,
    actionType: row.action_type,
    details: row.details_json ? JSON.parse(row.details_json) : undefined,
    timestamp: row.timestamp,
  }));
}

/**
 * Generate analytics report
 */
export function generateAnalyticsReport(
  db: Database,
  startDate: number,
  endDate: number
): AnalyticsReport {
  // Total messages
  const totalMessages =
    (
      db
        .prepare(
          'SELECT COUNT(*) as count FROM channel_messages WHERE timestamp >= ? AND timestamp <= ?'
        )
        .get(startDate, endDate) as { count: number }
    ).count || 0;

  // Total agent actions (tool executions)
  const totalAgentActions =
    (
      db
        .prepare(
          'SELECT COUNT(*) as count FROM tool_executions WHERE timestamp >= ? AND timestamp <= ?'
        )
        .get(startDate, endDate) as { count: number }
    ).count || 0;

  // Total workflow executions
  const totalWorkflowExecutions =
    (
      db
        .prepare(
          'SELECT COUNT(*) as count FROM automation_executions WHERE started_at >= ? AND started_at <= ?'
        )
        .get(startDate, endDate) as { count: number }
    ).count || 0;

  // Total errors
  const totalErrors =
    (
      db
        .prepare(
          `SELECT COUNT(*) as count FROM activity_feed
         WHERE activity_type = 'error' AND timestamp >= ? AND timestamp <= ?`
        )
        .get(startDate, endDate) as { count: number }
    ).count || 0;

  // Top channels
  const topChannels = db
    .prepare(
      `SELECT
          cm.channel_id,
          c.name as channel_name,
          COUNT(*) as message_count
         FROM channel_messages cm
         LEFT JOIN channels c ON cm.channel_id = c.id
         WHERE cm.timestamp >= ? AND cm.timestamp <= ?
         GROUP BY cm.channel_id
         ORDER BY message_count DESC
         LIMIT 10`
    )
    .all(startDate, endDate) as Array<{
    channel_id: string;
    channel_name: string;
    message_count: number;
  }>;

  // Top agents
  const topAgents = db
    .prepare(
      `SELECT
          te.agent_id,
          a.name as agent_name,
          COUNT(*) as action_count
         FROM tool_executions te
         LEFT JOIN agents a ON te.agent_id = a.id
         WHERE te.timestamp >= ? AND te.timestamp <= ?
         GROUP BY te.agent_id
         ORDER BY action_count DESC
         LIMIT 10`
    )
    .all(startDate, endDate) as Array<{
    agent_id: string;
    agent_name: string;
    action_count: number;
  }>;

  // Top workflows
  const topWorkflows = db
    .prepare(
      `SELECT
          ae.workflow_id,
          w.name as workflow_name,
          COUNT(*) as execution_count
         FROM automation_executions ae
         LEFT JOIN workflows w ON ae.workflow_id = w.id
         WHERE ae.started_at >= ? AND ae.started_at <= ?
         GROUP BY ae.workflow_id
         ORDER BY execution_count DESC
         LIMIT 10`
    )
    .all(startDate, endDate) as Array<{
    workflow_id: string;
    workflow_name: string;
    execution_count: number;
  }>;

  // Errors by type (from activity feed metadata)
  const errorResults = db
    .prepare(
      `SELECT metadata_json
       FROM activity_feed
       WHERE activity_type = 'error' AND timestamp >= ? AND timestamp <= ?`
    )
    .all(startDate, endDate) as Array<{ metadata_json: string }>;

  const errorsByType: Record<string, number> = {};
  for (const error of errorResults) {
    try {
      const metadata = JSON.parse(error.metadata_json);
      const errorType = metadata.errorType || 'unknown';
      errorsByType[errorType] = (errorsByType[errorType] || 0) + 1;
    } catch {
      errorsByType.unknown = (errorsByType.unknown || 0) + 1;
    }
  }

  // Activity trend (hourly buckets)
  const activityTrendResults = db
    .prepare(
      `SELECT
        (timestamp / 3600000) * 3600000 as bucket,
        COUNT(*) as count
       FROM activity_feed
       WHERE timestamp >= ? AND timestamp <= ?
       GROUP BY bucket
       ORDER BY bucket ASC`
    )
    .all(startDate, endDate) as Array<{ bucket: number; count: number }>;

  return {
    period: { start: startDate, end: endDate },
    metrics: {
      totalMessages,
      totalAgentActions,
      totalWorkflowExecutions,
      totalErrors,
    },
    topChannels: topChannels.map((c) => ({
      channelId: c.channel_id,
      channelName: c.channel_name || c.channel_id,
      messageCount: c.message_count,
    })),
    topAgents: topAgents.map((a) => ({
      agentId: a.agent_id,
      agentName: a.agent_name || a.agent_id,
      actionCount: a.action_count,
    })),
    topWorkflows: topWorkflows.map((w) => ({
      workflowId: w.workflow_id,
      workflowName: w.workflow_name || w.workflow_id,
      executionCount: w.execution_count,
    })),
    errorsByType,
    activityTrend: activityTrendResults.map((r) => ({
      timestamp: r.bucket,
      count: r.count,
    })),
  };
}

/**
 * Cleanup old activity feed items
 */
export function cleanupActivityFeed(
  db: Database,
  olderThan: number = 30 * 24 * 60 * 60 * 1000
): number {
  const cutoff = Date.now() - olderThan;
  const result = db.prepare('DELETE FROM activity_feed WHERE timestamp < ?').run(cutoff);
  return result.changes;
}

/**
 * Cleanup old audit log entries
 */
export function cleanupAuditLog(
  db: Database,
  olderThan: number = 90 * 24 * 60 * 60 * 1000
): number {
  const cutoff = Date.now() - olderThan;
  const result = db.prepare('DELETE FROM message_audit_log WHERE timestamp < ?').run(cutoff);
  return result.changes;
}

/**
 * Get quick stats for dashboard
 */
export function getQuickStats(db: Database): {
  messagesLastHour: number;
  actionsLastHour: number;
  activeChannels: number;
  systemHealth: number;
} {
  const hourAgo = Date.now() - 60 * 60 * 1000;

  const messagesLastHour =
    (
      db
        .prepare('SELECT COUNT(*) as count FROM channel_messages WHERE timestamp > ?')
        .get(hourAgo) as { count: number }
    ).count || 0;

  const actionsLastHour =
    (
      db
        .prepare('SELECT COUNT(*) as count FROM tool_executions WHERE timestamp > ?')
        .get(hourAgo) as { count: number }
    ).count || 0;

  const activeChannels =
    (
      db
        .prepare(
          'SELECT COUNT(DISTINCT channel_id) as count FROM channel_messages WHERE timestamp > ?'
        )
        .get(hourAgo) as { count: number }
    ).count || 0;

  const systemHealth = 85; // Would calculate from health metrics

  return {
    messagesLastHour,
    actionsLastHour,
    activeChannels,
    systemHealth,
  };
}
