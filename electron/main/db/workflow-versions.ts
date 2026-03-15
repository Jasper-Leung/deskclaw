/**
 * Workflow Version Management Functions
 */

import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import { dbLogger } from '../lib/logger.js';

/**
 * Interface for workflow version
 */
export interface WorkflowVersion {
  id: string;
  workflowId: string;
  version: number;
  definitionJson: string;
  changeDescription?: string;
  createdAt: number;
  createdBy?: string;
}

/**
 * Interface for workflow execution
 */
export interface WorkflowExecution {
  id: string;
  workflowId: string;
  workflowVersion?: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  inputData?: string;
  outputData?: string;
  error?: string;
  nodeResults?: string;
  triggeredBy?: 'manual' | 'scheduled' | 'api' | 'sub_workflow' | 'automation';
  triggerSourceId?: string;
  createdAt: number;
}

/**
 * Create a new workflow version
 */
export function createWorkflowVersion(
  db: Database.Database,
  params: {
    workflowId: string;
    definitionJson: string;
    changeDescription?: string;
    createdBy?: string;
  }
): WorkflowVersion {
  const { workflowId, definitionJson, changeDescription, createdBy } = params;

  // Get the current max version for this workflow
  const maxVersionResult = db
    .prepare('SELECT MAX(version) as max_version FROM workflow_versions WHERE workflow_id = ?')
    .get(workflowId) as { max_version: number | null } | undefined;

  const nextVersion = (maxVersionResult?.max_version || 0) + 1;

  const id = randomUUID();
  const now = Date.now();

  db.prepare(
    `
    INSERT INTO workflow_versions (id, workflow_id, version, definition_json, change_description, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    id,
    workflowId,
    nextVersion,
    definitionJson,
    changeDescription || null,
    now,
    createdBy || null
  );

  dbLogger.info(`[WorkflowVersion] Created version ${nextVersion} for workflow ${workflowId}`);

  return {
    id,
    workflowId,
    version: nextVersion,
    definitionJson,
    changeDescription,
    createdAt: now,
    createdBy,
  };
}

/**
 * Get all versions of a workflow
 */
export function getWorkflowVersions(db: Database.Database, workflowId: string): WorkflowVersion[] {
  const rows = db
    .prepare('SELECT * FROM workflow_versions WHERE workflow_id = ? ORDER BY version DESC')
    .all(workflowId) as any[];

  return rows.map((row) => ({
    id: row.id,
    workflowId: row.workflow_id,
    version: row.version,
    definitionJson: row.definition_json,
    changeDescription: row.change_description,
    createdAt: row.created_at,
    createdBy: row.created_by,
  }));
}

/**
 * Get a specific version of a workflow
 */
export function getWorkflowVersion(
  db: Database.Database,
  workflowId: string,
  version: number
): WorkflowVersion | undefined {
  const row = db
    .prepare('SELECT * FROM workflow_versions WHERE workflow_id = ? AND version = ?')
    .get(workflowId, version) as any;

  if (!row) return undefined;

  return {
    id: row.id,
    workflowId: row.workflow_id,
    version: row.version,
    definitionJson: row.definition_json,
    changeDescription: row.change_description,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

/**
 * Restore a workflow to a specific version
 */
export function restoreWorkflowVersion(
  db: Database.Database,
  workflowId: string,
  version: number
): boolean {
  const workflowVersion = getWorkflowVersion(db, workflowId, version);

  if (!workflowVersion) {
    dbLogger.warn(`[WorkflowVersion] Version ${version} not found for workflow ${workflowId}`);
    return false;
  }

  const now = Date.now();

  db.prepare(
    `
    UPDATE workflows
    SET definition_json = ?, updated_at = ?
    WHERE id = ?
  `
  ).run(workflowVersion.definitionJson, now, workflowId);

  dbLogger.info(`[WorkflowVersion] Restored workflow ${workflowId} to version ${version}`);

  return true;
}

/**
 * Create a workflow execution record
 */
export function createWorkflowExecution(
  db: Database.Database,
  params: {
    workflowId: string;
    triggeredBy?: WorkflowExecution['triggeredBy'];
    triggerSourceId?: string;
    inputData?: string;
  }
): WorkflowExecution {
  const { workflowId, triggeredBy, triggerSourceId, inputData } = params;

  // Get current workflow version from workflows table
  const workflow = db
    .prepare('SELECT definition_json FROM workflows WHERE id = ?')
    .get(workflowId) as { definition_json: string } | undefined;

  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  // Find matching version
  const versionRow = db
    .prepare('SELECT version FROM workflow_versions WHERE workflow_id = ? AND definition_json = ?')
    .get(workflowId, workflow.definition_json) as { version: number } | undefined;

  const workflowVersion = versionRow?.version;

  const id = randomUUID();
  const now = Date.now();

  db.prepare(
    `
    INSERT INTO workflow_executions (id, workflow_id, workflow_version, status, triggered_by, trigger_source_id, input_data_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    id,
    workflowId,
    workflowVersion || null,
    'pending',
    triggeredBy || 'manual',
    triggerSourceId || null,
    inputData || null,
    now
  );

  dbLogger.info(`[WorkflowExecution] Created execution ${id} for workflow ${workflowId}`);

  return {
    id,
    workflowId,
    workflowVersion,
    status: 'pending',
    triggeredBy,
    triggerSourceId,
    inputData,
    createdAt: now,
  };
}

/**
 * Update workflow execution status
 */
export function updateWorkflowExecution(
  db: Database.Database,
  executionId: string,
  updates: Partial<
    Pick<
      WorkflowExecution,
      'status' | 'startedAt' | 'completedAt' | 'durationMs' | 'outputData' | 'error' | 'nodeResults'
    >
  >
): WorkflowExecution {
  const setClauses: string[] = [];
  const values: any[] = [];

  if (updates.status !== undefined) {
    setClauses.push('status = ?');
    values.push(updates.status);
  }
  if (updates.startedAt !== undefined) {
    setClauses.push('started_at = ?');
    values.push(updates.startedAt);
  }
  if (updates.completedAt !== undefined) {
    setClauses.push('completed_at = ?');
    values.push(updates.completedAt);
  }
  if (updates.durationMs !== undefined) {
    setClauses.push('duration_ms = ?');
    values.push(updates.durationMs);
  }
  if (updates.outputData !== undefined) {
    setClauses.push('output_data_json = ?');
    values.push(updates.outputData);
  }
  if (updates.error !== undefined) {
    setClauses.push('error_text = ?');
    values.push(updates.error);
  }
  if (updates.nodeResults !== undefined) {
    setClauses.push('node_results_json = ?');
    values.push(updates.nodeResults);
  }

  values.push(executionId);

  db.prepare(
    `
    UPDATE workflow_executions
    SET ${setClauses.join(', ')}
    WHERE id = ?
  `
  ).run(...values);

  // Get and return the updated execution
  const row = db.prepare('SELECT * FROM workflow_executions WHERE id = ?').get(executionId) as any;
  return mapExecutionRow(row);
}

/**
 * Get workflow executions
 */
export function getWorkflowExecutions(
  db: Database.Database,
  params?: {
    workflowId?: string;
    status?: WorkflowExecution['status'];
    limit?: number;
    offset?: number;
  }
): WorkflowExecution[] {
  let query = 'SELECT * FROM workflow_executions WHERE 1=1';
  const values: any[] = [];

  if (params?.workflowId) {
    query += ' AND workflow_id = ?';
    values.push(params.workflowId);
  }
  if (params?.status) {
    query += ' AND status = ?';
    values.push(params.status);
  }

  query += ' ORDER BY created_at DESC';

  if (params?.limit) {
    query += ' LIMIT ?';
    values.push(params.limit);
  }
  if (params?.offset) {
    query += ' OFFSET ?';
    values.push(params.offset);
  }

  const rows = db.prepare(query).all(...values) as any[];
  return rows.map(mapExecutionRow);
}

/**
 * Get workflow execution statistics
 */
export function getWorkflowExecutionStats(
  db: Database.Database,
  workflowId: string
): {
  total: number;
  completed: number;
  failed: number;
  running: number;
  avgDurationMs?: number;
  successRate: number;
} {
  const stats = db
    .prepare(
      `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
        AVG(duration_ms) as avg_duration_ms
      FROM workflow_executions
      WHERE workflow_id = ?
    `
    )
    .get(workflowId) as any;

  const successRate = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;

  return {
    total: stats.total,
    completed: stats.completed || 0,
    failed: stats.failed || 0,
    running: stats.running || 0,
    avgDurationMs: stats.avg_duration_ms || undefined,
    successRate,
  };
}

/**
 * Delete old workflow versions (keep only N latest versions)
 */
export function cleanupOldWorkflowVersions(
  db: Database.Database,
  workflowId: string,
  keepVersions: number = 10
): number {
  // Get versions to delete (all but the most recent N)
  const versionsToDelete = db
    .prepare(
      `
      SELECT id FROM workflow_versions
      WHERE workflow_id = ?
      ORDER BY version DESC
      LIMIT -1 OFFSET ?
    `
    )
    .all(workflowId, keepVersions) as any[];

  const idsToDelete = versionsToDelete.map((v) => v.id);

  if (idsToDelete.length > 0) {
    const placeholders = idsToDelete.map(() => '?').join(',');
    db.prepare(`DELETE FROM workflow_versions WHERE id IN (${placeholders})`).run(...idsToDelete);
    dbLogger.info(
      `[WorkflowVersion] Cleaned up ${idsToDelete.length} old versions for workflow ${workflowId}`
    );
  }

  return idsToDelete.length;
}

/**
 * Map database row to WorkflowExecution
 */
function mapExecutionRow(row: any): WorkflowExecution {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    workflowVersion: row.workflow_version,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms,
    inputData: row.input_data_json,
    outputData: row.output_data_json,
    error: row.error_text,
    nodeResults: row.node_results_json,
    triggeredBy: row.triggered_by,
    triggerSourceId: row.trigger_source_id,
    createdAt: row.created_at,
  };
}
