/**
 * Enhanced Triggers System
 * Provides advanced trigger types for workflow automation
 */

import type { Database } from 'better-sqlite3';
import { randomUUID } from 'crypto';

export type TriggerType = 'schedule' | 'channel_event' | 'system_event' | 'webhook' | 'conditional';

export interface AutomationTrigger {
  id: string;
  workflowId: string;
  triggerType: TriggerType;
  triggerConfig: TriggerConfig;
  enabled: boolean;
  lastTriggered?: number;
  nextTrigger?: number;
  createdAt: number;
}

export interface TriggerConfig {
  // Schedule trigger config
  cronExpression?: string;
  timezone?: string;

  // Channel event trigger config
  channelId?: string;
  eventType?:
    | 'message_received'
    | 'message_sent'
    | 'user_joined'
    | 'user_left'
    | 'channel_mention'
    | 'keyword';
  filter?: Record<string, unknown>;

  // System event trigger config
  systemEventType?: 'startup' | 'shutdown' | 'error' | 'threshold_reached';

  // Webhook trigger config
  webhookPath?: string;
  webhookSecret?: string;

  // Conditional trigger config
  condition?: string;
  checkInterval?: number;
}

export interface ChannelEventSubscription {
  id: string;
  triggerId: string;
  channelId: string;
  eventType:
    | 'message_received'
    | 'message_sent'
    | 'user_joined'
    | 'user_left'
    | 'channel_mention'
    | 'keyword';
  filter?: Record<string, unknown>;
  createdAt: number;
}

/**
 * Create an automation trigger
 */
export function createTrigger(
  db: Database,
  workflowId: string,
  triggerType: TriggerType,
  triggerConfig: TriggerConfig,
  enabled: boolean = true
): AutomationTrigger {
  const id = randomUUID();
  const now = Date.now();

  db.prepare(
    `INSERT INTO automation_triggers (id, workflow_id, trigger_type, trigger_config_json, enabled, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, workflowId, triggerType, JSON.stringify(triggerConfig), enabled ? 1 : 0, now);

  // Calculate next trigger time for scheduled triggers
  let nextTrigger: number | undefined;
  if (triggerType === 'schedule' && triggerConfig.cronExpression) {
    nextTrigger = calculateNextCronTime(triggerConfig.cronExpression);
    db.prepare('UPDATE automation_triggers SET next_trigger = ? WHERE id = ?').run(nextTrigger, id);
  }

  return {
    id,
    workflowId,
    triggerType,
    triggerConfig,
    enabled,
    createdAt: now,
    nextTrigger,
  };
}

/**
 * Get trigger by ID
 */
export function getTrigger(db: Database, triggerId: string): AutomationTrigger | undefined {
  const result = db.prepare('SELECT * FROM automation_triggers WHERE id = ?').get(triggerId) as any;
  if (!result) return undefined;

  return {
    id: result.id,
    workflowId: result.workflow_id,
    triggerType: result.trigger_type,
    triggerConfig: JSON.parse(result.trigger_config_json),
    enabled: result.enabled === 1,
    lastTriggered: result.last_triggered,
    nextTrigger: result.next_trigger,
    createdAt: result.created_at,
  };
}

/**
 * Get all triggers
 */
export function getTriggers(db: Database, workflowId?: string): AutomationTrigger[] {
  let query = 'SELECT * FROM automation_triggers WHERE 1=1';
  const params: any[] = [];

  if (workflowId) {
    query += ' AND workflow_id = ?';
    params.push(workflowId);
  }

  query += ' ORDER BY created_at DESC';

  const results = db.prepare(query).all(...params) as any[];

  return results.map((row) => ({
    id: row.id,
    workflowId: row.workflow_id,
    triggerType: row.trigger_type,
    triggerConfig: JSON.parse(row.trigger_config_json),
    enabled: row.enabled === 1,
    lastTriggered: row.last_triggered,
    nextTrigger: row.next_trigger,
    createdAt: row.created_at,
  }));
}

/**
 * Get enabled triggers
 */
export function getEnabledTriggers(db: Database): AutomationTrigger[] {
  return getTriggers(db).filter((t) => t.enabled);
}

/**
 * Get triggers by type
 */
export function getTriggersByType(db: Database, triggerType: TriggerType): AutomationTrigger[] {
  return getTriggers(db).filter((t) => t.triggerType === triggerType);
}

/**
 * Update trigger
 */
export function updateTrigger(
  db: Database,
  triggerId: string,
  updates: Partial<Pick<AutomationTrigger, 'triggerConfig' | 'enabled'>>
): AutomationTrigger | undefined {
  const existing = getTrigger(db, triggerId);
  if (!existing) return undefined;

  const fields: string[] = [];
  const values: any[] = [];

  if (updates.triggerConfig !== undefined) {
    fields.push('trigger_config_json = ?');
    values.push(JSON.stringify(updates.triggerConfig));

    // Recalculate next trigger for schedule triggers
    if (existing.triggerType === 'schedule' && updates.triggerConfig.cronExpression) {
      const nextTrigger = calculateNextCronTime(updates.triggerConfig.cronExpression);
      fields.push('next_trigger = ?');
      values.push(nextTrigger);
    }
  }

  if (updates.enabled !== undefined) {
    fields.push('enabled = ?');
    values.push(updates.enabled ? 1 : 0);
  }

  if (fields.length === 0) return existing;

  values.push(triggerId);
  db.prepare(`UPDATE automation_triggers SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  return getTrigger(db, triggerId);
}

/**
 * Delete trigger
 */
export function deleteTrigger(db: Database, triggerId: string): boolean {
  // Delete associated channel event subscriptions
  db.prepare('DELETE FROM channel_event_subscriptions WHERE trigger_id = ?').run(triggerId);

  // Delete trigger
  const result = db.prepare('DELETE FROM automation_triggers WHERE id = ?').run(triggerId);
  return result.changes > 0;
}

/**
 * Enable or disable trigger
 */
export function setTriggerEnabled(db: Database, triggerId: string, enabled: boolean): boolean {
  const result = db
    .prepare('UPDATE automation_triggers SET enabled = ? WHERE id = ?')
    .run(enabled ? 1 : 0, triggerId);
  return result.changes > 0;
}

/**
 * Record trigger execution
 */
export function recordTriggerExecution(db: Database, triggerId: string): void {
  const now = Date.now();
  db.prepare('UPDATE automation_triggers SET last_triggered = ? WHERE id = ?').run(now, triggerId);

  // Calculate next trigger for schedule triggers
  const trigger = getTrigger(db, triggerId);
  if (trigger && trigger.triggerType === 'schedule' && trigger.triggerConfig.cronExpression) {
    const nextTrigger = calculateNextCronTime(trigger.triggerConfig.cronExpression);
    db.prepare('UPDATE automation_triggers SET next_trigger = ? WHERE id = ?').run(
      nextTrigger,
      triggerId
    );
  }
}

/**
 * Get due triggers (triggers that should be executed)
 */
export function getDueTriggers(db: Database): AutomationTrigger[] {
  const now = Date.now();
  const triggers = getEnabledTriggers(db);

  return triggers.filter((trigger) => {
    switch (trigger.triggerType) {
      case 'schedule':
        return trigger.nextTrigger !== undefined && trigger.nextTrigger <= now;
      default:
        return false;
    }
  });
}

/**
 * Subscribe to channel event
 */
export function subscribeToChannelEvent(
  db: Database,
  triggerId: string,
  channelId: string,
  eventType: ChannelEventSubscription['eventType'],
  filter?: Record<string, unknown>
): ChannelEventSubscription {
  const id = randomUUID();
  const now = Date.now();

  db.prepare(
    `INSERT INTO channel_event_subscriptions (id, trigger_id, channel_id, event_type, filter_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, triggerId, channelId, eventType, filter ? JSON.stringify(filter) : null, now);

  return {
    id,
    triggerId,
    channelId,
    eventType,
    filter,
    createdAt: now,
  };
}

/**
 * Get channel event subscriptions for a trigger
 */
export function getChannelEventSubscriptions(
  db: Database,
  triggerId: string
): ChannelEventSubscription[] {
  const results = db
    .prepare('SELECT * FROM channel_event_subscriptions WHERE trigger_id = ?')
    .all(triggerId) as any[];

  return results.map((row) => ({
    id: row.id,
    triggerId: row.trigger_id,
    channelId: row.channel_id,
    eventType: row.event_type,
    filter: row.filter_json ? JSON.parse(row.filter_json) : undefined,
    createdAt: row.created_at,
  }));
}

/**
 * Get channel event subscriptions for a channel
 */
export function getChannelSubscriptions(
  db: Database,
  channelId: string
): ChannelEventSubscription[] {
  const results = db
    .prepare('SELECT * FROM channel_event_subscriptions WHERE channel_id = ?')
    .all(channelId) as any[];

  return results.map((row) => ({
    id: row.id,
    triggerId: row.trigger_id,
    channelId: row.channel_id,
    eventType: row.event_type,
    filter: row.filter_json ? JSON.parse(row.filter_json) : undefined,
    createdAt: row.created_at,
  }));
}

/**
 * Delete channel event subscription
 */
export function deleteChannelEventSubscription(db: Database, subscriptionId: string): boolean {
  const result = db
    .prepare('DELETE FROM channel_event_subscriptions WHERE id = ?')
    .run(subscriptionId);
  return result.changes > 0;
}

/**
 * Calculate next cron time
 */
function calculateNextCronTime(cronExpression: string): number {
  // Simple cron parser (5-field or 6-field format)
  // Format: minute hour day month weekday [second]
  const parts = cronExpression.trim().split(/\s+/);

  if (parts.length < 5 || parts.length > 6) {
    console.error(`Invalid cron expression: ${cronExpression}`);
    return Date.now() + 60 * 60 * 1000; // Default: 1 hour from now
  }

  // For this implementation, use a simple heuristic
  // In production, use a proper cron library
  const now = new Date();
  const next = new Date(now);

  if (parts.length === 6) {
    // Has seconds field
    const second = parts[0];
    if (second !== '*') {
      const secondVal = parseInt(second);
      if (!isNaN(secondVal)) {
        next.setSeconds(secondVal);
        next.setMinutes(next.getMinutes() + 1);
      }
    }
  }

  const minute = parts[parts.length === 6 ? 1 : 0];
  const hour = parts[parts.length === 6 ? 2 : 1];

  if (minute !== '*') {
    const minuteVal = parseInt(minute);
    if (!isNaN(minuteVal)) {
      next.setMinutes(minuteVal);
      if (next.getTime() <= now.getTime()) {
        next.setHours(next.getHours() + 1);
      }
    }
  }

  if (hour !== '*') {
    const hourVal = parseInt(hour);
    if (!isNaN(hourVal)) {
      next.setHours(hourVal);
      if (next.getTime() <= now.getTime()) {
        next.setDate(next.getDate() + 1);
      }
    }
  }

  return next.getTime();
}

/**
 * Validate trigger config
 */
export function validateTriggerConfig(
  triggerType: TriggerType,
  config: TriggerConfig
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  switch (triggerType) {
    case 'schedule':
      if (!config.cronExpression) {
        errors.push('Schedule triggers require a cron expression');
      }
      break;

    case 'channel_event':
      if (!config.channelId) {
        errors.push('Channel event triggers require a channel ID');
      }
      if (!config.eventType) {
        errors.push('Channel event triggers require an event type');
      }
      break;

    case 'webhook':
      if (!config.webhookPath) {
        errors.push('Webhook triggers require a webhook path');
      }
      break;

    case 'conditional':
      if (!config.condition) {
        errors.push('Conditional triggers require a condition expression');
      }
      break;
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get trigger statistics
 */
export function getTriggerStats(db: Database): {
  totalTriggers: number;
  enabledTriggers: number;
  triggersByType: Record<TriggerType, number>;
  dueTriggers: number;
} {
  const allTriggers = getTriggers(db);
  const enabledTriggers = allTriggers.filter((t) => t.enabled);
  const dueTriggers = getDueTriggers(db);

  const triggersByType: Record<string, number> = {
    schedule: 0,
    channel_event: 0,
    system_event: 0,
    webhook: 0,
    conditional: 0,
  };

  for (const trigger of allTriggers) {
    triggersByType[trigger.triggerType]++;
  }

  return {
    totalTriggers: allTriggers.length,
    enabledTriggers: enabledTriggers.length,
    triggersByType: triggersByType as Record<TriggerType, number>,
    dueTriggers: dueTriggers.length,
  };
}
