import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

export interface CreateModelData {
  providerId: string;
  modelId: string;
  displayName?: string;
  isCustom?: boolean;
}

export const listModels = (db: Database.Database) => {
  const stmt = db.prepare(`
    SELECT m.id, m.provider_id, m.model_id, m.display_name, m.is_custom, m.created_at,
           p.name as provider_name, p.protocol as provider_protocol
    FROM models m
    JOIN providers p ON m.provider_id = p.id
    ORDER BY m.created_at DESC
  `);

  return stmt.all().map((row: any) => ({
    id: row.id,
    providerId: row.provider_id,
    modelId: row.model_id,
    displayName: row.display_name,
    isCustom: !!row.is_custom,
    createdAt: row.created_at,
    providerName: row.provider_name,
    providerProtocol: row.provider_protocol,
  }));
};

export const createModel = (db: Database.Database, data: CreateModelData) => {
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

export const deleteModel = (db: Database.Database, id: string) => {
  const stmt = db.prepare('DELETE FROM models WHERE id = ?');
  const result = stmt.run(id);

  if (result.changes === 0) {
    throw new Error('Model not found');
  }

  return { success: true };
};
