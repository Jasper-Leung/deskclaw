import { contextBridge, ipcRenderer } from 'electron';
const electronAPI = {
  // Providers
  providers: {
    list: () => ipcRenderer.invoke('providers:list'),
    create: (data) => ipcRenderer.invoke('providers:create', data),
    update: (id, data) => ipcRenderer.invoke('providers:update', id, data),
    delete: (id) => ipcRenderer.invoke('providers:delete', id),
    test: (id) => ipcRenderer.invoke('providers:test', id),
  },
  // Models
  models: {
    list: () => ipcRenderer.invoke('models:list'),
    create: (data) => ipcRenderer.invoke('models:create', data),
    delete: (id) => ipcRenderer.invoke('models:delete', id),
  },
  // Sessions
  sessions: {
    list: () => ipcRenderer.invoke('sessions:list'),
    get: (id) => ipcRenderer.invoke('sessions:get', id),
    create: (data) => ipcRenderer.invoke('sessions:create', data),
    append: (id, message) => ipcRenderer.invoke('sessions:append', id, message),
    update: (id, data) => ipcRenderer.invoke('sessions:update', id, data),
    delete: (id) => ipcRenderer.invoke('sessions:delete', id),
  },
  // Workflows
  workflows: {
    list: () => ipcRenderer.invoke('workflows:list'),
    get: (id) => ipcRenderer.invoke('workflows:get', id),
    create: (data) => ipcRenderer.invoke('workflows:create', data),
    update: (id, data) => ipcRenderer.invoke('workflows:update', id, data),
    delete: (id) => ipcRenderer.invoke('workflows:delete', id),
    execute: (id) => ipcRenderer.invoke('workflows:execute', id),
  },
  // Shell
  shell: {
    execute: (command, options) => ipcRenderer.invoke('shell:execute', command, options),
  },
  // LLM
  llm: {
    chat: (request) => ipcRenderer.invoke('llm:chat', request),
    stream: (request) => {
      // For streaming, we'll use a different approach with Event-based communication
      // This is a placeholder for now
      return ipcRenderer.invoke('llm:chat', request);
    },
  },
  // Memory
  memory: {
    list: () => ipcRenderer.invoke('memory:list'),
    create: (data) => ipcRenderer.invoke('memory:create', data),
    update: (id, data) => ipcRenderer.invoke('memory:update', id, data),
    delete: (id) => ipcRenderer.invoke('memory:delete', id),
  },
  // Scheduled Tasks
  scheduled: {
    list: () => ipcRenderer.invoke('scheduled:list'),
    create: (data) => ipcRenderer.invoke('scheduled:create', data),
    update: (id, data) => ipcRenderer.invoke('scheduled:update', id, data),
    delete: (id) => ipcRenderer.invoke('scheduled:delete', id),
    toggle: (id) => ipcRenderer.invoke('scheduled:toggle', id),
  },
  // Window controls
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    hide: () => ipcRenderer.send('window:hide'),
    show: () => ipcRenderer.send('window:show'),
  },
};
contextBridge.exposeInMainWorld('electronAPI', electronAPI);
