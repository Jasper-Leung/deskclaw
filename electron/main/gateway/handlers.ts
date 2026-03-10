/**
 * Gateway Method Handlers
 *
 * Implements all Gateway protocol methods.
 */

import type { GatewayServer } from './server.js';
import { sessionManager } from './sessions.js';
import { messageRouter } from './router.js';
import { channelRegistry } from '../channels/channel-registry.js';
import type Database from 'better-sqlite3';

export function registerGatewayHandlers(gateway: GatewayServer, db: Database.Database): void {
  gateway.registerHandler('sessions.list', async () => {
    return sessionManager.list();
  });

  gateway.registerHandler('sessions.get', async (params) => {
    const { sessionId } = params as { sessionId: string };
    return sessionManager.get(sessionId);
  });

  gateway.registerHandler('sessions.history', async (params) => {
    const { sessionId, limit } = params as { sessionId: string; limit?: number };
    return sessionManager.getHistory(sessionId, limit);
  });

  gateway.registerHandler('sessions.patch', async (params) => {
    const { sessionId, model, metadata } = params as {
      sessionId: string;
      model?: string;
      metadata?: Record<string, unknown>;
    };
    return sessionManager.patch(sessionId, { model, metadata });
  });

  gateway.registerHandler('sessions.delete', async (params) => {
    const { sessionId } = params as { sessionId: string };
    return sessionManager.delete(sessionId);
  });

  gateway.registerHandler('config.get', async (params) => {
    const { key } = params as { key?: string };
    if (key) {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
      return row ? JSON.parse((row as { value: string }).value) : null;
    }
    const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{
      key: string;
      value: string;
    }>;
    const config: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        config[row.key] = JSON.parse(row.value);
      } catch {
        config[row.key] = row.value;
      }
    }
    return config;
  });

  gateway.registerHandler('config.set', async (params) => {
    const { key, value } = params as { key: string; value: unknown };
    const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
    db.prepare(
      `
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?
    `
    ).run(key, valueStr, Date.now(), valueStr, Date.now());
    return { success: true };
  });

  gateway.registerHandler('channels.list', async () => {
    return db.prepare('SELECT * FROM channels ORDER BY created_at DESC').all();
  });

  gateway.registerHandler('channels.status', async () => {
    const channels = db.prepare('SELECT * FROM channels').all() as Array<{
      id: string;
      channel_type: string;
      name: string;
      enabled: number;
    }>;

    return channels.map((ch) => ({
      id: ch.id,
      type: ch.channel_type,
      name: ch.name,
      enabled: ch.enabled === 1,
      connected: channelRegistry.has(ch.channel_type),
    }));
  });

  gateway.registerHandler('channels.start', async (params) => {
    const { channelId } = params as { channelId: string };
    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId) as
      | {
          id: string;
          channel_type: string;
          config_json: string;
        }
      | undefined;

    if (!channel) {
      throw new Error('Channel not found');
    }

    const plugin = channelRegistry.getPlugin(channel.channel_type);
    const config = JSON.parse(channel.config_json);

    const validation = plugin.validateConfig(config);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid configuration');
    }

    await plugin.initialize(config);
    await plugin.start();

    db.prepare('UPDATE channels SET enabled = 1, updated_at = ? WHERE id = ?').run(
      Date.now(),
      channelId
    );

    return { success: true };
  });

  gateway.registerHandler('channels.stop', async (params) => {
    const { channelId } = params as { channelId: string };
    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId) as
      | {
          channel_type: string;
        }
      | undefined;

    if (!channel) {
      throw new Error('Channel not found');
    }

    const plugin = channelRegistry.getPlugin(channel.channel_type);
    await plugin.stop();

    messageRouter.clearChannelSessions(channelId);

    db.prepare('UPDATE channels SET enabled = 0, updated_at = ? WHERE id = ?').run(
      Date.now(),
      channelId
    );

    return { success: true };
  });

  gateway.registerHandler('tools.list', async () => {
    const skills = db.prepare('SELECT id, name, description FROM skills WHERE enabled = 1').all();
    return skills;
  });

  gateway.registerHandler('tools.execute', async (params) => {
    const { toolId } = params as { toolId: string; args: Record<string, unknown> };

    const skill = db.prepare('SELECT * FROM skills WHERE id = ? AND enabled = 1').get(toolId) as
      | {
          code: string;
          schema_json: string;
        }
      | undefined;

    if (!skill) {
      throw new Error(`Tool not found: ${toolId}`);
    }

    return { success: true, message: 'Tool execution requires skill runtime' };
  });

  gateway.registerHandler('agent.send', async (params) => {
    const { sessionId, message } = params as { sessionId: string; message: string };

    const session = sessionManager.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    sessionManager.appendMessage(sessionId, {
      role: 'user',
      content: message,
      timestamp: Date.now(),
    });

    return { success: true, sessionId };
  });

  gateway.registerHandler('ping', async () => {
    return { pong: true, timestamp: Date.now() };
  });
}
