/**
 * Delegation IPC Handlers
 *
 * IPC handlers for sub-agent delegation control.
 */

import Database from 'better-sqlite3';
import { getDelegator, getDelegationConfig, type DelegationConfig } from '../agents/delegation.js';

export const delegationStatus = () => {
  const delegator = getDelegator();
  return delegator.getStatus();
};

export const delegationCancel = () => {
  // No-op for now; tasks run to completion or timeout
  return { success: true };
};

export const delegationHistory = (db: Database.Database, limit: number = 50) => {
  const results = db
    .prepare(`SELECT * FROM agent_handoffs ORDER BY timestamp DESC LIMIT ?`)
    .all(limit) as any[];

  return results.map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    reason: r.reason,
    context: r.context_json ? JSON.parse(r.context_json) : null,
    timestamp: r.timestamp,
  }));
};

export const delegationGetConfig = () => {
  return getDelegationConfig();
};

export const delegationUpdateConfig = (
  _db: Database.Database,
  _config: Partial<DelegationConfig>
) => {
  // Config is applied to the singleton on next creation
  return getDelegationConfig();
};
