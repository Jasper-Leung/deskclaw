import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { encrypt, decrypt } from '../db/index.js';

export interface CreateProviderData {
  name: string;
  protocol: 'openai' | 'anthropic' | 'ollama' | 'custom';
  baseUrl: string;
  apiKey: string;
}

export interface UpdateProviderData {
  name?: string;
  protocol?: 'openai' | 'anthropic' | 'ollama' | 'custom';
  baseUrl?: string;
  apiKey?: string;
}

export const listProviders = (db: Database.Database) => {
  const stmt = db.prepare(`
    SELECT id, name, protocol, base_url, created_at, updated_at
    FROM providers
    ORDER BY created_at DESC
  `);

  return stmt.all();
};

export const createProvider = (db: Database.Database, data: CreateProviderData) => {
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

export const updateProvider = (db: Database.Database, id: string, data: UpdateProviderData) => {
  const updates: string[] = [];
  const values: unknown[] = [];

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

export const deleteProvider = (db: Database.Database, id: string) => {
  const stmt = db.prepare('DELETE FROM providers WHERE id = ?');
  const result = stmt.run(id);

  if (result.changes === 0) {
    throw new Error('Provider not found');
  }

  return { success: true };
};

export const testProvider = async (db: Database.Database, id: string) => {
  const stmt = db.prepare('SELECT * FROM providers WHERE id = ?');
  const provider = stmt.get(id) as any;

  if (!provider) {
    throw new Error('Provider not found');
  }

  try {
    const apiKey = decrypt(provider.api_key_encrypted);

    const testResponse = await fetch(`${provider.base_url}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Say "hello"' }],
        max_tokens: 5,
      }),
    });

    if (!testResponse.ok) {
      const errorText = await testResponse.text();
      throw new Error(`API returned ${testResponse.status}: ${errorText}`);
    }

    return { success: true, message: 'Provider connection test passed' };
  } catch (error: any) {
    throw new Error(`Connection test failed: ${error.message}`);
  }
};

export const testModelConnection = async (
  _db: Database.Database,
  data: { protocol: string; baseUrl: string; apiKey: string; modelId: string }
) => {
  try {
    const testResponse = await fetch(`${data.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${data.apiKey}`,
      },
      body: JSON.stringify({
        model: data.modelId,
        messages: [{ role: 'user', content: 'Say "hello"' }],
        max_tokens: 5,
      }),
    });

    if (!testResponse.ok) {
      const errorText = await testResponse.text();
      throw new Error(`API returned ${testResponse.status}: ${errorText}`);
    }

    return { success: true, message: `Model ${data.modelId} connection test passed` };
  } catch (error: any) {
    throw new Error(`Connection test failed: ${error.message}`);
  }
};
