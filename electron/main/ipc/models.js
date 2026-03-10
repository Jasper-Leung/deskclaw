import { randomUUID } from 'crypto';
export const listModels = (db) => {
  const stmt = db.prepare(`
    SELECT m.id, m.provider_id, m.model_id, m.display_name, m.is_custom, m.created_at,
           p.name as provider_name, p.protocol as provider_protocol
    FROM models m
    JOIN providers p ON m.provider_id = p.id
    ORDER BY m.created_at DESC
  `);
  return stmt.all();
};
export const createModel = (db, data) => {
  const id = randomUUID();
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO models (id, provider_id, model_id, display_name, is_custom, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    data.providerId,
    data.modelId,
    data.displayName || data.modelId,
    data.isCustom ? 1 : 0,
    now
  );
  return { id, ...data, createdAt: now };
};
export const deleteModel = (db, id) => {
  const stmt = db.prepare('DELETE FROM models WHERE id = ?');
  const result = stmt.run(id);
  if (result.changes === 0) {
    throw new Error('Model not found');
  }
  return { success: true };
};
