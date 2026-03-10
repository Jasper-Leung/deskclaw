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
});
