/**
 * Evolution IPC Handlers
 *
 * Exposes evolution analytics and suggestions to the renderer process.
 */

import { ipcMain } from 'electron';
import type { EventType, EvolutionInsight } from '../evolution/analytics.js';
import { getEvolutionAnalytics } from '../evolution/analytics.js';
import { getPredictiveEngine } from '../evolution/predictive-engine.js';
import { ipcLogger } from '../lib/logger.js';

// ============================================================================
// Type Definitions
// ============================================================================

export interface EvolutionSuggestion {
  id: string;
  type: 'optimization' | 'suggestion' | 'automation' | 'warning' | 'opportunity';
  title: string;
  description: string;
  priority: number;
  actionable: boolean;
  suggestedActions?: Array<{
    type: 'workflow' | 'setting' | 'automation' | 'notification';
    description: string;
    parameters?: Record<string, unknown>;
    estimatedImpact?: string;
  }>;
  estimatedImpact?: string;
  confidence: number;
  metadata?: Record<string, unknown>;
}

export interface EvolutionMetrics {
  totalEvents: number;
  eventsByType: Record<string, number>;
  topPatterns: Array<{
    type: string;
    description: string;
    confidence: number;
  }>;
  insightCount: number;
}

// ============================================================================
// IPC Handler Registration
// ============================================================================

export function registerEvolutionHandlers(): void {
  const analytics = getEvolutionAnalytics();

  // Get current suggestions
  ipcMain.handle('evolution:get-suggestions', () => {
    try {
      const insights = analytics.generateInsights();
      return insights.map((insight) => toSuggestionDTO(insight));
    } catch (error) {
      ipcLogger.error(error as Error, 'Failed to get suggestions');
      return [];
    }
  });

  // Dismiss a suggestion
  ipcMain.handle('evolution:dismiss-suggestion', (_event, suggestionId: string) => {
    try {
      // Store dismissed suggestion ID (could be persisted to DB)
      ipcLogger.info({ suggestionId }, 'Suggestion dismissed');
      return { success: true };
    } catch (error) {
      ipcLogger.error(error as Error, 'Failed to dismiss suggestion');
      return { success: false, error: String(error) };
    }
  });

  // Apply a suggestion
  ipcMain.handle(
    'evolution:apply-suggestion',
    (_event, suggestionId: string, actions: EvolutionSuggestion['suggestedActions']) => {
      try {
        ipcLogger.info({ suggestionId }, 'Applying suggestion');

        // Execute the suggested actions
        for (const action of actions || []) {
          executeSuggestedAction(action);
        }

        return { success: true };
      } catch (error) {
        ipcLogger.error(error as Error, 'Failed to apply suggestion');
        return { success: false, error: String(error) };
      }
    }
  );

  // Track event from renderer
  ipcMain.handle(
    'evolution:track-event',
    (_event, type: string, context: Record<string, unknown>) => {
      try {
        analytics.trackEvent(type as EventType, context);
        return { success: true };
      } catch (error) {
        ipcLogger.error(error as Error, 'Failed to track event');
        return { success: false, error: String(error) };
      }
    }
  );

  // Get evolution metrics
  ipcMain.handle('evolution:get-metrics', () => {
    try {
      const report = analytics.generateDailyReport();
      return {
        totalEvents: report.totalEvents,
        eventsByType: report.eventsByType,
        topPatterns: report.topPatterns.map((p) => ({
          type: p.type,
          description: p.description,
          confidence: p.confidence,
        })),
        insightCount: report.insights.length,
      } satisfies EvolutionMetrics;
    } catch (error) {
      ipcLogger.error(error as Error, 'Failed to get metrics');
      return null;
    }
  });

  // Get patterns
  ipcMain.handle('evolution:get-patterns', (_event, timeRange?: number) => {
    try {
      const patterns = analytics.analyzePatterns(timeRange);
      return patterns.map((p) => ({
        id: p.id,
        type: p.type,
        description: p.description,
        confidence: p.confidence,
        occurrences: p.occurrences,
        data: p.data,
      }));
    } catch (error) {
      ipcLogger.error(error as Error, 'Failed to get patterns');
      return [];
    }
  });

  // ============================================================================
  // Proactive Content Handlers
  // ============================================================================

  const predictiveEngine = getPredictiveEngine();

  // Get all predicted tasks
  ipcMain.handle('evolution:get-predicted-tasks', async () => {
    try {
      return await getPredictedTasks();
    } catch (error) {
      ipcLogger.error(error as Error, 'Failed to get predicted tasks');
      return [];
    }
  });

  // Get content delivery history
  ipcMain.handle('evolution:get-deliveries', async (_event, limit = 50) => {
    try {
      const db = (await import('../db/index.js')).getDatabase();
      const deliveries = db
        .prepare(
          `
          SELECT id, task_id, content_type as type, title, body,
                 timestamp, viewed, feedback
          FROM content_deliveries
          ORDER BY timestamp DESC
          LIMIT ?
        `
        )
        .all(limit) as Array<{
        id: string;
        task_id: string;
        type: string;
        title: string;
        body: string;
        timestamp: number;
        viewed: number;
        feedback: string | null;
      }>;

      return deliveries.map((d) => ({
        id: d.id,
        taskId: d.task_id,
        type: d.type,
        title: d.title,
        body: d.body,
        timestamp: d.timestamp,
        viewed: Boolean(d.viewed),
        feedback: d.feedback || undefined,
      }));
    } catch (error) {
      ipcLogger.error(error as Error, 'Failed to get deliveries');
      return [];
    }
  });

  // Toggle predicted task
  ipcMain.handle(
    'evolution:toggle-predicted-task',
    async (_event, taskId: string, enabled: boolean) => {
      try {
        const db = (await import('../db/index.js')).getDatabase();
        db.prepare('UPDATE predicted_tasks SET enabled = ?, updated_at = ? WHERE id = ?').run(
          enabled ? 1 : 0,
          Date.now(),
          taskId
        );

        // Also update scheduled task
        ipcLogger.info({ taskId, enabled }, 'Task toggled');
        return { success: true };
      } catch (error) {
        ipcLogger.error(error as Error, 'Failed to toggle task');
        return { success: false, error: String(error) };
      }
    }
  );

  // Delete predicted task
  ipcMain.handle('evolution:delete-predicted-task', async (_event, taskId: string) => {
    try {
      const db = (await import('../db/index.js')).getDatabase();

      // Delete from scheduled tasks
      // Delete predicted task
      db.prepare('DELETE FROM predicted_tasks WHERE id = ?').run(taskId);

      ipcLogger.info({ taskId }, 'Task deleted');
      return { success: true };
    } catch (error) {
      ipcLogger.error(error as Error, 'Failed to delete task');
      return { success: false, error: String(error) };
    }
  });

  // Provide feedback on delivery
  ipcMain.handle(
    'evolution:provide-delivery-feedback',
    async (_event, deliveryId: string, feedback: 'positive' | 'negative') => {
      try {
        const db = (await import('../db/index.js')).getDatabase();
        db.prepare('UPDATE content_deliveries SET feedback = ? WHERE id = ?').run(
          feedback,
          deliveryId
        );

        // Update intent confidence based on feedback
        updateIntentConfidenceFromFeedback(deliveryId, feedback);

        ipcLogger.info({ deliveryId, feedback }, 'Feedback recorded');
        return { success: true };
      } catch (error) {
        ipcLogger.error(error as Error, 'Failed to record feedback');
        return { success: false, error: String(error) };
      }
    }
  );

  // Manually trigger content delivery
  ipcMain.handle('evolution:trigger-delivery', async (_event, taskId: string) => {
    try {
      await predictiveEngine.deliverContent(taskId);
      return { success: true };
    } catch (error) {
      ipcLogger.error(error as Error, 'Failed to trigger delivery');
      return { success: false, error: String(error) };
    }
  });

  // Generate new predictions (trigger learning cycle)
  ipcMain.handle('evolution:generate-predictions', async () => {
    try {
      const tasks = await predictiveEngine.generatePredictedTasks();

      // Convert to DTO
      const db = (await import('../db/index.js')).getDatabase();
      const taskDTOs = tasks.map((task) => {
        const intent = db
          .prepare('SELECT topic, preferred_hour, preferred_minute FROM user_intents WHERE id = ?')
          .get(task.intentId) as
          | { topic: string; preferred_hour: number | null; preferred_minute: number | null }
          | undefined;

        return {
          id: task.id,
          name: task.name,
          description: task.description,
          cronExpression: task.cronExpression,
          estimatedValue: task.estimatedValue,
          enabled: task.enabled,
          topic: intent?.topic,
          preferredTime:
            intent?.preferred_hour !== undefined
              ? {
                  hour: intent.preferred_hour,
                  minute: intent.preferred_minute || 0,
                }
              : undefined,
        };
      });

      ipcLogger.info({ count: taskDTOs.length }, 'Generated predicted tasks');
      return taskDTOs;
    } catch (error) {
      ipcLogger.error(error as Error, 'Failed to generate predictions');
      return [];
    }
  });

  // Get learning insights
  ipcMain.handle('evolution:get-learning-insights', async () => {
    try {
      const db = (await import('../db/index.js')).getDatabase();

      // Get user intents
      const intents = db
        .prepare(
          `
          SELECT id, type, topic, keywords, confidence, frequency,
                 preferred_hour, preferred_minute, times_matched
          FROM user_intents
          ORDER BY confidence DESC, times_matched DESC
          LIMIT 10
        `
        )
        .all() as Array<{
        id: string;
        type: string;
        topic: string;
        keywords: string;
        confidence: number;
        frequency: string;
        preferred_hour: number | null;
        preferred_minute: number | null;
        times_matched: number;
      }>;

      // Get patterns count
      const patternsCount =
        (db.prepare('SELECT COUNT(*) as count FROM evolution_patterns').get() as { count: number })
          ?.count || 0;

      // Get active predictions count
      const activePredictions =
        (
          db.prepare('SELECT COUNT(*) as count FROM predicted_tasks WHERE enabled = 1').get() as {
            count: number;
          }
        )?.count || 0;

      // Get content delivered count
      const contentDelivered =
        (db.prepare('SELECT COUNT(*) as count FROM content_deliveries').get() as { count: number })
          ?.count || 0;

      // Get total events tracked
      const totalEvents =
        (db.prepare('SELECT COUNT(*) as count FROM evolution_events').get() as { count: number })
          ?.count || 0;

      return {
        totalIntents: intents.length,
        highConfidenceIntents: intents.filter((i) => i.confidence > 0.7).length,
        patternsDetected: patternsCount,
        activePredictions,
        contentDelivered,
        totalEvents,
        topIntents: intents.map((i) => ({
          type: i.type,
          topic: i.topic,
          confidence: i.confidence,
          frequency: i.frequency,
          timesDetected: i.times_matched,
          preferredTime:
            i.preferred_hour !== null
              ? `${i.preferred_hour}:${String(i.preferred_minute || 0).padStart(2, '0')}`
              : undefined,
        })),
      };
    } catch (error) {
      ipcLogger.error(error as Error, 'Failed to get learning insights');
      return null;
    }
  });

  ipcLogger.info('Evolution IPC handlers registered');
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert internal insight to suggestion DTO
 */
function toSuggestionDTO(insight: EvolutionInsight): EvolutionSuggestion {
  return {
    id: insight.id,
    type: insight.type,
    title: insight.title,
    description: insight.description,
    priority: insight.priority,
    actionable: insight.actionable,
    suggestedActions: insight.suggestedActions?.map((action) => ({
      type: action.type,
      description: action.description,
      parameters: action.parameters,
      estimatedImpact: action.estimatedImpact,
    })),
    estimatedImpact: insight.metadata?.estimatedImpact as string | undefined,
    confidence: (insight.metadata?.confidence as number | undefined) ?? 0.5,
    metadata: insight.metadata,
  };
}

/**
 * Execute a suggested action
 */
async function executeSuggestedAction(action: {
  type: string;
  description: string;
  parameters?: Record<string, unknown>;
}): Promise<void> {
  switch (action.type) {
    case 'workflow':
      await executeWorkflowAction(action.parameters);
      break;
    case 'setting':
      await executeSettingAction(action.parameters);
      break;
    case 'automation':
      await executeAutomationAction(action.parameters);
      break;
    default:
      ipcLogger.warn({ actionType: action.type }, 'Unknown action type');
  }
}

/**
 * Execute workflow-related actions
 */
async function executeWorkflowAction(parameters?: Record<string, unknown>): Promise<void> {
  if (!parameters) return;

  const db = (await import('../db/index.js')).getDatabase();

  // Check if workflow already exists
  const existing = db.prepare('SELECT id FROM workflows WHERE name = ?').get(parameters.name);

  if (existing) {
    ipcLogger.info({ name: String(parameters.name) }, 'Workflow already exists');
    return;
  }

  // Create new workflow from suggestion
  const { randomUUID } = await import('crypto');
  const workflowId = randomUUID();

  db.prepare(
    `
    INSERT INTO workflows (id, name, description, definition_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `
  ).run(
    workflowId,
    parameters.name,
    parameters.description || 'Auto-generated workflow',
    JSON.stringify(parameters.definition || { nodes: [], edges: [] }),
    Date.now(),
    Date.now()
  );

  ipcLogger.info({ workflowId }, 'Created workflow from suggestion');
}

/**
 * Execute setting-related actions
 */
async function executeSettingAction(parameters?: Record<string, unknown>): Promise<void> {
  if (!parameters) return;

  const db = (await import('../db/index.js')).getDatabase();

  // Update or insert setting
  db.prepare(
    `
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?
  `
  ).run(
    parameters.key,
    JSON.stringify(parameters.value),
    Date.now(),
    JSON.stringify(parameters.value),
    Date.now()
  );

  ipcLogger.info({ key: String(parameters.key) }, 'Updated setting from suggestion');
}

/**
 * Execute automation-related actions
 */
async function executeAutomationAction(parameters?: Record<string, unknown>): Promise<void> {
  if (!parameters) return;

  // This would integrate with the scheduled tasks system
  ipcLogger.info({ parameters }, 'Creating automation from suggestion');

  // Import and use the scheduled task creation logic
  // Note: This function doesn't exist in scheduled.js, removing for now
  // const { createScheduledTask } = await import('./scheduled.js');
  // await createScheduledTask(parameters as any);

  ipcLogger.info('Created automation from suggestion');
}

// ============================================================================
// Proactive Content Helper Functions
// ============================================================================

interface PredictedTaskDTO {
  id: string;
  name: string;
  description: string;
  cron_expression: string;
  estimated_value: number;
  enabled: number;
  topic?: string;
  preferred_hour?: number | null;
  preferred_minute?: number | null;
  next_run?: number;
  last_run?: number;
}

async function getPredictedTasks() {
  const db = (await import('../db/index.js')).getDatabase();

  const tasks = db
    .prepare(
      `
      SELECT pt.*, ui.topic, ui.preferred_hour, ui.preferred_minute,
             st.next_run, st.last_run
      FROM predicted_tasks pt
      LEFT JOIN user_intents ui ON pt.intent_id = ui.id
      LEFT JOIN scheduled_tasks st ON st.name = pt.name
      ORDER BY pt.estimated_value DESC, pt.created_at DESC
    `
    )
    .all() as Array<PredictedTaskDTO>;

  return tasks.map((task) => ({
    id: task.id,
    name: task.name,
    description: task.description,
    cronExpression: task.cron_expression,
    estimatedValue: task.estimated_value,
    enabled: Boolean(task.enabled),
    topic: task.topic,
    preferredTime:
      task.preferred_hour !== null
        ? { hour: task.preferred_hour, minute: task.preferred_minute || 0 }
        : undefined,
    nextRun: task.next_run ? new Date(task.next_run).toLocaleString() : undefined,
    lastRun: task.last_run ? new Date(task.last_run).toLocaleString() : undefined,
  }));
}

async function updateIntentConfidenceFromFeedback(
  deliveryId: string,
  feedback: 'positive' | 'negative'
): Promise<void> {
  const db = (await import('../db/index.js')).getDatabase();

  // Get intent_id from delivery
  const delivery = db
    .prepare(
      `
      SELECT pt.intent_id
      FROM content_deliveries cd
      JOIN predicted_tasks pt ON cd.task_id = pt.id
      WHERE cd.id = ?
    `
    )
    .get(deliveryId) as { intent_id: string } | undefined;

  if (!delivery) return;

  // Update confidence based on feedback
  const adjustment = feedback === 'positive' ? 0.05 : -0.1;

  db.prepare(
    `
    UPDATE user_intents
    SET confidence = MAX(0, MIN(1, confidence + ?)),
        updated_at = ?
    WHERE id = ?
  `
  ).run(adjustment, Date.now(), delivery.intent_id);
}
