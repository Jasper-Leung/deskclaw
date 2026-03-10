/**
 * Proactive Content IPC Handlers Extension
 *
 * Add these handlers to your existing evolution.ts file
 */

import { ipcMain } from 'electron';
import { getPredictiveEngine } from '../evolution/predictive-engine.js';
import { ipcLogger } from '../lib/logger.js';

export function registerProactiveContentHandlers(): void {
  const engine = getPredictiveEngine();

  // Get all predicted tasks
  ipcMain.handle('evolution:get-predicted-tasks', async () => {
    try {
      const tasks = await getAllPredictedTasks();
      return tasks;
    } catch (error) {
      ipcLogger.error({ error }, 'Failed to get predicted tasks');
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
      ipcLogger.error({ error }, 'Failed to get deliveries');
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
        const { updateScheduled } = await import('./scheduled.js');
        await updateScheduled(db, taskId, { enabled });

        ipcLogger.info(`Task toggled: ${taskId}, enabled: ${enabled}`);
        return { success: true };
      } catch (error) {
        ipcLogger.error({ error }, 'Failed to toggle task');
        return { success: false, error: String(error) };
      }
    }
  );

  // Delete predicted task
  ipcMain.handle('evolution:delete-predicted-task', async (_event, taskId: string) => {
    try {
      const db = (await import('../db/index.js')).getDatabase();

      // Delete from scheduled tasks
      const { deleteScheduled } = await import('./scheduled.js');
      await deleteScheduled(db, taskId);

      // Delete predicted task
      db.prepare('DELETE FROM predicted_tasks WHERE id = ?').run(taskId);

      ipcLogger.info(`Task deleted: ${taskId}`);
      return { success: true };
    } catch (error) {
      ipcLogger.error({ error }, 'Failed to delete task');
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

        ipcLogger.info(`Feedback recorded: ${deliveryId}, ${feedback}`);
        return { success: true };
      } catch (error) {
        ipcLogger.error({ error }, 'Failed to record feedback');
        return { success: false, error: String(error) };
      }
    }
  );

  // Manually trigger content delivery
  ipcMain.handle('evolution:trigger-delivery', async (_event, taskId: string) => {
    try {
      await engine.deliverContent(taskId);
      return { success: true };
    } catch (error) {
      ipcLogger.error({ error }, 'Failed to trigger delivery');
      return { success: false, error: String(error) };
    }
  });

  // Generate new predictions (trigger learning cycle)
  ipcMain.handle('evolution:generate-predictions', async () => {
    try {
      const tasks = await engine.generatePredictedTasks();

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

      ipcLogger.info(`Generated ${taskDTOs.length} predicted tasks`);
      return taskDTOs;
    } catch (error) {
      ipcLogger.error({ error }, 'Failed to generate predictions');
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

      return {
        totalIntents: intents.length,
        highConfidenceIntents: intents.filter((i) => i.confidence > 0.7).length,
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
      ipcLogger.error({ error }, 'Failed to get learning insights');
      return null;
    }
  });

  ipcLogger.info('Proactive content IPC handlers registered');
}

// ============================================================================
// Helper Functions
// ============================================================================

async function getAllPredictedTasks() {
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
