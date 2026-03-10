/**
 * IPC Handlers for Permission Control System
 */

import type { Database } from 'better-sqlite3';
import * as manager from '../permissions/manager.js';
import * as rateLimiter from '../permissions/rate-limiter.js';
import * as evaluator from '../permissions/evaluator.js';

// ============================================================================
// PERMISSION MANAGER HANDLERS
// ============================================================================

export const permissionsCreate = (
  db: Database,
  permission: Omit<manager.ChannelPermission, 'id' | 'createdAt'>
) => {
  return manager.createPermission(db, permission);
};

export const permissionsGetChannel = (db: Database, channelId: string) => {
  return manager.getChannelPermissions(db, channelId);
};

export const permissionsGetByType = (
  db: Database,
  channelId: string,
  type: manager.PermissionType
) => {
  return manager.getPermissionsByType(db, channelId, type);
};

export const permissionsUpdate = (
  db: Database,
  permissionId: string,
  updates: Partial<Omit<manager.ChannelPermission, 'id' | 'createdAt' | 'channelId'>>
) => {
  return manager.updatePermission(db, permissionId, updates);
};

export const permissionsGet = (db: Database, permissionId: string) => {
  return manager.getPermission(db, permissionId);
};

export const permissionsDelete = (db: Database, permissionId: string) => {
  return manager.deletePermission(db, permissionId);
};

export const permissionsCheck = (
  db: Database,
  channelId: string,
  peerId: string,
  permissionType: manager.PermissionType,
  defaultValue?: boolean
) => {
  return manager.checkPermission(db, channelId, peerId, permissionType, defaultValue);
};

export const permissionsCheckCommand = (
  db: Database,
  channelId: string,
  command: string,
  peerId: string
) => {
  return manager.checkCommandPermission(db, channelId, command, peerId);
};

export const permissionsCheckMention = (
  db: Database,
  channelId: string,
  peerId: string,
  mentionType: 'user' | 'group' | 'all'
) => {
  return manager.checkMentionPermission(db, channelId, peerId, mentionType);
};

export const permissionsBatchCreate = (
  db: Database,
  channelId: string,
  permissions: Array<{
    permissionType: manager.PermissionType;
    ruleValue: string;
    priority?: number;
  }>
) => {
  return manager.batchCreatePermissions(db, channelId, permissions);
};

export const permissionsClearChannel = (db: Database, channelId: string) => {
  return manager.clearChannelPermissions(db, channelId);
};

export const permissionsGetSummary = (db: Database, channelId: string) => {
  return manager.getPermissionSummary(db, channelId);
};

export const permissionsReorder = (db: Database, permissionIds: string[]) => {
  return manager.reorderPermissions(db, permissionIds);
};

export const permissionsExport = (db: Database, channelId: string) => {
  return manager.exportPermissions(db, channelId);
};

export const permissionsImport = (
  db: Database,
  channelId: string,
  permissions: Array<{
    permissionType: manager.PermissionType;
    ruleValue: string;
    priority?: number;
  }>
) => {
  return manager.importPermissions(db, channelId, permissions);
};

// ============================================================================
// RATE LIMITER HANDLERS
// ============================================================================

export const rateLimitCreate = (
  db: Database,
  rule: Omit<rateLimiter.RateLimitRule, 'id' | 'createdAt'>
) => {
  return rateLimiter.createRateLimitRule(db, rule);
};

export const rateLimitGetChannel = (db: Database, channelId: string) => {
  return rateLimiter.getRateLimitRules(db, channelId);
};

export const rateLimitGet = (db: Database, ruleId: string) => {
  return rateLimiter.getRateLimitRule(db, ruleId);
};

export const rateLimitUpdate = (
  db: Database,
  ruleId: string,
  updates: Partial<Omit<rateLimiter.RateLimitRule, 'id' | 'createdAt' | 'channelId'>>
) => {
  return rateLimiter.updateRateLimitRule(db, ruleId, updates);
};

export const rateLimitDelete = (db: Database, ruleId: string) => {
  return rateLimiter.deleteRateLimitRule(db, ruleId);
};

export const rateLimitCheck = (
  db: Database,
  channelId: string,
  identifier?: string,
  command?: string
) => {
  return rateLimiter.checkRateLimit(db, channelId, identifier, command);
};

export const rateLimitGetStats = (db: Database, channelId: string) => {
  return rateLimiter.getRateLimitStats(db, channelId);
};

export const rateLimitClearCache = (channelId?: string) => {
  return rateLimiter.clearRateLimitCache(channelId);
};

export const rateLimitGetUsage = (
  db: Database,
  channelId: string,
  limitType: rateLimiter.LimitType,
  identifier?: string
) => {
  return rateLimiter.getRateLimitUsage(db, channelId, limitType, identifier);
};

export const rateLimitCleanupCache = () => {
  return rateLimiter.cleanupExpiredCache();
};

// ============================================================================
// PERMISSION EVALUATOR HANDLERS
// ============================================================================

export const permissionsEvaluateAccess = (
  db: Database,
  channelId: string,
  peerId: string,
  content: string,
  isCommand?: boolean
) => {
  return evaluator.evaluateAccess(db, channelId, peerId, content, isCommand);
};

export const permissionsCreateGroupMentionRule = (
  db: Database,
  rule: Omit<evaluator.GroupMentionRule, 'id' | 'createdAt'>
) => {
  return evaluator.createGroupMentionRule(db, rule);
};

export const permissionsGetGroupMentionRules = (db: Database, channelId: string) => {
  return evaluator.getGroupMentionRules(db, channelId);
};

export const permissionsCheckGroupMention = (
  db: Database,
  channelId: string,
  peerId: string,
  groupPattern: string
) => {
  return evaluator.checkGroupMentionAllowed(db, channelId, peerId, groupPattern);
};

export const permissionsDeleteGroupMentionRule = (db: Database, ruleId: string) => {
  return evaluator.deleteGroupMentionRule(db, ruleId);
};

export const permissionsGetReport = (db: Database, channelId: string) => {
  return evaluator.getPermissionReport(db, channelId);
};

export const permissionsValidateConfig = (config: {
  permissions?: Array<{ type: manager.PermissionType; value: string }>;
  rateLimits?: Array<{ type: rateLimiter.LimitType; max: number; window: number }>;
}) => {
  return evaluator.validatePermissionConfig(config);
};

export const permissionsApplyPreset = (
  db: Database,
  channelId: string,
  preset: 'strict' | 'moderate' | 'open'
) => {
  return evaluator.applyPermissionPreset(db, channelId, preset);
};
