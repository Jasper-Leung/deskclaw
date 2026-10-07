/**
 * API Server IPC Handlers
 *
 * IPC handlers for controlling the OpenAI-compatible API server.
 */

import Database from 'better-sqlite3';
import {
  startApiServer,
  stopApiServer,
  getApiServerStatus,
  updateApiServerConfig,
} from '../gateway/api-server.js';
import type { ApiServerConfig } from '../gateway/api-server.js';

export const apiServerStart = (_db: Database.Database, config?: Partial<ApiServerConfig>) => {
  startApiServer(config);
  return getApiServerStatus();
};

export const apiServerStop = () => {
  stopApiServer();
  return getApiServerStatus();
};

export const apiServerStatus = () => {
  return getApiServerStatus();
};

export const apiServerUpdateConfig = (_db: Database.Database, config: Partial<ApiServerConfig>) => {
  updateApiServerConfig(config);
  return getApiServerStatus();
};
