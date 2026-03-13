import { contextBridge, ipcRenderer } from 'electron';
import type { IPCChannel, LLMRequest, Message } from '../../shared/types/index.js';
import type { EvolutionAPI } from './evolution-types.js';

const electronAPI = {
  // Providers
  providers: {
    list: () => ipcRenderer.invoke('providers:list' as IPCChannel),
    create: (data: { name: string; protocol: string; baseUrl: string; apiKey: string }) =>
      ipcRenderer.invoke('providers:create' as IPCChannel, data),
    update: (
      id: string,
      data: { name?: string; protocol?: string; baseUrl?: string; apiKey?: string }
    ) => ipcRenderer.invoke('providers:update' as IPCChannel, id, data),
    delete: (id: string) => ipcRenderer.invoke('providers:delete' as IPCChannel, id),
    test: (id: string) => ipcRenderer.invoke('providers:test' as IPCChannel, id),
    testModel: (data: { protocol: string; baseUrl: string; apiKey: string; modelId: string }) =>
      ipcRenderer.invoke('providers:testModel' as IPCChannel, data),
  },

  // Models
  models: {
    list: () => ipcRenderer.invoke('models:list' as IPCChannel),
    create: (data: {
      providerId: string;
      modelId: string;
      displayName?: string;
      isCustom?: boolean;
    }) => ipcRenderer.invoke('models:create' as IPCChannel, data),
    delete: (id: string) => ipcRenderer.invoke('models:delete' as IPCChannel, id),
  },

  // Agents
  agents: {
    list: () => ipcRenderer.invoke('agents:list' as IPCChannel),
    get: (id: string) => ipcRenderer.invoke('agents:get' as IPCChannel, id),
    create: (data: {
      name: string;
      description?: string;
      modelId?: string;
      systemPrompt?: string;
      temperature?: number;
    }) => ipcRenderer.invoke('agents:create' as IPCChannel, data),
    update: (
      id: string,
      data: {
        name?: string;
        description?: string;
        modelId?: string;
        systemPrompt?: string;
        temperature?: number;
      }
    ) => ipcRenderer.invoke('agents:update' as IPCChannel, id, data),
    delete: (id: string) => ipcRenderer.invoke('agents:delete' as IPCChannel, id),
  },

  // Sessions
  sessions: {
    list: () => ipcRenderer.invoke('sessions:list' as IPCChannel),
    get: (id: string) => ipcRenderer.invoke('sessions:get' as IPCChannel, id),
    create: (data: { agentId?: string; title: string; messages?: Message[] }) =>
      ipcRenderer.invoke('sessions:create' as IPCChannel, data),
    append: (id: string, message: Message) =>
      ipcRenderer.invoke('sessions:append' as IPCChannel, id, message),
    update: (id: string, data: { title?: string; messages?: Message[]; agentId?: string }) =>
      ipcRenderer.invoke('sessions:update' as IPCChannel, id, data),
    delete: (id: string) => ipcRenderer.invoke('sessions:delete' as IPCChannel, id),
  },

  // Workflows
  workflows: {
    list: () => ipcRenderer.invoke('workflows:list' as IPCChannel),
    get: (id: string) => ipcRenderer.invoke('workflows:get' as IPCChannel, id),
    create: (data: { name: string; nodes?: unknown[]; edges?: unknown[] }) =>
      ipcRenderer.invoke('workflows:create' as IPCChannel, data),
    update: (id: string, data: { name?: string; nodes?: unknown[]; edges?: unknown[] }) =>
      ipcRenderer.invoke('workflows:update' as IPCChannel, id, data),
    delete: (id: string) => ipcRenderer.invoke('workflows:delete' as IPCChannel, id),
    execute: (id: string) => ipcRenderer.invoke('workflows:execute' as IPCChannel, id),
    verify: () => ipcRenderer.invoke('workflows:verify' as IPCChannel),
    // Auto-workflow
    autoExecute: (request: { userMessage: string; modelId?: string }) =>
      ipcRenderer.invoke('workflows:auto:execute' as IPCChannel, request),
    autoPreview: (userMessage: string) =>
      ipcRenderer.invoke('workflows:auto:preview' as IPCChannel, userMessage),
    onMatched: (
      callback: (match: { workflowId: string; workflowName: string; confidence: number }) => void
    ) => {
      const listener = (
        _event: any,
        match: { workflowId: string; workflowName: string; confidence: number }
      ) => callback(match);
      ipcRenderer.on('workflow:auto:matched', listener);
      return () => ipcRenderer.removeListener('workflow:auto:matched', listener);
    },
    onProgress: (
      callback: (update: {
        workflowId: string;
        workflowName: string;
        type: string;
        nodeId?: string;
        nodeName?: string;
      }) => void
    ) => {
      const listener = (
        _event: any,
        update: {
          workflowId: string;
          workflowName: string;
          type: string;
          nodeId?: string;
          nodeName?: string;
        }
      ) => callback(update);
      ipcRenderer.on('workflow:auto:progress', listener);
      return () => ipcRenderer.removeListener('workflow:auto:progress', listener);
    },
    onOutput: (
      callback: (output: {
        workflowId: string;
        nodeId: string;
        nodeName: string;
        content: string;
      }) => void
    ) => {
      const listener = (
        _event: any,
        output: { workflowId: string; nodeId: string; nodeName: string; content: string }
      ) => callback(output);
      ipcRenderer.on('workflow:auto:output', listener);
      return () => ipcRenderer.removeListener('workflow:auto:output', listener);
    },
    onError: (callback: (error: { message: string }) => void) => {
      const listener = (_event: any, error: { message: string }) => callback(error);
      ipcRenderer.on('workflow:auto:error', listener);
      return () => ipcRenderer.removeListener('workflow:auto:error', listener);
    },
  },

  // Skills
  skills: {
    list: () => ipcRenderer.invoke('skills:list' as IPCChannel),
    get: (id: string) => ipcRenderer.invoke('skills:get' as IPCChannel, id),
    create: (data: {
      name: string;
      description?: string;
      schemaJson?: object;
      code?: string;
      metadata?: object;
      license?: string;
      allowedTools?: string[];
    }) => ipcRenderer.invoke('skills:create' as IPCChannel, data),
    update: (
      id: string,
      data: {
        name?: string;
        description?: string;
        schemaJson?: object;
        code?: string;
        metadata?: object;
        license?: string;
        allowedTools?: string[];
      }
    ) => ipcRenderer.invoke('skills:update' as IPCChannel, id, data),
    delete: (id: string) => ipcRenderer.invoke('skills:delete' as IPCChannel, id),
    execute: (id: string, options?: { input?: Record<string, unknown>; timeout?: number }) =>
      ipcRenderer.invoke('skills:execute' as IPCChannel, id, options),
    executeWithProgress: (
      id: string,
      options?: { input?: Record<string, unknown>; timeout?: number }
    ) => ipcRenderer.invoke('skills:executeWithProgress' as IPCChannel, id, options),
    onProgress: (
      callback: (data: {
        skillId: string;
        progress: { type: string; message: string; data?: unknown };
      }) => void
    ) => {
      const listener = (
        _event: any,
        data: { skillId: string; progress: { type: string; message: string; data?: unknown } }
      ) => callback(data);
      ipcRenderer.on('skills:progress', listener);
      return () => ipcRenderer.removeListener('skills:progress', listener);
    },
    import: (dirPath: string) => ipcRenderer.invoke('skills:import' as IPCChannel, dirPath),
    importDir: (dirPath: string) => ipcRenderer.invoke('skills:importDir' as IPCChannel, dirPath),
    content: (id: string) => ipcRenderer.invoke('skills:content' as IPCChannel, id),
    search: (query: string) => ipcRenderer.invoke('skills:search' as IPCChannel, query),
    byDomain: (domain: string) => ipcRenderer.invoke('skills:byDomain' as IPCChannel, domain),
    enabled: () => ipcRenderer.invoke('skills:enabled' as IPCChannel),
    checkDeps: (id: string) => ipcRenderer.invoke('skills:checkDeps' as IPCChannel, id),
    installDeps: (id: string) => ipcRenderer.invoke('skills:installDeps' as IPCChannel, id),
  },

  // Shell
  shell: {
    execute: (
      command: string,
      options?: {
        cwd?: string;
        env?: Record<string, string>;
        timeout?: number;
        requireApproval?: boolean;
      }
    ) => ipcRenderer.invoke('shell:execute' as IPCChannel, command, options),
    approve: (approvalId: string) => ipcRenderer.invoke('shell:approve' as IPCChannel, approvalId),
    reject: (approvalId: string) => ipcRenderer.invoke('shell:reject' as IPCChannel, approvalId),
    onApprovalRequest: (
      callback: (request: { approvalId: string; command: string; isDangerous: boolean }) => void
    ) => {
      const listener = (
        _event: any,
        request: { approvalId: string; command: string; isDangerous: boolean }
      ) => callback(request);
      ipcRenderer.on('shell:approval-request', listener);
      return () => ipcRenderer.removeListener('shell:approval-request', listener);
    },
  },

  // LLM
  llm: {
    chat: (request: LLMRequest) => ipcRenderer.invoke('llm:chat' as IPCChannel, request),
    stream: (request: LLMRequest) => ipcRenderer.invoke('llm:stream' as IPCChannel, request),
    onStreamChunk: (callback: (chunk: { content: string; done: boolean }) => void) => {
      const listener = (_event: any, chunk: { content: string; done: boolean }) => callback(chunk);
      ipcRenderer.on('llm:stream:chunk', listener);
      return () => ipcRenderer.removeListener('llm:stream:chunk', listener);
    },
    onStreamError: (callback: (error: { message: string }) => void) => {
      const listener = (_event: any, error: { message: string }) => callback(error);
      ipcRenderer.on('llm:stream:error', listener);
      return () => ipcRenderer.removeListener('llm:stream:error', listener);
    },
  },

  // Tools
  tools: {
    list: () => ipcRenderer.invoke('tools:list' as IPCChannel),
    schema: () => ipcRenderer.invoke('tools:schema' as IPCChannel),
    execute: (name: string, params: Record<string, unknown>) =>
      ipcRenderer.invoke('tools:execute' as IPCChannel, name, params),
  },

  // Memory
  memory: {
    list: () => ipcRenderer.invoke('memory:list' as IPCChannel),
    getAgentMemories: (agentId: string, limit?: number) =>
      ipcRenderer.invoke('memory:getAgentMemories' as IPCChannel, agentId, limit),
    create: (data: { agentId: string; content: string; importance?: number }) =>
      ipcRenderer.invoke('memory:create' as IPCChannel, data),
    update: (id: string, data: { content?: string; importance?: number }) =>
      ipcRenderer.invoke('memory:update' as IPCChannel, id, data),
    delete: (id: string) => ipcRenderer.invoke('memory:delete' as IPCChannel, id),
    smartCreate: (agentId: string, content: string, options?: { importance?: number }) =>
      ipcRenderer.invoke('memory:smartCreate' as IPCChannel, agentId, content, options),
  },

  // Scheduled Tasks
  scheduled: {
    list: () => ipcRenderer.invoke('scheduled:list' as IPCChannel),
    create: (data: {
      name: string;
      taskType: string;
      cronExpression: string;
      taskConfig: Record<string, unknown>;
      enabled?: boolean;
    }) => ipcRenderer.invoke('scheduled:create' as IPCChannel, data),
    update: (
      id: string,
      data: {
        name?: string;
        cronExpression?: string;
        taskConfig?: Record<string, unknown>;
        enabled?: boolean;
      }
    ) => ipcRenderer.invoke('scheduled:update' as IPCChannel, id, data),
    delete: (id: string) => ipcRenderer.invoke('scheduled:delete' as IPCChannel, id),
    toggle: (id: string) => ipcRenderer.invoke('scheduled:toggle' as IPCChannel, id),
    onMessage: (callback: (message: any) => void) => {
      const listener = (_event: any, message: any) => callback(message);
      ipcRenderer.on('scheduled:message', listener);
      return () => ipcRenderer.removeListener('scheduled:message', listener);
    },
  },

  // Settings
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get' as IPCChannel, key),
    set: (key: string, value: string) =>
      ipcRenderer.invoke('settings:set' as IPCChannel, key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll' as IPCChannel),
  },

  // Clipboard
  clipboard: {
    writeText: (text: string) => ipcRenderer.invoke('clipboard:writeText' as IPCChannel, text),
    readText: () => ipcRenderer.invoke('clipboard:readText' as IPCChannel),
  },

  // Dialog
  dialog: {
    selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory' as IPCChannel),
    selectFile: (filters?: Array<{ name: string; extensions: string[] }>) =>
      ipcRenderer.invoke('dialog:selectFile' as IPCChannel, filters),
    selectFiles: (filters?: Array<{ name: string; extensions: string[] }>) =>
      ipcRenderer.invoke('dialog:selectFiles' as IPCChannel, filters),
    saveFile: (filters?: Array<{ name: string; extensions: string[] }>) =>
      ipcRenderer.invoke('dialog:saveFile' as IPCChannel, filters),
  },

  // Window controls
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    hide: () => ipcRenderer.send('window:hide'),
    show: () => ipcRenderer.send('window:show'),
  },

  // Channels
  channels: {
    list: () => ipcRenderer.invoke('channels:list' as IPCChannel),
    types: () => ipcRenderer.invoke('channels:types' as IPCChannel),
    create: (data: { channelType: string; accountId: string; name: string; configJson: string }) =>
      ipcRenderer.invoke('channels:create' as IPCChannel, data),
    update: (id: string, data: { name?: string; configJson?: string }) =>
      ipcRenderer.invoke('channels:update' as IPCChannel, id, data),
    start: (id: string) => ipcRenderer.invoke('channels:start' as IPCChannel, id),
    stop: (id: string) => ipcRenderer.invoke('channels:stop' as IPCChannel, id),
    delete: (id: string) => ipcRenderer.invoke('channels:delete' as IPCChannel, id),
    send: (
      channelId: string,
      peerId: string,
      content: string,
      options?: { parseMode?: string; disablePreview?: boolean; replyTo?: string }
    ) => ipcRenderer.invoke('channels:send' as IPCChannel, channelId, peerId, content, options),
    messages: (channelId: string, peerId: string, limit?: number) =>
      ipcRenderer.invoke('channels:messages' as IPCChannel, channelId, peerId, limit),
    stats: () => ipcRenderer.invoke('channels:stats' as IPCChannel),
    setAutoReply: (channelId: string, peerId: string, enabled: boolean) =>
      ipcRenderer.invoke('channels:setAutoReply' as IPCChannel, channelId, peerId, enabled),
    getPeerSession: (channelId: string, peerId: string) =>
      ipcRenderer.invoke('channels:getPeerSession' as IPCChannel, channelId, peerId),
    listPeers: (channelId: string) =>
      ipcRenderer.invoke('channels:listPeers' as IPCChannel, channelId),
    cleanup: (maxAgeMs?: number) => ipcRenderer.invoke('channels:cleanup' as IPCChannel, maxAgeMs),
    test: (channelType: string, configJson: string) =>
      ipcRenderer.invoke('channels:test' as IPCChannel, channelType, configJson),
    accountInfo: (id: string) => ipcRenderer.invoke('channels:accountInfo' as IPCChannel, id),
    // Conversation management
    resetConversation: (channelId: string, peerId: string) =>
      ipcRenderer.invoke('channels:resetConversation' as IPCChannel, channelId, peerId),
    getConversation: (channelId: string, peerId: string) =>
      ipcRenderer.invoke('channels:getConversation' as IPCChannel, channelId, peerId),
    getAllConversations: () => ipcRenderer.invoke('channels:getAllConversations' as IPCChannel),
    clearConversation: (channelId: string, peerId: string) =>
      ipcRenderer.invoke('channels:clearConversation' as IPCChannel, channelId, peerId),
    getConversationConfig: () => ipcRenderer.invoke('channels:getConversationConfig' as IPCChannel),
    setConversationConfig: (config: {
      timeWindowMs?: number;
      maxMessages?: number;
      enableAutoReset?: boolean;
    }) => ipcRenderer.invoke('channels:setConversationConfig' as IPCChannel, config),
    onMessage: (
      callback: (message: {
        id: string;
        channelId: string;
        messageId: string;
        peerId: string;
        peerType: string;
        direction: string;
        content?: string;
        media?: { type: string; url: string; caption?: string };
        metadata?: Record<string, unknown>;
        timestamp: number;
      }) => void
    ) => {
      const listener = (_event: any, message: any) => callback(message);
      ipcRenderer.on('channels:message', listener);
      return () => ipcRenderer.removeListener('channels:message', listener);
    },
    onAutoReply: (
      callback: (data: { sessionId: string; channelId: string; peerId: string }) => void
    ) => {
      const listener = (_event: any, data: any) => callback(data);
      ipcRenderer.on('channels:autoReply', listener);
      return () => ipcRenderer.removeListener('channels:autoReply', listener);
    },
  },

  // Browser
  browser: {
    profiles: {
      list: () => ipcRenderer.invoke('browser:profiles:list' as IPCChannel),
      create: (data: {
        name: string;
        headless?: boolean;
        viewportWidth?: number;
        viewportHeight?: number;
      }) => ipcRenderer.invoke('browser:profiles:create' as IPCChannel, data),
      delete: (id: string) => ipcRenderer.invoke('browser:profiles:delete' as IPCChannel, id),
    },
    launch: (profileId: string) => ipcRenderer.invoke('browser:launch' as IPCChannel, profileId),
    closeProfile: (profileId: string) =>
      ipcRenderer.invoke('browser:closeProfile' as IPCChannel, profileId),
    navigate: (sessionId: string, url: string) =>
      ipcRenderer.invoke('browser:navigate' as IPCChannel, sessionId, url),
    snapshot: (sessionId: string, format?: string) =>
      ipcRenderer.invoke('browser:snapshot' as IPCChannel, sessionId, format),
    click: (sessionId: string, selector: string) =>
      ipcRenderer.invoke('browser:click' as IPCChannel, sessionId, selector),
    type: (sessionId: string, selector: string, text: string) =>
      ipcRenderer.invoke('browser:type' as IPCChannel, sessionId, selector, text),
    evaluate: (sessionId: string, fn: string) =>
      ipcRenderer.invoke('browser:evaluate' as IPCChannel, sessionId, fn),
    screenshot: (sessionId: string, fullPage?: boolean) =>
      ipcRenderer.invoke('browser:screenshot' as IPCChannel, sessionId, fullPage),
    closeSession: (sessionId: string) =>
      ipcRenderer.invoke('browser:closeSession' as IPCChannel, sessionId),
  },

  // Extension Bridge
  extensionBridge: {
    status: () => ipcRenderer.invoke('extensionBridge:status' as IPCChannel),
    start: (port: number) => ipcRenderer.invoke('extensionBridge:start' as IPCChannel, port),
    stop: () => ipcRenderer.invoke('extensionBridge:stop' as IPCChannel),
    navigate: (url: string) => ipcRenderer.invoke('extensionBridge:navigate' as IPCChannel, url),
    snapshot: () => ipcRenderer.invoke('extensionBridge:snapshot' as IPCChannel),
    click: (selector: string) =>
      ipcRenderer.invoke('extensionBridge:click' as IPCChannel, selector),
    type: (selector: string, text: string) =>
      ipcRenderer.invoke('extensionBridge:type' as IPCChannel, selector, text),
    screenshot: () => ipcRenderer.invoke('extensionBridge:screenshot' as IPCChannel),
  },

  // Quick Chat
  quickChat: {
    getSettings: () => ipcRenderer.invoke('quickChat:getSettings' as IPCChannel),
    updateSettings: (updates: Record<string, unknown>) =>
      ipcRenderer.invoke('quickChat:updateSettings' as IPCChannel, updates),
    getSessionConfig: () => ipcRenderer.invoke('quickChat:getSessionConfig' as IPCChannel),
    resetSettings: () => ipcRenderer.invoke('quickChat:resetSettings' as IPCChannel),
    setAgent: (agentId: string | null) =>
      ipcRenderer.invoke('quickChat:setAgent' as IPCChannel, agentId),
    setModel: (modelId: string | null) =>
      ipcRenderer.invoke('quickChat:setModel' as IPCChannel, modelId),
    getAvailableAgents: () => ipcRenderer.invoke('quickChat:getAvailableAgents' as IPCChannel),
    getStats: () => ipcRenderer.invoke('quickChat:getStats' as IPCChannel),
    createSession: () => ipcRenderer.invoke('quickChat:createSession' as IPCChannel),
    saveConversation: (sessionId: string, messages: unknown[]) =>
      ipcRenderer.invoke('quickChat:saveConversation' as IPCChannel, sessionId, messages),
    chat: (request: Record<string, unknown>) =>
      ipcRenderer.invoke('quickChat:chat' as IPCChannel, request),
    stream: (request: Record<string, unknown>) =>
      ipcRenderer.invoke('quickChat:stream' as IPCChannel, request),
    getFullConfig: () => ipcRenderer.invoke('quickChat:getFullConfig' as IPCChannel),
  },

  // Evolution & Self-Learning
  evolution: {
    // Analytics
    trackEvent: (type: string, context: Record<string, unknown>) =>
      ipcRenderer.invoke('evolution:track-event' as IPCChannel, type, context),
    getMetrics: () => ipcRenderer.invoke('evolution:get-metrics' as IPCChannel),
    getPatterns: (timeRange?: number) =>
      ipcRenderer.invoke('evolution:get-patterns' as IPCChannel, timeRange),
    getSuggestions: () => ipcRenderer.invoke('evolution:get-suggestions' as IPCChannel),
    dismissSuggestion: (id: string) =>
      ipcRenderer.invoke('evolution:dismiss-suggestion' as IPCChannel, id),
    applySuggestion: (id: string, actions: unknown[]) =>
      ipcRenderer.invoke('evolution:apply-suggestion' as IPCChannel, id, actions),

    // Proactive Content
    getPredictedTasks: () => ipcRenderer.invoke('evolution:get-predicted-tasks' as IPCChannel),
    getDeliveries: (limit?: number) =>
      ipcRenderer.invoke('evolution:get-deliveries' as IPCChannel, limit),
    togglePredictedTask: (id: string, enabled: boolean) =>
      ipcRenderer.invoke('evolution:toggle-predicted-task' as IPCChannel, id, enabled),
    deletePredictedTask: (id: string) =>
      ipcRenderer.invoke('evolution:delete-predicted-task' as IPCChannel, id),
    provideDeliveryFeedback: (id: string, feedback: 'positive' | 'negative') =>
      ipcRenderer.invoke('evolution:provide-delivery-feedback' as IPCChannel, id, feedback),
    triggerDelivery: (taskId: string) =>
      ipcRenderer.invoke('evolution:trigger-delivery' as IPCChannel, taskId),
    generatePredictions: () => ipcRenderer.invoke('evolution:generate-predictions' as IPCChannel),
    getLearningInsights: () => ipcRenderer.invoke('evolution:get-learning-insights' as IPCChannel),

    // Listen for proactive content deliveries
    onContentDelivery: (
      callback: (data: {
        type: string;
        title: string;
        content: string;
        actions?: unknown[];
      }) => void
    ) => {
      const listener = (_event: any, data: any) => callback(data);
      ipcRenderer.on('evolution:content-delivery', listener);
      return () => ipcRenderer.removeListener('evolution:content-delivery', listener);
    },
  },

  // Token Counter
  tokens: {
    countText: (text: string, modelId?: string) =>
      ipcRenderer.invoke('tokens:countText' as IPCChannel, text, modelId),
    countMessage: (message: { role?: string; content?: string }, modelId?: string) =>
      ipcRenderer.invoke('tokens:countMessage' as IPCChannel, message, modelId),
    countMessages: (messages: Array<{ role?: string; content?: string }>, modelId?: string) =>
      ipcRenderer.invoke('tokens:countMessages' as IPCChannel, messages, modelId),
  },

  // Community Keys - Secure storage for community-specific API keys
  communityKeys: {
    list: () => ipcRenderer.invoke('communityKeys:list' as IPCChannel),
    get: (id: string) => ipcRenderer.invoke('communityKeys:get' as IPCChannel, id),
    getByCommunity: (communityId: string) =>
      ipcRenderer.invoke('communityKeys:getByCommunity' as IPCChannel, communityId),
    getActive: (communityId: string) =>
      ipcRenderer.invoke('communityKeys:getActive' as IPCChannel, communityId),
    add: (data: {
      communityId: string;
      communityName: string;
      apiKey: string;
      keyType?: 'api_key' | 'token' | 'oauth' | 'custom';
      providerProtocol?: 'openai' | 'anthropic' | 'ollama' | 'custom';
      baseUrl?: string;
      heartbeatUrl?: string;
      heartbeatInterval?: number;
      expiresIn?: number;
      metadata?: Record<string, unknown>;
    }) => ipcRenderer.invoke('communityKeys:add' as IPCChannel, data),
    update: (
      id: string,
      updates: {
        apiKey?: string;
        isActive?: boolean;
        heartbeatUrl?: string;
        heartbeatInterval?: number;
        metadata?: Record<string, unknown>;
      }
    ) => ipcRenderer.invoke('communityKeys:update' as IPCChannel, id, updates),
    delete: (id: string) => ipcRenderer.invoke('communityKeys:delete' as IPCChannel, id),
    stats: () => ipcRenderer.invoke('communityKeys:stats' as IPCChannel),
    test: (id: string) => ipcRenderer.invoke('communityKeys:test' as IPCChannel, id),
    heartbeat: (id: string) => ipcRenderer.invoke('communityKeys:heartbeat' as IPCChannel, id),
    useKey: (communityId: string, providerProtocol?: string) =>
      ipcRenderer.invoke('communityKeys:useKey' as IPCChannel, communityId, providerProtocol),
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// ============================================================================
// Type Exports for Evolution
// ============================================================================

// Evolution types (imported from shared types)
export type {
  EvolutionSuggestion,
  EvolutionMetrics,
  UsagePattern,
} from '../../shared/types/evolution.js';

// Import evolution types for use in preload
import type {
  EvolutionSuggestion,
  EvolutionMetrics,
  UsagePattern,
  PredictedTask,
  DeliveredContent,
  LearningInsights,
  TimeOfDay,
  ContentSource,
  EventContext,
  EventType,
  SuggestedAction,
} from '../../shared/types/evolution.js';
