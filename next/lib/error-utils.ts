/**
 * Error Utility Functions
 *
 * Provides utilities for error handling and display in the Next.js frontend.
 */

import type { AppError } from '../../shared/types/common';

// Error types
export enum ErrorType {
  NETWORK = 'network',
  VALIDATION = 'validation',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  NOT_FOUND = 'not_found',
  SERVER = 'server',
  UNKNOWN = 'unknown',
}

// Error severity
export enum ErrorSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

// Application error interface
export interface AppErrorMessage {
  id: string;
  type: ErrorType;
  severity: ErrorSeverity;
  title: string;
  message: string;
  details?: string;
  timestamp: number;
  dismissible?: boolean;
  actions?: ErrorAction[];
}

export interface ErrorAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

// Type guard for AppError
export function isAppError(error: unknown): error is AppError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as AppError).message === 'string'
  );
}

// Get user-friendly error message
export function getErrorMessage(error: unknown): string {
  if (isAppError(error)) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unexpected error occurred';
}

// Get error type from error
export function getErrorType(error: unknown): ErrorType {
  if (isAppError(error)) {
    if (error.code === 'NETWORK_ERROR') return ErrorType.NETWORK;
    if (error.code === 'VALIDATION_ERROR') return ErrorType.VALIDATION;
    if (error.code === 'AUTH_ERROR') return ErrorType.AUTHENTICATION;
  }
  return ErrorType.UNKNOWN;
}

// Create error message object
export function createErrorMessage(
  error: unknown,
  options: Partial<AppErrorMessage> = {}
): AppErrorMessage {
  const message = getErrorMessage(error);
  const type = getErrorType(error);

  return {
    id: Math.random().toString(36).substring(7),
    type,
    severity: ErrorSeverity.ERROR,
    title: 'Error',
    message,
    timestamp: Date.now(),
    dismissible: true,
    ...options,
  };
}

// Common error messages
export const ErrorMessages = {
  network: {
    title: 'Network Error',
    message: 'Unable to connect to the server. Please check your internet connection.',
  },
  validation: {
    title: 'Validation Error',
    message: 'Please check your input and try again.',
  },
  authentication: {
    title: 'Authentication Error',
    message: 'You need to sign in to perform this action.',
  },
  authorization: {
    title: 'Authorization Error',
    message: 'You do not have permission to perform this action.',
  },
  notFound: {
    title: 'Not Found',
    message: 'The requested resource was not found.',
  },
  server: {
    title: 'Server Error',
    message: 'Something went wrong on the server. Please try again later.',
  },
  unknown: {
    title: 'Error',
    message: 'An unexpected error occurred. Please try again.',
  },
};

// Get default error message for type
export function getDefaultErrorMessage(type: ErrorType): AppErrorMessage {
  const defaults = {
    [ErrorType.NETWORK]: ErrorMessages.network,
    [ErrorType.VALIDATION]: ErrorMessages.validation,
    [ErrorType.AUTHENTICATION]: ErrorMessages.authentication,
    [ErrorType.AUTHORIZATION]: ErrorMessages.authorization,
    [ErrorType.NOT_FOUND]: ErrorMessages.notFound,
    [ErrorType.SERVER]: ErrorMessages.server,
    [ErrorType.UNKNOWN]: ErrorMessages.unknown,
  };

  const error = defaults[type];
  return {
    id: Math.random().toString(36).substring(7),
    type,
    severity: ErrorSeverity.ERROR,
    title: error.title,
    message: error.message,
    timestamp: Date.now(),
    dismissible: true,
  };
}

// Async wrapper with error handling
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  onError?: (error: unknown) => void
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    if (onError) {
      onError(error);
    }
    return null;
  }
}

// Parse API error response
export function parseApiError(response: unknown): AppErrorMessage {
  if (typeof response === 'object' && response !== null) {
    const data = response as Record<string, unknown>;

    if (data.error && typeof data.error === 'string') {
      return createErrorMessage(data.error);
    }

    if (data.message && typeof data.message === 'string') {
      return createErrorMessage(data.message);
    }
  }

  return getDefaultErrorMessage(ErrorType.UNKNOWN);
}
