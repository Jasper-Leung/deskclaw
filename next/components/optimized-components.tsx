'use client';

/**
 * Optimized Component Examples
 *
 * Examples of performance-optimized React components.
 */

import React, { memo, useCallback } from 'react';
import { VirtualList } from './virtual-list';
import { useDebounce, useThrottle, memo as memoComponent } from '@/lib/performance-utils';

/**
 * Memoized Item Component
 * Only re-renders when props change
 */
interface ItemProps {
  id: string;
  name: string;
  description?: string;
  onSelect?: (id: string) => void;
}

export const OptimizedItem = memoComponent(
  function Item({ id, name, description, onSelect }: ItemProps) {
    const handleClick = useCallback(() => {
      onSelect?.(id);
    }, [id, onSelect]);

    return (
      <div
        className="rounded border border-border p-3 hover:bg-accent cursor-pointer transition-colors"
        onClick={handleClick}
      >
        <h3 className="font-medium">{name}</h3>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison function
    return (
      prevProps.id === nextProps.id &&
      prevProps.name === nextProps.name &&
      prevProps.description === nextProps.description
    );
  }
);

/**
 * Optimized List Component
 * Uses virtual scrolling for large lists
 */
interface OptimizedListProps<T> {
  items: T[];
  getItemId: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  height?: number;
  itemHeight?: number;
}

export function OptimizedList<T>({
  items,
  getItemId,
  renderItem,
  height = 400,
  itemHeight = 60,
}: OptimizedListProps<T>) {
  // Only create render function when items change
  const renderCallback = useCallback(
    (item: T) => {
      return renderItem(item);
    },
    [renderItem]
  );

  // Use virtual list for large datasets
  if (items.length > 50) {
    return (
      <VirtualList
        items={items}
        itemHeight={itemHeight}
        height={height}
        renderItem={(item) => <div key={getItemId(item)}>{renderCallback(item)}</div>}
      />
    );
  }

  // Regular list for small datasets
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={getItemId(item)}>{renderCallback(item)}</div>
      ))}
    </div>
  );
}

/**
 * Optimized Search Component
 * Uses debouncing for search input
 */
interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
}

export const OptimizedSearchInput = memo(function SearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  debounceMs = 300,
}: SearchInputProps) {
  const [localValue, setLocalValue] = React.useState(value);
  const debouncedOnChange = useDebounce(onChange as (value: unknown) => void, debounceMs);

  // Update local value immediately
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setLocalValue(newValue);
      debouncedOnChange(newValue);
    },
    [debouncedOnChange]
  );

  // Update local value when prop changes
  React.useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <input
      type="text"
      value={localValue}
      onChange={handleChange}
      placeholder={placeholder}
      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    />
  );
});

/**
 * Optimized Infinite Scroll Component
 * Uses throttling for scroll events
 */
interface InfiniteScrollProps {
  onLoadMore: () => void;
  hasMore: boolean;
  isLoading: boolean;
  threshold?: number;
  children: React.ReactNode;
}

export const OptimizedInfiniteScroll = memo(function InfiniteScroll({
  onLoadMore,
  hasMore,
  isLoading,
  threshold = 200,
  children,
}: InfiniteScrollProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const throttledLoadMore = useThrottle(() => {
    if (hasMore && !isLoading) {
      onLoadMore();
    }
  }, 500);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight;

      if (scrollBottom < threshold && hasMore && !isLoading) {
        throttledLoadMore();
      }
    },
    [threshold, hasMore, isLoading, throttledLoadMore]
  );

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="overflow-auto"
      style={{ height: '100%' }}
    >
      {children}
      {isLoading && (
        <div className="flex items-center justify-center p-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}
    </div>
  );
});

/**
 * Optimized Toggle Component
 * Prevents unnecessary re-renders
 */
interface ToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  label?: string;
}

export const OptimizedToggle = memo(function Toggle({ enabled, onToggle, label }: ToggleProps) {
  const handleClick = useCallback(() => {
    onToggle(!enabled);
  }, [enabled, onToggle]);

  return (
    <button
      onClick={handleClick}
      className={`
        relative inline-flex h-6 w-11 items-center rounded-full transition-colors
        ${enabled ? 'bg-primary' : 'bg-input'}
      `}
      aria-pressed={enabled}
      aria-label={label}
    >
      <span
        className={`
          inline-block h-4 w-4 transform rounded-full bg-white transition-transform
          ${enabled ? 'translate-x-6' : 'translate-x-1'}
        `}
      />
    </button>
  );
});

/**
 * Optimized Counter Component
 * Demonstrates optimized state management
 */
export const OptimizedCounter = memo(function Counter() {
  const [count, setCount] = React.useState(0);

  const increment = useCallback(() => {
    setCount((c) => c + 1);
  }, []);

  const decrement = useCallback(() => {
    setCount((c) => c - 1);
  }, []);

  const reset = useCallback(() => {
    setCount(0);
  }, []);

  return (
    <div className="flex items-center gap-4">
      <button
        onClick={decrement}
        className="rounded-md bg-secondary px-4 py-2 hover:bg-secondary/80"
        aria-label="Decrement"
      >
        -
      </button>
      <span className="text-lg font-mono tabular-nums">{count}</span>
      <button
        onClick={increment}
        className="rounded-md bg-secondary px-4 py-2 hover:bg-secondary/80"
        aria-label="Increment"
      >
        +
      </button>
      <button
        onClick={reset}
        className="rounded-md bg-destructive px-4 py-2 text-destructive-foreground hover:bg-destructive/80"
        aria-label="Reset"
      >
        Reset
      </button>
    </div>
  );
});
