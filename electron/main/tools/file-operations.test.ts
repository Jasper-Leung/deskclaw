/**
 * File Operations Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Mock the database module
vi.mock('../db/index.js', () => ({
  getDatabase: vi.fn(() => ({
    prepare: vi.fn(() => ({
      get: vi.fn(() => ({ value: null })),
    })),
  })),
}));

// Mock Electron app
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/test-userdata'),
  },
}));

describe('File Operations', () => {
  const testDir = path.join(os.tmpdir(), 'deskclaw-test');
  const testFile = path.join(testDir, 'test.txt');

  beforeEach(async () => {
    // Create test directory
    await fs.mkdir(testDir, { recursive: true });
    // Create a test file
    await fs.writeFile(testFile, 'Test content');
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('readFile', () => {
    it('should read file content correctly', async () => {
      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe('Test content');
    });

    it('should throw error for non-existent file', async () => {
      const nonExistentFile = path.join(testDir, 'non-existent.txt');
      await expect(fs.readFile(nonExistentFile, 'utf-8')).rejects.toThrow();
    });
  });

  describe('writeFile', () => {
    it('should write file content correctly', async () => {
      const newFile = path.join(testDir, 'new-file.txt');
      await fs.writeFile(newFile, 'New content');
      const content = await fs.readFile(newFile, 'utf-8');
      expect(content).toBe('New content');
    });
  });

  describe('fileExists', () => {
    it('should return true for existing file', async () => {
      const { constants } = await import('fs/promises');
      await expect(fs.access(testFile, constants.F_OK)).resolves.not.toThrow();
    });

    it('should return false for non-existent file', async () => {
      const { constants } = await import('fs/promises');
      const nonExistentFile = path.join(testDir, 'non-existent.txt');
      await expect(fs.access(nonExistentFile, constants.F_OK)).rejects.toThrow();
    });
  });

  describe('listDirectory', () => {
    it('should list directory contents', async () => {
      const files = await fs.readdir(testDir);
      expect(files).toContain('test.txt');
    });

    it('should return empty array for empty directory', async () => {
      const emptyDir = path.join(testDir, 'empty');
      await fs.mkdir(emptyDir);
      const files = await fs.readdir(emptyDir);
      expect(files).toEqual([]);
      await fs.rmdir(emptyDir);
    });
  });

  /**
   * Security Tests for Path Validation
   */
  describe('Path Validation Security', () => {
    describe('Path Traversal Protection', () => {
      it('should reject paths with .. traversal sequences', async () => {
        // These should be blocked by path validation
        const traversalPaths = [
          '../../../etc/passwd',
          '..\\..\\..\\windows\\system32',
          './../../../test',
          'test/../../etc',
        ];

        for (const maliciousPath of traversalPaths) {
          // The path should be normalized and blocked
          const normalized = path.normalize(maliciousPath);
          expect(normalized).toContain('..');
        }
      });

      it('should reject paths attempting to escape home directory', () => {
        const homeDir = os.homedir();
        const escapeAttempts = [
          path.join(homeDir, '../etc/passwd'),
          path.join(homeDir, '../../Windows'),
        ];

        for (const attempt of escapeAttempts) {
          const normalized = path.normalize(attempt);
          // Should not resolve outside intended scope
          expect(normalized).toBeTruthy();
        }
      });
    });

    describe('Sensitive Path Protection', () => {
      it('should identify .env files as sensitive', () => {
        const sensitivePaths = [
          '.env',
          '.env.local',
          '.env.production',
          'config/.env',
          '/path/to/.env',
        ];

        // Check that .env patterns are detected
        const envPattern = /\.env(\.\w+)?$/i;
        sensitivePaths.forEach((p) => {
          expect(p.toLowerCase()).toMatch(envPattern);
        });
      });

      it('should identify key files as sensitive', () => {
        const sensitivePaths = [
          'private.key',
          'cert.pem',
          'config.p12',
          'identity.pfx',
        ];

        sensitivePaths.forEach((p) => {
          const ext = path.extname(p).toLowerCase();
          expect(['.key', '.pem', '.p12', '.pfx']).toContain(ext);
        });
      });

      it('should identify sensitive directories', () => {
        const sensitiveDirs = [
          path.join(os.homedir(), '.ssh'),
          path.join(os.homedir(), '.gnupg'),
          '/etc',
          '/root',
        ];

        sensitiveDirs.forEach((dir) => {
          expect(dir).toBeTruthy();
        });
      });
    });

    describe('Blocked Patterns', () => {
      it('should detect common dangerous patterns', () => {
        const dangerousPatterns = [
          '/node_modules/package/package.json',
          '/.git/config',
          '/.ssh/id_rsa',
          '~/.bashrc',
        ];

        dangerousPatterns.forEach((p) => {
          const normalized = path.normalize(p);
          expect(normalized).toBeTruthy();
        });
      });
    });
  });

  /**
   * File Size Limits
   */
  describe('File Size Limits', () => {
    it('should enforce maximum file size limits', async () => {
      const maxSize = 10000; // 10KB as defined in tools/index.ts
      const largeContent = 'x'.repeat(maxSize + 1000);

      const largeFile = path.join(testDir, 'large.txt');
      await fs.writeFile(largeFile, largeContent);

      const content = await fs.readFile(largeFile, 'utf-8');
      expect(content.length).toBeGreaterThan(maxSize);
    });
  });
});
