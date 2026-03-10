/**
 * Rate Limiter
 * Manages rate limiting for channel interactions
 */

import type { Database } from 'better-sqlite3';
import { randomUUID } from 'crypto';

export type LimitType = 'total' | 'per_user' | 'per_command';
export type BlockAction = 'reject' | 'queue' | 'throttle';

export interface RateLimitRule {
  id: string;
  channelId: string;
  limitType: LimitType;
  maxRequests: number;
  windowSeconds: number;
  blockAction: BlockAction;
  createdAt: number;
}

export interface RateLimitCheck {
  allowed: boolean;
  remainingRequests: number;
  resetTime: number;
  blockAction?: BlockAction;
}

interface RateLimitWindow {
  count: number;
  windowStart: number;
}

// In-memory cache for rate limiting (in production, use Redis)
const rateLimitCache = new Map<string, RateLimitWindow>();

/**
 * Create a rate limit rule
 */
export function createRateLimitRule(
  db: Database,
  rule: Omit<RateLimitRule, 'id' | 'createdAt'>
): RateLimitRule {
  const id = randomUUID();
  const now = Date.now();

  db.prepare(
    `INSERT INTO rate_limit_rules (id, channel_id, limit_type, max_requests, window_seconds, block_action, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    rule.channelId,
    rule.limitType,
    rule.maxRequests,
    rule.windowSeconds,
    rule.blockAction,
    now
  );

  return {
    ...rule,
    id,
    createdAt: now,
  };
}

/**
 * Get rate limit rules for a channel
 */
export function getRateLimitRules(db: Database, channelId: string): RateLimitRule[] {
  const results = db
    .prepare('SELECT * FROM rate_limit_rules WHERE channel_id = ? ORDER BY created_at ASC')
    .all(channelId) as any[];

  return results.map((row) => ({
    id: row.id,
    channelId: row.channel_id,
    limitType: row.limit_type,
    maxRequests: row.max_requests,
    windowSeconds: row.window_seconds,
    blockAction: row.block_action,
    createdAt: row.created_at,
  }));
}

/**
 * Get a rate limit rule by ID
 */
export function getRateLimitRule(db: Database, ruleId: string): RateLimitRule | undefined {
  const result = db.prepare('SELECT * FROM rate_limit_rules WHERE id = ?').get(ruleId) as any;
  if (!result) return undefined;

  return {
    id: result.id,
    channelId: result.channel_id,
    limitType: result.limit_type,
    maxRequests: result.max_requests,
    windowSeconds: result.window_seconds,
    blockAction: result.block_action,
    createdAt: result.created_at,
  };
}

/**
 * Update a rate limit rule
 */
export function updateRateLimitRule(
  db: Database,
  ruleId: string,
  updates: Partial<Omit<RateLimitRule, 'id' | 'createdAt' | 'channelId'>>
): RateLimitRule | undefined {
  const existing = getRateLimitRule(db, ruleId);
  if (!existing) return undefined;

  const fields: string[] = [];
  const values: any[] = [];

  if (updates.limitType !== undefined) {
    fields.push('limit_type = ?');
    values.push(updates.limitType);
  }
  if (updates.maxRequests !== undefined) {
    fields.push('max_requests = ?');
    values.push(updates.maxRequests);
  }
  if (updates.windowSeconds !== undefined) {
    fields.push('window_seconds = ?');
    values.push(updates.windowSeconds);
  }
  if (updates.blockAction !== undefined) {
    fields.push('block_action = ?');
    values.push(updates.blockAction);
  }

  if (fields.length === 0) return existing;

  values.push(ruleId);
  db.prepare(`UPDATE rate_limit_rules SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  return getRateLimitRule(db, ruleId);
}

/**
 * Delete a rate limit rule
 */
export function deleteRateLimitRule(db: Database, ruleId: string): boolean {
  const result = db.prepare('DELETE FROM rate_limit_rules WHERE id = ?').run(ruleId);
  return result.changes > 0;
}

/**
 * Check rate limit for a request
 */
export function checkRateLimit(
  db: Database,
  channelId: string,
  identifier?: string, // user ID for per_user limits
  command?: string // for per_command limits
): RateLimitCheck {
  const rules = getRateLimitRules(db, channelId);
  const now = Date.now();

  let mostRestrictiveCheck: RateLimitCheck | undefined;

  for (const rule of rules) {
    let key: string;
    switch (rule.limitType) {
      case 'total':
        key = `${channelId}:total`;
        break;
      case 'per_user':
        if (!identifier) continue;
        key = `${channelId}:user:${identifier}`;
        break;
      case 'per_command':
        if (!command) continue;
        key = `${channelId}:command:${command}`;
        break;
    }

    const window = rateLimitCache.get(key);
    const windowStart = window?.windowStart || now;
    const windowElapsed = now - windowStart;

    // Check if window has expired
    if (windowElapsed >= rule.windowSeconds * 1000) {
      // Reset window
      rateLimitCache.set(key, {
        count: 1,
        windowStart: now,
      });

      const check: RateLimitCheck = {
        allowed: true,
        remainingRequests: rule.maxRequests - 1,
        resetTime: now + rule.windowSeconds * 1000,
        blockAction: rule.blockAction,
      };

      if (
        !mostRestrictiveCheck ||
        check.remainingRequests < mostRestrictiveCheck.remainingRequests
      ) {
        mostRestrictiveCheck = check;
      }

      continue;
    }

    // Check limit
    const count = window?.count || 0;
    if (count >= rule.maxRequests) {
      const check: RateLimitCheck = {
        allowed: false,
        remainingRequests: 0,
        resetTime: windowStart + rule.windowSeconds * 1000,
        blockAction: rule.blockAction,
      };

      if (!mostRestrictiveCheck || !check.allowed) {
        mostRestrictiveCheck = check;
      }

      continue;
    }

    // Increment counter
    rateLimitCache.set(key, {
      count: count + 1,
      windowStart,
    });

    const check: RateLimitCheck = {
      allowed: true,
      remainingRequests: rule.maxRequests - count - 1,
      resetTime: windowStart + rule.windowSeconds * 1000,
      blockAction: rule.blockAction,
    };

    if (!mostRestrictiveCheck || check.remainingRequests < mostRestrictiveCheck.remainingRequests) {
      mostRestrictiveCheck = check;
    }
  }

  return (
    mostRestrictiveCheck || {
      allowed: true,
      remainingRequests: Number.MAX_SAFE_INTEGER,
      resetTime: now + 60000,
    }
  );
}

/**
 * Get rate limit statistics
 */
export function getRateLimitStats(
  db: Database,
  channelId: string
): {
  totalRules: number;
  rulesByType: Record<LimitType, number>;
  activeLimits: Array<{ type: LimitType; maxRequests: number; windowSeconds: number }>;
} {
  const rules = getRateLimitRules(db, channelId);

  const rulesByType: Record<string, number> = {
    total: 0,
    per_user: 0,
    per_command: 0,
  };

  const activeLimits: Array<{ type: LimitType; maxRequests: number; windowSeconds: number }> = [];

  for (const rule of rules) {
    rulesByType[rule.limitType]++;
    activeLimits.push({
      type: rule.limitType,
      maxRequests: rule.maxRequests,
      windowSeconds: rule.windowSeconds,
    });
  }

  return {
    totalRules: rules.length,
    rulesByType: rulesByType as Record<LimitType, number>,
    activeLimits,
  };
}

/**
 * Clear rate limit cache (for testing or manual reset)
 */
export function clearRateLimitCache(channelId?: string): void {
  if (channelId) {
    // Clear all cache entries for this channel
    for (const key of rateLimitCache.keys()) {
      if (key.startsWith(channelId)) {
        rateLimitCache.delete(key);
      }
    }
  } else {
    // Clear entire cache
    rateLimitCache.clear();
  }
}

/**
 * Get current usage for a rate limit
 */
export function getRateLimitUsage(
  db: Database,
  channelId: string,
  limitType: LimitType,
  identifier?: string
): { current: number; max: number; resetTime: number } {
  const rules = getRateLimitRules(db, channelId);
  const rule = rules.find((r) => r.limitType === limitType);

  if (!rule) {
    return {
      current: 0,
      max: 0,
      resetTime: Date.now() + 60000,
    };
  }

  let key: string;
  switch (limitType) {
    case 'total':
      key = `${channelId}:total`;
      break;
    case 'per_user':
      key = `${channelId}:user:${identifier}`;
      break;
    case 'per_command':
      key = `${channelId}:command:${identifier}`;
      break;
  }

  const window = rateLimitCache.get(key);
  const now = Date.now();

  if (!window || now - window.windowStart >= rule.windowSeconds * 1000) {
    return {
      current: 0,
      max: rule.maxRequests,
      resetTime: now + rule.windowSeconds * 1000,
    };
  }

  return {
    current: window.count,
    max: rule.maxRequests,
    resetTime: window.windowStart + rule.windowSeconds * 1000,
  };
}

/**
 * Clean up expired cache entries
 */
export function cleanupExpiredCache(): void {
  const now = Date.now();

  for (const [key, window] of rateLimitCache.entries()) {
    // Assume 1 hour max window for cleanup
    if (now - window.windowStart > 3600 * 1000) {
      rateLimitCache.delete(key);
    }
  }
}

// Run cleanup periodically
setInterval(cleanupExpiredCache, 60000); // Every minute
