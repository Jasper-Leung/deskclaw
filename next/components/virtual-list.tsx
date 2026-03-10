'use client';

/**
 * Virtual List Component
 *
 * Renders only visible items for better performance with large lists.
 */

import React, { useMemo, useRef, useState } from 'react';
import { calculateVisibleRange } from '@/lib/performance-utils';

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  height: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  overscan?: number;
  className?: string;
}

export function VirtualList<T>({
  items,
  itemHeight,
  height,
  renderItem,
  overscan = 3,
  className = '',
}: VirtualListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const totalHeight = items.length * itemHeight;

  const { startIndex, endIndex, offsetY } = useMemo(() => {
    return calculateVisibleRange(scrollTop, { itemHeight, containerHeight: height, overscan });
  }, [scrollTop, itemHeight, height, overscan]);

  const visibleItems = useMemo(() => {
    return items.slice(startIndex, endIndex);
  }, [items, startIndex, endIndex]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  return (
    <div
      ref={scrollContainerRef}
      className={`overflow-auto ${className}`}
      style={{ height }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleItems.map((item, index) => (
            <div
              key={startIndex + index}
              style={{ height: itemHeight }}
              data-index={startIndex + index}
            >
              {renderItem(item, startIndex + index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Hook for virtual list functionality
 */
export function useVirtualList<T>(
  items: T[],
  options: { itemHeight: number; containerHeight: number; overscan?: number }
) {
  const [scrollTop, setScrollTop] = useState(0);

  const range = useMemo(() => {
    return calculateVisibleRange(scrollTop, options);
  }, [scrollTop, options]);

  const visibleItems = useMemo(() => {
    return items.slice(range.startIndex, range.endIndex);
  }, [items, range]);

  const totalHeight = items.length * options.itemHeight;

  return {
    visibleItems,
    totalHeight,
    offsetY: range.offsetY,
    startIndex: range.startIndex,
    endIndex: range.endIndex,
    scrollTop,
    setScrollTop,
  };
}
