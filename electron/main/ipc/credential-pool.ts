/**
 * Credential Pool IPC Handlers
 *
 * IPC handlers for managing the multi-key failover pool.
 */

import Database from 'better-sqlite3';
import {
  listCredentials,
  addCredential,
  removeCredential,
  updateCredential,
  getCredential,
  getCredentialStats,
  resetCredential,
  getPoolConfig,
  savePoolConfig,
  type CredentialPoolConfig,
  type CredentialStatus,
} from '../keys/credential-pool.js';

export const credentialsList = (db: Database.Database, providerId: string) => {
  return listCredentials(db, providerId);
};

export const credentialsAdd = (
  db: Database.Database,
  data: { providerId: string; label: string; apiKey: string; priority?: number }
) => {
  return addCredential(db, data);
};

export const credentialsRemove = (db: Database.Database, id: string) => {
  removeCredential(db, id);
  return { success: true };
};

export const credentialsUpdate = (
  db: Database.Database,
  id: string,
  updates: { label?: string; apiKey?: string; priority?: number; status?: CredentialStatus }
) => {
  updateCredential(db, id, updates);
  return getCredential(db, id);
};

export const credentialsStatus = (db: Database.Database, providerId: string) => {
  return getCredentialStats(db, providerId);
};

export const credentialsStats = (db: Database.Database) => {
  // Get all providers and their credential stats
  const providers = db.prepare('SELECT id FROM providers').all() as any[];
  const stats: Record<string, any> = {};
  for (const p of providers) {
    stats[p.id] = getCredentialStats(db, p.id);
  }
  return stats;
};

export const credentialsReset = (db: Database.Database, id: string) => {
  resetCredential(db, id);
  return getCredential(db, id);
};

export const credentialsTest = async (db: Database.Database, id: string) => {
  const credential = getCredential(db, id);
  if (!credential) {
    throw new Error('Credential not found');
  }
  // Return credential info without the encrypted key
  return {
    id: credential.id,
    label: credential.label,
    status: credential.status,
    priority: credential.priority,
    requestCount: credential.requestCount,
  };
};

export const credentialsGetConfig = (db: Database.Database) => {
  return getPoolConfig(db);
};

export const credentialsUpdateConfig = (
  db: Database.Database,
  config: Partial<CredentialPoolConfig>
) => {
  savePoolConfig(db, config);
  return getPoolConfig(db);
};
