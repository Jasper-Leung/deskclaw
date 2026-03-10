/**
 * Error Management Store
 *
 * Zustand store for managing error state across the application.
 */

import { create } from 'zustand';
import type { AppErrorMessage } from './error-utils';
import { ErrorType, ErrorSeverity } from './error-utils';

interface ErrorStore {
  errors: AppErrorMessage[];
  addError: (error: AppErrorMessage | Partial<AppErrorMessage>) => void;
  removeError: (id: string) => void;
  clearErrors: () => void;
  clearErrorsByType: (type: string) => void;
}

export const useErrorStore = create<ErrorStore>((set) => ({
  errors: [],

  addError: (error) => {
    const normalizedError: AppErrorMessage = {
      id: Math.random().toString(36).substring(7),
      type: ErrorType.UNKNOWN,
      severity: ErrorSeverity.ERROR,
      title: 'Error',
      message: 'An error occurred',
      timestamp: Date.now(),
      dismissible: true,
      ...error,
    };

    set((state) => ({
      errors: [...state.errors, normalizedError],
    }));

    // Auto-dismiss after 5 seconds if dismissible
    if (normalizedError.dismissible) {
      setTimeout(() => {
        set((state) => ({
          errors: state.errors.filter((e) => e.id !== normalizedError.id),
        }));
      }, 5000);
    }
  },

  removeError: (id) => {
    set((state) => ({
      errors: state.errors.filter((e) => e.id !== id),
    }));
  },

  clearErrors: () => {
    set({ errors: [] });
  },

  clearErrorsByType: (type) => {
    set((state) => ({
      errors: state.errors.filter((e) => e.type !== type),
    }));
  },
}));

// Convenience hooks
export const useErrors = () => useErrorStore((state) => state.errors);
export const useAddError = () => useErrorStore((state) => state.addError);
export const useRemoveError = () => useErrorStore((state) => state.removeError);
export const useClearErrors = () => useErrorStore((state) => state.clearErrors);
