'use client';

/**
 * Error Toast Component
 *
 * Displays error messages as toast notifications.
 */

import React from 'react';
import { AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import type { AppErrorMessage } from '../lib/error-utils';

interface ErrorToastProps {
  error: AppErrorMessage;
  onDismiss: () => void;
}

export function ErrorToast({ error, onDismiss }: ErrorToastProps) {
  const getIcon = () => {
    switch (error.severity) {
      case 'critical':
      case 'error':
        return <AlertCircle className="h-5 w-5 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'info':
        return <Info className="h-5 w-5 text-blue-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-destructive" />;
    }
  };

  const getSeverityClasses = () => {
    switch (error.severity) {
      case 'critical':
      case 'error':
        return 'border-destructive/50 bg-destructive/10';
      case 'warning':
        return 'border-yellow-500/50 bg-yellow-500/10';
      case 'info':
        return 'border-blue-500/50 bg-blue-500/10';
      default:
        return 'border-destructive/50 bg-destructive/10';
    }
  };

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border p-4 shadow-lg ${getSeverityClasses()}`}
      role="alert"
      aria-live="polite"
    >
      <div className="flex-shrink-0">{getIcon()}</div>

      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-sm text-foreground">{error.title}</p>
          {error.type && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              {error.type}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{error.message}</p>

        {error.details && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
              Details
            </summary>
            <pre className="mt-1 overflow-auto rounded bg-muted p-2 text-xs text-muted-foreground">
              {error.details}
            </pre>
          </details>
        )}

        {error.actions && error.actions.length > 0 && (
          <div className="mt-3 flex gap-2">
            {error.actions.map((action, index) => (
              <button
                key={index}
                onClick={action.onClick}
                className={`rounded px-3 py-1.5 text-sm font-medium ${
                  action.primary
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'border border-border bg-background text-foreground hover:bg-accent'
                }`}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {error.dismissible && (
        <button
          onClick={onDismiss}
          className="flex-shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// Error Toast Container
interface ErrorToastContainerProps {
  errors: AppErrorMessage[];
  onDismiss: (id: string) => void;
}

export function ErrorToastContainer({ errors, onDismiss }: ErrorToastContainerProps) {
  if (errors.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-full max-w-md flex-col gap-2">
      {errors.map((error) => (
        <ErrorToast key={error.id} error={error} onDismiss={() => onDismiss(error.id)} />
      ))}
    </div>
  );
}
