/**
 * Database Encryption Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { encrypt, decrypt } from './index.js';
import crypto from 'crypto';

// Mock fs
const mockKey = crypto.randomBytes(32);
vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => mockKey),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

// Mock Electron app - mock must be defined inline for vi.mock hoisting
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/test-userdata'),
  },
}));

describe('Database Encryption', () => {
  const originalEncryptionKey = process.env.DESKCLAW_ENCRYPTION_KEY;

  beforeEach(() => {
    // Set a test encryption key
    process.env.DESKCLAW_ENCRYPTION_KEY = mockKey.toString('hex');
  });

  afterEach(() => {
    // Restore original encryption key
    if (originalEncryptionKey) {
      process.env.DESKCLAW_ENCRYPTION_KEY = originalEncryptionKey;
    } else {
      delete process.env.DESKCLAW_ENCRYPTION_KEY;
    }
  });

  describe('encrypt', () => {
    it('should encrypt a string', () => {
      const plaintext = 'This is a secret API key';
      const encrypted = encrypt(plaintext);

      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('string');
      expect(encrypted).not.toBe(plaintext);
      expect(encrypted).toContain(':'); // Should contain IV:authTag:encrypted parts
    });

    it('should produce different encrypted values for the same input', () => {
      const plaintext = 'Same input';
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2); // Due to random IV
    });

    it('should handle empty strings', () => {
      const encrypted = encrypt('');
      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('string');
    });

    it('should handle special characters', () => {
      const plaintext = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      const encrypted = encrypt(plaintext);
      expect(encrypted).toBeDefined();
    });
  });

  describe('decrypt', () => {
    it('should decrypt an encrypted string', () => {
      const plaintext = 'This is a secret API key';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle empty strings', () => {
      const encrypted = encrypt('');
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe('');
    });

    it('should handle special characters', () => {
      const plaintext = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('encrypt-decrypt cycle', () => {
    it('should maintain data integrity through encryption and decryption', () => {
      const testData = [
        'Simple string',
        'With numbers 123456',
        'With special chars !@#$%',
        'With unicode 你好世界 🌍',
        'Very long string'.repeat(100),
      ];

      for (const data of testData) {
        const encrypted = encrypt(data);
        const decrypted = decrypt(encrypted);
        expect(decrypted).toBe(data);
      }
    });
  });

  describe('error handling', () => {
    it('should throw error for invalid encrypted data format', () => {
      const invalidData = 'invalid:format';
      expect(() => decrypt(invalidData)).toThrow();
    });

    it('should throw error for malformed encrypted data', () => {
      const malformedData = 'a:b:c:d'; // Too many parts
      expect(() => decrypt(malformedData)).toThrow();
    });

    it('should throw error for corrupted data', () => {
      const plaintext = 'Test data';
      const encrypted = encrypt(plaintext);
      const corrupted = encrypted.replace(/./g, '0'); // Corrupt all characters
      expect(() => decrypt(corrupted)).toThrow();
    });
  });
});
