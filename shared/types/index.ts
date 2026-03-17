// Shared types between main and renderer processes

export * from './gateway.js';
export * from './evolution.js';

export interface Provider {
  id: string;
  name: string;
  protocol: 'openai' | 'anthropic' | 'ollama' | 'custom';
  baseUrl: string;
  apiKeyEncrypted: string;
  createdAt: number;
  updatedAt: number;
}

export interface Model {
  id: string;
  providerId: string;
  modelId: string;
  displayName: string;
  isCustom: boolean;
  createdAt: number;
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool' | 'tool_result' | 'tool_error';
  content: string;
  timestamp?: number;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface Session {
  id: string;
  agentId: string | null;
  title: string;
  messagesJson: string;
  createdAt: number;
  updatedAt: number;
}

export interface WorkflowNode {
  id: string;
  type: 'trigger' | 'agent' | 'tool' | 'prompt' | 'conditional' | 'parallel' | 'shell';
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  definitionJson: string;
  createdAt: number;
  updatedAt: number;
}

export interface Memory {
  id: string;
  agentId: string;
  content: string;
  embedding: string | null;
  importance: number;
  createdAt: number;
}

export interface ScheduledTask {
  id: string;
  workflowId: string;
  cronExpression: string;
  enabled: boolean;
  lastRun: number | null;
  nextRun: number | null;
}

// IPC Channel types
export type IPCChannel =
  // Providers
  | 'providers:list'
  | 'providers:create'
  | 'providers:update'
  | 'providers:delete'
  | 'providers:test'
  | 'providers:testModel'
  // Models
  | 'models:list'
  | 'models:create'
  | 'models:delete'
  // Agents
  | 'agents:list'
  | 'agents:get'
  | 'agents:create'
  | 'agents:update'
  | 'agents:delete'
  // Sessions
  | 'sessions:list'
  | 'sessions:get'
  | 'sessions:create'
  | 'sessions:append'
  | 'sessions:update'
  | 'sessions:delete'
  // Workflows
  | 'workflows:list'
  | 'workflows:get'
  | 'workflows:create'
  | 'workflows:update'
  | 'workflows:delete'
  | 'workflows:execute'
  | 'workflows:verify'
  // Auto Workflows
  | 'workflows:auto:execute'
  | 'workflows:auto:preview'
  // AI Workflow Generator
  | 'workflows:generate'
  | 'workflows:refine'
  | 'workflows:explain'
  | 'workflows:saveGenerated'
  // Skills
  | 'skills:list'
  | 'skills:get'
  | 'skills:create'
  | 'skills:update'
  | 'skills:delete'
  | 'skills:execute'
  | 'skills:executeWithProgress'
  | 'skills:import'
  | 'skills:importDir'
  | 'skills:content'
  | 'skills:search'
  | 'skills:byDomain'
  | 'skills:enabled'
  | 'skills:checkDeps'
  | 'skills:installDeps'
  // Shell
  | 'shell:execute'
  | 'shell:approve'
  | 'shell:reject'
  // LLM
  | 'llm:chat'
  | 'llm:stream'
  // Tools
  | 'tools:list'
  | 'tools:schema'
  | 'tools:execute'
  // Memory
  | 'memory:list'
  | 'memory:create'
  | 'memory:update'
  | 'memory:delete'
  // Scheduled Tasks
  | 'scheduled:list'
  | 'scheduled:create'
  | 'scheduled:update'
  | 'scheduled:delete'
  | 'scheduled:toggle'
  // Settings
  | 'settings:get'
  | 'settings:set'
  | 'settings:getAll'
  // Clipboard
  | 'clipboard:writeText'
  | 'clipboard:readText'
  // Dialog
  | 'dialog:selectDirectory'
  | 'dialog:selectFile'
  | 'dialog:selectFiles'
  | 'dialog:saveFile'
  // Channels
  | 'channels:list'
  | 'channels:types'
  | 'channels:create'
  | 'channels:update'
  | 'channels:start'
  | 'channels:stop'
  | 'channels:delete'
  | 'channels:send'
  | 'channels:messages'
  | 'channels:stats'
  | 'channels:setAutoReply'
  | 'channels:getPeerSession'
  | 'channels:listPeers'
  | 'channels:cleanup'
  | 'channels:test'
  | 'channels:accountInfo'
  // Browser
  | 'browser:profiles:list'
  | 'browser:profiles:create'
  | 'browser:profiles:delete'
  | 'browser:launch'
  | 'browser:closeProfile'
  | 'browser:navigate'
  | 'browser:snapshot'
  | 'browser:click'
  | 'browser:type'
  | 'browser:evaluate'
  | 'browser:screenshot'
  | 'browser:closeSession'
  | 'browser:sessions:list'
  | 'browser:stats'
  // MCP Browser
  | 'mcpBrowser:connect'
  | 'mcpBrowser:disconnect'
  | 'mcpBrowser:isConnected'
  | 'mcpBrowser:getTabs'
  | 'mcpBrowser:sessions:list'
  | 'mcpBrowser:sessions:setCurrent'
  | 'mcpBrowser:sessions:getCurrent'
  | 'mcpBrowser:navigate'
  | 'mcpBrowser:screenshot'
  | 'mcpBrowser:snapshot'
  | 'mcpBrowser:click'
  | 'mcpBrowser:type'
  | 'mcpBrowser:closeSession'
  | 'mcpBrowser:stats'
  | 'mcpBrowser:scroll'
  | 'mcpBrowser:scrollToEnd'
  | 'mcpBrowser:evaluate'
  | 'mcpBrowser:waitForSelector';

export interface LLMRequest {
  model: string;
  messages: Message[];
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMStreamChunk {
  content: string;
  done: boolean;
}

export interface ShellExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// Channel types
export interface Channel {
  id: string;
  channel_type: string;
  account_id: string;
  name: string;
  enabled: number;
  config_json: string;
  created_at: number;
  updated_at: number;
}

export interface ChannelMessage {
  id: string;
  channelId: string;
  messageId: string;
  peerId: string;
  peerType: 'direct' | 'group' | 'channel' | 'thread';
  direction: 'inbound' | 'outbound';
  content?: string;
  media?: { type: string; url: string; caption?: string };
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export interface ChannelType {
  id: string;
  name: string;
  description: string;
  icon: string;
  capabilities: {
    chatTypes: Array<'direct' | 'group' | 'channel' | 'thread'>;
    media?: boolean;
    reactions?: boolean;
    polls?: boolean;
    nativeCommands?: boolean;
    blockStreaming?: boolean;
  };
  defaultConfig: Record<string, unknown>;
  configSchema: Array<{
    key: string;
    type: 'text' | 'password' | 'number' | 'boolean' | 'textarea' | 'select';
    label: string;
    placeholder?: string;
    required: boolean;
    hint?: string;
    options?: Array<{ value: string; label: string }>;
  }>;
}

// Browser types
export interface BrowserProfile {
  id: string;
  name: string;
  user_data_dir?: string;
  headless: number;
  viewport_width: number;
  viewport_height: number;
  created_at: number;
  updated_at: number;
}

export interface BrowserSession {
  id: string;
  profile_id: string;
  page_id: string;
  url?: string;
  title?: string;
  created_at: number;
  updated_at: number;
}
