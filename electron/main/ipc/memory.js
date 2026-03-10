import { randomUUID } from 'crypto';
export const listMemories = (db) => {
  const stmt = db.prepare(`
    SELECT id, agent_id, content, importance, created_at
    FROM memories
    ORDER BY importance DESC, created_at DESC
  `);
  return stmt.all();
};
export const createMemory = (db, data) => {
  const id = randomUUID();
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO memories (id, agent_id, content, importance, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(id, data.agentId, data.content, data.importance ?? 1.0, now);
  return { id, ...data, createdAt: now };
};
export const updateMemory = (db, id, data) => {
  const updates = [];
  const values = [];
  if (data.content !== undefined) {
    updates.push('content = ?');
    values.push(data.content);
  }
  if (data.importance !== undefined) {
    updates.push('importance = ?');
    values.push(data.importance);
  }
  if (updates.length === 0) {
    throw new Error('No fields to update');
  }
  values.push(id);
  const stmt = db.prepare(`
    UPDATE memories
    SET ${updates.join(', ')}
    WHERE id = ?
  `);
  const result = stmt.run(...values);
  if (result.changes === 0) {
    throw new Error('Memory not found');
  }
  const getStmt = db.prepare('SELECT * FROM memories WHERE id = ?');
  return getStmt.get(id);
};
export const deleteMemory = (db, id) => {
  const stmt = db.prepare('DELETE FROM memories WHERE id = ?');
  const result = stmt.run(id);
  if (result.changes === 0) {
    throw new Error('Memory not found');
  }
  return { success: true };
};
