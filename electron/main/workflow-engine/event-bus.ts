/**
 * Event Bus for Workflow Automation
 * Handles event-driven triggers and subscriptions
 */

import type { Database } from 'better-sqlite3';
import { EventEmitter } from 'events';
import * as triggers from './triggers.js';
import * as scheduler from './scheduler.js';

export interface ChannelEvent {
  type:
    | 'message_received'
    | 'message_sent'
    | 'user_joined'
    | 'user_left'
    | 'channel_mention'
    | 'keyword';
  channelId: string;
  data: {
    messageId?: string;
    peerId?: string;
    content?: string;
    timestamp: number;
    [key: string]: unknown;
  };
}

export interface SystemEvent {
  type: 'startup' | 'shutdown' | 'error' | 'threshold_reached';
  data: {
    [key: string]: unknown;
  };
}

class WorkflowEventBus extends EventEmitter {
  private db: Database;
  private processing = new Set<string>();
  private checkInterval?: NodeJS.Timeout;

  constructor(db: Database) {
    super();
    this.db = db;
    this.setupScheduledCheck();
  }

  /**
   * Emit a channel event
   */
  async emitChannelEvent(event: ChannelEvent): Promise<void> {
    this.emit('channel_event', event);
    await this.processChannelEvent(event);
  }

  /**
   * Emit a system event
   */
  async emitSystemEvent(event: SystemEvent): Promise<void> {
    this.emit('system_event', event);
    await this.processSystemEvent(event);
  }

  /**
   * Process channel event and trigger matching automations
   */
  private async processChannelEvent(event: ChannelEvent): Promise<void> {
    // Get channel event subscriptions for this channel and event type
    const subscriptions = this.db
      .prepare(
        `SELECT ces.* FROM channel_event_subscriptions ces
         INNER JOIN automation_triggers at ON ces.trigger_id = at.id
         WHERE ces.channel_id = ? AND ces.event_type = ? AND at.enabled = 1`
      )
      .all(event.channelId, event.type) as Array<{
      id: string;
      trigger_id: string;
      filter_json: string | null;
    }>;

    for (const subscription of subscriptions) {
      // Prevent duplicate processing
      const key = `${subscription.trigger_id}:${event.data.messageId || event.data.timestamp}`;
      if (this.processing.has(key)) continue;

      try {
        this.processing.add(key);

        // Check filter if present
        if (subscription.filter_json) {
          const filter = JSON.parse(subscription.filter_json);
          if (!this.matchesFilter(event.data, filter)) {
            continue;
          }
        }

        // Execute the trigger
        await scheduler.executeAutomationTrigger(this.db, subscription.trigger_id, {
          event,
        });
      } catch (error) {
        console.error(
          `Error processing channel event for trigger ${subscription.trigger_id}:`,
          error
        );
      } finally {
        setTimeout(() => this.processing.delete(key), 5000); // Clear after 5 seconds
      }
    }
  }

  /**
   * Process system event and trigger matching automations
   */
  private async processSystemEvent(event: SystemEvent): Promise<void> {
    // Get triggers with matching system event type
    const triggerResults = this.db
      .prepare(
        `SELECT at.id, at.trigger_config_json
         FROM automation_triggers at
         WHERE at.trigger_type = 'system_event' AND at.enabled = 1`
      )
      .all() as Array<{ id: string; trigger_config_json: string }>;

    for (const trigger of triggerResults) {
      try {
        const config = JSON.parse(trigger.trigger_config_json);

        if (config.systemEventType === event.type) {
          await scheduler.executeAutomationTrigger(this.db, trigger.id, {
            event,
          });
        }
      } catch (error) {
        console.error(`Error processing system event for trigger ${trigger.id}:`, error);
      }
    }
  }

  /**
   * Check if event data matches filter
   */
  private matchesFilter(data: Record<string, unknown>, filter: Record<string, unknown>): boolean {
    for (const [key, value] of Object.entries(filter)) {
      if (value === '*') continue;

      const dataValue = data[key];
      if (typeof value === 'string' && typeof dataValue === 'string') {
        // Simple pattern matching
        const pattern = value.replace(/\*/g, '.*');
        const regex = new RegExp(`^${pattern}$`, 'i');
        if (!regex.test(dataValue)) {
          return false;
        }
      } else if (dataValue !== value) {
        return false;
      }
    }

    return true;
  }

  /**
   * Setup scheduled trigger checking
   */
  private setupScheduledCheck(): void {
    // Check every minute for due scheduled triggers
    this.checkInterval = setInterval(async () => {
      await this.checkDueTriggers();
    }, 60 * 1000);
  }

  /**
   * Check and execute due scheduled triggers
   */
  private async checkDueTriggers(): Promise<void> {
    try {
      const dueTriggers = triggers.getDueTriggers(this.db);

      for (const trigger of dueTriggers) {
        try {
          await scheduler.executeAutomationTrigger(this.db, trigger.id);
        } catch (error) {
          console.error(`Error executing scheduled trigger ${trigger.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error checking due triggers:', error);
    }
  }

  /**
   * Stop the event bus
   */
  shutdown(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    this.removeAllListeners();
  }

  /**
   * Get event bus statistics
   */
  getStats(): {
    processingCount: number;
    listenerCount: number;
  } {
    return {
      processingCount: this.processing.size,
      listenerCount: this.listenerCount('channel_event') + this.listenerCount('system_event'),
    };
  }
}

// Singleton instance
let eventBusInstance: WorkflowEventBus | null = null;

/**
 * Get the event bus instance
 */
export function getEventBus(db: Database): WorkflowEventBus {
  if (!eventBusInstance) {
    eventBusInstance = new WorkflowEventBus(db);
  }
  return eventBusInstance;
}

/**
 * Shutdown the event bus
 */
export function shutdownEventBus(): void {
  if (eventBusInstance) {
    eventBusInstance.shutdown();
    eventBusInstance = null;
  }
}

/**
 * Helper: Emit message received event
 */
export async function emitMessageReceived(
  db: Database,
  channelId: string,
  messageId: string,
  peerId: string,
  content: string
): Promise<void> {
  const eventBus = getEventBus(db);
  await eventBus.emitChannelEvent({
    type: 'message_received',
    channelId,
    data: {
      messageId,
      peerId,
      content,
      timestamp: Date.now(),
    },
  });
}

/**
 * Helper: Emit user joined event
 */
export async function emitUserJoined(
  db: Database,
  channelId: string,
  peerId: string
): Promise<void> {
  const eventBus = getEventBus(db);
  await eventBus.emitChannelEvent({
    type: 'user_joined',
    channelId,
    data: {
      peerId,
      timestamp: Date.now(),
    },
  });
}

/**
 * Helper: Emit error event
 */
export async function emitError(
  db: Database,
  errorType: string,
  errorMessage: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const eventBus = getEventBus(db);
  await eventBus.emitSystemEvent({
    type: 'error',
    data: {
      errorType,
      errorMessage,
      timestamp: Date.now(),
      ...metadata,
    },
  });
}

/**
 * Subscribe to channel events
 */
export function subscribeToChannelEvents(
  db: Database,
  callback: (event: ChannelEvent) => void
): () => void {
  const eventBus = getEventBus(db);
  eventBus.on('channel_event', callback);

  return () => {
    eventBus.off('channel_event', callback);
  };
}

/**
 * Subscribe to system events
 */
export function subscribeToSystemEvents(
  db: Database,
  callback: (event: SystemEvent) => void
): () => void {
  const eventBus = getEventBus(db);
  eventBus.on('system_event', callback);

  return () => {
    eventBus.off('system_event', callback);
  };
}
