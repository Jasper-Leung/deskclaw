// Global type declarations for DeskClaw

interface Window {
  electronAPI?: {
    providers: {
      list: () => Promise<any[]>;
      create: (data: any) => Promise<any>;
      update: (id: string, data: any) => Promise<any>;
      delete: (id: string) => Promise<void>;
      test: (id: string) => Promise<any>;
      testModel: (data: any) => Promise<any>;
    };
    models: {
      list: () => Promise<any[]>;
      create: (data: any) => Promise<any>;
      delete: (id: string) => Promise<void>;
    };
    agents: {
      list: () => Promise<any[]>;
      get: (id: string) => Promise<any>;
      create: (data: any) => Promise<any>;
      update: (id: string, data: any) => Promise<any>;
      delete: (id: string) => Promise<void>;
    };
    sessions: {
      list: () => Promise<any[]>;
      get: (id: string) => Promise<any>;
      create: (data: any) => Promise<any>;
      append: (id: string, message: any) => Promise<void>;
      update: (id: string, data: any) => Promise<void>;
      delete: (id: string) => Promise<void>;
    };
    workflows: {
      list: () => Promise<any[]>;
      get: (id: string) => Promise<any>;
      create: (data: any) => Promise<any>;
      update: (id: string, data: any) => Promise<any>;
      delete: (id: string) => Promise<void>;
      execute: (id: string) => Promise<any>;
      verify: () => Promise<any>;
      autoExecute: (request: any) => Promise<any>;
      autoPreview: (userMessage: string) => Promise<any>;
      onMatched: (callback: (match: any) => void) => () => void;
      onProgress: (callback: (update: any) => void) => () => void;
      onOutput: (callback: (output: any) => void) => () => void;
      onError: (callback: (error: any) => void) => () => void;
    };
    skills: {
      list: () => Promise<any[]>;
      get: (id: string) => Promise<any>;
      create: (data: any) => Promise<any>;
      update: (id: string, data: any) => Promise<any>;
      delete: (id: string) => Promise<void>;
      execute: (id: string, options?: any) => Promise<any>;
      executeWithProgress: (id: string, options?: any) => Promise<any>;
      onProgress: (callback: (data: any) => void) => () => void;
      import: (dirPath: string) => Promise<any>;
      importDir: (dirPath: string) => Promise<any>;
      content: (id: string) => Promise<any>;
      search: (query: string) => Promise<any[]>;
      byDomain: (domain: string) => Promise<any[]>;
      enabled: () => Promise<any[]>;
      checkDeps: (id: string) => Promise<any>;
      installDeps: (id: string) => Promise<void>;
    };
    shell: {
      execute: (command: string, options?: any) => Promise<any>;
      approve: (approvalId: string) => Promise<void>;
      reject: (approvalId: string) => Promise<void>;
      onApprovalRequest: (callback: (request: any) => void) => () => void;
    };
    llm: {
      chat: (request: any) => Promise<any>;
      stream: (request: any) => Promise<void>;
      onStreamChunk: (callback: (chunk: any) => void) => () => void;
      onStreamError: (callback: (error: any) => void) => () => void;
    };
    tools: {
      list: () => Promise<any[]>;
      schema: () => Promise<any>;
      execute: (name: string, params: any) => Promise<any>;
    };
    memory: {
      list: () => Promise<any[]>;
      getAgentMemories: (agentId: string, limit?: number) => Promise<any[]>;
      create: (data: { agentId: string; content: string; importance?: number }) => Promise<any>;
      update: (id: string, data: { content?: string; importance?: number }) => Promise<void>;
      delete: (id: string) => Promise<void>;
      smartCreate: (
        agentId: string,
        content: string,
        options?: { importance?: number }
      ) => Promise<any>;
    };
    scheduled: {
      list: () => Promise<any[]>;
      create: (data: any) => Promise<any>;
      update: (id: string, data: any) => Promise<void>;
      delete: (id: string) => Promise<void>;
      toggle: (id: string) => Promise<any>;
      onMessage: (callback: (message: any) => void) => () => void;
    };
    settings: {
      get: (key: string) => Promise<string | null>;
      set: (key: string, value: string) => Promise<void>;
      getAll: () => Promise<Record<string, string>>;
    };
    clipboard: {
      writeText: (text: string) => Promise<{ success: boolean }>;
      readText: () => Promise<{ success: boolean; text?: string }>;
    };
    dialog: {
      selectDirectory: () => Promise<string | null>;
      selectFile: (
        filters?: Array<{ name: string; extensions: string[] }>
      ) => Promise<string | null>;
      selectFiles: (filters?: Array<{ name: string; extensions: string[] }>) => Promise<string[]>;
      saveFile: (filters?: Array<{ name: string; extensions: string[] }>) => Promise<string | null>;
    };
    window: {
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      hide: () => void;
      show: () => void;
    };
    channels: {
      list: () => Promise<any[]>;
      types: () => Promise<any[]>;
      create: (data: any) => Promise<any>;
      update: (id: string, data: any) => Promise<any>;
      start: (id: string) => Promise<any>;
      stop: (id: string) => Promise<any>;
      delete: (id: string) => Promise<any>;
      send: (channelId: string, peerId: string, content: string, options?: any) => Promise<any>;
      messages: (channelId: string, peerId: string, limit?: number) => Promise<any[]>;
      stats: () => Promise<any>;
      setAutoReply: (channelId: string, peerId: string, enabled: boolean) => Promise<any>;
      getPeerSession: (channelId: string, peerId: string) => Promise<any>;
      listPeers: (channelId: string) => Promise<any[]>;
      cleanup: (maxAgeMs?: number) => Promise<any>;
      test: (channelType: string, configJson: string) => Promise<any>;
      accountInfo: (id: string) => Promise<any>;
      onMessage: (callback: (message: any) => void) => () => void;
      onAutoReply: (callback: (data: any) => void) => () => void;
    };
    browser: {
      profiles: {
        list: () => Promise<any[]>;
        create: (data: any) => Promise<any>;
        delete: (id: string) => Promise<any>;
      };
      launch: (profileId: string) => Promise<any>;
      closeProfile: (profileId: string) => Promise<any>;
      navigate: (sessionId: string, url: string) => Promise<any>;
      snapshot: (sessionId: string, format?: string) => Promise<any>;
      click: (sessionId: string, selector: string) => Promise<any>;
      type: (sessionId: string, selector: string, text: string) => Promise<any>;
      evaluate: (sessionId: string, fn: string) => Promise<any>;
      screenshot: (sessionId: string, fullPage?: boolean) => Promise<any>;
      closeSession: (sessionId: string) => Promise<any>;
      sessions?: {
        list: () => Promise<any[]>;
      };
    };
    quickChat: {
      getSettings: () => Promise<any>;
      updateSettings: (updates: Record<string, unknown>) => Promise<void>;
      getSessionConfig: () => Promise<any>;
      resetSettings: () => Promise<void>;
      setAgent: (agentId: string | null) => Promise<void>;
      setModel: (modelId: string | null) => Promise<void>;
      getAvailableAgents: () => Promise<any[]>;
      getStats: () => Promise<any>;
      createSession: () => Promise<any>;
      saveConversation: (sessionId: string, messages: unknown[]) => Promise<void>;
      chat: (request: Record<string, unknown>) => Promise<any>;
      stream: (request: Record<string, unknown>) => Promise<void>;
      getFullConfig: () => Promise<any>;
    };
    evolution: {
      trackEvent: (type: string, context: Record<string, unknown>) => Promise<void>;
      getMetrics: () => Promise<any>;
      getPatterns: (timeRange?: number) => Promise<any>;
      getSuggestions: () => Promise<any>;
      dismissSuggestion: (id: string) => Promise<void>;
      applySuggestion: (id: string, actions: unknown[]) => Promise<void>;
      getPredictedTasks: () => Promise<any>;
      getDeliveries: (limit?: number) => Promise<any>;
      togglePredictedTask: (id: string, enabled: boolean) => Promise<void>;
      deletePredictedTask: (id: string) => Promise<void>;
      provideDeliveryFeedback: (id: string, feedback: 'positive' | 'negative') => Promise<void>;
      triggerDelivery: (taskId: string) => Promise<void>;
      generatePredictions: () => Promise<void>;
      getLearningInsights: () => Promise<any>;
      onContentDelivery: (callback: (data: any) => void) => () => void;
    };
  };
}
