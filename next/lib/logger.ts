/**
 * Unified Logger Configuration for Next.js using Pino
 *
 * This module provides a centralized logging system for the DeskClaw Next.js frontend.
 * All logging should use this module instead of console.log/error/warn.
 */

import pino from 'pino';

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
  const envLevel =
    process.env.NEXT_PUBLIC_LOG_LEVEL?.toUpperCase() || process.env.LOG_LEVEL?.toUpperCase();
  if (envLevel && Object.values(LogLevel).includes(envLevel.toLowerCase() as LogLevel)) {
    return envLevel.toLowerCase() as LogLevel;
  }
  // Use debug in development, warn in production (less verbose)
  return process.env.NODE_ENV === 'production' ? LogLevel.WARN : LogLevel.DEBUG;
};

// Pino configuration for browser
const pinoConfig: pino.LoggerOptions = {
  level: getLogLevel(),
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Browser configuration
  browser: {
    asObject: true,
    transmit: {
      level: 'error',
      send: (_level, logEvent) => {
        // Send errors to server in production
        if (process.env.NODE_ENV === 'production') {
          // TODO: Implement error reporting to server
          console.error('[Error Report]', logEvent);
        }
      },
    },
  },
};

// Create the main logger instance
export const logger = pino(pinoConfig);

// Create child loggers with context
export const createLogger = (name: string, context?: Record<string, unknown>): pino.Logger => {
  return logger.child({ name, ...context });
};

// Module-specific loggers
export const uiLogger = createLogger('ui');
export const apiLogger = createLogger('api');
export const storeLogger = createLogger('store');

// Export default logger
export default logger;
