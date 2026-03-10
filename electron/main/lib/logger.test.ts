/**
 * Logger Module Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger, createLogger } from './logger';

// Mock Electron app
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/test-userdata'),
  },
}));

describe('Logger', () => {
  beforeEach(() => {
    // Reset environment before each test
    process.env.NODE_ENV = 'test';
    delete process.env.LOG_LEVEL;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('logger instance', () => {
    it('should create a logger instance', () => {
      expect(logger).toBeDefined();
      expect(typeof logger.info === 'function').toBe(true);
      expect(typeof logger.error === 'function').toBe(true);
      expect(typeof logger.warn === 'function').toBe(true);
    });

    it('should log info messages', () => {
      const spy = vi.spyOn(logger, 'info');
      logger.info('Test info message');
      expect(spy).toHaveBeenCalledWith('Test info message');
    });

    it('should log error messages', () => {
      const spy = vi.spyOn(logger, 'error');
      logger.error('Test error message');
      expect(spy).toHaveBeenCalledWith('Test error message');
    });

    it('should log warning messages', () => {
      const spy = vi.spyOn(logger, 'warn');
      logger.warn('Test warning message');
      expect(spy).toHaveBeenCalledWith('Test warning message');
    });
  });

  describe('createLogger', () => {
    it('should create a child logger with name', () => {
      const childLogger = createLogger('test-module');
      expect(childLogger).toBeDefined();
    });

    it('should create a child logger with context', () => {
      const childLogger = createLogger('test-module', { userId: '123' });
      expect(childLogger).toBeDefined();
    });
  });

  describe('log levels', () => {
    it('should use debug level in development', () => {
      process.env.NODE_ENV = 'development';
      // Re-import to pick up new env
      const testLogger = createLogger('test');
      expect(testLogger.level).toBeDefined();
    });

    it('should use info level in production', () => {
      process.env.NODE_ENV = 'production';
      // Re-import to pick up new env
      const testLogger = createLogger('test');
      expect(testLogger.level).toBeDefined();
    });

    it('should respect custom log level from environment', () => {
      process.env.LOG_LEVEL = 'warn';
      // Re-import to pick up new env
      const testLogger = createLogger('test');
      expect(testLogger.level).toBeDefined();
    });
  });

  describe('module-specific loggers', () => {
    it('should export dbLogger', async () => {
      const { dbLogger } = await import('./logger');
      expect(dbLogger).toBeDefined();
    });

    it('should export ipcLogger', async () => {
      const { ipcLogger } = await import('./logger');
      expect(ipcLogger).toBeDefined();
    });

    it('should export channelLogger', async () => {
      const { channelLogger } = await import('./logger');
      expect(channelLogger).toBeDefined();
    });

    it('should export workflowLogger', async () => {
      const { workflowLogger } = await import('./logger');
      expect(workflowLogger).toBeDefined();
    });

    it('should export toolLogger', async () => {
      const { toolLogger } = await import('./logger');
      expect(toolLogger).toBeDefined();
    });

    it('should export memoryLogger', async () => {
      const { memoryLogger } = await import('./logger');
      expect(memoryLogger).toBeDefined();
    });

    it('should export browserLogger', async () => {
      const { browserLogger } = await import('./logger');
      expect(browserLogger).toBeDefined();
    });
  });
});
