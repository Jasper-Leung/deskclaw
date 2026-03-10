import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

export interface CreateAgentData {
  name: string;
  description?: string;
  modelId?: string;
  systemPrompt?: string;
  temperature?: number;
}

export interface UpdateAgentData {
  name?: string;
  description?: string;
  modelId?: string;
  systemPrompt?: string;
  temperature?: number;
}

export const listAgents = (db: Database.Database) => {
  const stmt = db.prepare(`
    SELECT id, name, description, model_id, system_prompt, temperature, created_at, updated_at
    FROM agents
    ORDER BY updated_at DESC
  `);

  return stmt.all();
};

export const getAgent = (db: Database.Database, id: string) => {
  const stmt = db.prepare('SELECT * FROM agents WHERE id = ?');
  const agent = stmt.get(id);

  if (!agent) {
    throw new Error('Agent not found');
  }

  return agent;
};

export const createAgent = (db: Database.Database, data: CreateAgentData) => {
  const id = randomUUID();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO agents (id, name, description, model_id, system_prompt, temperature, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    data.name,
    data.description || null,
    data.modelId || null,
    data.systemPrompt || null,
    data.temperature ?? 0.7,
    now,
    now
  );

  return { id, ...data, createdAt: now, updatedAt: now };
};

export const updateAgent = (db: Database.Database, id: string, data: UpdateAgentData) => {
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
  if (data.modelId !== undefined) {
    updates.push('model_id = ?');
    values.push(data.modelId);
  }
  if (data.systemPrompt !== undefined) {
    updates.push('system_prompt = ?');
    values.push(data.systemPrompt);
  }
  if (data.temperature !== undefined) {
    updates.push('temperature = ?');
    values.push(data.temperature);
  }

  if (updates.length === 0) {
    return getAgent(db, id);
  }

  updates.push('updated_at = ?');
  values.push(Date.now());
  values.push(id);

  const stmt = db.prepare(`
    UPDATE agents
    SET ${updates.join(', ')}
    WHERE id = ?
  `);

  const result = stmt.run(...values);

  if (result.changes === 0) {
    throw new Error('Agent not found');
  }

  return getAgent(db, id);
};

export const deleteAgent = (db: Database.Database, id: string) => {
  const stmt = db.prepare('DELETE FROM agents WHERE id = ?');
  const result = stmt.run(id);

  if (result.changes === 0) {
    throw new Error('Agent not found');
  }

  return { success: true };
};
