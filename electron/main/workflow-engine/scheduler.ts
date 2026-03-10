/**
 * Automation Scheduler
 * Schedules and executes automated workflows
 */

import type { Database } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { executeWorkflow } from './index.js';
import * as triggers from './triggers.js';

export interface AutomationExecution {
  id: string;
  triggerId: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  inputData?: Record<string, unknown>;
  outputData?: Record<string, unknown>;
  error?: string;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
}

export interface ScheduleOptions {
  maxConcurrent?: number;
  retryOnFailure?: boolean;
  maxRetries?: number;
  timeout?: number;
}

/**
 * Execute an automation trigger
 */
export async function executeAutomationTrigger(
  db: Database,
  triggerId: string,
  inputData?: Record<string, unknown>
): Promise<AutomationExecution> {
  const trigger = triggers.getTrigger(db, triggerId);
  if (!trigger) {
    throw new Error(`Trigger ${triggerId} not found`);
  }

  const now = Date.now();
  const executionId = randomUUID();

  // Create execution record
  db.prepare(
    `INSERT INTO automation_executions (id, trigger_id, workflow_id, status, input_data_json, started_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    executionId,
    triggerId,
    trigger.workflowId,
    'running',
    inputData ? JSON.stringify(inputData) : null,
    now
  );

  try {
    // Get workflow definition
    const workflow = db
      .prepare('SELECT definition_json FROM workflows WHERE id = ?')
      .get(trigger.workflowId) as { definition_json: string } | undefined;

    if (!workflow) {
      throw new Error(`Workflow ${trigger.workflowId} not found`);
    }

    const definition = JSON.parse(workflow.definition_json) as {
      nodes: Array<{
        id: string;
        position: { x: number; y: number };
        data: Record<string, unknown>;
      }>;
      edges: Array<{ id: string; source: string; target: string }>;
    };

    // Execute workflow
    const result = await executeWorkflow(
      db,
      trigger.workflowId,
      definition.nodes as any,
      definition.edges as any
    );

    const completedAt = Date.now();
    const durationMs = completedAt - now;

    // Update execution record
    db.prepare(
      `UPDATE automation_executions
       SET status = ?, output_data_json = ?, completed_at = ?, duration_ms = ?
       WHERE id = ?`
    ).run(
      result.success ? 'completed' : 'failed',
      JSON.stringify(result.results),
      completedAt,
      durationMs,
      executionId
    );

    // Update trigger last triggered time
    triggers.recordTriggerExecution(db, triggerId);

    return {
      id: executionId,
      triggerId,
      workflowId: trigger.workflowId,
      status: result.success ? 'completed' : 'failed',
      inputData,
      outputData: result.results,
      error: result.error,
      startedAt: now,
      completedAt,
      durationMs,
    };
  } catch (error: any) {
    const completedAt = Date.now();
    const durationMs = completedAt - now;

    // Update execution record with error
    db.prepare(
      `UPDATE automation_executions
       SET status = ?, error_text = ?, completed_at = ?, duration_ms = ?
       WHERE id = ?`
    ).run('failed', error.message, completedAt, durationMs, executionId);

    return {
      id: executionId,
      triggerId,
      workflowId: trigger.workflowId,
      status: 'failed',
      inputData,
      error: error.message,
      startedAt: now,
      completedAt,
      durationMs,
    };
  }
}

/**
 * Get execution by ID
 */
export function getExecution(db: Database, executionId: string): AutomationExecution | undefined {
  const result = db
    .prepare('SELECT * FROM automation_executions WHERE id = ?')
    .get(executionId) as any;
  if (!result) return undefined;

  return {
    id: result.id,
    triggerId: result.trigger_id,
    workflowId: result.workflow_id,
    status: result.status,
    inputData: result.input_data_json ? JSON.parse(result.input_data_json) : undefined,
    outputData: result.output_data_json ? JSON.parse(result.output_data_json) : undefined,
    error: result.error_text,
    startedAt: result.started_at,
    completedAt: result.completed_at,
    durationMs: result.duration_ms,
  };
}

/**
 * Get executions for a trigger
 */
export function getTriggerExecutions(
  db: Database,
  triggerId: string,
  limit: number = 50
): AutomationExecution[] {
  const results = db
    .prepare(
      'SELECT * FROM automation_executions WHERE trigger_id = ? ORDER BY started_at DESC LIMIT ?'
    )
    .all(triggerId, limit) as any[];

  return results.map((row) => ({
    id: row.id,
    triggerId: row.trigger_id,
    workflowId: row.workflow_id,
    status: row.status,
    inputData: row.input_data_json ? JSON.parse(row.input_data_json) : undefined,
    outputData: row.output_data_json ? JSON.parse(row.output_data_json) : undefined,
    error: row.error_text,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms,
  }));
}

/**
 * Get executions for a workflow
 */
export function getWorkflowExecutions(
  db: Database,
  workflowId: string,
  limit: number = 50
): AutomationExecution[] {
  const results = db
    .prepare(
      'SELECT * FROM automation_executions WHERE workflow_id = ? ORDER BY started_at DESC LIMIT ?'
    )
    .all(workflowId, limit) as any[];

  return results.map((row) => ({
    id: row.id,
    triggerId: row.trigger_id,
    workflowId: row.workflow_id,
    status: row.status,
    inputData: row.input_data_json ? JSON.parse(row.input_data_json) : undefined,
    outputData: row.output_data_json ? JSON.parse(row.output_data_json) : undefined,
    error: row.error_text,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms,
  }));
}

/**
 * Get recent executions
 */
export function getRecentExecutions(db: Database, limit: number = 50): AutomationExecution[] {
  const results = db
    .prepare('SELECT * FROM automation_executions ORDER BY started_at DESC LIMIT ?')
    .all(limit) as any[];

  return results.map((row) => ({
    id: row.id,
    triggerId: row.trigger_id,
    workflowId: row.workflow_id,
    status: row.status,
    inputData: row.input_data_json ? JSON.parse(row.input_data_json) : undefined,
    outputData: row.output_data_json ? JSON.parse(row.output_data_json) : undefined,
    error: row.error_text,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms,
  }));
}

/**
 * Cancel an execution
 */
export function cancelExecution(db: Database, executionId: string): boolean {
  const result = db
    .prepare(
      "UPDATE automation_executions SET status = 'cancelled' WHERE id = ? AND status IN ('pending', 'running')"
    )
    .run(executionId);
  return result.changes > 0;
}

/**
 * Get execution statistics
 */
export function getExecutionStats(
  db: Database,
  timeRange: number = 24 * 60 * 60 * 1000
): {
  totalExecutions: number;
  completedExecutions: number;
  failedExecutions: number;
  runningExecutions: number;
  avgExecutionTime: number;
  successRate: number;
} {
  const since = Date.now() - timeRange;

  const result = db
    .prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
        AVG(duration_ms) as avg_time
       FROM automation_executions
       WHERE started_at > ?`
    )
    .get(since) as any;

  return {
    totalExecutions: result.total || 0,
    completedExecutions: result.completed || 0,
    failedExecutions: result.failed || 0,
    runningExecutions: result.running || 0,
    avgExecutionTime: result.avg_time || 0,
    successRate: result.total > 0 ? (result.completed / result.total) * 100 : 0,
  };
}

/**
 * Cleanup old executions
 */
export function cleanupOldExecutions(
  db: Database,
  olderThan: number = 30 * 24 * 60 * 60 * 1000
): number {
  const cutoff = Date.now() - olderThan;

  // Keep failed executions longer for debugging
  const result = db
    .prepare(
      `DELETE FROM automation_executions
       WHERE started_at < ?
       AND (status != 'failed' OR started_at < ?)`
    )
    .run(cutoff, cutoff - 7 * 24 * 60 * 60 * 1000);

  return result.changes;
}

/**
 * Retry failed execution
 */
export async function retryExecution(
  db: Database,
  executionId: string
): Promise<AutomationExecution> {
  const execution = getExecution(db, executionId);
  if (!execution) {
    throw new Error(`Execution ${executionId} not found`);
  }

  if (execution.status !== 'failed') {
    throw new Error(`Can only retry failed executions, current status: ${execution.status}`);
  }

  return await executeAutomationTrigger(db, execution.triggerId, execution.inputData);
}

/**
 * Get executions by status
 */
export function getExecutionsByStatus(
  db: Database,
  status: AutomationExecution['status'],
  limit: number = 50
): AutomationExecution[] {
  const results = db
    .prepare(
      'SELECT * FROM automation_executions WHERE status = ? ORDER BY started_at DESC LIMIT ?'
    )
    .all(status, limit) as any[];

  return results.map((row) => ({
    id: row.id,
    triggerId: row.trigger_id,
    workflowId: row.workflow_id,
    status: row.status,
    inputData: row.input_data_json ? JSON.parse(row.input_data_json) : undefined,
    outputData: row.output_data_json ? JSON.parse(row.output_data_json) : undefined,
    error: row.error_text,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms,
  }));
}
