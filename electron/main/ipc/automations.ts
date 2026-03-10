/**
 * IPC Handlers for Visual Automation Enhancements
 */

import type { Database } from 'better-sqlite3';
import * as triggers from '../workflow-engine/triggers.js';
import * as scheduler from '../workflow-engine/scheduler.js';
import * as eventBus from '../workflow-engine/event-bus.js';

// ============================================================================
// TRIGGER SYSTEM HANDLERS
// ============================================================================

export const automationsCreateTrigger = (
  db: Database,
  workflowId: string,
  triggerType: triggers.TriggerType,
  triggerConfig: triggers.TriggerConfig,
  enabled?: boolean
) => {
  return triggers.createTrigger(db, workflowId, triggerType, triggerConfig, enabled);
};

export const automationsGetTrigger = (db: Database, triggerId: string) => {
  return triggers.getTrigger(db, triggerId);
};

export const automationsGetTriggers = (db: Database, workflowId?: string) => {
  return triggers.getTriggers(db, workflowId);
};

export const automationsGetEnabledTriggers = (db: Database) => {
  return triggers.getEnabledTriggers(db);
};

export const automationsGetTriggersByType = (db: Database, triggerType: triggers.TriggerType) => {
  return triggers.getTriggersByType(db, triggerType);
};

export const automationsUpdateTrigger = (
  db: Database,
  triggerId: string,
  updates: Partial<Pick<triggers.AutomationTrigger, 'triggerConfig' | 'enabled'>>
) => {
  return triggers.updateTrigger(db, triggerId, updates);
};

export const automationsDeleteTrigger = (db: Database, triggerId: string) => {
  return triggers.deleteTrigger(db, triggerId);
};

export const automationsSetTriggerEnabled = (db: Database, triggerId: string, enabled: boolean) => {
  return triggers.setTriggerEnabled(db, triggerId, enabled);
};

export const automationsGetDueTriggers = (db: Database) => {
  return triggers.getDueTriggers(db);
};

export const automationsSubscribeChannelEvent = (
  db: Database,
  triggerId: string,
  channelId: string,
  eventType: triggers.ChannelEventSubscription['eventType'],
  filter?: Record<string, unknown>
) => {
  return triggers.subscribeToChannelEvent(db, triggerId, channelId, eventType, filter);
};

export const automationsGetChannelSubscriptions = (db: Database, triggerId: string) => {
  return triggers.getChannelEventSubscriptions(db, triggerId);
};

export const automationsGetChannelSubsForChannel = (db: Database, channelId: string) => {
  return triggers.getChannelSubscriptions(db, channelId);
};

export const automationsDeleteChannelSubscription = (db: Database, subscriptionId: string) => {
  return triggers.deleteChannelEventSubscription(db, subscriptionId);
};

export const automationsValidateConfig = (
  triggerType: triggers.TriggerType,
  config: triggers.TriggerConfig
) => {
  return triggers.validateTriggerConfig(triggerType, config);
};

export const automationsGetTriggerStats = (db: Database) => {
  return triggers.getTriggerStats(db);
};

// ============================================================================
// SCHEDULER HANDLERS
// ============================================================================

export const automationsExecuteTrigger = async (
  db: Database,
  triggerId: string,
  inputData?: Record<string, unknown>
) => {
  return await scheduler.executeAutomationTrigger(db, triggerId, inputData);
};

export const automationsGetExecution = (db: Database, executionId: string) => {
  return scheduler.getExecution(db, executionId);
};

export const automationsGetTriggerExecutions = (
  db: Database,
  triggerId: string,
  limit?: number
) => {
  return scheduler.getTriggerExecutions(db, triggerId, limit);
};

export const automationsGetWorkflowExecutions = (
  db: Database,
  workflowId: string,
  limit?: number
) => {
  return scheduler.getWorkflowExecutions(db, workflowId, limit);
};

export const automationsGetRecentExecutions = (db: Database, limit?: number) => {
  return scheduler.getRecentExecutions(db, limit);
};

export const automationsCancelExecution = (db: Database, executionId: string) => {
  return scheduler.cancelExecution(db, executionId);
};

export const automationsGetExecutionStats = (db: Database, timeRange?: number) => {
  return scheduler.getExecutionStats(db, timeRange);
};

export const automationsCleanupExecutions = (db: Database, olderThan?: number) => {
  return scheduler.cleanupOldExecutions(db, olderThan);
};

export const automationsRetryExecution = async (db: Database, executionId: string) => {
  return await scheduler.retryExecution(db, executionId);
};

export const automationsGetExecutionsByStatus = (
  db: Database,
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled',
  limit?: number
) => {
  return scheduler.getExecutionsByStatus(db, status, limit);
};

// ============================================================================
// EVENT BUS HANDLERS
// ============================================================================

export const automationsGetEventBusStats = (db: Database) => {
  return eventBus.getEventBus(db).getStats();
};

export const automationsEmitMessageReceived = async (
  db: Database,
  channelId: string,
  messageId: string,
  peerId: string,
  content: string
) => {
  return await eventBus.emitMessageReceived(db, channelId, messageId, peerId, content);
};

export const automationsEmitUserJoined = async (
  db: Database,
  channelId: string,
  peerId: string
) => {
  return await eventBus.emitUserJoined(db, channelId, peerId);
};

export const automationsEmitError = async (
  db: Database,
  errorType: string,
  errorMessage: string,
  metadata?: Record<string, unknown>
) => {
  return await eventBus.emitError(db, errorType, errorMessage, metadata);
};

export const automationsSubscribeChannelEvents = (
  db: Database,
  callback: (event: eventBus.ChannelEvent) => void
) => {
  return eventBus.subscribeToChannelEvents(db, callback);
};

export const automationsSubscribeSystemEvents = (
  db: Database,
  callback: (event: eventBus.SystemEvent) => void
) => {
  return eventBus.subscribeToSystemEvents(db, callback);
};

export const automationsShutdownEventBus = () => {
  return eventBus.shutdownEventBus();
};
