/**
 * Channels IPC Handlers
 *
 * Handles all IPC communication for the channel system.
 */

import { ipcMain, BrowserWindow } from 'electron';
import type Database from 'better-sqlite3';
import { getDatabase } from '../db/index.js';
import { channelRegistry } from '../channels/channel-registry.js';
import { channelRouter } from '../channels/channel-router.js';
import type { ChannelMessage } from '../channels/channel-plugin.js';

// Import channel implementations to register them
import '../channels/index.js';

let mainWindow: BrowserWindow | null = null;

/**
 * Set the main window reference for sending events
 */
export const setChannelsMainWindow = (window: BrowserWindow | null): void => {
  mainWindow = window;
};

/**
 * Save a message to the database
 */
function saveMessage(db: Database.Database, msg: ChannelMessage): void {
  const now = Date.now();
  db.prepare(
    `
    INSERT OR REPLACE INTO channel_messages
    (id, channel_id, message_id, peer_id, peer_type, direction, content, metadata_json, timestamp, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    msg.id,
    msg.channelId,
    msg.messageId,
    msg.peerId,
    msg.peerType,
    msg.direction,
    msg.content || null,
    JSON.stringify(msg.metadata || {}),
    msg.timestamp,
    now
  );
}

/**
 * Handle incoming message and trigger AI response if configured
 */
async function handleIncomingMessage(db: Database.Database, msg: ChannelMessage): Promise<void> {
  // Check if auto-reply is enabled for this channel/peer
  const autoReplyEnabled = channelRouter.isAutoReplyEnabled(msg.channelId, msg.peerId);

  if (!autoReplyEnabled) {
    return;
  }

  // Get default model
  const defaultModelRow = db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get('defaultModel') as { value: string } | undefined;
  const defaultModel = defaultModelRow?.value;

  if (!defaultModel) {
    console.warn('[Channels] No default model configured for auto-reply');
    return;
  }

  // Create or get session for this peer
  const sessionTitle = `chat:${msg.channelId}:${msg.peerId}`;
  let session = db.prepare('SELECT id FROM sessions WHERE title = ?').get(sessionTitle) as
    | { id: string }
    | undefined;

  if (!session) {
    const sessionId = crypto.randomUUID();
    db.prepare(
      `
      INSERT INTO sessions (id, title, messages_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `
    ).run(sessionId, sessionTitle, '[]', Date.now(), Date.now());
    session = { id: sessionId };

    // Map peer to session
    channelRouter.mapPeerToSession(msg.channelId, msg.peerId, sessionId);
  }

  // Add message to session
  const messagesJson = db
    .prepare('SELECT messages_json FROM sessions WHERE id = ?')
    .get(session.id) as { messages_json: string };

  const messages = JSON.parse(messagesJson.messages_json);
  messages.push({
    role: 'user',
    content: msg.content || '',
    timestamp: msg.timestamp,
  });

  db.prepare('UPDATE sessions SET messages_json = ?, updated_at = ? WHERE id = ?').run(
    JSON.stringify(messages),
    Date.now(),
    session.id
  );

  // Trigger AI response via stream
  if (mainWindow) {
    mainWindow.webContents.send('channels:autoReply', {
      sessionId: session.id,
      channelId: msg.channelId,
      peerId: msg.peerId,
    });
  }
}

/**
 * Register all channels IPC handlers
 */
export const registerChannelsHandlers = (): void => {
  const db = getDatabase();

  // List all channels
  ipcMain.handle('channels:list', () => {
    return db.prepare('SELECT * FROM channels ORDER BY created_at DESC').all();
  });

  // Get supported channel types
  ipcMain.handle('channels:types', () => {
    return channelRegistry.listChannelTypes();
  });

  // Create a new channel
  ipcMain.handle('channels:create', (_, data) => {
    const { channelType, accountId, name, configJson } = data as {
      channelType: string;
      accountId: string;
      name: string;
      configJson: string;
    };

    const id = crypto.randomUUID();
    const now = Date.now();

    db.prepare(
      `
      INSERT INTO channels (id, channel_type, account_id, name, config_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(id, channelType, accountId, name, configJson, now, now);

    return { id, channelType, accountId, name };
  });

  // Update a channel
  ipcMain.handle('channels:update', (_, id, data) => {
    const { name, configJson } = data as { name?: string; configJson?: string };
    const updates: string[] = [];
    const values: unknown[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (configJson !== undefined) {
      updates.push('config_json = ?');
      values.push(configJson);
    }

    if (updates.length === 0) {
      return { success: false, error: 'No updates provided' };
    }

    updates.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);

    db.prepare(`UPDATE channels SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    return { success: true };
  });

  // Start a channel
  ipcMain.handle('channels:start', async (_, id) => {
    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(id) as
      | {
          id: string;
          channel_type: string;
          config_json: string;
          name: string;
        }
      | undefined;

    if (!channel) {
      throw new Error('Channel not found');
    }

    try {
      const config = JSON.parse(channel.config_json);
      const plugin = channelRegistry.getPlugin(channel.channel_type);

      // Validate config
      const validation = plugin.validateConfig(config);
      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid configuration');
      }

      // Initialize and start
      await plugin.initialize(config);
      await plugin.start();

      // Set up message callback
      plugin.onMessage((msg) => {
        // Save to database
        saveMessage(db, msg);

        // Forward to UI
        mainWindow?.webContents.send('channels:message', msg);

        // Route to handlers
        channelRouter.route(msg).catch((err) => {
          console.error('[Channels] Error routing message:', err);
        });

        // Handle auto-reply
        handleIncomingMessage(db, msg).catch((err) => {
          console.error('[Channels] Error handling incoming message:', err);
        });
      });

      // Update enabled status
      db.prepare('UPDATE channels SET enabled = 1, updated_at = ? WHERE id = ?').run(
        Date.now(),
        id
      );

      return { success: true };
    } catch (error) {
      console.error('[Channels] Failed to start channel:', error);
      throw error;
    }
  });

  // Stop a channel
  ipcMain.handle('channels:stop', async (_, id) => {
    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(id) as
      | {
          channel_type: string;
        }
      | undefined;

    if (!channel) {
      throw new Error('Channel not found');
    }

    try {
      const plugin = channelRegistry.getPlugin(channel.channel_type);
      await plugin.stop();

      // Clear sessions for this channel
      channelRouter.clearChannelSessions(id);

      // Update enabled status
      db.prepare('UPDATE channels SET enabled = 0, updated_at = ? WHERE id = ?').run(
        Date.now(),
        id
      );

      return { success: true };
    } catch (error) {
      console.error('[Channels] Failed to stop channel:', error);
      throw error;
    }
  });

  // Send a message
  ipcMain.handle('channels:send', async (_, channelId, peerId, content, options) => {
    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId) as
      | {
          channel_type: string;
          enabled: number;
        }
      | undefined;

    if (!channel) {
      throw new Error('Channel not found');
    }

    if (!channel.enabled) {
      throw new Error('Channel is not started');
    }

    try {
      const plugin = channelRegistry.getPlugin(channel.channel_type);
      const messageId = await plugin.sendMessage(peerId, content, options);

      // Save outbound message
      saveMessage(db, {
        id: `outbound_${messageId}`,
        channelId,
        messageId,
        peerId,
        peerType: 'direct',
        direction: 'outbound',
        content,
        timestamp: Date.now(),
      });

      return { messageId };
    } catch (error) {
      console.error('[Channels] Failed to send message:', error);
      throw error;
    }
  });

  // Get message history
  ipcMain.handle('channels:messages', (_, channelId, peerId, limit = 50) => {
    return db
      .prepare(
        `
          SELECT * FROM channel_messages
          WHERE channel_id = ? AND peer_id = ?
          ORDER BY timestamp DESC
          LIMIT ?
        `
      )
      .all(channelId, peerId, limit);
  });

  // Delete a channel
  ipcMain.handle('channels:delete', (_, id) => {
    db.prepare('DELETE FROM channels WHERE id = ?').run(id);
    db.prepare('DELETE FROM channel_messages WHERE channel_id = ?').run(id);
    channelRouter.clearChannelSessions(id);
    return { success: true };
  });

  // Get channel statistics
  ipcMain.handle('channels:stats', () => {
    const channelCount = db.prepare('SELECT COUNT(*) as count FROM channels').get() as {
      count: number;
    };
    const activeCount = db
      .prepare('SELECT COUNT(*) as count FROM channels WHERE enabled = 1')
      .get() as { count: number };
    const messageCount = db.prepare('SELECT COUNT(*) as count FROM channel_messages').get() as {
      count: number;
    };

    const routerStats = channelRouter.getStats();

    return {
      totalChannels: channelCount.count,
      activeChannels: activeCount.count,
      totalMessages: messageCount.count,
      peerSessions: routerStats.totalPeerSessions,
      activeSessions24h: routerStats.activeSessions24h,
      autoReplyEnabled: routerStats.autoReplyEnabled,
    };
  });

  // Set auto-reply for a peer
  ipcMain.handle('channels:setAutoReply', (_, channelId, peerId, enabled) => {
    channelRouter.setAutoReply(channelId, peerId, enabled);
    return { success: true };
  });

  // Get peer session info
  ipcMain.handle('channels:getPeerSession', (_, channelId, peerId) => {
    return channelRouter.getPeerSession(channelId, peerId);
  });

  // List active peers for a channel
  ipcMain.handle('channels:listPeers', (_, channelId) => {
    return channelRouter.listActivePeers(channelId);
  });

  // Clean up inactive sessions
  ipcMain.handle('channels:cleanup', (_, maxAgeMs = 7 * 24 * 60 * 60 * 1000) => {
    channelRouter.cleanupInactiveSessions(maxAgeMs);
    return { success: true };
  });

  // Test channel connection
  ipcMain.handle('channels:test', async (_, channelType, configJson) => {
    try {
      const plugin = channelRegistry.getPlugin(channelType);
      const config = JSON.parse(configJson);

      const validation = plugin.validateConfig(config);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      await plugin.initialize(config);
      await plugin.start();
      await plugin.stop();

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Get account info for a channel
  ipcMain.handle('channels:accountInfo', async (_, id) => {
    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(id) as
      | {
          channel_type: string;
          config_json: string;
          enabled: number;
        }
      | undefined;

    if (!channel) {
      throw new Error('Channel not found');
    }

    const plugin = channelRegistry.getPlugin(channel.channel_type);
    const config = JSON.parse(channel.config_json);

    // Temporarily initialize to get account info
    await plugin.initialize(config);

    try {
      if (plugin.getAccountInfo) {
        const info = await plugin.getAccountInfo();
        return { success: true, info };
      } else {
        return { success: false, error: 'Not supported' };
      }
    } finally {
      // Clean up
      await plugin.stop();
    }
  });
};
