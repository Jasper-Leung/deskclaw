/**
 * Gateway Protocol Types
 *
 * Defines the WebSocket protocol for Gateway communication.
 */

export interface GatewayRequest {
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

export interface GatewayResponse {
  id: string;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface GatewayEvent {
  event: string;
  data: unknown;
}

export type GatewayMessage = GatewayRequest | GatewayResponse | GatewayEvent;

export interface GatewayClient {
  id: string;
  type: 'ui' | 'cli' | 'node' | 'channel';
  name?: string;
  connectedAt: number;
  lastActivity: number;
}

export interface GatewaySession {
  id: string;
  channelId?: string;
  peerId?: string;
  model?: string;
  messages: GatewayMessageEntry[];
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface GatewayMessageEntry {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: number;
  toolCalls?: ToolCallEntry[];
  toolCallId?: string;
}

export interface ToolCallEntry {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface GatewayConfig {
  port: number;
  host: string;
  auth?: {
    mode: 'none' | 'token' | 'password';
    token?: string;
    password?: string;
  };
}

export interface ChannelStatus {
  id: string;
  type: string;
  name: string;
  enabled: boolean;
  connected: boolean;
  error?: string;
  stats?: {
    messagesReceived: number;
    messagesSent: number;
    lastMessage?: number;
  };
}

export interface NodeCapabilities {
  id: string;
  type: string;
  capabilities: string[];
  permissions: Record<string, boolean>;
}

export const GatewayMethods = {
  SESSIONS_LIST: 'sessions.list',
  SESSIONS_GET: 'sessions.get',
  SESSIONS_SEND: 'sessions.send',
  SESSIONS_PATCH: 'sessions.patch',
  SESSIONS_DELETE: 'sessions.delete',
  SESSIONS_HISTORY: 'sessions.history',

  CONFIG_GET: 'config.get',
  CONFIG_SET: 'config.set',

  CHANNELS_LIST: 'channels.list',
  CHANNELS_STATUS: 'channels.status',
  CHANNELS_START: 'channels.start',
  CHANNELS_STOP: 'channels.stop',

  NODES_LIST: 'nodes.list',
  NODES_DESCRIBE: 'nodes.describe',
  NODES_INVOKE: 'nodes.invoke',

  AGENT_SEND: 'agent.send',
  AGENT_STREAM: 'agent.stream',

  TOOLS_LIST: 'tools.list',
  TOOLS_EXECUTE: 'tools.execute',

  PAIRING_APPROVE: 'pairing.approve',
  PAIRING_LIST: 'pairing.list',
  PAIRING_REJECT: 'pairing.reject',
} as const;

export const GatewayEvents = {
  MESSAGE: 'message',
  TYPING: 'typing',
  PRESENCE: 'presence',
  SESSION_CREATED: 'session.created',
  SESSION_DELETED: 'session.deleted',
  CHANNEL_CONNECTED: 'channel.connected',
  CHANNEL_DISCONNECTED: 'channel.disconnected',
  NODE_REGISTERED: 'node.registered',
  NODE_UNREGISTERED: 'node.unregistered',
  ERROR: 'error',
} as const;
