/**
 * Optimized State Management Hooks
 *
 * Performance-optimized state management utilities.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

/**
 * Optimized selector hook - prevents unnecessary re-renders
 */
export function useOptimizedSelector<T, U>(
  value: T,
  selector: (value: T) => U,
  areEqual: (prev: U, next: U) => boolean = Object.is
): U {
  const prevRef = useRef<U | undefined>(undefined);
  const selected = selector(value);

  if (prevRef.current === undefined || !areEqual(prevRef.current, selected)) {
    prevRef.current = selected;
  }

  return prevRef.current as U;
}

/**
 * Stable callback hook - returns a memoized callback that won't change
 * when dependencies change, using a ref to track latest values.
 */
export function useStableCallback<T extends (...args: unknown[]) => unknown>(callback: T): T {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  });

  return useCallback((...args: unknown[]) => callbackRef.current(...args), []) as T;
}

/**
 * Batcher hook - batches multiple state updates
 */
export function useBatcher(): (update: () => void) => void {
  const pendingUpdatesRef = useRef<(() => void)[]>([]);
  const batchingRef = useRef(false);

  const flush = useCallback(() => {
    const updates = pendingUpdatesRef.current;
    pendingUpdatesRef.current = [];

    batchingRef.current = false;

    updates.forEach((update) => update());
  }, []);

  const batch = useCallback(
    (update: () => void) => {
      pendingUpdatesRef.current.push(update);

      if (!batchingRef.current) {
        batchingRef.current = true;
        // Use requestAnimationFrame for better batching
        requestAnimationFrame(flush);
      }
    },
    [flush]
  );

  return batch;
}

/**
 * Optimized map state hook - similar to useState but with optimized updates
 */
export function useOptimizedMap<K, V>(initialState?: Map<K, V>) {
  const mapRef = useRef(initialState ?? new Map());
  const [, forceUpdate] = useState({});

  const set = useCallback((key: K, value: V) => {
    if (mapRef.current.get(key) !== value) {
      mapRef.current.set(key, value);
      forceUpdate({});
    }
  }, []);

  const deleteKey = useCallback((key: K) => {
    if (mapRef.current.has(key)) {
      mapRef.current.delete(key);
      forceUpdate({});
    }
  }, []);

  const clear = useCallback(() => {
    if (mapRef.current.size > 0) {
      mapRef.current.clear();
      forceUpdate({});
    }
  }, []);

  const get = useCallback((key: K) => {
    return mapRef.current.get(key);
  }, []);

  const has = useCallback((key: K) => {
    return mapRef.current.has(key);
  }, []);

  const map = useMemo(() => {
    return new Map(mapRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceUpdate, forceUpdate]);

  return { map, set, delete: deleteKey, clear, get, has };
}

/**
 * Optimized set state hook - similar to useState but with Set operations
 */
export function useOptimizedSet<T>(initialState?: Set<T>) {
  const setRef = useRef(initialState ?? new Set());
  const [, forceUpdate] = useState({});

  const add = useCallback((value: T) => {
    if (!setRef.current.has(value)) {
      setRef.current.add(value);
      forceUpdate({});
    }
  }, []);

  const remove = useCallback((value: T) => {
    if (setRef.current.has(value)) {
      setRef.current.delete(value);
      forceUpdate({});
    }
  }, []);

  const clear = useCallback(() => {
    if (setRef.current.size > 0) {
      setRef.current.clear();
      forceUpdate({});
    }
  }, []);

  const has = useCallback((value: T) => {
    return setRef.current.has(value);
  }, []);

  const set = useMemo(() => {
    return new Set(setRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceUpdate, forceUpdate]);

  return { set, add, remove, clear, has };
}

/**
 * External store subscription hook - optimized for external state
 */
export function useExternalStore<T>(
  subscribe: (callback: () => void) => () => void,
  getSnapshot: () => T,
  getServerSnapshot?: () => T
): T {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Create an optimized store
 */
export function createOptimizedStore<T>(initialState: T) {
  let state = initialState;
  const listeners = new Set<() => void>();

  const getState = () => state;

  const setState = (partial: Partial<T> | ((state: T) => Partial<T>)) => {
    const nextState = typeof partial === 'function' ? partial(state) : partial;
    if (nextState !== state) {
      state = { ...state, ...nextState };
      listeners.forEach((listener) => listener());
    }
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const useStore = <U = T>(selector?: (state: T) => U): U => {
    const snap = useSyncExternalStore(
      subscribe,
      () => (selector ? selector(state) : state) as U,
      () => (selector ? selector(initialState) : initialState) as U
    );
    return snap;
  };

  return { getState, setState, subscribe, useStore };
}
