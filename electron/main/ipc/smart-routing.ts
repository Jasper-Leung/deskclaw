/**
 * Smart Routing IPC Handlers
 *
 * Manages smart model routing configuration and testing.
 */

import Database from 'better-sqlite3';
import {
  analyzeAndRoute,
  getDefaultSmartRoutingConfig,
  type SmartRoutingConfig,
  type RoutingDecision,
} from '../lib/smart-routing.js';
import { ipcMain } from 'electron';
import { getDatabase } from '../db/index.js';

const SETTINGS_KEY = 'smartRoutingConfig';

function getConfig(db: Database.Database): SmartRoutingConfig {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(SETTINGS_KEY) as any;
  if (!row) return getDefaultSmartRoutingConfig();
  try {
    return { ...getDefaultSmartRoutingConfig(), ...JSON.parse(row.value) };
  } catch {
    return getDefaultSmartRoutingConfig();
  }
}

function saveConfig(db: Database.Database, config: SmartRoutingConfig): void {
  const now = Date.now();
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?`
  ).run(SETTINGS_KEY, JSON.stringify(config), now, JSON.stringify(config), now);
}

export const smartRoutingGetConfig = (db: Database.Database): SmartRoutingConfig => {
  return getConfig(db);
};

export const smartRoutingUpdateConfig = (
  db: Database.Database,
  updates: Partial<SmartRoutingConfig>
): SmartRoutingConfig => {
  const current = getConfig(db);
  const updated = { ...current, ...updates };
  saveConfig(db, updated);
  return updated;
};

export const smartRoutingTestRoute = (
  db: Database.Database,
  message: string,
  defaultModelId: string
): RoutingDecision => {
  const config = getConfig(db);
  return analyzeAndRoute(message, config, defaultModelId);
};

export function registerSmartRoutingHandlers(): void {
  const db = getDatabase();

  ipcMain.handle('smartRouting:getConfig', () => smartRoutingGetConfig(db));
  ipcMain.handle('smartRouting:updateConfig', (_, updates) =>
    smartRoutingUpdateConfig(db, updates)
  );
  ipcMain.handle('smartRouting:testRoute', (_, message, defaultModelId) =>
    smartRoutingTestRoute(db, message, defaultModelId)
  );
}
