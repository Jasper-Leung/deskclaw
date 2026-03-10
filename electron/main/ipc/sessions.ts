import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { Message } from '../../../shared/types/index.js';

export interface CreateSessionData {
  agentId?: string;
  title: string;
  messages?: Message[];
}

export const listSessions = (db: Database.Database) => {
  const stmt = db.prepare(`
    SELECT id, agent_id, title, created_at, updated_at
    FROM sessions
    ORDER BY updated_at DESC
  `);

  return stmt.all();
};

export const getSession = (db: Database.Database, id: string) => {
  const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
  const session = stmt.get(id) as any;

  if (!session) {
    throw new Error('Session not found');
  }

  return {
    ...session,
    messagesJson: JSON.parse(session.messages_json),
  };
};

export const createSession = (db: Database.Database, data: CreateSessionData) => {
  const id = randomUUID();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO sessions (id, agent_id, title, messages_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  stmt.run(id, data.agentId || null, data.title, JSON.stringify(data.messages || []), now, now);

  return { id, ...data, messages: data.messages || [], createdAt: now, updatedAt: now };
};

export const appendMessage = (db: Database.Database, id: string, message: Message) => {
  const session = getSession(db, id);
  const messages = session.messagesJson as Message[];
  messages.push(message);

  const stmt = db.prepare(`
    UPDATE sessions
    SET messages_json = ?, updated_at = ?
    WHERE id = ?
  `);

  stmt.run(JSON.stringify(messages), Date.now(), id);

  return messages;
};

export const updateSession = (
  db: Database.Database,
  id: string,
  data: Partial<CreateSessionData>
) => {
  const updates: string[] = [];
  const values: unknown[] = [];

  if (data.title !== undefined) {
    updates.push('title = ?');
    values.push(data.title);
  }
  if (data.messages !== undefined) {
    updates.push('messages_json = ?');
    values.push(JSON.stringify(data.messages));
  }
  if (data.agentId !== undefined) {
    updates.push('agent_id = ?');
    values.push(data.agentId);
  }

  if (updates.length === 0) {
    return getSession(db, id);
  }

  updates.push('updated_at = ?');
  values.push(Date.now());
  values.push(id);

  const stmt = db.prepare(`
    UPDATE sessions
    SET ${updates.join(', ')}
    WHERE id = ?
  `);

  const result = stmt.run(...values);

  if (result.changes === 0) {
    throw new Error('Session not found');
  }

  return getSession(db, id);
};

export const deleteSession = (db: Database.Database, id: string) => {
  const stmt = db.prepare('DELETE FROM sessions WHERE id = ?');
  const result = stmt.run(id);

  if (result.changes === 0) {
    throw new Error('Session not found');
  }

  return { success: true };
};
