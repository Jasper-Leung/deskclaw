/**
 * Global Error Handler
 *
 * Provides centralized error handling for the Electron main process.
 */

import { app, dialog } from 'electron';
import { dbLogger, ipcLogger, workflowLogger, toolLogger, memoryLogger } from './logger.js';
import type { AppError } from '../../../shared/types/common.js';

// Error categories
export enum ErrorCategory {
  DATABASE = 'database',
  IPC = 'ipc',
  WORKFLOW = 'workflow',
  TOOL = 'tool',
  MEMORY = 'memory',
  NETWORK = 'network',
  FILE_SYSTEM = 'file_system',
  UNKNOWN = 'unknown',
}

// Error severity levels
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

// Application error class
export class ApplicationError extends Error implements AppError {
  public readonly code: string;
  public readonly statusCode?: number;
  public readonly details?: unknown;
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly timestamp: number;

  constructor(
    message: string,
    code: string = 'APP_ERROR',
    category: ErrorCategory = ErrorCategory.UNKNOWN,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    details?: unknown
  ) {
    super(message);
    this.name = 'ApplicationError';
    this.code = code;
    this.category = category;
    this.severity = severity;
    this.details = details;
    this.timestamp = Date.now();

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApplicationError);
    }
  }
}

// Error handler options
interface ErrorHandlerOptions {
  showDialog?: boolean;
  logError?: boolean;
  notifyRenderer?: boolean;
}

// Get appropriate logger for category
function getLoggerForCategory(category: ErrorCategory) {
  switch (category) {
    case ErrorCategory.DATABASE:
      return dbLogger;
    case ErrorCategory.IPC:
      return ipcLogger;
    case ErrorCategory.WORKFLOW:
      return workflowLogger;
    case ErrorCategory.TOOL:
      return toolLogger;
    case ErrorCategory.MEMORY:
      return memoryLogger;
    default:
      return ipcLogger;
  }
}

// Handle error with appropriate actions
export function handleError(
  error: Error | ApplicationError | unknown,
  options: ErrorHandlerOptions = {}
): void {
  const { showDialog = false, logError = true, notifyRenderer = false } = options;

  // Normalize error
  const appError =
    error instanceof ApplicationError
      ? error
      : error instanceof Error
        ? new ApplicationError(
            error.message,
            'GENERIC_ERROR',
            ErrorCategory.UNKNOWN,
            ErrorSeverity.MEDIUM,
            error
          )
        : new ApplicationError(
            String(error),
            'UNKNOWN_ERROR',
            ErrorCategory.UNKNOWN,
            ErrorSeverity.MEDIUM
          );

  // Log error
  if (logError) {
    const logger = getLoggerForCategory(appError.category);
    logger.error({
      code: appError.code,
      category: appError.category,
      severity: appError.severity,
      message: appError.message,
      stack: appError.stack,
      details: appError.details,
    });
  }

  // Show dialog for critical errors
  if (showDialog || appError.severity === ErrorSeverity.CRITICAL) {
    showErrorDialog(appError);
  }

  // Notify renderer process
  if (notifyRenderer) {
    notifyRendererError(appError);
  }
}

// Show error dialog to user
function showErrorDialog(error: ApplicationError): void {
  const buttons = ['OK', 'Copy Error'];
  const detail = `Error Code: ${error.code}\nCategory: ${error.category}\n\n${error.message}`;

  if (app.isReady()) {
    dialog
      .showMessageBox({
        type: 'error',
        title: 'DeskClaw Error',
        message:
          error.severity === ErrorSeverity.CRITICAL
            ? 'A critical error occurred'
            : 'An error occurred',
        detail,
        buttons,
      })
      .then((result) => {
        if (result.response === 1) {
          // Copy error to clipboard
          require('electron').clipboard.writeText(
            `Error Code: ${error.code}\nCategory: ${error.category}\nMessage: ${error.message}\nStack: ${error.stack}`
          );
        }
      })
      .catch(() => {
        // Ignore dialog errors
      });
  }
}

// Notify renderer process of error
function notifyRendererError(error: ApplicationError): void {
  // This will be implemented with the main window reference
  // For now, we'll just log it
  ipcLogger.info(`Error notification sent to renderer: ${error.code}, ${error.message}`);
}

// Create category-specific error creators
export const Errors = {
  database: (message: string, details?: unknown) =>
    new ApplicationError(message, 'DB_ERROR', ErrorCategory.DATABASE, ErrorSeverity.HIGH, details),

  ipc: (message: string, details?: unknown) =>
    new ApplicationError(message, 'IPC_ERROR', ErrorCategory.IPC, ErrorSeverity.MEDIUM, details),

  workflow: (message: string, details?: unknown) =>
    new ApplicationError(
      message,
      'WORKFLOW_ERROR',
      ErrorCategory.WORKFLOW,
      ErrorSeverity.MEDIUM,
      details
    ),

  tool: (message: string, details?: unknown) =>
    new ApplicationError(message, 'TOOL_ERROR', ErrorCategory.TOOL, ErrorSeverity.MEDIUM, details),

  memory: (message: string, details?: unknown) =>
    new ApplicationError(message, 'MEMORY_ERROR', ErrorCategory.MEMORY, ErrorSeverity.LOW, details),

  network: (message: string, details?: unknown) =>
    new ApplicationError(
      message,
      'NETWORK_ERROR',
      ErrorCategory.NETWORK,
      ErrorSeverity.MEDIUM,
      details
    ),

  fileSystem: (message: string, details?: unknown) =>
    new ApplicationError(
      message,
      'FS_ERROR',
      ErrorCategory.FILE_SYSTEM,
      ErrorSeverity.HIGH,
      details
    ),
};

// Wrap async functions with error handling
export function withErrorHandling<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  options: ErrorHandlerOptions = {}
): T {
  return (async (...args: unknown[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      handleError(error, options);
      throw error;
    }
  }) as T;
}

// Setup global error handlers
export function setupGlobalErrorHandlers(): void {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    handleError(
      new ApplicationError(
        error.message,
        'UNCAUGHT_EXCEPTION',
        ErrorCategory.UNKNOWN,
        ErrorSeverity.CRITICAL,
        error
      ),
      { showDialog: true, logError: true }
    );
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: unknown) => {
    handleError(
      new ApplicationError(
        String(reason),
        'UNHANDLED_REJECTION',
        ErrorCategory.UNKNOWN,
        ErrorSeverity.HIGH,
        reason
      ),
      { logError: true }
    );
  });

  ipcLogger.info('Global error handlers initialized');
}
