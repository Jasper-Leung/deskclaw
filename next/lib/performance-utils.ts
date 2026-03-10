/**
 * Performance Utilities
 *
 * Utility functions for optimizing React components and application performance.
 */

import React, { useCallback, useEffect, useRef } from 'react';

/**
 * Debounce hook - delays function execution until after a delay period
 */
export function useDebounce<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    },
    [callback, delay]
  );
}

/**
 * Throttle hook - limits function execution to once per delay period
 */
export function useThrottle<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  const lastRunRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  return useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();
      const timeSinceLastRun = now - lastRunRef.current;

      if (timeSinceLastRun >= delay) {
        lastRunRef.current = now;
        callback(...args);
      } else {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          lastRunRef.current = Date.now();
          callback(...args);
        }, delay - timeSinceLastRun);
      }
    },
    [callback, delay]
  );
}

/**
 * Deferred value hook - defers updating a value until after a delay
 */
export function useDeferredValue<T>(value: T, delay: number): T {
  const [deferredValue, setDeferredValue] = React.useState(value);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDeferredValue(value);
    }, delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return deferredValue;
}

/**
 * Idle callback hook - executes function when browser is idle
 */
export function useIdleCallback(callback: () => void, options?: { timeout?: number }): void {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (typeof requestIdleCallback === 'undefined') {
      // Fallback for browsers without requestIdleCallback
      const timer = setTimeout(() => {
        callbackRef.current();
      }, options?.timeout || 0);
      return () => clearTimeout(timer);
    }

    const id = requestIdleCallback(() => {
      callbackRef.current();
    }, options);

    return () => cancelIdleCallback(id);
  }, [options]);
}

/**
 * Measure render performance
 */
export function useRenderTiming(componentName: string): void {
  const renderCountRef = useRef(0);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    renderCountRef.current += 1;
    startTimeRef.current = performance.now();

    return () => {
      const endTime = performance.now();
      const renderTime = endTime - startTimeRef.current;

      if (process.env.NODE_ENV === 'development' && renderTime > 16) {
        console.warn(
          `[Performance] ${componentName} render #${renderCountRef.current} took ${renderTime.toFixed(2)}ms`
        );
      }
    };
  });
}

/**
 * Memoized component factory
 */
export function memo<P extends object>(
  Component: React.FunctionComponent<P>,
  areEqual?: (prevProps: Readonly<P>, nextProps: Readonly<P>) => boolean
): React.NamedExoticComponent<P> {
  return React.memo(Component, areEqual);
}

/**
 * Virtual scroll utilities
 */
export interface VirtualScrollOptions {
  itemHeight: number;
  containerHeight: number;
  overscan?: number;
}

export function calculateVisibleRange(
  scrollTop: number,
  options: VirtualScrollOptions
): { startIndex: number; endIndex: number; offsetY: number } {
  const { itemHeight, containerHeight, overscan = 3 } = options;

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan;
  const offsetY = startIndex * itemHeight;

  return { startIndex, endIndex, offsetY };
}

/**
 * Lazy load component helper
 */
export function lazyLoad<T extends React.ComponentType<any>>(
  componentFactory: () => Promise<{ default: T }>,
  _fallback?: React.ReactNode
): React.LazyExoticComponent<T> {
  return React.lazy(componentFactory);
}

/**
 * Image loading optimization
 */
export function useImageLoading(src: string): { isLoading: boolean; error: Error | null } {
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);

    const img = new Image();
    img.src = src;

    img.onload = () => {
      setIsLoading(false);
    };

    img.onerror = () => {
      setError(new Error(`Failed to load image: ${src}`));
      setIsLoading(false);
    };

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [src]);

  return { isLoading, error };
}

/**
 * Batch state updates helper
 */
export function batchUpdates(updates: () => void): void {
  updates();
}

/**
 * Performance measurement utility
 */
export class PerformanceMonitor {
  private marks = new Map<string, number>();

  mark(name: string): void {
    this.marks.set(name, performance.now());
  }

  measure(name: string, startMark?: string): number {
    const endTime = performance.now();
    if (startMark) {
      const startTime = this.marks.get(startMark);
      if (startTime !== undefined) {
        return endTime - startTime;
      }
    }
    this.marks.set(name, endTime);
    return 0;
  }

  log(name: string, duration: number): void {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Performance] ${name}: ${duration.toFixed(2)}ms`);
    }
  }
}

export const performanceMonitor = new PerformanceMonitor();
