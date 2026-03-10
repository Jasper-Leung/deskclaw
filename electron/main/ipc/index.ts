import { ipcMain, BrowserWindow, dialog, clipboard } from 'electron';
import Database from 'better-sqlite3';
import { getDatabase } from '../db/index.js';
import * as providersHandlers from './providers.js';
import * as modelsHandlers from './models.js';
import * as agentsHandlers from './agents.js';
import * as sessionsHandlers from './sessions.js';
import * as workflowsHandlers from './workflows.js';
import * as workflowsGeneratorHandlers from './workflows-generator.js';
import * as skillsHandlers from './skills.js';
import * as shellHandlers from './shell.js';
import * as llmHandlers from './llm.js';
import * as llmEnhancedHandlers from './llm-enhanced.js';
import * as memoryHandlers from './memory.js';
import * as memoryEnhancedHandlers from './memory-enhanced.js';
import * as memorySmartHandlers from './memory-smart.js';
import * as scheduledHandlers from './scheduled.js';
import * as toolsHandlers from './tools.js';
import * as workflowsAutoHandlers from './workflows-auto.js';
import * as channelsHandlers from './channels.js';
import * as browserHandlers from './browser.js';
import * as extensionBridgeHandlers from './extension-bridge.js';
import * as quickChatHandlers from './quick-chat.js';
import { registerGatewayIPCHandlers, setGatewayMainWindow } from './gateway.js';
import { registerEvolutionHandlers } from './evolution.js';

let mainWindow: BrowserWindow | null = null;

export const setMainWindow = (window: BrowserWindow | null) => {
  mainWindow = window;
  shellHandlers.setShellMainWindow?.(window);
  channelsHandlers.setChannelsMainWindow(window);
  setGatewayMainWindow(window);
};

export const registerIPCHandlers = (): void => {
  const db = getDatabase();

  // Providers
  ipcMain.handle('providers:list', () => providersHandlers.listProviders(db));
  ipcMain.handle('providers:create', (_, data) => providersHandlers.createProvider(db, data));
  ipcMain.handle('providers:update', (_, id, data) =>
    providersHandlers.updateProvider(db, id, data)
  );
  ipcMain.handle('providers:delete', (_, id) => providersHandlers.deleteProvider(db, id));
  ipcMain.handle('providers:test', (_, id) => providersHandlers.testProvider(db, id));
  ipcMain.handle('providers:testModel', (_, data) =>
    providersHandlers.testModelConnection(db, data)
  );

  // Models
  ipcMain.handle('models:list', () => modelsHandlers.listModels(db));
  ipcMain.handle('models:create', (_, data) => modelsHandlers.createModel(db, data));
  ipcMain.handle('models:delete', (_, id) => modelsHandlers.deleteModel(db, id));

  // Agents
  ipcMain.handle('agents:list', () => agentsHandlers.listAgents(db));
  ipcMain.handle('agents:get', (_, id) => agentsHandlers.getAgent(db, id));
  ipcMain.handle('agents:create', (_, data) => agentsHandlers.createAgent(db, data));
  ipcMain.handle('agents:update', (_, id, data) => agentsHandlers.updateAgent(db, id, data));
  ipcMain.handle('agents:delete', (_, id) => agentsHandlers.deleteAgent(db, id));

  // Sessions
  ipcMain.handle('sessions:list', () => sessionsHandlers.listSessions(db));
  ipcMain.handle('sessions:get', (_, id) => sessionsHandlers.getSession(db, id));
  ipcMain.handle('sessions:create', (_, data) => sessionsHandlers.createSession(db, data));
  ipcMain.handle('sessions:append', (_, id, message) =>
    sessionsHandlers.appendMessage(db, id, message)
  );
  ipcMain.handle('sessions:update', (_, id, data) => sessionsHandlers.updateSession(db, id, data));
  ipcMain.handle('sessions:delete', (_, id) => sessionsHandlers.deleteSession(db, id));

  // Workflows
  ipcMain.handle('workflows:list', () => workflowsHandlers.listWorkflows(db));
  ipcMain.handle('workflows:get', (_, id) => workflowsHandlers.getWorkflow(db, id));
  ipcMain.handle('workflows:create', (_, data) => workflowsHandlers.createWorkflow(db, data));
  ipcMain.handle('workflows:update', (_, id, data) =>
    workflowsHandlers.updateWorkflow(db, id, data)
  );
  ipcMain.handle('workflows:delete', (_, id) => workflowsHandlers.deleteWorkflow(db, id));
  ipcMain.handle('workflows:execute', (_, id) => workflowsHandlers.executeWorkflow(db, id));
  ipcMain.handle('workflows:verify', () => workflowsHandlers.verifyWorkflows());

  // Auto Workflows
  ipcMain.handle('workflows:auto:execute', (_, request) =>
    workflowsAutoHandlers.autoExecuteWorkflow(db, request, mainWindow)
  );
  ipcMain.handle('workflows:auto:preview', (_, userMessage) =>
    workflowsAutoHandlers.previewWorkflowMatch(db, userMessage)
  );

  // AI Workflow Generator
  ipcMain.handle('workflows:generate', (_, description, modelId) =>
    workflowsGeneratorHandlers.generateWorkflow(db, description, modelId)
  );
  ipcMain.handle('workflows:refine', (_, workflow, feedback, modelId) =>
    workflowsGeneratorHandlers.refineWorkflow(db, workflow, feedback, modelId)
  );
  ipcMain.handle('workflows:explain', (_, workflow, modelId) =>
    workflowsGeneratorHandlers.explainWorkflow(db, workflow, modelId)
  );
  ipcMain.handle('workflows:saveGenerated', (_, workflow) =>
    workflowsGeneratorHandlers.saveGeneratedWorkflow(db, workflow)
  );

  // Skills
  ipcMain.handle('skills:list', () => skillsHandlers.listSkills(db));
  ipcMain.handle('skills:get', (_, id) => skillsHandlers.getSkill(db, id));
  ipcMain.handle('skills:create', (_, data) => skillsHandlers.createSkill(db, data));
  ipcMain.handle('skills:update', (_, id, data) => skillsHandlers.updateSkill(db, id, data));
  ipcMain.handle('skills:delete', (_, id) => skillsHandlers.deleteSkill(db, id));
  ipcMain.handle('skills:execute', (_, id, options) =>
    skillsHandlers.executeSkill(db, id, options)
  );
  ipcMain.handle('skills:executeWithProgress', async (event, id, options) => {
    const progressCallback = (progress: { type: string; message: string; data?: unknown }) => {
      event.sender.send('skills:progress', { skillId: id, progress });
    };
    return await skillsHandlers.executeSkill(db, id, { ...options, onProgress: progressCallback });
  });
  ipcMain.handle('skills:import', (_, dirPath) => skillsHandlers.importSkill(db, dirPath));
  ipcMain.handle('skills:importDir', (_, dirPath) =>
    skillsHandlers.importSkillsFromDir(db, dirPath)
  );
  ipcMain.handle('skills:content', (_, id) => skillsHandlers.getSkillContent(db, id));
  ipcMain.handle('skills:search', (_, query) => skillsHandlers.searchSkills(db, query));
  ipcMain.handle('skills:byDomain', (_, domain) => skillsHandlers.getSkillsByDomain(db, domain));
  ipcMain.handle('skills:enabled', () => skillsHandlers.getEnabledSkills(db));
  ipcMain.handle('skills:checkDeps', (_, id) => skillsHandlers.checkDependencies(db, id));
  ipcMain.handle('skills:installDeps', (_, id) => skillsHandlers.installDependencies(db, id));

  // Shell
  ipcMain.handle('shell:execute', (_, command, options) =>
    shellHandlers.executeShell(command, options)
  );
  ipcMain.handle('shell:approve', (_, approvalId) => shellHandlers.approveCommand(approvalId));
  ipcMain.handle('shell:reject', (_, approvalId) => shellHandlers.rejectCommand(approvalId));

  // LLM
  ipcMain.handle('llm:chat', (_, request) => llmHandlers.chat(db, request));
  ipcMain.handle('llm:stream', (_, request) => llmHandlers.chatStream(db, request, mainWindow));

  // LLM Enhanced (with Memory Integration)
  ipcMain.handle('llm:chat:withMemory', (_, request, memoryOptions) =>
    llmEnhancedHandlers.chat(db, request, memoryOptions)
  );
  ipcMain.handle('llm:stream:withMemory', (_, request, memoryOptions) =>
    llmEnhancedHandlers.chatStream(db, request, mainWindow, memoryOptions)
  );
  ipcMain.handle('llm:chat:withMemoryContext', (_, request, memoryOptions) =>
    llmEnhancedHandlers.chatWithMemoryContext(db, request, memoryOptions)
  );
  ipcMain.handle('llm:getMemoryPreview', (_, agentId, query, options) =>
    llmEnhancedHandlers.getMemoryPreview(db, agentId, query, options)
  );

  // Tools
  ipcMain.handle('tools:list', () => toolsHandlers.listTools());
  ipcMain.handle('tools:schema', () => toolsHandlers.getToolSchema());
  ipcMain.handle('tools:execute', (_, name, params) =>
    toolsHandlers.executeToolRequest(name, params)
  );

  // Tools Marketplace
  ipcMain.handle('tools:marketplace:list', (_, params) =>
    toolsHandlers.toolsMarketplaceList(db, params)
  );
  ipcMain.handle('tools:marketplace:get', (_, id) => toolsHandlers.toolsMarketplaceGet(db, id));
  ipcMain.handle('tools:marketplace:getByName', (_, name) =>
    toolsHandlers.toolsMarketplaceGetByName(db, name)
  );
  ipcMain.handle('tools:marketplace:upsert', (_, tool) =>
    toolsHandlers.toolsMarketplaceUpsert(db, tool)
  );
  ipcMain.handle('tools:marketplace:delete', (_, id) =>
    toolsHandlers.toolsMarketplaceDelete(db, id)
  );
  ipcMain.handle('tools:marketplace:setEnabled', (_, id, enabled) =>
    toolsHandlers.toolsMarketplaceSetEnabled(db, id, enabled)
  );
  ipcMain.handle('tools:marketplace:getByCategory', (_, category) =>
    toolsHandlers.toolsMarketplaceGetByCategory(db, category)
  );
  ipcMain.handle('tools:marketplace:getEnabled', () =>
    toolsHandlers.toolsMarketplaceGetEnabled(db)
  );
  ipcMain.handle('tools:marketplace:search', (_, query, limit) =>
    toolsHandlers.toolsMarketplaceSearch(db, query, limit)
  );
  ipcMain.handle('tools:marketplace:getStats', () => toolsHandlers.toolsMarketplaceGetStats(db));
  ipcMain.handle('tools:marketplace:import', (_, dir) =>
    toolsHandlers.toolsMarketplaceImport(db, dir)
  );

  // Tools Permissions
  ipcMain.handle('tools:permissions:getLevel', (_, agentId, toolId) =>
    toolsHandlers.toolsPermissionsGetLevel(db, agentId, toolId)
  );
  ipcMain.handle('tools:permissions:setLevel', (_, agentId, toolId, level, maxCalls) =>
    toolsHandlers.toolsPermissionsSetLevel(db, agentId, toolId, level, maxCalls)
  );
  ipcMain.handle('tools:permissions:getAgent', (_, agentId) =>
    toolsHandlers.toolsPermissionsGetAgent(db, agentId)
  );
  ipcMain.handle('tools:permissions:getTool', (_, toolId) =>
    toolsHandlers.toolsPermissionsGetTool(db, toolId)
  );
  ipcMain.handle('tools:permissions:delete', (_, id) =>
    toolsHandlers.toolsPermissionsDelete(db, id)
  );
  ipcMain.handle('tools:permissions:check', (_, agentId, toolId) =>
    toolsHandlers.toolsPermissionsCheck(db, agentId, toolId)
  );
  ipcMain.handle('tools:permissions:getStats', (_, agentId, toolId, timeRange) =>
    toolsHandlers.toolsPermissionsGetStats(db, agentId, toolId, timeRange)
  );
  ipcMain.handle('tools:permissions:batchSet', (_, agentId, perms) =>
    toolsHandlers.toolsPermissionsBatchSet(db, agentId, perms)
  );
  ipcMain.handle('tools:permissions:resetAgent', (_, agentId) =>
    toolsHandlers.toolsPermissionsResetAgent(db, agentId)
  );

  // Tools Monitoring
  ipcMain.handle('tools:monitor:log', (_, execution) =>
    toolsHandlers.toolsMonitorLog(db, execution)
  );
  ipcMain.handle('tools:monitor:getToolLogs', (_, toolId, limit, offset) =>
    toolsHandlers.toolsMonitorGetToolLogs(db, toolId, limit, offset)
  );
  ipcMain.handle('tools:monitor:getAgentLogs', (_, agentId, limit, offset) =>
    toolsHandlers.toolsMonitorGetAgentLogs(db, agentId, limit, offset)
  );
  ipcMain.handle('tools:monitor:getSessionLogs', (_, sessionId, limit, offset) =>
    toolsHandlers.toolsMonitorGetSessionLogs(db, sessionId, limit, offset)
  );
  ipcMain.handle('tools:monitor:getMetrics', (_, toolId, timeRange) =>
    toolsHandlers.toolsMonitorGetMetrics(db, toolId, timeRange)
  );
  ipcMain.handle('tools:monitor:getUsageStats', (_, timeRange, limit) =>
    toolsHandlers.toolsMonitorGetUsageStats(db, timeRange, limit)
  );
  ipcMain.handle('tools:monitor:getRecent', (_, limit, offset) =>
    toolsHandlers.toolsMonitorGetRecent(db, limit, offset)
  );
  ipcMain.handle('tools:monitor:query', (_, filters) =>
    toolsHandlers.toolsMonitorQuery(db, filters)
  );
  ipcMain.handle('tools:monitor:cleanup', (_, olderThan) =>
    toolsHandlers.toolsMonitorCleanup(db, olderThan)
  );
  ipcMain.handle('tools:monitor:getByInterval', (_, interval, timeRange) =>
    toolsHandlers.toolsMonitorGetByInterval(db, interval, timeRange)
  );
  ipcMain.handle('tools:monitor:getErrors', (_, limit, offset) =>
    toolsHandlers.toolsMonitorGetErrors(db, limit, offset)
  );
  ipcMain.handle('tools:monitor:getTopTools', (_, timeRange, limit) =>
    toolsHandlers.toolsMonitorGetTopTools(db, timeRange, limit)
  );

  // Memory
  ipcMain.handle('memory:list', () => memoryHandlers.listMemories(db));
  ipcMain.handle('memory:create', (_, data) => memoryHandlers.createMemory(db, data));
  ipcMain.handle('memory:update', (_, id, data) => memoryHandlers.updateMemory(db, id, data));
  ipcMain.handle('memory:delete', (_, id) => memoryHandlers.deleteMemory(db, id));

  // Memory Enhanced (with Semantic Search and Retrieval)
  ipcMain.handle('memory:get', (_, id) => memoryEnhancedHandlers.memoryGet(db, id));
  ipcMain.handle('memory:getAgentMemories', (_, agentId, limit) =>
    memoryEnhancedHandlers.memoryGetAgentMemories(db, agentId, limit)
  );
  ipcMain.handle('memory:search', (_, agentId, query, options) =>
    memoryEnhancedHandlers.memorySearch(db, agentId, query, options)
  );
  ipcMain.handle('memory:semanticSearch', (_, agentId, query, options) =>
    memoryEnhancedHandlers.memorySemanticSearch(db, agentId, query, options)
  );
  ipcMain.handle('memory:retrieveForLLM', (_, agentId, query, context, options) =>
    memoryEnhancedHandlers.memoryRetrieveForLLM(db, agentId, query, context, options)
  );
  ipcMain.handle('memory:injectIntoMessages', (_, agentId, messages, options) =>
    memoryEnhancedHandlers.memoryInjectIntoMessages(db, agentId, messages, options)
  );
  ipcMain.handle('memory:getStats', (_, agentId) =>
    memoryEnhancedHandlers.memoryGetStats(db, agentId)
  );
  ipcMain.handle('memory:createFromConversation', (_, agentId, conversation, options) =>
    memoryEnhancedHandlers.memoryCreateFromConversation(db, agentId, conversation, options)
  );
  ipcMain.handle('memory:updateImportance', (_, id, delta) =>
    memoryEnhancedHandlers.memoryUpdateImportance(db, id, delta)
  );
  ipcMain.handle('memory:cleanup', (_, agentId, options) =>
    memoryEnhancedHandlers.memoryCleanup(db, agentId, options)
  );
  ipcMain.handle('memory:getByImportance', (_, agentId, min, max, limit) =>
    memoryEnhancedHandlers.memoryGetByImportance(db, agentId, min, max, limit)
  );
  ipcMain.handle('memory:batchDelete', (_, ids) =>
    memoryEnhancedHandlers.memoryBatchDelete(db, ids)
  );
  ipcMain.handle('memory:getAllAgents', () => memoryEnhancedHandlers.memoryGetAllAgents(db));
  ipcMain.handle('memory:exportAgent', (_, agentId) =>
    memoryEnhancedHandlers.memoryExportAgent(db, agentId)
  );
  ipcMain.handle('memory:importAgent', (_, agentId, memories) =>
    memoryEnhancedHandlers.memoryImportAgent(db, agentId, memories)
  );

  // Memory Smart (Intelligent Assessment, Deduplication, Importance Adjustment)
  ipcMain.handle('memory:smartCreate', (_, agentId, content, options) =>
    memorySmartHandlers.smartCreateMemory(db, agentId, content, options)
  );
  ipcMain.handle('memory:smartCreateBatch', (_, agentId, messages, options) =>
    memorySmartHandlers.smartCreateMemoriesFromConversation(db, agentId, messages, options)
  );
  ipcMain.handle('memory:evaluateContent', (_, agentId, content, context) =>
    memorySmartHandlers.memoryEvaluateContent(db, agentId, content, context)
  );
  ipcMain.handle('memory:batchEvaluate', (_, messages, agentId) =>
    memorySmartHandlers.memoryBatchEvaluate(db, messages, agentId)
  );
  ipcMain.handle('memory:checkDuplicate', (_, agentId, content, threshold) =>
    memorySmartHandlers.memoryCheckDuplicate(db, agentId, content, threshold)
  );
  ipcMain.handle('memory:findMergeDuplicates', (_, agentId, threshold, mergeStrategy) =>
    memorySmartHandlers.memoryFindAndMergeDuplicates(db, agentId, threshold, mergeStrategy)
  );
  ipcMain.handle('memory:getDuplicateStats', (_, agentId, threshold) =>
    memorySmartHandlers.memoryGetDuplicateStats(db, agentId, threshold)
  );
  ipcMain.handle('memory:suggestReview', (_, agentId, limit) =>
    memorySmartHandlers.memorySuggestDuplicateReview(db, agentId, limit)
  );
  ipcMain.handle('memory:trackAccess', (_, memoryId, accessType, context) =>
    memorySmartHandlers.memoryTrackAccess(db, memoryId, accessType, context)
  );
  ipcMain.handle('memory:getAccessStats', (_, memoryId) =>
    memorySmartHandlers.memoryGetAccessStats(db, memoryId)
  );
  ipcMain.handle('memory:adjustImportance', (_, memoryId, options) =>
    memorySmartHandlers.memoryAdjustImportance(db, memoryId, options)
  );
  ipcMain.handle('memory:batchAdjustImportance', (_, agentId, options) =>
    memorySmartHandlers.memoryBatchAdjustImportance(db, agentId, options)
  );
  ipcMain.handle('memory:applyFeedback', (_, memoryId, feedback, options) =>
    memorySmartHandlers.memoryApplyFeedback(db, memoryId, feedback, options)
  );
  ipcMain.handle('memory:getAdjustmentStats', (_, agentId) =>
    memorySmartHandlers.memoryGetAdjustmentStats(db, agentId)
  );
  ipcMain.handle('memory:getNeedingAdjustment', (_, agentId, days, limit) =>
    memorySmartHandlers.memoryGetMemoriesNeedingAdjustment(db, agentId, days, limit)
  );
  ipcMain.handle('memory:cleanupTracking', (_, olderThanDays, keepRecent) =>
    memorySmartHandlers.memoryCleanupTracking(db, olderThanDays, keepRecent)
  );

  // Scheduled Tasks
  ipcMain.handle('scheduled:list', () => scheduledHandlers.listScheduled(db));
  ipcMain.handle('scheduled:create', (_, data) => scheduledHandlers.createScheduled(db, data));
  ipcMain.handle('scheduled:update', (_, id, data) =>
    scheduledHandlers.updateScheduled(db, id, data)
  );
  ipcMain.handle('scheduled:delete', (_, id) => scheduledHandlers.deleteScheduled(db, id));
  ipcMain.handle('scheduled:toggle', (_, id) => scheduledHandlers.toggleScheduled(db, id));

  // Channels
  channelsHandlers.registerChannelsHandlers();

  // Browser
  browserHandlers.registerBrowserHandlers();

  // Extension Bridge
  extensionBridgeHandlers.registerExtensionBridgeHandlers();

  // Gateway
  registerGatewayIPCHandlers();

  // Quick Chat
  ipcMain.handle('quickChat:getSettings', () => quickChatHandlers.quickChatGetSettings(db));
  ipcMain.handle('quickChat:updateSettings', (_, updates) =>
    quickChatHandlers.quickChatUpdateSettings(db, updates)
  );
  ipcMain.handle('quickChat:getSessionConfig', () =>
    quickChatHandlers.quickChatGetSessionConfig(db)
  );
  ipcMain.handle('quickChat:resetSettings', () => quickChatHandlers.quickChatResetSettings(db));
  ipcMain.handle('quickChat:setAgent', (_, agentId) =>
    quickChatHandlers.quickChatSetAgent(db, agentId)
  );
  ipcMain.handle('quickChat:setModel', (_, modelId) =>
    quickChatHandlers.quickChatSetModel(db, modelId)
  );
  ipcMain.handle('quickChat:getAvailableAgents', () =>
    quickChatHandlers.quickChatGetAvailableAgents(db)
  );
  ipcMain.handle('quickChat:getStats', () => quickChatHandlers.quickChatGetStats(db));
  ipcMain.handle('quickChat:createSession', () => quickChatHandlers.quickChatCreateSession(db));
  ipcMain.handle('quickChat:saveConversation', (_, sessionId, messages) =>
    quickChatHandlers.quickChatSaveConversation(db, sessionId, messages)
  );
  ipcMain.handle('quickChat:chat', (_, request) => quickChatHandlers.quickChatChat(db, request));
  ipcMain.handle('quickChat:stream', (_, request) =>
    quickChatHandlers.quickChatStream(db, request, mainWindow)
  );
  ipcMain.handle('quickChat:getFullConfig', () => quickChatHandlers.quickChatGetFullConfig(db));

  // Evolution
  registerEvolutionHandlers();

  // Settings
  ipcMain.handle('settings:get', (_, key) => getSetting(db, key));
  ipcMain.handle('settings:set', (_, key, value) => setSetting(db, key, value));
  ipcMain.handle('settings:getAll', () => getAllSettings(db));

  // Clipboard handlers
  ipcMain.handle('clipboard:writeText', (_, text) => {
    try {
      clipboard.writeText(text);
      return { success: true };
    } catch (error) {
      console.error('Failed to write to clipboard:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('clipboard:readText', () => {
    try {
      return { success: true, text: clipboard.readText() };
    } catch (error) {
      console.error('Failed to read from clipboard:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Dialog handlers
  ipcMain.handle('dialog:selectDirectory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select a directory',
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle(
    'dialog:selectFile',
    async (_, options?: { filters?: Array<{ name: string; extensions: string[] }> }) => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        title: 'Select a file',
        filters: options?.filters,
      });
      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }
      return result.filePaths[0];
    }
  );

  ipcMain.handle(
    'dialog:selectFiles',
    async (_, options?: { filters?: Array<{ name: string; extensions: string[] }> }) => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        title: 'Select files',
        filters: options?.filters,
      });
      if (result.canceled) {
        return [];
      }
      return result.filePaths;
    }
  );

  ipcMain.handle(
    'dialog:saveFile',
    async (_, options?: { filters?: Array<{ name: string; extensions: string[] }> }) => {
      const result = await dialog.showSaveDialog({
        title: 'Save file',
        filters: options?.filters,
      });
      if (result.canceled || !result.filePath) {
        return null;
      }
      return result.filePath;
    }
  );
};

// Settings helpers
function getSetting(db: Database.Database, key: string): string | null {
  const result = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any;
  return result?.value || null;
}

function setSetting(db: Database.Database, key: string, value: string): void {
  const now = Date.now();
  db.prepare(
    `
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?
  `
  ).run(key, value, now, value, now);
}

function getAllSettings(db: Database.Database): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{
    key: string;
    value: string;
  }>;
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
