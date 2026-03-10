/**
 * Permission Manager
 * Manages channel permissions and access control
 */

import type { Database } from 'better-sqlite3';
import { randomUUID } from 'crypto';

export type PermissionType =
  | 'allow_from'
  | 'block_from'
  | 'allow_command'
  | 'block_command'
  | 'allow_mention'
  | 'require_mention';

export interface ChannelPermission {
  id: string;
  channelId: string;
  permissionType: PermissionType;
  ruleValue: string;
  priority: number;
  createdAt: number;
}

/**
 * Create a channel permission
 */
export function createPermission(
  db: Database,
  permission: Omit<ChannelPermission, 'id' | 'createdAt'>
): ChannelPermission {
  const id = randomUUID();
  const now = Date.now();

  db.prepare(
    `INSERT INTO channel_permissions (id, channel_id, permission_type, rule_value, priority, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    permission.channelId,
    permission.permissionType,
    permission.ruleValue,
    permission.priority,
    now
  );

  return {
    ...permission,
    id,
    createdAt: now,
  };
}

/**
 * Get all permissions for a channel
 */
export function getChannelPermissions(db: Database, channelId: string): ChannelPermission[] {
  const results = db
    .prepare(
      'SELECT * FROM channel_permissions WHERE channel_id = ? ORDER BY priority DESC, created_at ASC'
    )
    .all(channelId) as any[];

  return results.map((row) => ({
    id: row.id,
    channelId: row.channel_id,
    permissionType: row.permission_type,
    ruleValue: row.rule_value,
    priority: row.priority,
    createdAt: row.created_at,
  }));
}

/**
 * Get permissions by type
 */
export function getPermissionsByType(
  db: Database,
  channelId: string,
  permissionType: PermissionType
): ChannelPermission[] {
  const results = db
    .prepare(
      'SELECT * FROM channel_permissions WHERE channel_id = ? AND permission_type = ? ORDER BY priority DESC'
    )
    .all(channelId, permissionType) as any[];

  return results.map((row) => ({
    id: row.id,
    channelId: row.channel_id,
    permissionType: row.permission_type,
    ruleValue: row.rule_value,
    priority: row.priority,
    createdAt: row.created_at,
  }));
}

/**
 * Update a permission
 */
export function updatePermission(
  db: Database,
  permissionId: string,
  updates: Partial<Omit<ChannelPermission, 'id' | 'createdAt' | 'channelId'>>
): ChannelPermission | undefined {
  const existing = db
    .prepare('SELECT * FROM channel_permissions WHERE id = ?')
    .get(permissionId) as any;
  if (!existing) return undefined;

  const fields: string[] = [];
  const values: any[] = [];

  if (updates.permissionType !== undefined) {
    fields.push('permission_type = ?');
    values.push(updates.permissionType);
  }
  if (updates.ruleValue !== undefined) {
    fields.push('rule_value = ?');
    values.push(updates.ruleValue);
  }
  if (updates.priority !== undefined) {
    fields.push('priority = ?');
    values.push(updates.priority);
  }

  if (fields.length === 0) return existing;

  values.push(permissionId);
  db.prepare(`UPDATE channel_permissions SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  return getPermission(db, permissionId);
}

/**
 * Get a permission by ID
 */
export function getPermission(db: Database, permissionId: string): ChannelPermission | undefined {
  const result = db
    .prepare('SELECT * FROM channel_permissions WHERE id = ?')
    .get(permissionId) as any;
  if (!result) return undefined;

  return {
    id: result.id,
    channelId: result.channel_id,
    permissionType: result.permission_type,
    ruleValue: result.rule_value,
    priority: result.priority,
    createdAt: result.created_at,
  };
}

/**
 * Delete a permission
 */
export function deletePermission(db: Database, permissionId: string): boolean {
  const result = db.prepare('DELETE FROM channel_permissions WHERE id = ?').run(permissionId);
  return result.changes > 0;
}

/**
 * Check if a peer is allowed to interact
 */
export function checkPermission(
  db: Database,
  channelId: string,
  peerId: string,
  permissionType: PermissionType,
  defaultValue: boolean = true
): boolean {
  const permissions = getPermissionsByType(db, channelId, permissionType);

  for (const permission of permissions) {
    // Check if rule matches peerId
    if (matchRule(permission.ruleValue, peerId)) {
      // For allow_* permissions, return true if matched
      if (permissionType.startsWith('allow_')) {
        return true;
      }
      // For block_* permissions, return false if matched
      if (permissionType.startsWith('block_')) {
        return false;
      }
    }
  }

  return defaultValue;
}

/**
 * Check if a command is allowed
 */
export function checkCommandPermission(
  db: Database,
  channelId: string,
  command: string,
  peerId: string
): { allowed: boolean; reason?: string } {
  // Check blocked commands first
  const blockedCommands = getPermissionsByType(db, channelId, 'block_command');
  for (const perm of blockedCommands) {
    if (matchRule(perm.ruleValue, command)) {
      return {
        allowed: false,
        reason: `Command "${command}" is blocked`,
      };
    }
  }

  // Check allowed commands
  const allowedCommands = getPermissionsByType(db, channelId, 'allow_command');
  if (allowedCommands.length > 0) {
    for (const perm of allowedCommands) {
      if (matchRule(perm.ruleValue, command)) {
        return { allowed: true };
      }
    }
    // If there are allow rules but none matched, deny
    return {
      allowed: false,
      reason: `Command "${command}" is not in the allowed list`,
    };
  }

  // Default to allowed
  return { allowed: true };
}

/**
 * Check if a mention is allowed
 */
export function checkMentionPermission(
  db: Database,
  channelId: string,
  peerId: string,
  mentionType: 'user' | 'group' | 'all'
): { allowed: boolean; reason?: string } {
  // Check require_mention permissions
  const requireMentions = getPermissionsByType(db, channelId, 'require_mention');
  for (const perm of requireMentions) {
    if (perm.ruleValue === 'admin' && !isAdmin(db, channelId, peerId)) {
      return {
        allowed: false,
        reason: 'Only admins can use mentions',
      };
    }
  }

  // Check allow_mention permissions
  const allowMentions = getPermissionsByType(db, channelId, 'allow_mention');
  if (allowMentions.length > 0) {
    for (const perm of allowMentions) {
      if (matchRule(perm.ruleValue, peerId)) {
        return { allowed: true };
      }
    }
    return {
      allowed: false,
      reason: 'You are not allowed to use mentions',
    };
  }

  return { allowed: true };
}

/**
 * Batch create permissions
 */
export function batchCreatePermissions(
  db: Database,
  channelId: string,
  permissions: Array<{ permissionType: PermissionType; ruleValue: string; priority?: number }>
): ChannelPermission[] {
  const results: ChannelPermission[] = [];

  for (const perm of permissions) {
    const result = createPermission(db, {
      channelId,
      permissionType: perm.permissionType,
      ruleValue: perm.ruleValue,
      priority: perm.priority || 0,
    });
    results.push(result);
  }

  return results;
}

/**
 * Delete all permissions for a channel
 */
export function clearChannelPermissions(db: Database, channelId: string): number {
  const result = db.prepare('DELETE FROM channel_permissions WHERE channel_id = ?').run(channelId);
  return result.changes;
}

/**
 * Get permission summary for a channel
 */
export function getPermissionSummary(
  db: Database,
  channelId: string
): {
  totalPermissions: number;
  permissionsByType: Record<PermissionType, number>;
  highPriorityRules: ChannelPermission[];
} {
  const allPermissions = getChannelPermissions(db, channelId);

  const permissionsByType: Record<string, number> = {};
  for (const type of [
    'allow_from',
    'block_from',
    'allow_command',
    'block_command',
    'allow_mention',
    'require_mention',
  ]) {
    permissionsByType[type] = allPermissions.filter((p) => p.permissionType === type).length;
  }

  const highPriorityRules = allPermissions.filter((p) => p.priority > 50).slice(0, 10);

  return {
    totalPermissions: allPermissions.length,
    permissionsByType: permissionsByType as Record<PermissionType, number>,
    highPriorityRules,
  };
}

/**
 * Helper: Check if a rule matches a value
 */
function matchRule(rule: string, value: string): boolean {
  // Exact match
  if (rule === value) return true;

  // Wildcard match (supports * and ?)
  const regexPattern = rule.replace(/\*/g, '.*').replace(/\?/g, '.');
  try {
    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(value);
  } catch {
    return false;
  }
}

/**
 * Helper: Check if peer is admin (placeholder)
 */
function isAdmin(db: Database, channelId: string, peerId: string): boolean {
  // This would check against channel-specific admin lists
  // For now, return false
  return false;
}

/**
 * Reorder permissions by priority
 */
export function reorderPermissions(db: Database, permissionIds: string[]): void {
  const stmt = db.prepare('UPDATE channel_permissions SET priority = ? WHERE id = ?');

  const transaction = db.transaction(() => {
    // Higher priority = higher number
    permissionIds.forEach((id, index) => {
      const priority = permissionIds.length - index;
      stmt.run(priority, id);
    });
  });

  transaction();
}

/**
 * Export permissions for a channel
 */
export function exportPermissions(db: Database, channelId: string): ChannelPermission[] {
  return getChannelPermissions(db, channelId);
}

/**
 * Import permissions for a channel
 */
export function importPermissions(
  db: Database,
  channelId: string,
  permissions: Array<{ permissionType: PermissionType; ruleValue: string; priority?: number }>
): ChannelPermission[] {
  // Clear existing permissions
  clearChannelPermissions(db, channelId);

  // Import new permissions
  return batchCreatePermissions(db, channelId, permissions);
}
