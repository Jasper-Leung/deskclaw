/**
 * Community Keys IPC Handlers
 *
 * Handles secure storage and management of community-specific API keys.
 */

import { ipcMain } from 'electron';
import type Database from 'better-sqlite3';
import * as keySystem from '../keys/index.js';

/**
 * Register community keys IPC handlers
 */
export const registerCommunityKeysHandlers = (): void => {
  // List all community keys
  ipcMain.handle('communityKeys:list', () => {
    return keySystem.communityKeysDB.list();
  });

  // Get a specific key by ID
  ipcMain.handle('communityKeys:get', (_, id: string) => {
    return keySystem.communityKeysDB.get(id);
  });

  // Get keys by community ID
  ipcMain.handle('communityKeys:getByCommunity', (_, communityId: string) => {
    return keySystem.communityKeysDB.getByCommunity(communityId);
  });

  // Get active key for a community
  ipcMain.handle('communityKeys:getActive', (_, communityId: string) => {
    return keySystem.communityKeysDB.getActiveKey(communityId);
  });

  // Add a new community key
  ipcMain.handle(
    'communityKeys:add',
    async (
      _,
      data: {
        communityId: string;
        communityName: string;
        apiKey: string;
        keyType?: 'api_key' | 'token' | 'oauth' | 'custom';
        providerProtocol?: 'openai' | 'anthropic' | 'ollama' | 'custom';
        baseUrl?: string;
        heartbeatUrl?: string;
        heartbeatInterval?: number;
        expiresIn?: number;
        metadata?: Record<string, unknown>;
      }
    ) => {
      try {
        const key = await keySystem.encryptAndStoreCommunityKey(
          data.communityId,
          data.communityName,
          data.apiKey,
          {
            keyType: data.keyType,
            providerProtocol: data.providerProtocol,
            baseUrl: data.baseUrl,
            heartbeatUrl: data.heartbeatUrl,
            heartbeatInterval: data.heartbeatInterval,
            expiresIn: data.expiresIn,
            metadata: data.metadata,
          }
        );

        // Schedule heartbeat if URL is provided
        if (data.heartbeatUrl) {
          scheduleHeartbeat(key.id, data.heartbeatUrl, data.heartbeatInterval || 3600);
        }

        return { success: true, key };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  // Update a community key
  ipcMain.handle(
    'communityKeys:update',
    async (
      _,
      id: string,
      updates: {
        apiKey?: string;
        isActive?: boolean;
        heartbeatUrl?: string;
        heartbeatInterval?: number;
        metadata?: Record<string, unknown>;
      }
    ) => {
      try {
        const updateData: Partial<keySystem.CommunityKey> = {};

        if (updates.apiKey) {
          updateData.apiKeyEncrypted = await keySystem.secureKeyStorage.encrypt(updates.apiKey);
        }
        if (updates.isActive !== undefined) {
          updateData.isActive = updates.isActive;
        }
        if (updates.heartbeatUrl !== undefined) {
          updateData.heartbeatUrl = updates.heartbeatUrl;
        }
        if (updates.heartbeatInterval !== undefined) {
          updateData.heartbeatInterval = updates.heartbeatInterval;
        }
        if (updates.metadata !== undefined) {
          updateData.metadata = JSON.stringify(updates.metadata);
        }

        const key = keySystem.communityKeysDB.update(id, updateData);

        // Update heartbeat schedule if URL changed
        if (updates.heartbeatUrl && key) {
          scheduleHeartbeat(id, updates.heartbeatUrl, updates.heartbeatInterval || 3600);
        }

        return { success: true, key };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  // Delete a community key
  ipcMain.handle('communityKeys:delete', (_, id: string) => {
    try {
      const result = keySystem.communityKeysDB.delete(id);
      cancelHeartbeat(id);
      return { success: true, deleted: result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Get statistics
  ipcMain.handle('communityKeys:stats', () => {
    return keySystem.communityKeysDB.getStats();
  });

  // Test a community key (decrypt and validate)
  ipcMain.handle('communityKeys:test', async (_, id: string) => {
    try {
      const key = keySystem.communityKeysDB.get(id);
      if (!key) {
        return { success: false, error: 'Key not found' };
      }

      const decrypted = await keySystem.decryptCommunityKey(key);
      return {
        success: true,
        valid: true,
        keyType: key.keyType,
        providerProtocol: key.providerProtocol,
        preview: `${decrypted.slice(0, 8)}...${decrypted.slice(-4)}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Refresh heartbeat for a key
  ipcMain.handle('communityKeys:heartbeat', async (_, id: string) => {
    try {
      const key = keySystem.communityKeysDB.get(id);
      if (!key) {
        return { success: false, error: 'Key not found' };
      }

      if (!key.heartbeatUrl) {
        return { success: false, error: 'No heartbeat URL configured' };
      }

      const result = await performHeartbeat(key);

      if (result.success) {
        keySystem.communityKeysDB.update(id, {
          lastHeartbeat: Date.now(),
        });
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Use a community key for API calls
  ipcMain.handle(
    'communityKeys:useKey',
    async (_, communityId: string, providerProtocol?: string) => {
      try {
        const creds = await keySystem.getCommunityApiKey(
          communityId,
          (providerProtocol as keySystem.CommunityKey['providerProtocol']) || 'openai'
        );

        if (!creds) {
          return { success: false, error: 'No active key found for this community' };
        }

        return {
          success: true,
          apiKey: creds.apiKey,
          baseUrl: creds.baseUrl,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );
};

// ============================================================================
// HEARTBEAT MANAGEMENT
// ============================================================================

interface HeartbeatSchedule {
  keyId: string;
  url: string;
  interval: number;
  timeoutId?: NodeJS.Timeout;
}

const activeHeartbeats = new Map<string, HeartbeatSchedule>();

/**
 * Schedule periodic heartbeat for a community key
 */
function scheduleHeartbeat(keyId: string, url: string, interval: number): void {
  // Cancel existing schedule if any
  cancelHeartbeat(keyId);

  // Calculate delay (subtract some buffer to heartbeat before expiry)
  const delayMs = interval * 1000 - 60 * 1000; // 1 minute before expiry

  const timeoutId = setTimeout(
    async () => {
      try {
        const key = keySystem.communityKeysDB.get(keyId);
        if (key && key.isActive) {
          await performHeartbeat(key);
          keySystem.communityKeysDB.update(keyId, {
            lastHeartbeat: Date.now(),
          });

          // Reschedule next heartbeat
          scheduleHeartbeat(keyId, url, interval);
        }
      } catch (error) {
        console.error(`[Heartbeat] Failed for key ${keyId}:`, error);

        // Retry with backoff
        const retryDelay = delayMs * 2;
        const retryId = setTimeout(() => {
          scheduleHeartbeat(keyId, url, interval);
        }, retryDelay);
        activeHeartbeats.set(keyId, {
          keyId,
          url,
          interval,
          timeoutId: retryId,
        });
      }
    },
    Math.max(delayMs, 5000)
  ); // Minimum 5 seconds

  activeHeartbeats.set(keyId, { keyId, url, interval, timeoutId });
  console.log(`[Heartbeat] Scheduled for key ${keyId} every ${interval}s`);
}

/**
 * Cancel heartbeat for a key
 */
function cancelHeartbeat(keyId: string): void {
  const schedule = activeHeartbeats.get(keyId);
  if (schedule?.timeoutId) {
    clearTimeout(schedule.timeoutId);
    activeHeartbeats.delete(keyId);
    console.log(`[Heartbeat] Cancelled for key ${keyId}`);
  }
}

/**
 * Perform heartbeat request
 */
async function performHeartbeat(key: keySystem.CommunityKey): Promise<{
  success: boolean;
  error?: string;
  data?: unknown;
}> {
  try {
    const apiKey = await keySystem.decryptCommunityKey(key);

    const response = await fetch(key.heartbeatUrl!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'X-Community-ID': key.communityId,
        'User-Agent': 'DeskClaw/1.0',
      },
      body: JSON.stringify({
        action: 'heartbeat',
        keyId: key.id,
        timestamp: Date.now(),
      }),
    });

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      console.log(`[Heartbeat] Success for key ${key.id} from ${key.communityId}`);
      return { success: true, data };
    } else {
      const errorText = await response.text();
      console.error(`[Heartbeat] Failed for key ${key.id}: ${response.status} ${errorText}`);
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Heartbeat] Error for key ${key.id}:`, errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Start heartbeat system - resumes all active heartbeats on startup
 */
export function startHeartbeatSystem(): void {
  const keys = keySystem.communityKeysDB.list();

  for (const key of keys) {
    if (key.isActive && key.heartbeatUrl && key.heartbeatInterval) {
      // Check if heartbeat is needed
      const now = Date.now();
      const lastHeartbeat = key.lastHeartbeat || 0;
      const nextHeartbeat = lastHeartbeat + key.heartbeatInterval * 1000;

      if (nextHeartbeat <= now) {
        // Heartbeat is overdue, schedule immediately
        setTimeout(() => {
          performHeartbeat(key).then((result) => {
            if (result.success) {
              keySystem.communityKeysDB.update(key.id, {
                lastHeartbeat: Date.now(),
              });
            }
          });
        }, Math.random() * 5000); // Random delay to avoid thundering herd
      }

      scheduleHeartbeat(key.id, key.heartbeatUrl, key.heartbeatInterval);
    }
  }

  console.log(`[Heartbeat] Started with ${activeHeartbeats.size} active schedules`);
}

/**
 * Stop heartbeat system
 */
export function stopHeartbeatSystem(): void {
  for (const [keyId] of activeHeartbeats) {
    cancelHeartbeat(keyId);
  }
  console.log('[Heartbeat] Stopped');
}
