/**
 * Keychain Fallback Module
 *
 * Provides a fallback implementation when the native keytar module is not available.
 * This uses a secure file-based storage as a fallback.
 */

import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import crypto from 'crypto';

// Try to import keytar, use fallback if not available
let keytarModule: typeof import('keytar') | null = null;

try {
  keytarModule = require('keytar');
  console.log('[Keychain] Native keytar module loaded');
} catch (error) {
  console.log('[Keychain] Native keytar not available, using fallback');
}

// ============================================================================
// FALLBACK IMPLEMENTATION
// ============================================================================

class KeychainFallback {
  private dbPath: string;
  private data: Map<string, Map<string, string>> = new Map();
  private loaded = false;
  private masterKey: Buffer | null = null;

  constructor() {
    const userDataPath = app.getPath('userData');
    const keysDir = path.join(userDataPath, 'keys');

    if (!fs.existsSync(keysDir)) {
      fs.mkdirSync(keysDir, { recursive: true });
    }

    this.dbPath = path.join(keysDir, 'keychain-fallback.json');
    this.initializeMasterKey();
  }

  /**
   * Initialize or load master key for encryption
   */
  private initializeMasterKey(): void {
    const userDataPath = app.getPath('userData');
    const masterKeyPath = path.join(userDataPath, '.keychain-master-key');

    if (fs.existsSync(masterKeyPath)) {
      try {
        const keyData = fs.readFileSync(masterKeyPath);
        this.masterKey = keyData;
        if (this.masterKey.length !== 32) {
          throw new Error('Invalid key length');
        }
      } catch {
        this.masterKey = crypto.randomBytes(32);
        fs.writeFileSync(masterKeyPath, this.masterKey, { mode: 0o600 });
      }
    } else {
      this.masterKey = crypto.randomBytes(32);
      fs.writeFileSync(masterKeyPath, this.masterKey, { mode: 0o600 });
    }
  }

  /**
   * Encrypt a value
   */
  private encrypt(value: string): string {
    if (!this.masterKey) {
      throw new Error('Master key not initialized');
    }

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey, iv);

    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt a value
   */
  private decrypt(value: string): string {
    if (!this.masterKey) {
      throw new Error('Master key not initialized');
    }

    const parts = value.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encryptedData = parts[2];

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.masterKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Load data from disk
   */
  private load(): void {
    if (this.loaded) return;

    try {
      if (fs.existsSync(this.dbPath)) {
        const rawData = fs.readFileSync(this.dbPath, 'utf8');
        const parsed = JSON.parse(rawData);

        for (const [service, accounts] of Object.entries(parsed)) {
          const serviceMap = new Map<string, string>();
          for (const [account, value] of Object.entries(accounts as Record<string, string>)) {
            try {
              const decrypted = this.decrypt(value);
              serviceMap.set(account, decrypted);
            } catch {
              // Skip invalid entries
            }
          }
          this.data.set(service, serviceMap);
        }
      }
    } catch (error) {
      console.error('[KeychainFallback] Failed to load data:', error);
    }

    this.loaded = true;
  }

  /**
   * Save data to disk
   */
  private save(): void {
    try {
      const obj: Record<string, Record<string, string>> = {};

      for (const [service, accounts] of this.data.entries()) {
        obj[service] = {};
        for (const [account, value] of accounts.entries()) {
          obj[service][account] = this.encrypt(value);
        }
      }

      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.dbPath, JSON.stringify(obj, null, 2), {
        mode: 0o600,
      });
    } catch (error) {
      console.error('[KeychainFallback] Failed to save data:', error);
      throw error;
    }
  }

  /**
   * Get a password
   */
  async getPassword(service: string, account: string): Promise<string | null> {
    this.load();

    const serviceMap = this.data.get(service);
    if (!serviceMap) return null;

    return serviceMap.get(account) || null;
  }

  /**
   * Set a password
   */
  async setPassword(service: string, account: string, password: string): Promise<void> {
    this.load();

    let serviceMap = this.data.get(service);
    if (!serviceMap) {
      serviceMap = new Map();
      this.data.set(service, serviceMap);
    }

    serviceMap.set(account, password);
    this.save();
  }

  /**
   * Delete a password
   */
  async deletePassword(service: string, account: string): Promise<boolean> {
    this.load();

    const serviceMap = this.data.get(service);
    if (!serviceMap) return false;

    const result = serviceMap.delete(account);
    if (serviceMap.size === 0) {
      this.data.delete(service);
    }

    if (result) {
      this.save();
    }

    return result;
  }

  /**
   * Find all passwords for a service
   */
  async findCredentials(service: string): Promise<Array<{ account: string; password: string }>> {
    this.load();

    const serviceMap = this.data.get(service);
    if (!serviceMap) return [];

    const results: Array<{ account: string; password: string }> = [];
    for (const [account, password] of serviceMap.entries()) {
      results.push({ account, password });
    }

    return results;
  }

  /**
   * Find all accounts for a service (by prefix)
   */
  async findAccounts(servicePrefix: string): Promise<string[]> {
    this.load();

    const results: string[] = [];
    for (const service of this.data.keys()) {
      if (service.startsWith(servicePrefix)) {
        const serviceMap = this.data.get(service);
        if (serviceMap) {
          for (const account of serviceMap.keys()) {
            results.push(account);
          }
        }
      }
    }

    return results;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

// Use native keytar if available, otherwise use fallback
const fallback = new KeychainFallback();

export const keytar = keytarModule || {
  getPassword: (service: string, account: string) => fallback.getPassword(service, account),
  setPassword: (service: string, account: string, password: string) =>
    fallback.setPassword(service, account, password),
  deletePassword: (service: string, account: string) => fallback.deletePassword(service, account),
  findCredentials: (service: string) => fallback.findCredentials(service),
};

// Export for testing
export { KeychainFallback };
