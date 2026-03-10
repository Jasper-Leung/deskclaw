/**
 * Dashboard Health Monitor
 * Monitors health metrics for channels and system components
 */

import type { Database } from 'better-sqlite3';
import { randomUUID } from 'crypto';

export type MetricType = 'connectivity' | 'response_time' | 'error_rate' | 'message_count';

export interface HealthMetric {
  id: string;
  channelId: string;
  metricType: MetricType;
  value: number;
  timestamp: number;
}

export interface ChannelHealthStatus {
  channelId: string;
  channelName: string;
  overallHealth: 'healthy' | 'degraded' | 'unhealthy';
  connectivity: number;
  responseTime: number;
  errorRate: number;
  messageCount: number;
  lastUpdated: number;
}

/**
 * Record a health metric
 */
export function recordHealthMetric(
  db: Database,
  channelId: string,
  metricType: MetricType,
  value: number
): HealthMetric {
  const id = randomUUID();
  const timestamp = Date.now();

  db.prepare(
    `INSERT INTO channel_health_metrics (id, channel_id, metric_type, value, timestamp)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, channelId, metricType, value, timestamp);

  return {
    id,
    channelId,
    metricType,
    value,
    timestamp,
  };
}

/**
 * Get health metrics for a channel
 */
export function getHealthMetrics(
  db: Database,
  channelId: string,
  metricType?: MetricType,
  since?: number,
  limit?: number
): HealthMetric[] {
  let query = 'SELECT * FROM channel_health_metrics WHERE channel_id = ?';
  const params: any[] = [channelId];

  if (metricType) {
    query += ' AND metric_type = ?';
    params.push(metricType);
  }

  if (since) {
    query += ' AND timestamp > ?';
    params.push(since);
  }

  query += ' ORDER BY timestamp DESC';

  if (limit) {
    query += ' LIMIT ?';
    params.push(limit);
  }

  const results = db.prepare(query).all(...params) as any[];

  return results.map((row) => ({
    id: row.id,
    channelId: row.channel_id,
    metricType: row.metric_type,
    value: row.value,
    timestamp: row.timestamp,
  }));
}

/**
 * Get latest health metrics for all channels
 */
export function getLatestHealthMetrics(db: Database): Map<string, HealthMetric[]> {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

  const results = db
    .prepare(
      `SELECT * FROM channel_health_metrics
       WHERE timestamp > ?
       ORDER BY channel_id, metric_type, timestamp DESC`
    )
    .all(fiveMinutesAgo) as any[];

  const metrics = new Map<string, HealthMetric[]>();

  for (const row of results) {
    const channelId = row.channel_id;
    if (!metrics.has(channelId)) {
      metrics.set(channelId, []);
    }
    metrics.get(channelId)!.push({
      id: row.id,
      channelId: row.channel_id,
      metricType: row.metric_type,
      value: row.value,
      timestamp: row.timestamp,
    });
  }

  return metrics;
}

/**
 * Get channel health status
 */
export function getChannelHealthStatus(
  db: Database,
  channelId: string
): ChannelHealthStatus | undefined {
  const channel = db.prepare('SELECT name FROM channels WHERE id = ?').get(channelId) as
    | { name: string }
    | undefined;

  if (!channel) return undefined;

  const metrics = getHealthMetrics(db, channelId, undefined, Date.now() - 5 * 60 * 1000, 100);

  const latestMetrics: Record<MetricType, number> = {
    connectivity: 100,
    response_time: 0,
    error_rate: 0,
    message_count: 0,
  };

  for (const metric of metrics) {
    latestMetrics[metric.metricType] = metric.value;
  }

  // Calculate overall health
  let healthScore = 100;
  healthScore -= latestMetrics.error_rate * 2; // Error rate has high impact
  if (latestMetrics.connectivity < 100) {
    healthScore -= 100 - latestMetrics.connectivity;
  }
  if (latestMetrics.response_time > 1000) {
    healthScore -= Math.min((latestMetrics.response_time - 1000) / 100, 20);
  }

  const overallHealth: 'healthy' | 'degraded' | 'unhealthy' =
    healthScore >= 80 ? 'healthy' : healthScore >= 50 ? 'degraded' : 'unhealthy';

  return {
    channelId,
    channelName: channel.name,
    overallHealth,
    connectivity: latestMetrics.connectivity,
    responseTime: latestMetrics.response_time,
    errorRate: latestMetrics.error_rate,
    messageCount: latestMetrics.message_count,
    lastUpdated: Date.now(),
  };
}

/**
 * Get health status for all channels
 */
export function getAllChannelHealthStatus(db: Database): ChannelHealthStatus[] {
  const channels = db.prepare('SELECT id FROM channels WHERE enabled = 1').all() as Array<{
    id: string;
  }>;

  const statuses: ChannelHealthStatus[] = [];

  for (const channel of channels) {
    const status = getChannelHealthStatus(db, channel.id);
    if (status) {
      statuses.push(status);
    }
  }

  return statuses.sort((a, b) => {
    // Sort by health status (unhealthy first)
    const healthOrder = { unhealthy: 0, degraded: 1, healthy: 2 };
    return healthOrder[a.overallHealth] - healthOrder[b.overallHealth];
  });
}

/**
 * Record connectivity metric
 */
export function recordConnectivity(db: Database, channelId: string, connected: boolean): void {
  recordHealthMetric(db, channelId, 'connectivity', connected ? 100 : 0);
}

/**
 * Record response time metric
 */
export function recordResponseTime(db: Database, channelId: string, responseTimeMs: number): void {
  recordHealthMetric(db, channelId, 'response_time', responseTimeMs);
}

/**
 * Record error rate metric
 */
export function recordErrorRate(db: Database, channelId: string, errorRate: number): void {
  recordHealthMetric(db, channelId, 'error_rate', Math.min(100, Math.max(0, errorRate)));
}

/**
 * Record message count metric
 */
export function recordMessageCount(db: Database, channelId: string, count: number): void {
  recordHealthMetric(db, channelId, 'message_count', count);
}

/**
 * Get health trends for a channel
 */
export function getHealthTrends(
  db: Database,
  channelId: string,
  hours: number = 24
): Array<{
  timestamp: number;
  connectivity: number;
  responseTime: number;
  errorRate: number;
  messageCount: number;
}> {
  const since = Date.now() - hours * 60 * 60 * 1000;

  const results = db
    .prepare(
      `SELECT
        (timestamp / 300000) * 300000 as bucket, -- 5-minute buckets
        metric_type,
        AVG(value) as avg_value
       FROM channel_health_metrics
       WHERE channel_id = ? AND timestamp > ?
       GROUP BY bucket, metric_type
       ORDER BY bucket ASC`
    )
    .all(channelId, since) as any[];

  const trends = new Map<number, Record<MetricType, number>>();

  for (const row of results) {
    if (!trends.has(row.bucket)) {
      trends.set(row.bucket, {
        connectivity: 100,
        response_time: 0,
        error_rate: 0,
        message_count: 0,
      });
    }
    trends.get(row.bucket)![row.metric_type as MetricType] = row.avg_value;
  }

  return Array.from(trends.entries()).map(([timestamp, metrics]) => ({
    timestamp,
    connectivity: metrics.connectivity,
    responseTime: metrics.response_time,
    errorRate: metrics.error_rate,
    messageCount: metrics.message_count,
  }));
}

/**
 * Clean up old health metrics
 */
export function cleanupHealthMetrics(
  db: Database,
  olderThan: number = 7 * 24 * 60 * 60 * 1000
): number {
  const cutoff = Date.now() - olderThan;
  const result = db.prepare('DELETE FROM channel_health_metrics WHERE timestamp < ?').run(cutoff);
  return result.changes;
}

/**
 * Get system health summary
 */
export function getSystemHealthSummary(db: Database): {
  totalChannels: number;
  healthyChannels: number;
  degradedChannels: number;
  unhealthyChannels: number;
  overallHealth: 'healthy' | 'degraded' | 'unhealthy';
} {
  const statuses = getAllChannelHealthStatus(db);

  const healthy = statuses.filter((s) => s.overallHealth === 'healthy').length;
  const degraded = statuses.filter((s) => s.overallHealth === 'degraded').length;
  const unhealthy = statuses.filter((s) => s.overallHealth === 'unhealthy').length;

  let overallHealth: 'healthy' | 'degraded' | 'unhealthy';
  if (unhealthy > 0) {
    overallHealth = 'unhealthy';
  } else if (degraded > 0) {
    overallHealth = 'degraded';
  } else {
    overallHealth = 'healthy';
  }

  return {
    totalChannels: statuses.length,
    healthyChannels: healthy,
    degradedChannels: degraded,
    unhealthyChannels: unhealthy,
    overallHealth,
  };
}
