/**
 * Credential Pool - Multi-Key Failover System
 *
 * Manages multiple API credentials per provider with selection strategies,
 * automatic failover, and cooldown management.
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { encrypt, decrypt } from '../db/index.js';
import { createLogger } from '../lib/logger.js';

const poolLogger = createLogger('credential-pool');

export type SelectionStrategy = 'fill-first' | 'round-robin' | 'random' | 'least-used';
export type CredentialStatus = 'active' | 'cooldown' | 'disabled' | 'error';

export interface ProviderCredential {
  id: string;
  providerId: string;
  label: string;
  apiKeyEncrypted: string;
  priority: number;
  status: CredentialStatus;
  lastError: string | null;
  lastErrorAt: number | null;
  requestCount: number;
  cooldownUntil: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface CredentialPoolConfig {
  strategy: SelectionStrategy;
  autoResetCooldownMs: number;
}

const DEFAULT_POOL_CONFIG: CredentialPoolConfig = {
  strategy: 'fill-first',
  autoResetCooldownMs: 3600000, // 1 hour
};

// Track round-robin index per provider
const rrIndex = new Map<string, number>();

/**
 * Get pool config from settings
 */
export function getPoolConfig(db: Database.Database): CredentialPoolConfig {
  try {
    const row = db
      .prepare("SELECT value FROM settings WHERE key = 'credentialPoolConfig'")
      .get() as any;
    if (!row) return { ...DEFAULT_POOL_CONFIG };
    return { ...DEFAULT_POOL_CONFIG, ...JSON.parse(row.value) };
  } catch {
    return { ...DEFAULT_POOL_CONFIG };
  }
}

/**
 * Save pool config
 */
export function savePoolConfig(db: Database.Database, config: Partial<CredentialPoolConfig>): void {
  const current = getPoolConfig(db);
  const updated = { ...current, ...config };
  const now = Date.now();
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES ('credentialPoolConfig', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?`
  ).run(JSON.stringify(updated), now, JSON.stringify(updated), now);
}

/**
 * Select a credential from the pool using the configured strategy
 */
export function selectCredential(
  db: Database.Database,
  providerId: string
): ProviderCredential | null {
  const config = getPoolConfig(db);
  const now = Date.now();

  // Reset expired cooldowns
  resetExpiredCooldowns(db, now);

  // Get active credentials for this provider, ordered by priority
  const credentials = db
    .prepare(
      `SELECT * FROM provider_credentials
       WHERE provider_id = ? AND status = 'active'
       ORDER BY priority ASC`
    )
    .all(providerId) as ProviderCredential[];

  if (credentials.length === 0) {
    return null;
  }

  switch (config.strategy) {
    case 'fill-first':
      return credentials[0]; // Use highest priority

    case 'round-robin': {
      const idx = (rrIndex.get(providerId) || 0) % credentials.length;
      rrIndex.set(providerId, idx + 1);
      return credentials[idx];
    }

    case 'random': {
      const randomIdx = Math.floor(Math.random() * credentials.length);
      return credentials[randomIdx];
    }

    case 'least-used': {
      return credentials.reduce((min, c) => (c.requestCount < min.requestCount ? c : min));
    }

    default:
      return credentials[0];
  }
}

/**
 * Report successful use of a credential
 */
export function reportSuccess(db: Database.Database, credentialId: string): void {
  db.prepare(
    `UPDATE provider_credentials
     SET request_count = request_count + 1, updated_at = ?
     WHERE id = ?`
  ).run(Date.now(), credentialId);
}

/**
 * Report an error with a credential
 */
export function reportError(
  db: Database.Database,
  credentialId: string,
  error: { statusCode?: number; message: string }
): void {
  const now = Date.now();
  let cooldownMs = 3600000; // Default: 1 hour

  if (error.statusCode === 429) {
    cooldownMs = 3600000; // Rate limited: 1 hour
  } else if (error.statusCode === 402 || (error.statusCode && error.statusCode >= 500)) {
    cooldownMs = 86400000; // Payment issue or server error: 24 hours
  }

  const status: CredentialStatus = 'cooldown';

  db.prepare(
    `UPDATE provider_credentials
     SET status = ?, last_error = ?, last_error_at = ?, cooldown_until = ?, updated_at = ?
     WHERE id = ?`
  ).run(status, error.message, now, now + cooldownMs, now, credentialId);

  poolLogger.warn(
    `Credential ${credentialId} set to cooldown: ${error.message} (cooldown: ${cooldownMs}ms)`
  );
}

/**
 * Reset expired cooldowns back to active
 */
function resetExpiredCooldowns(db: Database.Database, now: number): void {
  db.prepare(
    `UPDATE provider_credentials
     SET status = 'active', cooldown_until = NULL, updated_at = ?
     WHERE status = 'cooldown' AND cooldown_until IS NOT NULL AND cooldown_until <= ?`
  ).run(now, now);
}

/**
 * Add a new credential to the pool
 */
export function addCredential(
  db: Database.Database,
  data: {
    providerId: string;
    label: string;
    apiKey: string;
    priority?: number;
  }
): ProviderCredential {
  const id = randomUUID();
  const now = Date.now();

  db.prepare(
    `INSERT INTO provider_credentials (id, provider_id, label, api_key_encrypted, priority, status, request_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'active', 0, ?, ?)`
  ).run(id, data.providerId, data.label, encrypt(data.apiKey), data.priority || 0, now, now);

  return {
    id,
    providerId: data.providerId,
    label: data.label,
    apiKeyEncrypted: encrypt(data.apiKey),
    priority: data.priority || 0,
    status: 'active',
    lastError: null,
    lastErrorAt: null,
    requestCount: 0,
    cooldownUntil: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Remove a credential from the pool
 */
export function removeCredential(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM provider_credentials WHERE id = ?').run(id);
}

/**
 * Update a credential
 */
export function updateCredential(
  db: Database.Database,
  id: string,
  updates: { label?: string; apiKey?: string; priority?: number; status?: CredentialStatus }
): void {
  const now = Date.now();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (updates.label !== undefined) {
    sets.push('label = ?');
    values.push(updates.label);
  }
  if (updates.apiKey !== undefined) {
    sets.push('api_key_encrypted = ?');
    values.push(encrypt(updates.apiKey));
  }
  if (updates.priority !== undefined) {
    sets.push('priority = ?');
    values.push(updates.priority);
  }
  if (updates.status !== undefined) {
    sets.push('status = ?');
    values.push(updates.status);
    if (updates.status === 'active') {
      sets.push('cooldown_until = NULL');
    }
  }

  if (sets.length === 0) return;

  sets.push('updated_at = ?');
  values.push(now);
  values.push(id);

  db.prepare(`UPDATE provider_credentials SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

/**
 * List credentials for a provider
 */
export function listCredentials(db: Database.Database, providerId: string): ProviderCredential[] {
  return db
    .prepare('SELECT * FROM provider_credentials WHERE provider_id = ? ORDER BY priority ASC')
    .all(providerId) as ProviderCredential[];
}

/**
 * Get a specific credential
 */
export function getCredential(db: Database.Database, id: string): ProviderCredential | null {
  return db
    .prepare('SELECT * FROM provider_credentials WHERE id = ?')
    .get(id) as ProviderCredential | null;
}

/**
 * Reset a credential back to active status
 */
export function resetCredential(db: Database.Database, id: string): void {
  const now = Date.now();
  db.prepare(
    `UPDATE provider_credentials
     SET status = 'active', cooldown_until = NULL, last_error = NULL, last_error_at = NULL, updated_at = ?
     WHERE id = ?`
  ).run(now, id);
}

/**
 * Get decrypted API key for a credential
 */
export function getCredentialApiKey(credential: ProviderCredential): string {
  return decrypt(credential.apiKeyEncrypted);
}

/**
 * Get stats for all credentials of a provider
 */
export function getCredentialStats(db: Database.Database, providerId: string) {
  const credentials = listCredentials(db, providerId);
  return {
    total: credentials.length,
    active: credentials.filter((c) => c.status === 'active').length,
    cooldown: credentials.filter((c) => c.status === 'cooldown').length,
    disabled: credentials.filter((c) => c.status === 'disabled').length,
    error: credentials.filter((c) => c.status === 'error').length,
    totalRequests: credentials.reduce((sum, c) => sum + c.requestCount, 0),
  };
}
