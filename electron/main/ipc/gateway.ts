/**
 * Gateway IPC Handlers
 *
 * Handles IPC communication for Gateway control from UI.
 */

import { ipcMain, BrowserWindow } from 'electron';
import type { GatewayConfig } from '../../../shared/types/gateway.js';
import { createGatewayServer, registerGatewayHandlers } from '../gateway/index.js';
import { getDatabase } from '../db/index.js';
import type { GatewayServer } from '../gateway/server.js';

let mainWindow: BrowserWindow | null = null;
let gateway: GatewayServer | undefined;

export const setGatewayMainWindow = (window: BrowserWindow | null): void => {
  mainWindow = window;
};

export const getGateway = (): GatewayServer | undefined => {
  return gateway;
};

export const registerGatewayIPCHandlers = (): void => {
  const db = getDatabase();

  ipcMain.handle('gateway:start', async (_, config?: GatewayConfig) => {
    if (gateway?.isRunning()) {
      return { success: true, message: 'Gateway already running' };
    }

    const gatewayConfig: GatewayConfig = config || {
      port: 18789,
      host: '127.0.0.1',
    };

    try {
      gateway = createGatewayServer(gatewayConfig);
      registerGatewayHandlers(gateway, db);
      await gateway.start();

      gateway.on('client:connect', (client) => {
        mainWindow?.webContents.send('gateway:client:connect', client);
      });

      gateway.on('client:disconnect', (client) => {
        mainWindow?.webContents.send('gateway:client:disconnect', client);
      });

      gateway.on('error', (error) => {
        console.error('[Gateway] Error:', error);
        mainWindow?.webContents.send('gateway:error', {
          message: error.message,
        });
      });

      return { success: true, port: gatewayConfig.port };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('gateway:stop', async () => {
    if (!gateway) {
      return { success: true, message: 'Gateway not running' };
    }

    try {
      await gateway.stop();
      gateway = undefined;
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('gateway:status', async () => {
    if (!gateway) {
      return {
        running: false,
        clients: [],
        port: 0,
      };
    }

    return {
      running: gateway.isRunning(),
      clients: gateway.getConnectedClients(),
    };
  });

  ipcMain.handle('gateway:broadcast', async (_, event: string, data: unknown) => {
    if (!gateway) {
      throw new Error('Gateway not running');
    }

    gateway.broadcast(event, data);
    return { success: true };
  });
};
