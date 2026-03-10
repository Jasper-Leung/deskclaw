import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { WorkflowNode, WorkflowEdge } from '../../../shared/types/index.js';
import { verifyPresetWorkflows } from '../db/verify-workflows.js';

export interface CreateWorkflowData {
  name: string;
  description?: string;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
}

export const listWorkflows = (db: Database.Database) => {
  const stmt = db.prepare(`
    SELECT id, name, description, is_preset, created_at, updated_at
    FROM workflows
    ORDER BY is_preset DESC, updated_at DESC
  `);

  return stmt.all();
};

export const getWorkflow = (db: Database.Database, id: string) => {
  const stmt = db.prepare('SELECT * FROM workflows WHERE id = ?');
  const workflowData = stmt.get(id) as any;

  if (!workflowData) {
    throw new Error('Workflow not found');
  }

  return {
    ...workflowData,
    definitionJson: JSON.parse(workflowData.definition_json),
  };
};

export const createWorkflow = (db: Database.Database, data: CreateWorkflowData) => {
  const id = randomUUID();
  const now = Date.now();

  const definition = {
    nodes: data.nodes || [],
    edges: data.edges || [],
  };

  const stmt = db.prepare(`
    INSERT INTO workflows (id, name, description, definition_json, is_preset, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(id, data.name, data.description || null, JSON.stringify(definition), 0, now, now);

  return { id, ...data, definition, isPreset: 0, createdAt: now, updatedAt: now };
};

export const updateWorkflow = (
  db: Database.Database,
  id: string,
  data: Partial<CreateWorkflowData>
) => {
  const updates: string[] = [];
  const values: unknown[] = [];

  if (data.name !== undefined) {
    updates.push('name = ?');
    values.push(data.name);
  }
  if (data.description !== undefined) {
    updates.push('description = ?');
    values.push(data.description);
  }
  if (data.nodes !== undefined || data.edges !== undefined) {
    const current = getWorkflow(db, id);
    const definition = {
      nodes: data.nodes ?? current.definitionJson.nodes,
      edges: data.edges ?? current.definitionJson.edges,
    };
    updates.push('definition_json = ?');
    values.push(JSON.stringify(definition));
  }

  if (updates.length === 0) {
    return getWorkflow(db, id);
  }

  updates.push('updated_at = ?');
  values.push(Date.now());
  values.push(id);

  const stmt = db.prepare(`
    UPDATE workflows
    SET ${updates.join(', ')}
    WHERE id = ?
  `);

  const result = stmt.run(...values);

  if (result.changes === 0) {
    throw new Error('Workflow not found');
  }

  return getWorkflow(db, id);
};

export const deleteWorkflow = (db: Database.Database, id: string) => {
  const stmt = db.prepare('DELETE FROM workflows WHERE id = ?');
  const result = stmt.run(id);

  if (result.changes === 0) {
    throw new Error('Workflow not found');
  }

  return { success: true };
};

import { executeWorkflow as runWorkflow } from '../workflow-engine/index.js';

export const executeWorkflow = async (db: Database.Database, id: string) => {
  const workflow = getWorkflow(db, id);
  const { nodes, edges } = workflow.definitionJson;

  // Execute the workflow using the workflow engine
  const startTime = Date.now();
  const result = await runWorkflow(db, id, nodes, edges);

  // Track workflow execution for evolution learning
  try {
    const { getEvolutionAnalytics } = await import('../evolution/analytics.js');
    getEvolutionAnalytics().trackWorkflowExecution(workflow.name, id, Date.now() - startTime, true);
  } catch {
    // silently ignore tracking errors
  }

  return result;
};

/**
 * Verify all preset workflows
 */
export const verifyWorkflows = () => {
  return verifyPresetWorkflows();
};
