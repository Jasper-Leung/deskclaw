/**
 * Error Store Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useErrorStore } from './error-store';
import { ErrorType, ErrorSeverity } from './error-utils';

describe('Error Store', () => {
  beforeEach(() => {
    // Reset store state before each test
    useErrorStore.setState({ errors: [] });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('should have empty errors array', () => {
      const state = useErrorStore.getState();
      expect(state.errors).toEqual([]);
    });
  });

  describe('addError', () => {
    it('should add error with default values', () => {
      const { addError } = useErrorStore.getState();

      addError({ message: 'Test error' });

      const errors = useErrorStore.getState().errors;
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        type: ErrorType.UNKNOWN,
        severity: ErrorSeverity.ERROR,
        title: 'Error',
        message: 'Test error',
        dismissible: true,
      });
      expect(errors[0].id).toBeDefined();
      expect(errors[0].timestamp).toBeDefined();
    });

    it('should add error with custom values', () => {
      const { addError } = useErrorStore.getState();

      addError({
        type: ErrorType.VALIDATION,
        severity: ErrorSeverity.WARNING,
        title: 'Custom Error',
        message: 'Custom message',
        dismissible: false,
      });

      const errors = useErrorStore.getState().errors;
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        type: ErrorType.VALIDATION,
        severity: ErrorSeverity.WARNING,
        title: 'Custom Error',
        message: 'Custom message',
        dismissible: false,
      });
    });

    it('should auto-dismiss dismissible errors after 5 seconds', () => {
      const { addError } = useErrorStore.getState();

      addError({ message: 'Auto-dismiss error' });

      expect(useErrorStore.getState().errors).toHaveLength(1);

      vi.advanceTimersByTime(5000);

      expect(useErrorStore.getState().errors).toHaveLength(0);
    });

    it('should not auto-dismiss non-dismissible errors', () => {
      const { addError } = useErrorStore.getState();

      addError({
        message: 'Non-dismissible error',
        dismissible: false,
      });

      expect(useErrorStore.getState().errors).toHaveLength(1);

      vi.advanceTimersByTime(5000);

      expect(useErrorStore.getState().errors).toHaveLength(1);
    });

    it('should add multiple errors', () => {
      const { addError } = useErrorStore.getState();

      addError({ message: 'Error 1' });
      addError({ message: 'Error 2' });
      addError({ message: 'Error 3' });

      const errors = useErrorStore.getState().errors;
      expect(errors).toHaveLength(3);
      expect(errors.map((e) => e.message)).toEqual(['Error 1', 'Error 2', 'Error 3']);
    });
  });

  describe('removeError', () => {
    it('should remove error by id', () => {
      const { addError, removeError } = useErrorStore.getState();

      addError({ message: 'Error 1' });
      addError({ message: 'Error 2' });

      const errors = useErrorStore.getState().errors;
      const errorId = errors[0].id;

      removeError(errorId);

      const updatedErrors = useErrorStore.getState().errors;
      expect(updatedErrors).toHaveLength(1);
      expect(updatedErrors[0].message).toBe('Error 2');
    });

    it('should handle removing non-existent error', () => {
      const { addError, removeError } = useErrorStore.getState();

      addError({ message: 'Error 1' });

      removeError('non-existent-id');

      expect(useErrorStore.getState().errors).toHaveLength(1);
    });
  });

  describe('clearErrors', () => {
    it('should clear all errors', () => {
      const { addError, clearErrors } = useErrorStore.getState();

      addError({ message: 'Error 1' });
      addError({ message: 'Error 2' });
      addError({ message: 'Error 3' });

      expect(useErrorStore.getState().errors).toHaveLength(3);

      clearErrors();

      expect(useErrorStore.getState().errors).toHaveLength(0);
    });
  });

  describe('clearErrorsByType', () => {
    it('should clear errors of specific type', () => {
      const { addError, clearErrorsByType } = useErrorStore.getState();

      addError({ type: ErrorType.VALIDATION, message: 'Validation error' });
      addError({ type: ErrorType.NETWORK, message: 'Network error' });
      addError({ type: ErrorType.VALIDATION, message: 'Another validation error' });

      expect(useErrorStore.getState().errors).toHaveLength(3);

      clearErrorsByType(ErrorType.VALIDATION);

      const errors = useErrorStore.getState().errors;
      expect(errors).toHaveLength(1);
      expect(errors[0].type).toBe(ErrorType.NETWORK);
    });
  });

  describe('convenience hooks', () => {
    it('useErrors should return errors array', () => {
      const { addError } = useErrorStore.getState();
      addError({ message: 'Test error' });

      const errors = useErrorStore.getState().errors;
      expect(errors).toHaveLength(1);
    });
  });
});
