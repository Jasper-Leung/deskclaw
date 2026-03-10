/**
 * Extension Bridge IPC Handlers
 *
 * Handles IPC communication for the browser extension bridge
 */

import { ipcMain } from 'electron';
import { extensionBridgeService } from '../browser/extension-bridge.js';

/**
 * Register all extension bridge IPC handlers
 */
export const registerExtensionBridgeHandlers = (): void => {
  // Start the extension bridge WebSocket server
  ipcMain.handle('extensionBridge:start', async (_, port?: number) => {
    try {
      await extensionBridgeService.startServer(port);
      return { success: true, port: extensionBridgeService.getPort() };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Stop the extension bridge WebSocket server
  ipcMain.handle('extensionBridge:stop', async () => {
    try {
      await extensionBridgeService.stopServer();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Get extension bridge status
  ipcMain.handle('extensionBridge:status', () => {
    return {
      running: extensionBridgeService.isRunning(),
      port: extensionBridgeService.getPort(),
      extensions: extensionBridgeService.getExtensionCount(),
    };
  });

  // Send command to connected extension
  ipcMain.handle(
    'extensionBridge:send',
    async (
      _,
      message: {
        type: 'ping' | 'navigate' | 'click' | 'type' | 'snapshot' | 'evaluate' | 'screenshot';
        data?: Record<string, unknown>;
      }
    ) => {
      try {
        extensionBridgeService.broadcast(message);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  // Navigate to URL in connected extension
  ipcMain.handle('extensionBridge:navigate', async (_, url: string) => {
    try {
      extensionBridgeService.broadcast({
        type: 'navigate',
        data: { url },
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Get page snapshot from connected extension
  ipcMain.handle('extensionBridge:snapshot', async () => {
    // This is a one-way request, the extension will send the response asynchronously
    extensionBridgeService.broadcast({
      type: 'snapshot',
    });
    return { success: true };
  });

  // Click element in connected extension
  ipcMain.handle('extensionBridge:click', async (_, selector: string) => {
    try {
      extensionBridgeService.broadcast({
        type: 'click',
        data: { selector },
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Type text in connected extension
  ipcMain.handle('extensionBridge:type', async (_, selector: string, text: string) => {
    try {
      extensionBridgeService.broadcast({
        type: 'type',
        data: { selector, text },
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Evaluate JavaScript in connected extension
  ipcMain.handle('extensionBridge:evaluate', async (_, script: string) => {
    try {
      extensionBridgeService.broadcast({
        type: 'evaluate',
        data: { script },
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Take screenshot in connected extension
  ipcMain.handle('extensionBridge:screenshot', async () => {
    try {
      extensionBridgeService.broadcast({
        type: 'screenshot',
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
};
