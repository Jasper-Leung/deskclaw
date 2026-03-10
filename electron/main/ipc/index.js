import { ipcMain } from 'electron';
import { getDatabase } from '../db';
import * as providersHandlers from './providers';
import * as modelsHandlers from './models';
import * as sessionsHandlers from './sessions';
import * as workflowsHandlers from './workflows';
import * as shellHandlers from './shell';
import * as llmHandlers from './llm';
import * as memoryHandlers from './memory';
import * as scheduledHandlers from './scheduled';
export const registerIPCHandlers = () => {
  const db = getDatabase();
  // Providers
  ipcMain.handle('providers:list', () => providersHandlers.listProviders(db));
  ipcMain.handle('providers:create', (_, data) => providersHandlers.createProvider(db, data));
  ipcMain.handle('providers:update', (_, id, data) =>
    providersHandlers.updateProvider(db, id, data)
  );
  ipcMain.handle('providers:delete', (_, id) => providersHandlers.deleteProvider(db, id));
  ipcMain.handle('providers:test', (_, id) => providersHandlers.testProvider(db, id));
  // Models
  ipcMain.handle('models:list', () => modelsHandlers.listModels(db));
  ipcMain.handle('models:create', (_, data) => modelsHandlers.createModel(db, data));
  ipcMain.handle('models:delete', (_, id) => modelsHandlers.deleteModel(db, id));
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
  // Shell
  ipcMain.handle('shell:execute', (_, command, options) =>
    shellHandlers.executeShell(command, options)
  );
  // LLM
  ipcMain.handle('llm:chat', (_, request) => llmHandlers.chat(db, request));
  // Memory
  ipcMain.handle('memory:list', () => memoryHandlers.listMemories(db));
  ipcMain.handle('memory:create', (_, data) => memoryHandlers.createMemory(db, data));
  ipcMain.handle('memory:update', (_, id, data) => memoryHandlers.updateMemory(db, id, data));
  ipcMain.handle('memory:delete', (_, id) => memoryHandlers.deleteMemory(db, id));
  // Scheduled Tasks
  ipcMain.handle('scheduled:list', () => scheduledHandlers.listScheduled(db));
  ipcMain.handle('scheduled:create', (_, data) => scheduledHandlers.createScheduled(db, data));
  ipcMain.handle('scheduled:update', (_, id, data) =>
    scheduledHandlers.updateScheduled(db, id, data)
  );
  ipcMain.handle('scheduled:delete', (_, id) => scheduledHandlers.deleteScheduled(db, id));
  ipcMain.handle('scheduled:toggle', (_, id) => scheduledHandlers.toggleScheduled(db, id));
};
