/**
 * IPC Handlers for Enhanced Dashboard
 */

import type { Database } from 'better-sqlite3';
import * as aggregator from '../dashboard/aggregator.js';
import * as healthMonitor from '../dashboard/health-monitor.js';
import * as analytics from '../dashboard/analytics.js';

// ============================================================================
// DASHBOARD AGGREGATOR HANDLERS
// ============================================================================

export const dashboardAggregateMetrics = (db: Database) => {
  return aggregator.aggregateDashboardMetrics(db);
};

export const dashboardGetChannelMetrics = (db: Database, limit?: number) => {
  return aggregator.getChannelMetrics(db, limit);
};

export const dashboardGetAgentMetrics = (db: Database, limit?: number) => {
  return aggregator.getAgentMetrics(db, limit);
};

export const dashboardGetWorkflowMetrics = (db: Database, limit?: number) => {
  return aggregator.getWorkflowMetrics(db, limit);
};

export const dashboardCreateSnapshot = (db: Database, metrics: aggregator.DashboardMetrics) => {
  return aggregator.createDashboardSnapshot(db, metrics);
};

export const dashboardGetSnapshots = (db: Database, hours?: number, intervalMinutes?: number) => {
  return aggregator.getHistoricalSnapshots(db, hours, intervalMinutes);
};

// ============================================================================
// HEALTH MONITOR HANDLERS
// ============================================================================

export const dashboardRecordHealthMetric = (
  db: Database,
  channelId: string,
  metricType: healthMonitor.MetricType,
  value: number
) => {
  return healthMonitor.recordHealthMetric(db, channelId, metricType, value);
};

export const dashboardGetHealthMetrics = (
  db: Database,
  channelId: string,
  metricType?: healthMonitor.MetricType,
  since?: number,
  limit?: number
) => {
  return healthMonitor.getHealthMetrics(db, channelId, metricType, since, limit);
};

export const dashboardGetLatestHealthMetrics = (db: Database) => {
  return healthMonitor.getLatestHealthMetrics(db);
};

export const dashboardGetChannelHealthStatus = (db: Database, channelId: string) => {
  return healthMonitor.getChannelHealthStatus(db, channelId);
};

export const dashboardGetAllChannelHealthStatus = (db: Database) => {
  return healthMonitor.getAllChannelHealthStatus(db);
};

export const dashboardRecordConnectivity = (
  db: Database,
  channelId: string,
  connected: boolean
) => {
  return healthMonitor.recordConnectivity(db, channelId, connected);
};

export const dashboardRecordResponseTime = (
  db: Database,
  channelId: string,
  responseTimeMs: number
) => {
  return healthMonitor.recordResponseTime(db, channelId, responseTimeMs);
};

export const dashboardRecordErrorRate = (db: Database, channelId: string, errorRate: number) => {
  return healthMonitor.recordErrorRate(db, channelId, errorRate);
};

export const dashboardRecordMessageCount = (db: Database, channelId: string, count: number) => {
  return healthMonitor.recordMessageCount(db, channelId, count);
};

export const dashboardGetHealthTrends = (db: Database, channelId: string, hours?: number) => {
  return healthMonitor.getHealthTrends(db, channelId, hours);
};

export const dashboardCleanupHealthMetrics = (db: Database, olderThan?: number) => {
  return healthMonitor.cleanupHealthMetrics(db, olderThan);
};

export const dashboardGetSystemHealthSummary = (db: Database) => {
  return healthMonitor.getSystemHealthSummary(db);
};

// ============================================================================
// ANALYTICS ENGINE HANDLERS
// ============================================================================

export const dashboardAddActivityFeedItem = (
  db: Database,
  item: Omit<analytics.ActivityFeedItem, 'id'>
) => {
  return analytics.addActivityFeedItem(db, item);
};

export const dashboardGetActivityFeed = (
  db: Database,
  limit?: number,
  offset?: number,
  filters?: {
    activityType?: analytics.ActivityFeedItem['activityType'];
    sourceType?: analytics.ActivityFeedItem['sourceType'];
    sourceId?: string;
    since?: number;
  }
) => {
  return analytics.getActivityFeed(db, limit, offset, filters);
};

export const dashboardLogMessageAudit = (
  db: Database,
  messageId: string,
  channelId: string,
  sessionId: string | undefined,
  agentId: string | undefined,
  actionType: 'received' | 'processed' | 'responded' | 'error' | 'blocked',
  details?: Record<string, unknown>
) => {
  return analytics.logMessageAudit(
    db,
    messageId,
    channelId,
    sessionId,
    agentId,
    actionType,
    details
  );
};

export const dashboardGetMessageAuditLog = (
  db: Database,
  limit?: number,
  offset?: number,
  filters?: {
    messageId?: string;
    channelId?: string;
    sessionId?: string;
    agentId?: string;
    actionType?: string;
    since?: number;
  }
) => {
  return analytics.getMessageAuditLog(db, limit, offset, filters);
};

export const dashboardGenerateReport = (db: Database, startDate: number, endDate: number) => {
  return analytics.generateAnalyticsReport(db, startDate, endDate);
};

export const dashboardCleanupActivityFeed = (db: Database, olderThan?: number) => {
  return analytics.cleanupActivityFeed(db, olderThan);
};

export const dashboardCleanupAuditLog = (db: Database, olderThan?: number) => {
  return analytics.cleanupAuditLog(db, olderThan);
};

export const dashboardGetQuickStats = (db: Database) => {
  return analytics.getQuickStats(db);
};
