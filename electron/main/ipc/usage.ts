/**
 * Usage Tracking IPC Handlers
 *
 * Provides usage statistics and cost tracking to the renderer.
 */

import Database from 'better-sqlite3';
import { getUsageStats, getSessionUsage } from '../lib/usage-tracker.js';

export const usageGetStats = (
  db: Database.Database,
  options?: { since?: number; until?: number; sessionId?: string }
) => {
  return getUsageStats(db, options);
};

export const usageGetSession = (db: Database.Database, sessionId: string) => {
  return getSessionUsage(db, sessionId);
};
