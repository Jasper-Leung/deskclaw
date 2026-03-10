/**
 * Tool Permission System
 * Manages agent tool permissions and access control
 */

import type { Database } from 'better-sqlite3';
import { randomUUID } from 'crypto';

export type PermissionLevel = 'allowed' | 'require_approval' | 'blocked';

export interface AgentToolPermission {
  id: string;
  agentId: string;
  toolId: string;
  permissionLevel: PermissionLevel;
  maxCallsPerHour: number;
  createdAt: number;
  updatedAt: number;
}

export interface ToolExecutionCheck {
  allowed: boolean;
  requiresApproval: boolean;
  reason?: string;
  remainingCalls?: number;
}

/**
 * Get permission level for an agent-tool pair
 */
export function getPermissionLevel(db: Database, agentId: string, toolId: string): PermissionLevel {
  const result = db
    .prepare(
      'SELECT permission_level FROM agent_tool_permissions WHERE agent_id = ? AND tool_id = ?'
    )
    .get(agentId, toolId) as { permission_level: PermissionLevel } | undefined;

  return result?.permission_level || 'allowed';
}

/**
 * Set permission level for an agent-tool pair
 */
export function setPermissionLevel(
  db: Database,
  agentId: string,
  toolId: string,
  level: PermissionLevel,
  maxCallsPerHour: number = 100
): AgentToolPermission {
  const now = Date.now();
  const id = randomUUID();

  const existing = db
    .prepare('SELECT id FROM agent_tool_permissions WHERE agent_id = ? AND tool_id = ?')
    .get(agentId, toolId) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE agent_tool_permissions
       SET permission_level = ?, max_calls_per_hour = ?, updated_at = ?
       WHERE id = ?`
    ).run(level, maxCallsPerHour, now, existing.id);

    return {
      id: existing.id,
      agentId,
      toolId,
      permissionLevel: level,
      maxCallsPerHour,
      createdAt: now,
      updatedAt: now,
    };
  }

  db.prepare(
    `INSERT INTO agent_tool_permissions (id, agent_id, tool_id, permission_level, max_calls_per_hour, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, agentId, toolId, level, maxCallsPerHour, now, now);

  return {
    id,
    agentId,
    toolId,
    permissionLevel: level,
    maxCallsPerHour,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Get all permissions for an agent
 */
export function getAgentPermissions(db: Database, agentId: string): AgentToolPermission[] {
  const results = db
    .prepare('SELECT * FROM agent_tool_permissions WHERE agent_id = ? ORDER BY created_at DESC')
    .all(agentId) as any[];

  return results.map((row) => ({
    id: row.id,
    agentId: row.agent_id,
    toolId: row.tool_id,
    permissionLevel: row.permission_level,
    maxCallsPerHour: row.max_calls_per_hour,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Get all permissions for a tool
 */
export function getToolPermissions(db: Database, toolId: string): AgentToolPermission[] {
  const results = db
    .prepare('SELECT * FROM agent_tool_permissions WHERE tool_id = ? ORDER BY created_at DESC')
    .all(toolId) as any[];

  return results.map((row) => ({
    id: row.id,
    agentId: row.agent_id,
    toolId: row.tool_id,
    permissionLevel: row.permission_level,
    maxCallsPerHour: row.max_calls_per_hour,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Delete a permission
 */
export function deletePermission(db: Database, permissionId: string): boolean {
  const result = db.prepare('DELETE FROM agent_tool_permissions WHERE id = ?').run(permissionId);
  return result.changes > 0;
}

/**
 * Check if an agent can execute a tool
 */
export function checkToolExecution(
  db: Database,
  agentId: string,
  toolId: string
): ToolExecutionCheck {
  const permission = getPermissionLevel(db, agentId, toolId);

  if (permission === 'blocked') {
    return {
      allowed: false,
      requiresApproval: false,
      reason: 'Tool is blocked for this agent',
    };
  }

  if (permission === 'require_approval') {
    return {
      allowed: false,
      requiresApproval: true,
      reason: 'Tool requires approval for this agent',
    };
  }

  // Check rate limit
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const recentCalls = db
    .prepare(
      `SELECT COUNT(*) as count FROM tool_executions
       WHERE tool_id = ? AND agent_id = ? AND timestamp > ? AND status = 'success'`
    )
    .get(toolId, agentId, oneHourAgo) as { count: number };

  const limit = db
    .prepare(
      'SELECT max_calls_per_hour FROM agent_tool_permissions WHERE agent_id = ? AND tool_id = ?'
    )
    .get(agentId, toolId) as { max_calls_per_hour: number } | undefined;

  const maxCalls = limit?.max_calls_per_hour || 100;
  const remainingCalls = Math.max(0, maxCalls - recentCalls.count);

  if (remainingCalls === 0) {
    return {
      allowed: false,
      requiresApproval: false,
      reason: 'Rate limit exceeded',
      remainingCalls: 0,
    };
  }

  return {
    allowed: true,
    requiresApproval: false,
    remainingCalls,
  };
}

/**
 * Get execution statistics for an agent-tool pair
 */
export function getExecutionStats(
  db: Database,
  agentId: string,
  toolId: string,
  timeRange: number = 24 * 60 * 60 * 1000 // Default 24 hours
): {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  blockedExecutions: number;
  avgExecutionTime: number;
} {
  const since = Date.now() - timeRange;

  const stats = db
    .prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as blocked,
        AVG(execution_time_ms) as avg_time
       FROM tool_executions
       WHERE tool_id = ? AND agent_id = ? AND timestamp > ?`
    )
    .get(toolId, agentId, since) as any;

  return {
    totalExecutions: stats.total || 0,
    successfulExecutions: stats.successful || 0,
    failedExecutions: stats.failed || 0,
    blockedExecutions: stats.blocked || 0,
    avgExecutionTime: stats.avg_time || 0,
  };
}

/**
 * Batch set permissions for an agent
 */
export function batchSetPermissions(
  db: Database,
  agentId: string,
  permissions: Array<{ toolId: string; level: PermissionLevel; maxCallsPerHour?: number }>
): AgentToolPermission[] {
  const results: AgentToolPermission[] = [];

  for (const perm of permissions) {
    const result = setPermissionLevel(db, agentId, perm.toolId, perm.level, perm.maxCallsPerHour);
    results.push(result);
  }

  return results;
}

/**
 * Reset all permissions for an agent to default
 */
export function resetAgentPermissions(db: Database, agentId: string): void {
  db.prepare('DELETE FROM agent_tool_permissions WHERE agent_id = ?').run(agentId);
}
