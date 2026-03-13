/**
 * Secure Key Storage System
 *
 * Provides secure storage for API keys using system keychain where available.
 * Supports isolated storage for community-specific keys.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { keytar } from './keychain-fallback.js';

// ============================================================================
// TYPES
// ============================================================================

export interface CommunityKey {
  id: string;
  communityId: string; // e.g., 'moltbook', 'github-community'
  communityName: string; // Display name
  keyType: 'api_key' | 'token' | 'oauth' | 'custom';
  providerProtocol: 'openai' | 'anthropic' | 'ollama' | 'custom';
  apiKeyEncrypted: string; // Encrypted API key
  baseUrl?: string; // Optional base URL for custom providers
  heartbeatUrl?: string; // URL for heartbeat/refresh endpoint
  lastHeartbeat?: number; // Last successful heartbeat timestamp
  heartbeatInterval?: number; // Heartbeat interval in seconds (default 3600)
  metadata?: string; // Additional metadata as JSON
  isActive: boolean; // Whether this key is active
  createdAt: number;
  updatedAt: number;
  expiresAt?: number; // Optional expiration time
}

export interface KeyStorageStats {
  totalKeys: number;
  activeKeys: number;
  expiredKeys: number;
  keysByCommunity: Record<string, number>;
}

// ============================================================================
// SECURE KEY STORAGE CLASS
// ============================================================================

class SecureKeyStorage {
  private masterKey: Buffer | null = null;
  private readonly keyServiceName = 'deskclaw-secure-storage';
  private readonly masterKeyAccount = 'master-encryption-key';
  private initialized = false;

  /**
   * Initialize the secure key storage
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Try to get master key from system keychain
      const storedKey = await keytar.getPassword(this.keyServiceName, this.masterKeyAccount);

      if (storedKey) {
        // Key exists in keychain, use it
        this.masterKey = Buffer.from(storedKey, 'hex');
      } else {
        // Generate new master key and store in keychain
        this.masterKey = crypto.randomBytes(32);
        await keytar.setPassword(
          this.keyServiceName,
          this.masterKeyAccount,
          this.masterKey.toString('hex')
        );
      }

      this.initialized = true;
      console.log('[SecureKeyStorage] Initialized with system keychain');
    } catch (error) {
      // Fallback to file-based storage (less secure)
      console.warn('[SecureKeyStorage] Keychain not available, using fallback');
      this.initializeFallback();
    }
  }

  /**
   * Fallback initialization for when keychain is not available
   */
  private initializeFallback(): void {
    const userDataPath = app.getPath('userData');
    const keyPath = path.join(userDataPath, '.secure-master-key');

    if (fs.existsSync(keyPath)) {
      const key = fs.readFileSync(keyPath);
      if (key.length === 32) {
        this.masterKey = key;
      } else {
        // Regenerate if invalid
        this.masterKey = crypto.randomBytes(32);
        fs.writeFileSync(keyPath, this.masterKey, { mode: 0o600 });
      }
    } else {
      this.masterKey = crypto.randomBytes(32);
      fs.writeFileSync(keyPath, this.masterKey, { mode: 0o600 });
    }

    this.initialized = true;
  }

  /**
   * Ensure storage is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
    if (!this.masterKey) {
      throw new Error('Secure key storage not initialized');
    }
  }

  /**
   * Encrypt a value using the master key
   */
  async encrypt(plaintext: string): Promise<string> {
    await this.ensureInitialized();

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey!, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt a value using the master key
   */
  async decrypt(ciphertext: string): Promise<string> {
    await this.ensureInitialized();

    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encryptedData = parts[2];

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.masterKey!, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Hash a value for comparison (one-way)
   */
  async hash(value: string): Promise<string> {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  /**
   * Check if a key matches the hash
   */
  async verifyHash(value: string, hash: string): Promise<boolean> {
    const valueHash = await this.hash(value);
    return valueHash === hash;
  }

  /**
   * Generate a unique ID
   */
  generateId(): string {
    return crypto.randomUUID();
  }

  /**
   * Get the current timestamp
   */
  now(): number {
    return Date.now();
  }

  /**
   * Check if a key is expired
   */
  isExpired(key: CommunityKey): boolean {
    if (!key.expiresAt) return false;
    return key.expiresAt < this.now();
  }

  /**
   * Check if a heartbeat is needed
   */
  needsHeartbeat(key: CommunityKey): boolean {
    if (!key.heartbeatInterval) return false;
    if (!key.lastHeartbeat) return true;
    return this.now() - key.lastHeartbeat > key.heartbeatInterval * 1000;
  }

  /**
   * Update heartbeat timestamp
   */
  updateHeartbeat(key: CommunityKey): CommunityKey {
    return {
      ...key,
      lastHeartbeat: this.now(),
    };
  }
}

// ============================================================================
// COMMUNITY KEYS DATABASE
// ============================================================================

class CommunityKeysDatabase {
  private dbPath: string;
  private keys: Map<string, CommunityKey> = new Map();
  private loaded = false;

  constructor() {
    const userDataPath = app.getPath('userData');
    const dataDir = path.join(userDataPath, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.dbPath = path.join(dataDir, 'community-keys.json');
  }

  /**
   * Load keys from disk
   */
  private load(): void {
    if (this.loaded) return;

    try {
      if (fs.existsSync(this.dbPath)) {
        const data = fs.readFileSync(this.dbPath, 'utf8');
        const keysArray = JSON.parse(data) as CommunityKey[];
        for (const key of keysArray) {
          this.keys.set(key.id, key);
        }
      }
    } catch (error) {
      console.error('[CommunityKeysDB] Failed to load keys:', error);
    }

    this.loaded = true;
  }

  /**
   * Save keys to disk
   */
  private save(): void {
    try {
      const keysArray = Array.from(this.keys.values());
      fs.writeFileSync(this.dbPath, JSON.stringify(keysArray, null, 2), {
        mode: 0o600,
      });
    } catch (error) {
      console.error('[CommunityKeysDB] Failed to save keys:', error);
      throw error;
    }
  }

  /**
   * Add a new community key
   */
  add(key: Omit<CommunityKey, 'id' | 'createdAt' | 'updatedAt'>): CommunityKey {
    this.load();

    const newKey: CommunityKey = {
      id: crypto.randomUUID(),
      ...key,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.keys.set(newKey.id, newKey);
    this.save();

    return newKey;
  }

  /**
   * Get a key by ID
   */
  get(id: string): CommunityKey | undefined {
    this.load();
    return this.keys.get(id);
  }

  /**
   * Get keys by community ID
   */
  getByCommunity(communityId: string): CommunityKey[] {
    this.load();
    return Array.from(this.keys.values()).filter(
      (k) => k.communityId === communityId && k.isActive && !this.isExpired(k)
    );
  }

  /**
   * Get active key for a community
   */
  getActiveKey(communityId: string): CommunityKey | undefined {
    const keys = this.getByCommunity(communityId);
    // Prefer keys that haven't expired
    return keys.find((k) => !this.isExpired(k)) || keys[0];
  }

  /**
   * Check if a key is expired
   */
  private isExpired(key: CommunityKey): boolean {
    if (!key.expiresAt) return false;
    return key.expiresAt < Date.now();
  }

  /**
   * Update a key
   */
  update(
    id: string,
    updates: Partial<Omit<CommunityKey, 'id' | 'createdAt'>>
  ): CommunityKey | undefined {
    this.load();

    const existing = this.keys.get(id);
    if (!existing) return undefined;

    const updated: CommunityKey = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    this.keys.set(id, updated);
    this.save();

    return updated;
  }

  /**
   * Delete a key
   */
  delete(id: string): boolean {
    this.load();

    const result = this.keys.delete(id);
    if (result) {
      this.save();
    }

    return result;
  }

  /**
   * List all keys
   */
  list(): CommunityKey[] {
    this.load();
    return Array.from(this.keys.values());
  }

  /**
   * Get statistics
   */
  getStats(): KeyStorageStats {
    this.load();

    const allKeys = Array.from(this.keys.values());
    const keysByCommunity: Record<string, number> = {};

    for (const key of allKeys) {
      keysByCommunity[key.communityId] = (keysByCommunity[key.communityId] || 0) + 1;
    }

    return {
      totalKeys: allKeys.length,
      activeKeys: allKeys.filter((k) => k.isActive && !this.isExpired(k)).length,
      expiredKeys: allKeys.filter((k) => this.isExpired(k)).length,
      keysByCommunity,
    };
  }

  /**
   * Find keys that need heartbeat
   */
  findKeysNeedingHeartbeat(): CommunityKey[] {
    this.load();

    const now = Date.now();
    return Array.from(this.keys.values()).filter((key) => {
      if (!key.isActive) return false;
      if (!key.heartbeatInterval) return false;
      if (!key.lastHeartbeat) return true;
      return now - key.lastHeartbeat > key.heartbeatInterval * 1000;
    });
  }
}

// ============================================================================
// SINGLETON EXPORTS
// ============================================================================

export const secureKeyStorage = new SecureKeyStorage();
export const communityKeysDB = new CommunityKeysDatabase();

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Decrypt a community API key
 */
export async function decryptCommunityKey(key: CommunityKey): Promise<string> {
  return await secureKeyStorage.decrypt(key.apiKeyEncrypted);
}

/**
 * Encrypt and store a community API key
 */
export async function encryptAndStoreCommunityKey(
  communityId: string,
  communityName: string,
  apiKey: string,
  options: {
    keyType?: CommunityKey['keyType'];
    providerProtocol?: CommunityKey['providerProtocol'];
    baseUrl?: string;
    heartbeatUrl?: string;
    heartbeatInterval?: number;
    expiresIn?: number; // Seconds until expiration
    metadata?: Record<string, unknown>;
  } = {}
): Promise<CommunityKey> {
  const apiKeyEncrypted = await secureKeyStorage.encrypt(apiKey);

  const expiresAt = options.expiresIn ? Date.now() + options.expiresIn * 1000 : undefined;

  return communityKeysDB.add({
    communityId,
    communityName,
    keyType: options.keyType || 'api_key',
    providerProtocol: options.providerProtocol || 'openai',
    apiKeyEncrypted,
    baseUrl: options.baseUrl,
    heartbeatUrl: options.heartbeatUrl,
    heartbeatInterval: options.heartbeatInterval || 3600,
    metadata: options.metadata ? JSON.stringify(options.metadata) : undefined,
    isActive: true,
    expiresAt,
  });
}

/**
 * Get an active API key for a community
 */
export async function getCommunityApiKey(
  communityId: string,
  providerProtocol: CommunityKey['providerProtocol'] = 'openai'
): Promise<{ apiKey: string; baseUrl?: string } | null> {
  const keys = communityKeysDB.getByCommunity(communityId);
  const key = keys.find((k) => k.providerProtocol === providerProtocol);

  if (!key) return null;

  const apiKey = await decryptCommunityKey(key);
  return {
    apiKey,
    baseUrl: key.baseUrl,
  };
}
