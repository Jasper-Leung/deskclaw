import { randomUUID } from 'crypto';
import cron from 'node-cron';
// Store running tasks
const runningTasks = new Map();
export const listScheduled = (db) => {
  const stmt = db.prepare(`
    SELECT st.id, st.workflow_id, st.cron_expression, st.enabled, st.last_run, st.next_run,
           w.name as workflow_name
    FROM scheduled_tasks st
    JOIN workflows w ON st.workflow_id = w.id
    ORDER BY st.created_at DESC
  `);
  return stmt.all();
};
export const createScheduled = (db, data) => {
  const id = randomUUID();
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO scheduled_tasks (id, workflow_id, cron_expression, enabled, last_run, next_run)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, data.workflowId, data.cronExpression, data.enabled ? 1 : 0, null, null);
  // Start the task if enabled
  if (data.enabled !== false) {
    startScheduledTask(db, id);
  }
  return { id, ...data, lastRun: null, nextRun: null };
};
export const updateScheduled = (db, id, data) => {
  const updates = [];
  const values = [];
  if (data.cronExpression !== undefined) {
    updates.push('cron_expression = ?');
    values.push(data.cronExpression);
  }
  if (data.enabled !== undefined) {
    updates.push('enabled = ?');
    values.push(data.enabled ? 1 : 0);
  }
  if (updates.length === 0) {
    throw new Error('No fields to update');
  }
  values.push(id);
  const stmt = db.prepare(`
    UPDATE scheduled_tasks
    SET ${updates.join(', ')}
    WHERE id = ?
  `);
  const result = stmt.run(...values);
  if (result.changes === 0) {
    throw new Error('Scheduled task not found');
  }
  // Restart task if enabled status changed
  if (data.enabled !== undefined) {
    if (data.enabled) {
      startScheduledTask(db, id);
    } else {
      stopScheduledTask(id);
    }
  }
  const getStmt = db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?');
  return getStmt.get(id);
};
export const deleteScheduled = (db, id) => {
  stopScheduledTask(id);
  const stmt = db.prepare('DELETE FROM scheduled_tasks WHERE id = ?');
  const result = stmt.run(id);
  if (result.changes === 0) {
    throw new Error('Scheduled task not found');
  }
  return { success: true };
};
export const toggleScheduled = (db, id) => {
  const stmt = db.prepare('SELECT enabled FROM scheduled_tasks WHERE id = ?');
  const result = stmt.get(id);
  if (!result) {
    throw new Error('Scheduled task not found');
  }
  return updateScheduled(db, id, { enabled: !result.enabled });
};
const startScheduledTask = (db, id) => {
  const stmt = db.prepare('SELECT workflow_id, cron_expression FROM scheduled_tasks WHERE id = ?');
  const task = stmt.get(id);
  if (!task) {
    return;
  }
  // Stop existing task if running
  stopScheduledTask(id);
  // Start new task
  const scheduledTask = cron.schedule(
    task.cron_expression,
    () => {
      executeScheduledWorkflow(db, id);
    },
    {
      scheduled: true,
    }
  );
  runningTasks.set(id, scheduledTask);
};
const stopScheduledTask = (id) => {
  const task = runningTasks.get(id);
  if (task) {
    task.stop();
    runningTasks.delete(id);
  }
};
const executeScheduledWorkflow = (db, id) => {
  const now = Date.now();
  const stmt = db.prepare(`
    UPDATE scheduled_tasks
    SET last_run = ?
    WHERE id = ?
  `);
  stmt.run(now, id);
  // Here you would execute the workflow
  // For now, this is a placeholder
  console.log(`Executing scheduled workflow: ${id}`);
};
