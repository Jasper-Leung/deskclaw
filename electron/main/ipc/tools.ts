import type { Database } from 'better-sqlite3';
import { executeTool, getAvailableTools, getTool, getToolsSchema } from '../tools/index.js';
import * as permissions from '../tools/permissions.js';
import * as marketplace from '../tools/marketplace.js';
import * as monitor from '../tools/monitor.js';

// ============================================================================
// LEGACY TOOL HANDLERS (Backward compatibility)
// ============================================================================

export const listTools = () => {
  const tools = getAvailableTools();
  // Return only serializable properties (exclude handler function)
  return Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => [
      name,
      {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    ])
  );
};

export const getToolSchema = () => {
  return getToolsSchema();
};

export const executeToolRequest = async (name: string, params: Record<string, unknown>) => {
  return await executeTool(name, params);
};

// ============================================================================
// TOOL MARKETPLACE HANDLERS
// ============================================================================

export const toolsMarketplaceList = (db: Database, params?: marketplace.ToolSearchParams) => {
  return marketplace.listTools(db, params);
};

export const toolsMarketplaceGet = (db: Database, toolId: string) => {
  return marketplace.getTool(db, toolId);
};

export const toolsMarketplaceGetByName = (db: Database, name: string) => {
  return marketplace.getToolByName(db, name);
};

export const toolsMarketplaceUpsert = (
  db: Database,
  tool: Omit<marketplace.Tool, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
) => {
  return marketplace.upsertTool(db, tool);
};

export const toolsMarketplaceDelete = (db: Database, toolId: string) => {
  return marketplace.deleteTool(db, toolId);
};

export const toolsMarketplaceSetEnabled = (db: Database, toolId: string, enabled: boolean) => {
  return marketplace.setToolEnabled(db, toolId, enabled);
};

export const toolsMarketplaceGetByCategory = (db: Database, category: marketplace.ToolCategory) => {
  return marketplace.getToolsByCategory(db, category);
};

export const toolsMarketplaceGetEnabled = (db: Database) => {
  return marketplace.getEnabledTools(db);
};

export const toolsMarketplaceSearch = (db: Database, query: string, limit?: number) => {
  return marketplace.searchTools(db, query, limit);
};

export const toolsMarketplaceGetStats = (db: Database) => {
  return marketplace.getToolStats(db);
};

export const toolsMarketplaceImport = async (db: Database, directoryPath: string) => {
  return await marketplace.importToolsFromDirectory(db, directoryPath);
};

// ============================================================================
// TOOL PERMISSIONS HANDLERS
// ============================================================================

export const toolsPermissionsGetLevel = (db: Database, agentId: string, toolId: string) => {
  return permissions.getPermissionLevel(db, agentId, toolId);
};

export const toolsPermissionsSetLevel = (
  db: Database,
  agentId: string,
  toolId: string,
  level: permissions.PermissionLevel,
  maxCallsPerHour?: number
) => {
  return permissions.setPermissionLevel(db, agentId, toolId, level, maxCallsPerHour);
};

export const toolsPermissionsGetAgent = (db: Database, agentId: string) => {
  return permissions.getAgentPermissions(db, agentId);
};

export const toolsPermissionsGetTool = (db: Database, toolId: string) => {
  return permissions.getToolPermissions(db, toolId);
};

export const toolsPermissionsDelete = (db: Database, permissionId: string) => {
  return permissions.deletePermission(db, permissionId);
};

export const toolsPermissionsCheck = (db: Database, agentId: string, toolId: string) => {
  return permissions.checkToolExecution(db, agentId, toolId);
};

export const toolsPermissionsGetStats = (
  db: Database,
  agentId: string,
  toolId: string,
  timeRange?: number
) => {
  return permissions.getExecutionStats(db, agentId, toolId, timeRange);
};

export const toolsPermissionsBatchSet = (
  db: Database,
  agentId: string,
  perms: Array<{ toolId: string; level: permissions.PermissionLevel; maxCallsPerHour?: number }>
) => {
  return permissions.batchSetPermissions(db, agentId, perms);
};

export const toolsPermissionsResetAgent = (db: Database, agentId: string) => {
  return permissions.resetAgentPermissions(db, agentId);
};

// ============================================================================
// TOOL MONITORING HANDLERS
// ============================================================================

export const toolsMonitorLog = (
  db: Database,
  execution: Omit<monitor.ToolExecutionLog, 'id' | 'timestamp'>
) => {
  return monitor.logToolExecution(db, execution);
};

export const toolsMonitorGetToolLogs = (
  db: Database,
  toolId: string,
  limit?: number,
  offset?: number
) => {
  return monitor.getToolExecutionLogs(db, toolId, limit, offset);
};

export const toolsMonitorGetAgentLogs = (
  db: Database,
  agentId: string,
  limit?: number,
  offset?: number
) => {
  return monitor.getAgentExecutionLogs(db, agentId, limit, offset);
};

export const toolsMonitorGetSessionLogs = (
  db: Database,
  sessionId: string,
  limit?: number,
  offset?: number
) => {
  return monitor.getSessionExecutionLogs(db, sessionId, limit, offset);
};

export const toolsMonitorGetMetrics = (db: Database, toolId: string, timeRange?: number) => {
  return monitor.getToolMetrics(db, toolId, timeRange);
};

export const toolsMonitorGetUsageStats = (db: Database, timeRange?: number, limit?: number) => {
  return monitor.getToolUsageStats(db, timeRange, limit);
};

export const toolsMonitorGetRecent = (db: Database, limit?: number, offset?: number) => {
  return monitor.getRecentExecutions(db, limit, offset);
};

export const toolsMonitorQuery = (
  db: Database,
  filters: {
    toolId?: string;
    agentId?: string;
    sessionId?: string;
    status?: monitor.ExecutionStatus;
    startTime?: number;
    endTime?: number;
    limit?: number;
    offset?: number;
  }
) => {
  return monitor.queryExecutionLogs(db, filters);
};

export const toolsMonitorCleanup = (db: Database, olderThan?: number) => {
  return monitor.cleanupOldLogs(db, olderThan);
};

export const toolsMonitorGetByInterval = (
  db: Database,
  interval: 'hour' | 'day' | 'week',
  timeRange?: number
) => {
  return monitor.getExecutionCountByInterval(db, interval, timeRange);
};

export const toolsMonitorGetErrors = (db: Database, limit?: number, offset?: number) => {
  return monitor.getErrorLogs(db, limit, offset);
};

export const toolsMonitorGetTopTools = (db: Database, timeRange?: number, limit?: number) => {
  return monitor.getTopTools(db, timeRange, limit);
};
