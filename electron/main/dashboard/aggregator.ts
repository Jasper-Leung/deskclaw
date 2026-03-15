/**
 * Dashboard Metrics Aggregator
 * Aggregates metrics from various sources for the dashboard
 */

import type { Database } from 'better-sqlite3';

export interface DashboardMetrics {
  timestamp: number;
  totalMessages: number;
  activeChannels: number;
  totalAgents: number;
  activeWorkflows: number;
  systemHealthScore: number;
}

export interface ChannelMetrics {
  channelId: string;
  channelName: string;
  messageCount: number;
  lastActivity: number;
  status: 'connected' | 'disconnected' | 'error';
  errorRate: number;
}

export interface AgentMetrics {
  agentId: string;
  agentName: string;
  sessionCount: number;
  totalInteractions: number;
  avgResponseTime: number;
  lastUsed: number;
}

export interface WorkflowMetrics {
  workflowId: string;
  workflowName: string;
  executionCount: number;
  successRate: number;
  avgExecutionTime: number;
  lastExecuted: number;
}

/**
 * Aggregate dashboard metrics
 */
export function aggregateDashboardMetrics(db: Database): DashboardMetrics {
  const now = Date.now();

  // Total messages
  const totalMessages =
    (db.prepare('SELECT COUNT(*) as count FROM channel_messages').get() as { count: number })
      .count || 0;

  // Active channels (enabled and recently active)
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const activeChannels =
    (
      db
        .prepare(
          'SELECT COUNT(DISTINCT channel_id) as count FROM channel_messages WHERE timestamp > ?'
        )
        .get(dayAgo) as { count: number }
    ).count || 0;

  // Total agents
  const totalAgents =
    (db.prepare('SELECT COUNT(*) as count FROM agents').get() as { count: number }).count || 0;

  // Active workflows (executed in last 24 hours)
  const activeWorkflows =
    (
      db
        .prepare(
          'SELECT COUNT(DISTINCT workflow_id) as count FROM automation_executions WHERE started_at > ?'
        )
        .get(dayAgo) as { count: number }
    ).count || 0;

  // Calculate system health score
  const systemHealthScore = calculateSystemHealthScore(db, now);

  return {
    timestamp: now,
    totalMessages,
    activeChannels,
    totalAgents,
    activeWorkflows,
    systemHealthScore,
  };
}

/**
 * Get channel metrics
 */
export function getChannelMetrics(db: Database, limit: number = 20): ChannelMetrics[] {
  const channels = db
    .prepare('SELECT id, name FROM channels WHERE enabled = 1 LIMIT ?')
    .all(limit) as Array<{ id: string; name: string }>;

  return channels.map((channel) => {
    const stats = db
      .prepare(
        `SELECT
          COUNT(*) as message_count,
          MAX(timestamp) as last_activity
         FROM channel_messages
         WHERE channel_id = ?`
      )
      .get(channel.id) as { message_count: number; last_activity: number } | undefined;

    // Calculate error rate (messages with errors in last hour)
    const hourAgo = Date.now() - 60 * 60 * 1000;
    const errorStats = db
      .prepare(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN metadata_json LIKE '%"error":%' THEN 1 ELSE 0 END) as errors
         FROM channel_messages
         WHERE channel_id = ? AND timestamp > ?`
      )
      .get(channel.id, hourAgo) as { total: number; errors: number } | undefined;

    const errorRate =
      errorStats && errorStats.total > 0 ? (errorStats.errors / errorStats.total) * 100 : 0;

    // Determine status (simplified - would check actual connection status)
    const lastActivity = stats?.last_activity || 0;
    const status: 'connected' | 'disconnected' | 'error' =
      lastActivity > dayAgo ? 'connected' : lastActivity > weekAgo ? 'disconnected' : 'error';

    return {
      channelId: channel.id,
      channelName: channel.name,
      messageCount: stats?.message_count || 0,
      lastActivity,
      status,
      errorRate,
    };
  });
}

/**
 * Get agent metrics
 */
export function getAgentMetrics(db: Database, limit: number = 20): AgentMetrics[] {
  const agents = db.prepare('SELECT id, name FROM agents LIMIT ?').all(limit) as Array<{
    id: string;
    name: string;
  }>;

  return agents.map((agent) => {
    const sessionStats = db
      .prepare(
        'SELECT COUNT(*) as count, MAX(updated_at) as last_used FROM sessions WHERE agent_id = ?'
      )
      .get(agent.id) as { count: number; last_used: number } | undefined;

    const messageCount =
      (
        db
          .prepare('SELECT COUNT(*) as count FROM tool_executions WHERE agent_id = ?')
          .get(agent.id) as { count: number }
      ).count || 0;

    return {
      agentId: agent.id,
      agentName: agent.name,
      sessionCount: sessionStats?.count || 0,
      totalInteractions: messageCount,
      avgResponseTime: 0, // Would calculate from actual response times
      lastUsed: sessionStats?.last_used || 0,
    };
  });
}

/**
 * Get workflow metrics
 */
export function getWorkflowMetrics(db: Database, limit: number = 20): WorkflowMetrics[] {
  const workflows = db.prepare('SELECT id, name FROM workflows LIMIT ?').all(limit) as Array<{
    id: string;
    name: string;
  }>;

  return workflows.map((workflow) => {
    const executionStats = db
      .prepare(
        `SELECT
          COUNT(*) as count,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          AVG(duration_ms) as avg_time,
          MAX(started_at) as last_executed
         FROM automation_executions
         WHERE workflow_id = ?`
      )
      .get(workflow.id) as
      | {
          count: number;
          completed: number;
          avg_time: number;
          last_executed: number;
        }
      | undefined;

    const successRate =
      executionStats && executionStats.count > 0
        ? (executionStats.completed / executionStats.count) * 100
        : 0;

    return {
      workflowId: workflow.id,
      workflowName: workflow.name,
      executionCount: executionStats?.count || 0,
      successRate,
      avgExecutionTime: executionStats?.avg_time || 0,
      lastExecuted: executionStats?.last_executed || 0,
    };
  });
}

/**
 * Create dashboard snapshot
 */
export function createDashboardSnapshot(db: Database, metrics: DashboardMetrics): void {
  const id = Date.now().toString() + Math.random().toString(36).substring(2);

  db.prepare(
    `INSERT INTO dashboard_snapshots (id, snapshot_time, total_messages, active_channels, total_agents, active_workflows, system_health_score, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    metrics.timestamp,
    metrics.totalMessages,
    metrics.activeChannels,
    metrics.totalAgents,
    metrics.activeWorkflows,
    metrics.systemHealthScore,
    JSON.stringify({ source: 'aggregator' })
  );
}

/**
 * Get historical snapshots
 */
export function getHistoricalSnapshots(
  db: Database,
  hours: number = 24,
  _intervalMinutes: number = 60
): DashboardMetrics[] {
  const now = Date.now();
  const since = now - hours * 60 * 60 * 1000;

  const snapshots = db
    .prepare(
      `SELECT * FROM dashboard_snapshots
       WHERE snapshot_time > ?
       ORDER BY snapshot_time ASC`
    )
    .all(since) as any[];

  return snapshots.map((row) => ({
    timestamp: row.snapshot_time,
    totalMessages: row.total_messages,
    activeChannels: row.active_channels,
    totalAgents: row.total_agents,
    activeWorkflows: row.active_workflows,
    systemHealthScore: row.system_health_score,
  }));
}

/**
 * Calculate system health score
 */
function calculateSystemHealthScore(db: Database, now: number): number {
  let score = 100;

  // Check active channels (ideally at least 1)
  const activeChannels =
    (
      db
        .prepare(
          'SELECT COUNT(DISTINCT channel_id) as count FROM channel_messages WHERE timestamp > ?'
        )
        .get(now - 60 * 60 * 1000) as { count: number }
    ).count || 0;

  if (activeChannels === 0) {
    score -= 20;
  } else if (activeChannels < 2) {
    score -= 5;
  }

  // Check error rate in recent messages
  const hourAgo = now - 60 * 60 * 1000;
  const errorCheck = db
    .prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN metadata_json LIKE '%"error":%' THEN 1 ELSE 0 END) as errors
       FROM channel_messages
       WHERE timestamp > ?`
    )
    .get(hourAgo) as { total: number; errors: number } | undefined;

  if (errorCheck && errorCheck.total > 0) {
    const errorRate = (errorCheck.errors / errorCheck.total) * 100;
    score -= Math.min(errorRate, 20); // Deduct up to 20 points for errors
  }

  // Check workflow success rate
  const workflowCheck = db
    .prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
       FROM automation_executions
       WHERE started_at > ?`
    )
    .get(hourAgo) as { total: number; completed: number } | undefined;

  if (workflowCheck && workflowCheck.total > 0) {
    const successRate = (workflowCheck.completed / workflowCheck.total) * 100;
    if (successRate < 90) {
      score -= (90 - successRate) / 5; // Deduct points for low success rate
    }
  }

  return Math.max(0, Math.min(100, score));
}

// Time constants
const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
