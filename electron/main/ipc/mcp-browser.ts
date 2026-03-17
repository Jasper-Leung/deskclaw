/**
 * MCP Browser IPC Handlers
 *
 * Handles all IPC communication for the MCP-based browser automation system.
 */

import { ipcMain } from 'electron';
import { mcpBrowserService } from '../browser/mcp-browser-service.js';

/**
 * Register all MCP browser IPC handlers
 */
export const registerMCPBrowserHandlers = (): void => {
  // Connect to chrome-devtools-mcp
  ipcMain.handle('mcpBrowser:connect', async () => {
    try {
      await mcpBrowserService.connect();
      await mcpBrowserService.syncSessions();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Disconnect from chrome-devtools-mcp
  ipcMain.handle('mcpBrowser:disconnect', async () => {
    try {
      await mcpBrowserService.disconnect();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Check connection status
  ipcMain.handle('mcpBrowser:isConnected', () => {
    return { connected: mcpBrowserService.isMCPConnected() };
  });

  // Get Chrome tabs
  ipcMain.handle('mcpBrowser:getTabs', async () => {
    try {
      const tabs = await mcpBrowserService.getChromePages();
      return { success: true, tabs };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // List all sessions
  ipcMain.handle('mcpBrowser:sessions:list', () => {
    try {
      const sessions = mcpBrowserService.getSessions();
      return { success: true, sessions };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Set current session
  ipcMain.handle('mcpBrowser:sessions:setCurrent', async (_, sessionId: string) => {
    try {
      mcpBrowserService.setCurrentSession(sessionId);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Get current session
  ipcMain.handle('mcpBrowser:sessions:getCurrent', () => {
    try {
      const session = mcpBrowserService.getCurrentSession();
      return { success: true, session };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Navigate to URL
  ipcMain.handle('mcpBrowser:navigate', async (_, url: string, sessionId?: string) => {
    try {
      await mcpBrowserService.navigate(url, sessionId);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Take screenshot
  ipcMain.handle('mcpBrowser:screenshot', async (_, sessionId?: string) => {
    try {
      const data = await mcpBrowserService.screenshot(sessionId);
      return {
        success: true,
        data,
        mimeType: 'image/png',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Get snapshot
  ipcMain.handle('mcpBrowser:snapshot', async (_, sessionId?: string) => {
    try {
      const snapshot = await mcpBrowserService.snapshot(sessionId);
      return { success: true, snapshot };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Click element
  ipcMain.handle('mcpBrowser:click', async (_, selector: string, sessionId?: string) => {
    try {
      await mcpBrowserService.click(selector, sessionId);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Type text
  ipcMain.handle(
    'mcpBrowser:type',
    async (_, selector: string, text: string, sessionId?: string) => {
      try {
        await mcpBrowserService.type(selector, text, sessionId);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  // Close session
  ipcMain.handle('mcpBrowser:closeSession', async (_, sessionId: string) => {
    try {
      await mcpBrowserService.closeSession(sessionId);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Get stats
  ipcMain.handle('mcpBrowser:stats', () => {
    return {
      connected: mcpBrowserService.isMCPConnected(),
      activeSessions: mcpBrowserService.getActiveSessionCount(),
      activeBrowsers: mcpBrowserService.getActiveBrowserCount(),
    };
  });

  // Scroll page
  ipcMain.handle('mcpBrowser:scroll', async (_, pixels: number, sessionId?: string) => {
    try {
      await mcpBrowserService.scroll(pixels, sessionId);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Scroll to end of page
  ipcMain.handle('mcpBrowser:scrollToEnd', async (_, maxScrolls: number, sessionId?: string) => {
    try {
      await mcpBrowserService.scrollToEnd(sessionId, maxScrolls);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Evaluate JavaScript
  ipcMain.handle('mcpBrowser:evaluate', async (_, expression: string, sessionId?: string) => {
    try {
      const result = await mcpBrowserService.evaluate(expression, sessionId);
      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Wait for selector
  ipcMain.handle(
    'mcpBrowser:waitForSelector',
    async (_, selector: string, timeoutMs: number, sessionId?: string) => {
      try {
        const found = await mcpBrowserService.waitForSelector(selector, timeoutMs, sessionId);
        return { success: true, found };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );
};
