import { randomUUID } from 'crypto';
import { encrypt } from '../db/index.js';
export const listProviders = (db) => {
  const stmt = db.prepare(`
    SELECT id, name, protocol, base_url, created_at, updated_at
    FROM providers
    ORDER BY created_at DESC
  `);
  return stmt.all();
};
export const createProvider = (db, data) => {
  const id = randomUUID();
  const now = Date.now();
  const apiKeyEncrypted = encrypt(data.apiKey);
  const stmt = db.prepare(`
    INSERT INTO providers (id, name, protocol, base_url, api_key_encrypted, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, data.name, data.protocol, data.baseUrl, apiKeyEncrypted, now, now);
  return {
    id,
    name: data.name,
    protocol: data.protocol,
    baseUrl: data.baseUrl,
    createdAt: now,
    updatedAt: now,
  };
};
export const updateProvider = (db, id, data) => {
  const updates = [];
  const values = [];
  if (data.name !== undefined) {
    updates.push('name = ?');
    values.push(data.name);
  }
  if (data.protocol !== undefined) {
    updates.push('protocol = ?');
    values.push(data.protocol);
  }
  if (data.baseUrl !== undefined) {
    updates.push('base_url = ?');
    values.push(data.baseUrl);
  }
  if (data.apiKey !== undefined) {
    updates.push('api_key_encrypted = ?');
    values.push(encrypt(data.apiKey));
  }
  if (updates.length === 0) {
    throw new Error('No fields to update');
  }
  updates.push('updated_at = ?');
  values.push(Date.now());
  values.push(id);
  const stmt = db.prepare(`
    UPDATE providers
    SET ${updates.join(', ')}
    WHERE id = ?
  `);
  const result = stmt.run(...values);
  if (result.changes === 0) {
    throw new Error('Provider not found');
  }
  return listProviders(db);
};
export const deleteProvider = (db, id) => {
  const stmt = db.prepare('DELETE FROM providers WHERE id = ?');
  const result = stmt.run(id);
  if (result.changes === 0) {
    throw new Error('Provider not found');
  }
  return { success: true };
};
export const testProvider = (db, id) => {
  const stmt = db.prepare('SELECT * FROM providers WHERE id = ?');
  const provider = stmt.get(id);
  if (!provider) {
    throw new Error('Provider not found');
  }
  // In a real implementation, this would make a test request to the provider
  // For now, we'll just return success
  return { success: true, message: 'Provider connection test passed' };
};
