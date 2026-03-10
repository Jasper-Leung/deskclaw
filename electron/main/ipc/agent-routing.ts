/**
 * IPC Handlers for Agent Routing and Coordination
 */

import type { Database } from 'better-sqlite3';
import * as router from '../agents/agent-router.js';
import * as specialization from '../agents/specialization.js';
import * as coordinator from '../agents/coordinator.js';

// ============================================================================
// AGENT ROUTING HANDLERS
// ============================================================================

export const agentRoutingCreateRule = (
  db: Database,
  rule: Omit<router.AgentRoutingRule, 'id' | 'createdAt' | 'updatedAt'>
) => {
  return router.createRoutingRule(db, rule);
};

export const agentRoutingUpdateRule = (
  db: Database,
  ruleId: string,
  updates: Partial<Omit<router.AgentRoutingRule, 'id' | 'createdAt' | 'updatedAt'>>
) => {
  return router.updateRoutingRule(db, ruleId, updates);
};

export const agentRoutingDeleteRule = (db: Database, ruleId: string) => {
  return router.deleteRoutingRule(db, ruleId);
};

export const agentRoutingGetRules = (db: Database, enabledOnly?: boolean) => {
  return router.getRoutingRules(db, enabledOnly);
};

export const agentRoutingGetAgentRules = (db: Database, agentId: string) => {
  return router.getAgentRoutingRules(db, agentId);
};

export const agentRoutingGetRule = (db: Database, ruleId: string) => {
  return router.getRoutingRule(db, ruleId);
};

export const agentRoutingRoute = (
  db: Database,
  message: { content: string; channelType?: string; senderId?: string; sessionId?: string },
  fallbackAgentId?: string
) => {
  return router.routeMessage(db, message, fallbackAgentId);
};

export const agentRoutingReorder = (db: Database, ruleIds: string[]) => {
  return router.reorderRoutingRules(db, ruleIds);
};

export const agentRoutingSetEnabled = (db: Database, ruleId: string, enabled: boolean) => {
  return router.setRoutingRuleEnabled(db, ruleId, enabled);
};

export const agentRoutingTest = (
  db: Database,
  ruleId: string,
  message: { content: string; channelType?: string; senderId?: string }
) => {
  return router.testRoutingRule(db, ruleId, message);
};

export const agentRoutingGetStats = (db: Database) => {
  return router.getRoutingStats(db);
};

// ============================================================================
// AGENT SPECIALIZATION HANDLERS
// ============================================================================

export const agentSpecializationCreate = (
  db: Database,
  spec: Omit<specialization.AgentSpecialization, 'id' | 'createdAt' | 'updatedAt'>
) => {
  return specialization.createSpecialization(db, spec);
};

export const agentSpecializationGetTemplate = (name: string) => {
  return specialization.getTemplate(name);
};

export const agentSpecializationGetTemplates = () => {
  return specialization.getTemplates();
};

export const agentSpecializationCreateFromTemplate = (
  db: Database,
  agentId: string,
  templateName: string,
  customName?: string
) => {
  return specialization.createFromTemplate(db, agentId, templateName, customName);
};

export const agentSpecializationUpdateCapabilities = (
  db: Database,
  agentId: string,
  capabilities: specialization.AgentCapability[]
) => {
  return specialization.updateCapabilities(db, agentId, capabilities);
};

export const agentSpecializationGetCapabilities = (db: Database, agentId: string) => {
  return specialization.getCapabilities(db, agentId);
};

export const agentSpecializationHasCapability = (
  db: Database,
  agentId: string,
  capability: specialization.AgentCapability
) => {
  return specialization.hasCapability(db, agentId, capability);
};

export const agentSpecializationFindBestAgent = (
  db: Database,
  task: {
    type: string;
    description: string;
    requiredCapabilities?: specialization.AgentCapability[];
  },
  agentIds?: string[]
) => {
  return specialization.findBestAgentForTask(db, task, agentIds);
};

export const agentSpecializationAddTrainingExample = (
  db: Database,
  agentId: string,
  example: { input: string; output: string; context?: string }
) => {
  return specialization.addTrainingExample(db, agentId, example);
};

export const agentSpecializationGetTrainingExamples = (db: Database, agentId: string) => {
  return specialization.getTrainingExamples(db, agentId);
};

export const agentSpecializationClearTrainingExamples = (db: Database, agentId: string) => {
  return specialization.clearTrainingExamples(db, agentId);
};

// ============================================================================
// AGENT COORDINATION HANDLERS
// ============================================================================

export const agentCoordinationRecordHandoff = (
  db: Database,
  handoff: Omit<coordinator.AgentHandoff, 'id' | 'timestamp'>
) => {
  return coordinator.recordHandoff(db, handoff);
};

export const agentCoordinationGetSessionHandoffs = (db: Database, sessionId: string) => {
  return coordinator.getSessionHandoffs(db, sessionId);
};

export const agentCoordinationGetAgentHandoffs = (db: Database, agentId: string) => {
  return coordinator.getAgentHandoffs(db, agentId);
};

export const agentCoordinationGetRecentHandoffs = (
  db: Database,
  limit?: number,
  offset?: number
) => {
  return coordinator.getRecentHandoffs(db, limit, offset);
};

export const agentCoordinationExecuteHandoff = async (
  db: Database,
  sessionId: string,
  fromAgentId: string,
  toAgentId: string,
  reason: string,
  context: coordinator.HandoffContext
) => {
  return await coordinator.executeHandoff(db, sessionId, fromAgentId, toAgentId, reason, context);
};

export const agentCoordinationSuggestHandoff = (
  db: Database,
  sessionId: string,
  currentAgentId: string,
  messageContent: string
) => {
  return coordinator.suggestHandoff(db, sessionId, currentAgentId, messageContent);
};

export const agentCoordinationGetStats = (db: Database, timeRange?: number) => {
  return coordinator.getHandoffStats(db, timeRange);
};

export const agentCoordinationCreateContext = (
  messages: Array<{ role: string; content: string }>,
  maxMessages?: number
) => {
  return coordinator.createHandoffContext(messages, maxMessages);
};

export const agentCoordinationGetHandoffChain = (db: Database, sessionId: string) => {
  return coordinator.getHandoffChain(db, sessionId);
};

export const agentCoordinationGetCurrentAgent = (db: Database, sessionId: string) => {
  return coordinator.getCurrentAgent(db, sessionId);
};

export const agentCoordinationHasMultipleAgents = (db: Database, sessionId: string) => {
  return coordinator.hasMultipleAgents(db, sessionId);
};

export const agentCoordinationGetCollaborationNetwork = (db: Database, timeRange?: number) => {
  return coordinator.getCollaborationNetwork(db, timeRange);
};

export const agentCoordinationCleanup = (db: Database, olderThan?: number) => {
  return coordinator.cleanupOldHandoffs(db, olderThan);
};
