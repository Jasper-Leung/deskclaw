/**
 * Evolution Analytics System
 *
 * Collects and analyzes usage data for self-evolution capabilities.
 */

import { randomUUID } from 'crypto';
import type { Database } from 'better-sqlite3';
import { dbLogger } from '../lib/logger.js';
import { getDatabase } from '../db/index.js';

// ============================================================================
// Type Definitions
// ============================================================================

export type EventType =
  | 'click'
  | 'command'
  | 'workflow_execution'
  | 'chat_message'
  | 'agent_creation'
  | 'tool_execution'
  | 'error'
  | 'page_view';

export interface UsageEvent {
  id: string;
  type: EventType;
  timestamp: number;
  sessionId: string;
  userId?: string;
  context: EventContext;
}

export interface EventContext {
  [key: string]: unknown;
  // Click context
  elementId?: string;
  elementType?: string;
  // Command context
  command?: string;
  args?: Record<string, unknown>;
  // Workflow context
  workflowId?: string;
  workflowName?: string;
  executionTime?: number;
  success?: boolean;
  // Chat context
  agentId?: string;
  modelId?: string;
  messageLength?: number;
  // Error context
  errorType?: string;
  errorMessage?: string;
  // Page context
  page?: string;
  duration?: number;
}

export interface UsagePattern {
  id: string;
  type: 'sequence' | 'frequency' | 'correlation';
  description: string;
  confidence: number;
  occurrences: number;
  lastOccurrence: number;
  data: PatternData;
}

export interface PatternData {
  sequence?: string[];
  frequency?: Record<string, number>;
  correlation?: Record<string, number>;
  timePatterns?: {
    hourOfDay: number;
    dayOfWeek: number;
  }[];
}

export interface EvolutionInsight {
  id: string;
  type: 'optimization' | 'suggestion' | 'automation' | 'warning' | 'opportunity';
  title: string;
  description: string;
  priority: number; // 0-1
  actionable: boolean;
  suggestedActions?: SuggestedAction[];
  metadata: Record<string, unknown>;
}

export interface SuggestedAction {
  type: 'workflow' | 'setting' | 'automation' | 'notification';
  description: string;
  parameters: Record<string, unknown>;
  estimatedImpact?: string;
}

// ============================================================================
// Analytics Engine
// ============================================================================

export class EvolutionAnalytics {
  private db: Database;
  private sessionId: string;
  private eventBuffer: UsageEvent[] = [];
  private flushInterval: number = 5000; // 5 seconds
  private flushTimer?: NodeJS.Timeout;

  constructor() {
    this.db = getDatabase();
    this.sessionId = randomUUID();
    this.initializeDatabase();
    this.startBatchFlush();
  }

  // ============================================================================
  // Database Initialization
  // ============================================================================

  private initializeDatabase(): void {
    // Create evolution events table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS evolution_events (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        session_id TEXT NOT NULL,
        user_id TEXT,
        context_json TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `);

    // Create index for faster queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_evolution_events_type
      ON evolution_events(event_type, timestamp DESC)
    `);

    // Create index for session queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_evolution_events_session
      ON evolution_events(session_id, timestamp)
    `);

    dbLogger.info('Evolution analytics database initialized');
  }

  // ============================================================================
  // Event Tracking
  // ============================================================================

  /**
   * Track a usage event
   */
  trackEvent(type: EventType, context: EventContext): void {
    const event: UsageEvent = {
      id: randomUUID(),
      type,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      context,
    };

    // Add to buffer for batch insertion
    this.eventBuffer.push(event);

    // Flush if buffer is full
    if (this.eventBuffer.length >= 100) {
      this.flushEvents();
    }
  }

  /**
   * Track click events
   */
  trackClick(elementId: string, elementType: string, metadata?: Record<string, unknown>): void {
    this.trackEvent('click', {
      elementId,
      elementType,
      ...metadata,
    });
  }

  /**
   * Track command execution
   */
  trackCommand(command: string, args?: Record<string, unknown>, success = true): void {
    this.trackEvent('command', {
      command,
      args,
      success,
    });
  }

  /**
   * Track workflow execution
   */
  trackWorkflowExecution(
    workflowId: string,
    workflowName: string,
    executionTime: number,
    success: boolean
  ): void {
    this.trackEvent('workflow_execution', {
      workflowId,
      workflowName,
      executionTime,
      success,
    });
  }

  /**
   * Track chat messages
   */
  trackChatMessage(agentId: string, modelId: string, messageLength: number, isUser: boolean): void {
    this.trackEvent('chat_message', {
      agentId,
      modelId,
      messageLength,
      isUser,
    });
  }

  /**
   * Track errors
   */
  trackError(errorType: string, errorMessage: string, context?: Record<string, unknown>): void {
    this.trackEvent('error', {
      errorType,
      errorMessage,
      ...context,
    });
  }

  /**
   * Track page views
   */
  trackPageView(page: string, duration?: number): void {
    this.trackEvent('page_view', {
      page,
      duration,
    });
  }

  // ============================================================================
  // Event Storage
  // ============================================================================

  /**
   * Flush buffered events to database
   */
  private flushEvents(): void {
    if (this.eventBuffer.length === 0) return;

    const stmt = this.db.prepare(`
      INSERT INTO evolution_events (id, event_type, session_id, user_id, context_json, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((events: UsageEvent[]) => {
      for (const event of events) {
        stmt.run(
          event.id,
          event.type,
          event.sessionId,
          event.userId || null,
          JSON.stringify(event.context),
          event.timestamp
        );
      }
    });

    try {
      insertMany(this.eventBuffer);
      dbLogger.debug(`Flushed ${this.eventBuffer.length} events to database`);
      this.eventBuffer = [];
    } catch (error) {
      dbLogger.error(error as Error, 'Failed to flush events');
    }
  }

  /**
   * Start periodic batch flush
   */
  private startBatchFlush(): void {
    this.flushTimer = setInterval(() => {
      this.flushEvents();
    }, this.flushInterval);
  }

  /**
   * Stop analytics and flush remaining events
   */
  shutdown(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flushEvents();
    dbLogger.info('Evolution analytics shutdown complete');
  }

  // ============================================================================
  // Pattern Analysis
  // ============================================================================

  /**
   * Analyze usage patterns from collected events
   */
  analyzePatterns(timeRange = 7 * 24 * 60 * 60 * 1000): UsagePattern[] {
    const since = Date.now() - timeRange;

    // Get events in time range
    const events = this.db
      .prepare(
        `
      SELECT event_type, context_json, timestamp
      FROM evolution_events
      WHERE timestamp >= ?
      ORDER BY timestamp ASC
    `
      )
      .all(since) as Array<{ event_type: string; context_json: string; timestamp: number }>;

    const patterns: UsagePattern[] = [];

    // Analyze sequential patterns
    patterns.push(...this.analyzeSequentialPatterns(events));

    // Analyze frequency patterns
    patterns.push(...this.analyzeFrequencyPatterns(events));

    // Analyze time patterns
    patterns.push(...this.analyzeTimePatterns(events));

    return patterns.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Detect sequential patterns (e.g., users always do A then B)
   */
  private analyzeSequentialPatterns(
    events: Array<{ event_type: string; context_json: string; timestamp: number }>
  ): UsagePattern[] {
    const patterns: UsagePattern[] = [];
    const sequences = new Map<string, number>();

    // Extract sequences of 2-3 events
    for (let i = 0; i < events.length - 1; i++) {
      const current = this.getEventSignature(events[i]);
      const next = this.getEventSignature(events[i + 1]);
      const timeDiff = events[i + 1].timestamp - events[i].timestamp;

      // Only consider sequences within 5 minutes
      if (timeDiff < 5 * 60 * 1000) {
        const key = `${current} -> ${next}`;
        sequences.set(key, (sequences.get(key) || 0) + 1);
      }
    }

    // Convert to patterns
    for (const [sequence, count] of sequences.entries()) {
      if (count >= 3) {
        // Minimum 3 occurrences
        patterns.push({
          id: randomUUID(),
          type: 'sequence',
          description: `Common sequence: ${sequence}`,
          confidence: Math.min(count / 10, 1), // Cap at 1.0
          occurrences: count,
          lastOccurrence: Date.now(),
          data: {
            sequence: sequence.split(' -> '),
          },
        });
      }
    }

    return patterns;
  }

  /**
   * Detect frequency patterns (e.g., most used features)
   */
  private analyzeFrequencyPatterns(
    events: Array<{ event_type: string; context_json: string; timestamp: number }>
  ): UsagePattern[] {
    const patterns: UsagePattern[] = [];
    const frequencies = new Map<string, number>();

    for (const event of events) {
      const signature = this.getEventSignature(event);
      frequencies.set(signature, (frequencies.get(signature) || 0) + 1);
    }

    // Find top features
    const sorted = Array.from(frequencies.entries()).sort((a, b) => b[1] - a[1]);

    for (const [feature, count] of sorted.slice(0, 10)) {
      patterns.push({
        id: randomUUID(),
        type: 'frequency',
        description: `Frequently used: ${feature}`,
        confidence: count / events.length,
        occurrences: count,
        lastOccurrence: Date.now(),
        data: {
          frequency: { [feature]: count },
        },
      });
    }

    return patterns;
  }

  /**
   * Detect time patterns (e.g., user is most active at certain times)
   */
  private analyzeTimePatterns(
    events: Array<{ event_type: string; context_json: string; timestamp: number }>
  ): UsagePattern[] {
    const patterns: UsagePattern[] = [];
    const hourCounts = new Array(24).fill(0);
    const dayCounts = new Array(7).fill(0);

    for (const event of events) {
      const date = new Date(event.timestamp);
      hourCounts[date.getHours()]++;
      dayCounts[date.getDay()]++;
    }

    // Find peak hours
    const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
    const peakDay = dayCounts.indexOf(Math.max(...dayCounts));

    patterns.push({
      id: randomUUID(),
      type: 'frequency',
      description: `Most active at hour ${peakHour}`,
      confidence: hourCounts[peakHour] / events.length,
      occurrences: hourCounts[peakHour],
      lastOccurrence: Date.now(),
      data: {
        timePatterns: [{ hourOfDay: peakHour, dayOfWeek: peakDay }],
      },
    });

    return patterns;
  }

  /**
   * Get a signature for an event (for pattern matching)
   */
  private getEventSignature(event: {
    event_type: string;
    context_json: string;
    timestamp: number;
  }): string {
    const context = JSON.parse(event.context_json) as EventContext;

    switch (event.event_type) {
      case 'click':
        return `click:${context.elementType}`;
      case 'command':
        return `command:${context.command}`;
      case 'workflow_execution':
        return `workflow:${context.workflowName}`;
      case 'page_view':
        return `page:${context.page}`;
      default:
        return event.event_type;
    }
  }

  // ============================================================================
  // Insight Generation
  // ============================================================================

  /**
   * Generate actionable insights from patterns
   */
  generateInsights(): EvolutionInsight[] {
    const insights: EvolutionInsight[] = [];
    const patterns = this.analyzePatterns();

    for (const pattern of patterns) {
      if (pattern.confidence < 0.3) continue; // Low confidence patterns

      // Generate insights based on pattern type
      switch (pattern.type) {
        case 'sequence':
          insights.push(this.generateSequenceInsight(pattern));
          break;
        case 'frequency':
          insights.push(this.generateFrequencyInsight(pattern));
          break;
      }
    }

    return insights.sort((a, b) => b.priority - a.priority);
  }

  private generateSequenceInsight(pattern: UsagePattern): EvolutionInsight {
    const sequence = pattern.data.sequence as string[];

    return {
      id: randomUUID(),
      type: 'automation',
      title: 'Automate Common Sequence',
      description: `You frequently do: ${sequence.join(' then ')}. Consider creating a workflow.`,
      priority: pattern.confidence,
      actionable: true,
      suggestedActions: [
        {
          type: 'workflow',
          description: 'Create automated workflow',
          parameters: {
            steps: sequence,
          },
          estimatedImpact: 'Save time on repetitive tasks',
        },
      ],
      metadata: {
        patternId: pattern.id,
        occurrences: pattern.occurrences,
      },
    };
  }

  private generateFrequencyInsight(pattern: UsagePattern): EvolutionInsight {
    const feature = Object.keys(pattern.data.frequency || {})[0];

    return {
      id: randomUUID(),
      type: 'suggestion',
      title: 'Popular Feature',
      description: `You use "${feature}" frequently (${pattern.occurrences} times).`,
      priority: pattern.confidence * 0.5,
      actionable: false,
      metadata: {
        feature,
        usageCount: pattern.occurrences,
      },
    };
  }

  // ============================================================================
  // Reporting
  // ============================================================================

  /**
   * Generate a daily evolution report
   */
  generateDailyReport(): {
    date: string;
    totalEvents: number;
    eventsByType: Record<string, number>;
    topPatterns: UsagePattern[];
    insights: EvolutionInsight[];
  } {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const endOfDay = startOfDay + 24 * 60 * 60 * 1000;

    // Get today's events
    const events = this.db
      .prepare(
        `
      SELECT event_type, context_json, timestamp
      FROM evolution_events
      WHERE timestamp >= ? AND timestamp < ?
    `
      )
      .all(startOfDay, endOfDay) as Array<{ event_type: string; context_json: string }>;

    // Count by type
    const eventsByType: Record<string, number> = {};
    for (const event of events) {
      eventsByType[event.event_type] = (eventsByType[event.event_type] || 0) + 1;
    }

    return {
      date: today.toISOString().split('T')[0],
      totalEvents: events.length,
      eventsByType,
      topPatterns: this.analyzePatterns(24 * 60 * 60 * 1000).slice(0, 5),
      insights: this.generateInsights().slice(0, 5),
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let analyticsInstance: EvolutionAnalytics | null = null;

export function getEvolutionAnalytics(): EvolutionAnalytics {
  if (!analyticsInstance) {
    analyticsInstance = new EvolutionAnalytics();
  }
  return analyticsInstance;
}
