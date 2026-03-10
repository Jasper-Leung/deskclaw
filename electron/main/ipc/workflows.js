import { randomUUID } from 'crypto';
export const listWorkflows = (db) => {
  const stmt = db.prepare(`
    SELECT id, name, created_at, updated_at
    FROM workflows
    ORDER BY updated_at DESC
  `);
  return stmt.all();
};
export const getWorkflow = (db, id) => {
  const stmt = db.prepare('SELECT * FROM workflows WHERE id = ?');
  const workflow = stmt.get(id);
  if (!workflow) {
    throw new Error('Workflow not found');
  }
  return {
    ...workflow,
    definitionJson: JSON.parse(workflow.definition_json),
  };
};
export const createWorkflow = (db, data) => {
  const id = randomUUID();
  const now = Date.now();
  const definition = {
    nodes: data.nodes || [],
    edges: data.edges || [],
  };
  const stmt = db.prepare(`
    INSERT INTO workflows (id, name, definition_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(id, data.name, JSON.stringify(definition), now, now);
  return { id, ...data, definition, createdAt: now, updatedAt: now };
};
export const updateWorkflow = (db, id, data) => {
  const updates = [];
  const values = [];
  if (data.name !== undefined) {
    updates.push('name = ?');
    values.push(data.name);
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
export const deleteWorkflow = (db, id) => {
  const stmt = db.prepare('DELETE FROM workflows WHERE id = ?');
  const result = stmt.run(id);
  if (result.changes === 0) {
    throw new Error('Workflow not found');
  }
  return { success: true };
};
export const executeWorkflow = (db, id) => {
  // This is a placeholder for workflow execution
  // In a real implementation, this would execute the workflow using a workflow engine
  const workflow = getWorkflow(db, id);
  return {
    success: true,
    workflowId: id,
    executionId: randomUUID(),
    status: 'running',
  };
};
