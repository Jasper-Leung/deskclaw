/**
 * Unified Logger Configuration using Pino
 *
 * This module provides a centralized logging system for the DeskClaw application.
 * All logging should use this module instead of console.log/error/warn.
 */

import pino from 'pino';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';
import { app } from 'electron';

// Simple error serializer to avoid pino-std-serializers dependency
const errSerializer = (err: Error): Record<string, unknown> => {
  if (!err) return {};
  const obj: Record<string, unknown> = {
    message: err.message,
    name: err.name,
    stack: err.stack,
  };
  if ((err as any).code) obj.code = (err as any).code;
  if ((err as any).errno) obj.errno = (err as any).errno;
  if ((err as any).syscall) obj.syscall = (err as any).syscall;
  if ((err as any).path) obj.path = (err as any).path;
  return obj;
};

// Log levels
export enum LogLevel {
  TRACE = 'trace',
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
  SILENT = 'silent',
}

// Get log level from environment or use default
const getLogLevel = (): LogLevel => {
  const envLevel = process.env.LOG_LEVEL?.toUpperCase();
  if (envLevel && Object.values(LogLevel).includes(envLevel.toLowerCase() as LogLevel)) {
    return envLevel.toLowerCase() as LogLevel;
  }
  // Use debug in development, info in production
  return process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG;
};

// Get log directory
const getLogDir = (): string => {
  const userDataPath = app.getPath('userData');
  const logDir = path.join(userDataPath, 'logs');

  // Create log directory if it doesn't exist
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  return logDir;
};

// Pino configuration
const pinoConfig: pino.LoggerOptions = {
  level: getLogLevel(),
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    error: errSerializer,
  },
  // In development, use pretty print (optional, requires pino-pretty)
  ...(process.env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino/file',
      options: {
        destination: path.join(getLogDir(), 'combined.log'),
        mkdir: true,
      },
    },
  }),
};

// Create the main logger instance
export const logger = pino(pinoConfig);

// Create child loggers with context
export const createLogger = (name: string, context?: Record<string, unknown>): pino.Logger => {
  return logger.child({ name, ...context });
};

// Module-specific loggers
export const dbLogger = createLogger('database');
export const ipcLogger = createLogger('ipc');
export const channelLogger = createLogger('channels');
export const workflowLogger = createLogger('workflow');
export const toolLogger = createLogger('tools');
export const memoryLogger = createLogger('memory');
export const browserLogger = createLogger('browser');

// Export default logger
export default logger;
