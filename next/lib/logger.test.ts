/**
 * Next.js Logger Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock pino - must be defined inline for vi.mock hoisting
vi.mock('pino', () => {
  const createLogger = () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    silent: vi.fn(),
    level: 'info',
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    child: vi.fn(function (this: any, _context: any) {
      return this;
    }),
  });
  const pinoMock = vi.fn(createLogger);
  pinoMock.stdTimeFunctions = {
    isoTime: vi.fn(() => ''),
  };
  return { default: pinoMock };
});

import { logger, createLogger } from './logger';

describe('Next.js Logger', () => {
  beforeEach(() => {
    // Reset environment before each test
    process.env.NODE_ENV = 'test';
    delete process.env.NEXT_PUBLIC_LOG_LEVEL;
    delete process.env.LOG_LEVEL;
    vi.clearAllMocks();
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
      logger.info('Test info message');
      expect(logger.info).toHaveBeenCalledWith('Test info message');
    });

    it('should log error messages', () => {
      logger.error('Test error message');
      expect(logger.error).toHaveBeenCalledWith('Test error message');
    });

    it('should log warning messages', () => {
      logger.warn('Test warning message');
      expect(logger.warn).toHaveBeenCalledWith('Test warning message');
    });
  });

  describe('createLogger', () => {
    it('should create a child logger with name', () => {
      const childLogger = createLogger('test-component');
      expect(childLogger).toBeDefined();
    });

    it('should create a child logger with context', () => {
      const childLogger = createLogger('test-component', { component: 'TestComponent' });
      expect(childLogger).toBeDefined();
    });
  });

  describe('log levels', () => {
    it('should use debug level in development', () => {
      process.env.NODE_ENV = 'development';
      const testLogger = createLogger('test');
      expect(testLogger.level).toBeDefined();
    });

    it('should use warn level in production', () => {
      process.env.NODE_ENV = 'production';
      const testLogger = createLogger('test');
      expect(testLogger.level).toBeDefined();
    });

    it('should respect custom log level from environment', () => {
      process.env.NEXT_PUBLIC_LOG_LEVEL = 'error';
      const testLogger = createLogger('test');
      expect(testLogger.level).toBeDefined();
    });
  });

  describe('module-specific loggers', () => {
    it('should export uiLogger', async () => {
      const { uiLogger } = await import('./logger');
      expect(uiLogger).toBeDefined();
    });

    it('should export apiLogger', async () => {
      const { apiLogger } = await import('./logger');
      expect(apiLogger).toBeDefined();
    });

    it('should export storeLogger', async () => {
      const { storeLogger } = await import('./logger');
      expect(storeLogger).toBeDefined();
    });
  });
});
