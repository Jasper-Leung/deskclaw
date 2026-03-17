/**
 * Browser IPC Handlers
 *
 * Handles all IPC communication for the browser automation system.
 */

import { ipcMain } from 'electron';
import { getDatabase } from '../db/index.js';
import { browserService } from '../browser/browser-service.js';

/**
 * Register all browser IPC handlers
 */
export const registerBrowserHandlers = (): void => {
  const db = getDatabase();

  // List all browser profiles
  ipcMain.handle('browser:profiles:list', () => {
    return db.prepare('SELECT * FROM browser_profiles ORDER BY created_at DESC').all();
  });

  // Create a new browser profile
  ipcMain.handle(
    'browser:profiles:create',
    (
      _,
      data: {
        name: string;
        headless?: boolean;
        viewportWidth?: number;
        viewportHeight?: number;
        cdpEndpoint?: string; // CDP endpoint for connecting to existing browser
      }
    ) => {
      const id = crypto.randomUUID();
      const now = Date.now();

      db.prepare(
        `
        INSERT INTO browser_profiles (id, name, headless, viewport_width, viewport_height, cdp_endpoint, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        id,
        data.name,
        data.headless ? 1 : 0,
        data.viewportWidth || 1280,
        data.viewportHeight || 720,
        data.cdpEndpoint || null,
        now,
        now
      );

      return { id, ...data };
    }
  );

  // Delete a browser profile
  ipcMain.handle('browser:profiles:delete', (_, id: string) => {
    // Stop browser if running
    if (browserService.getActiveBrowserCount() > 0) {
      browserService.closeProfile(id).catch(console.error);
    }

    db.prepare('DELETE FROM browser_profiles WHERE id = ?').run(id);
    db.prepare('DELETE FROM browser_sessions WHERE profile_id = ?').run(id);
    return { success: true };
  });

  // Launch a browser profile
  ipcMain.handle('browser:launch', async (_, profileId: string) => {
    try {
      const sessionId = await browserService.launchProfile(profileId);
      return { sessionId, success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Close a browser profile
  ipcMain.handle('browser:closeProfile', async (_, profileId: string) => {
    try {
      await browserService.closeProfile(profileId);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Navigate to a URL
  ipcMain.handle('browser:navigate', async (_, sessionId: string, url: string) => {
    try {
      await browserService.navigate(sessionId, url);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Get a snapshot of the current page
  ipcMain.handle('browser:snapshot', async (_, sessionId: string, format?: string) => {
    try {
      const snapshot = await browserService.snapshot(sessionId, format as any);
      return { success: true, snapshot };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Click an element
  ipcMain.handle('browser:click', async (_, sessionId: string, selector: string) => {
    try {
      await browserService.click(sessionId, selector);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Type text into an element
  ipcMain.handle('browser:type', async (_, sessionId: string, selector: string, text: string) => {
    try {
      await browserService.type(sessionId, selector, text);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Evaluate JavaScript
  ipcMain.handle('browser:evaluate', async (_, sessionId: string, fn: string) => {
    try {
      const result = await browserService.evaluate(sessionId, fn);
      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Take a screenshot
  ipcMain.handle('browser:screenshot', async (_, sessionId: string, fullPage?: boolean) => {
    try {
      const buffer = await browserService.screenshot(sessionId, fullPage);
      return {
        success: true,
        data: buffer.toString('base64'),
        mimeType: 'image/png',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Close a session
  ipcMain.handle('browser:closeSession', async (_, sessionId: string) => {
    try {
      await browserService.closeSession(sessionId);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // List active sessions
  ipcMain.handle('browser:sessions:list', () => {
    return db.prepare('SELECT * FROM browser_sessions ORDER BY created_at DESC').all();
  });

  // Get browser service stats
  ipcMain.handle('browser:stats', () => {
    return {
      activeBrowsers: browserService.getActiveBrowserCount(),
      activeSessions: browserService.getActiveSessionCount(),
    };
  });
};
