/**
 * Permission Evaluator
 * Evaluates access control and permissions for channel operations
 */

import type { Database } from 'better-sqlite3';
import * as manager from './manager.js';
import * as rateLimiter from './rate-limiter.js';

export interface AccessControlEvaluation {
  allowed: boolean;
  reason?: string;
  requiresApproval?: boolean;
  rateLimit?: rateLimiter.RateLimitCheck;
  permissions?: {
    fromAllowed: boolean;
    commandAllowed: boolean;
    mentionAllowed: boolean;
  };
}

export interface GroupMentionRule {
  id: string;
  channelId: string;
  groupPattern: string;
  requiredPermission: 'anyone' | 'admin' | 'specific_user';
  allowedUsers?: string[];
  createdAt: number;
}

/**
 * Evaluate full access control for a channel message
 */
export function evaluateAccess(
  db: Database,
  channelId: string,
  peerId: string,
  content: string,
  isCommand: boolean = false
): AccessControlEvaluation {
  const result: AccessControlEvaluation = {
    allowed: true,
    permissions: {
      fromAllowed: true,
      commandAllowed: true,
      mentionAllowed: true,
    },
  };

  // Check block_from permissions
  const blockedFrom = manager.getPermissionsByType(db, channelId, 'block_from');
  for (const perm of blockedFrom) {
    if (matchRule(perm.ruleValue, peerId)) {
      result.allowed = false;
      result.reason = `Peer "${peerId}" is blocked`;
      result.permissions!.fromAllowed = false;
      return result;
    }
  }

  // Check allow_from permissions
  const allowedFrom = manager.getPermissionsByType(db, channelId, 'allow_from');
  if (allowedFrom.length > 0) {
    let fromMatch = false;
    for (const perm of allowedFrom) {
      if (matchRule(perm.ruleValue, peerId)) {
        fromMatch = true;
        break;
      }
    }
    if (!fromMatch) {
      result.allowed = false;
      result.reason = `Peer "${peerId}" is not in the allowed list`;
      result.permissions!.fromAllowed = false;
      return result;
    }
  }

  // Check rate limits
  const rateLimitCheck = rateLimiter.checkRateLimit(db, channelId, peerId);
  result.rateLimit = rateLimitCheck;

  if (!rateLimitCheck.allowed) {
    result.allowed = false;
    result.reason = `Rate limit exceeded: ${rateLimitCheck.blockAction}`;

    if (rateLimitCheck.blockAction === 'queue') {
      result.requiresApproval = true;
    }

    return result;
  }

  // Check command permissions if this is a command
  if (isCommand) {
    const command = extractCommand(content);
    const commandCheck = manager.checkCommandPermission(db, channelId, command, peerId);

    if (!commandCheck.allowed) {
      result.allowed = false;
      result.reason = commandCheck.reason;
      result.permissions!.commandAllowed = false;
      return result;
    }
  }

  // Check mention permissions if content contains mentions
  if (containsMention(content)) {
    const mentionType = getMentionType(content);
    const mentionCheck = manager.checkMentionPermission(db, channelId, peerId, mentionType);

    if (!mentionCheck.allowed) {
      result.allowed = false;
      result.reason = mentionCheck.reason;
      result.permissions!.mentionAllowed = false;
      return result;
    }
  }

  return result;
}

/**
 * Create a group mention rule
 */
export function createGroupMentionRule(
  db: Database,
  rule: Omit<GroupMentionRule, 'id' | 'createdAt'>
): GroupMentionRule {
  const id = Date.now().toString() + Math.random().toString(36).substring(2);
  const now = Date.now();

  db.prepare(
    `INSERT INTO group_mention_rules (id, channel_id, group_pattern, required_permission, allowed_users_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    rule.channelId,
    rule.groupPattern,
    rule.requiredPermission,
    rule.allowedUsers ? JSON.stringify(rule.allowedUsers) : null,
    now
  );

  return {
    ...rule,
    id,
    createdAt: now,
  };
}

/**
 * Get group mention rules for a channel
 */
export function getGroupMentionRules(db: Database, channelId: string): GroupMentionRule[] {
  const results = db
    .prepare('SELECT * FROM group_mention_rules WHERE channel_id = ?')
    .all(channelId) as any[];

  return results.map((row) => ({
    id: row.id,
    channelId: row.channel_id,
    groupPattern: row.group_pattern,
    requiredPermission: row.required_permission,
    allowedUsers: row.allowed_users_json ? JSON.parse(row.allowed_users_json) : undefined,
    createdAt: row.created_at,
  }));
}

/**
 * Check if group mention is allowed
 */
export function checkGroupMentionAllowed(
  db: Database,
  channelId: string,
  peerId: string,
  groupPattern: string
): boolean {
  const rules = getGroupMentionRules(db, channelId);

  for (const rule of rules) {
    if (matchRule(rule.groupPattern, groupPattern)) {
      switch (rule.requiredPermission) {
        case 'anyone':
          return true;
        case 'admin':
          return isAdmin(db, channelId, peerId);
        case 'specific_user':
          return rule.allowedUsers?.includes(peerId) || false;
      }
    }
  }

  // Default: allow
  return true;
}

/**
 * Delete a group mention rule
 */
export function deleteGroupMentionRule(db: Database, ruleId: string): boolean {
  const result = db.prepare('DELETE FROM group_mention_rules WHERE id = ?').run(ruleId);
  return result.changes > 0;
}

/**
 * Get comprehensive permission report for a channel
 */
export function getPermissionReport(
  db: Database,
  channelId: string
): {
  channelPermissions: manager.ChannelPermission[];
  rateLimitRules: rateLimiter.RateLimitRule[];
  groupMentionRules: GroupMentionRule[];
  summary: {
    totalPermissions: number;
    totalRateLimits: number;
    totalGroupMentionRules: number;
    restrictedAccess: boolean;
    rateLimited: boolean;
  };
} {
  const channelPermissions = manager.getChannelPermissions(db, channelId);
  const rateLimitRules = rateLimiter.getRateLimitRules(db, channelId);
  const groupMentionRules = getGroupMentionRules(db, channelId);

  const summary = {
    totalPermissions: channelPermissions.length,
    totalRateLimits: rateLimitRules.length,
    totalGroupMentionRules: groupMentionRules.length,
    restrictedAccess: channelPermissions.some(
      (p) => p.permissionType === 'allow_from' || p.permissionType === 'block_from'
    ),
    rateLimited: rateLimitRules.length > 0,
  };

  return {
    channelPermissions,
    rateLimitRules,
    groupMentionRules,
    summary,
  };
}

/**
 * Helper: Check if a rule matches a value
 */
function matchRule(rule: string, value: string): boolean {
  if (rule === value) return true;

  const regexPattern = rule.replace(/\*/g, '.*').replace(/\?/g, '.');
  try {
    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(value);
  } catch {
    return false;
  }
}

/**
 * Helper: Extract command from message content
 */
function extractCommand(content: string): string {
  const match = content.match(/^\/(\w+)/);
  return match ? match[1] : content.split(' ')[0];
}

/**
 * Helper: Check if content contains a mention
 */
function containsMention(content: string): boolean {
  return /@[\w\u4e00-\u9fa5]+/.test(content);
}

/**
 * Helper: Get mention type from content
 */
function getMentionType(content: string): 'user' | 'group' | 'all' {
  if (content.includes('@all') || content.includes('@everyone')) {
    return 'all';
  }
  if (content.includes('@here')) {
    return 'group';
  }
  return 'user';
}

/**
 * Helper: Check if peer is admin
 */
function isAdmin(db: Database, channelId: string, peerId: string): boolean {
  // This would check against channel-specific admin lists
  // For now, return false
  return false;
}

/**
 * Validate permission configuration
 */
export function validatePermissionConfig(config: {
  permissions?: Array<{ type: manager.PermissionType; value: string }>;
  rateLimits?: Array<{ type: rateLimiter.LimitType; max: number; window: number }>;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.permissions) {
    for (const perm of config.permissions) {
      if (
        ![
          'allow_from',
          'block_from',
          'allow_command',
          'block_command',
          'allow_mention',
          'require_mention',
        ].includes(perm.type)
      ) {
        errors.push(`Invalid permission type: ${perm.type}`);
      }
      if (!perm.value || perm.value.trim() === '') {
        errors.push(`Permission value cannot be empty for type: ${perm.type}`);
      }
    }
  }

  if (config.rateLimits) {
    for (const limit of config.rateLimits) {
      if (!['total', 'per_user', 'per_command'].includes(limit.type)) {
        errors.push(`Invalid rate limit type: ${limit.type}`);
      }
      if (limit.max <= 0) {
        errors.push(`Rate limit max must be positive for type: ${limit.type}`);
      }
      if (limit.window <= 0) {
        errors.push(`Rate limit window must be positive for type: ${limit.type}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Apply permission preset to a channel
 */
export function applyPermissionPreset(
  db: Database,
  channelId: string,
  preset: 'strict' | 'moderate' | 'open'
): void {
  // Clear existing permissions
  manager.clearChannelPermissions(db, channelId);
  rateLimiter.clearRateLimitCache(channelId);

  switch (preset) {
    case 'strict':
      // Only allow specific users, block all commands
      manager.batchCreatePermissions(db, channelId, [
        { permissionType: 'allow_from', ruleValue: 'admin@*', priority: 100 },
      ]);
      manager.batchCreatePermissions(db, channelId, [
        { permissionType: 'block_command', ruleValue: '*', priority: 100 },
      ]);
      rateLimiter.createRateLimitRule(db, {
        channelId,
        limitType: 'per_user',
        maxRequests: 10,
        windowSeconds: 3600,
        blockAction: 'reject',
      });
      break;

    case 'moderate':
      // Allow commands but with rate limiting
      rateLimiter.createRateLimitRule(db, {
        channelId,
        limitType: 'per_user',
        maxRequests: 100,
        windowSeconds: 3600,
        blockAction: 'throttle',
      });
      rateLimiter.createRateLimitRule(db, {
        channelId,
        limitType: 'total',
        maxRequests: 1000,
        windowSeconds: 3600,
        blockAction: 'reject',
      });
      break;

    case 'open':
      // No restrictions
      break;
  }
}
