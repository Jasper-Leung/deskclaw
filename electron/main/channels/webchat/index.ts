import { WebSocketServer, WebSocket } from 'ws';
import type { ChannelPlugin, ChannelMessage, SendOptions } from '../channel-plugin.js';
import { channelRegistry } from '../channel-registry.js';

export interface WebChatConfig {
  port: number;
  host?: string;
  path?: string;
  maxConnections?: number;
  heartbeatInterval?: number;
}

interface WebChatClient {
  id: string;
  ws: WebSocket;
  peerId: string;
  lastHeartbeat: number;
}

interface IncomingMessage {
  type: 'message' | 'heartbeat' | 'auth';
  content?: string;
  peerId?: string;
  token?: string;
}

export class WebChatChannel implements ChannelPlugin<WebChatConfig> {
  id = 'webchat';
  name = 'WebChat';
  description = 'Built-in web chat via WebSocket';
  capabilities = {
    chatTypes: ['direct'] as Array<'direct' | 'group' | 'channel' | 'thread'>,
    media: false,
    reactions: false,
    polls: false,
    nativeCommands: false,
    blockStreaming: false,
  };

  private server?: WebSocketServer;
  private config?: WebChatConfig;
  private messageCallback?: (message: ChannelMessage) => void;
  private clients = new Map<string, WebChatClient>();
  private running = false;
  private heartbeatTimer?: NodeJS.Timeout;

  async initialize(config: WebChatConfig): Promise<void> {
    this.config = {
      host: '0.0.0.0',
      path: '/ws',
      maxConnections: 100,
      heartbeatInterval: 30000,
      ...config,
    };

    if (!this.config.port || this.config.port < 1 || this.config.port > 65535) {
      throw new Error('Valid port number (1-65535) is required');
    }
  }

  async start(): Promise<void> {
    if (!this.config) {
      throw new Error('Channel not initialized. Call initialize() first.');
    }

    if (this.running) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        this.server = new WebSocketServer({
          host: this.config!.host,
          port: this.config!.port,
          path: this.config!.path,
        });

        this.server.on('connection', (ws, req) => {
          this.handleConnection(ws, req);
        });

        this.server.on('error', (error) => {
          console.error('[WebChat] Server error:', error);
          if (!this.running) {
            reject(error);
          }
        });

        this.server.on('listening', () => {
          this.running = true;
          console.log(
            `[WebChat] Server listening on ${this.config!.host}:${this.config!.port}${this.config!.path}`
          );
          this.startHeartbeatCheck();
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async stop(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }

    for (const client of this.clients.values()) {
      client.ws.close(1001, 'Server shutting down');
    }
    this.clients.clear();

    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          this.running = false;
          console.log('[WebChat] Server stopped');
          resolve();
        });
      });
    }

    this.running = false;
  }

  isConnected(): boolean {
    return this.server !== undefined && this.running;
  }

  onMessage(callback: (message: ChannelMessage) => void): void {
    this.messageCallback = callback;
  }

  async sendMessage(peerId: string, content: string, _options?: SendOptions): Promise<string> {
    const client = this.clients.get(peerId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      throw new Error(`Client ${peerId} not connected`);
    }

    const messageId = `webchat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return new Promise((resolve, reject) => {
      try {
        const message = JSON.stringify({
          type: 'message',
          id: messageId,
          content,
          timestamp: Date.now(),
        });

        client.ws.send(message, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve(messageId);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  validateConfig(config: unknown): { valid: boolean; error?: string } {
    if (typeof config !== 'object' || config === null) {
      return { valid: false, error: 'Config must be an object' };
    }

    const cfg = config as Partial<WebChatConfig>;

    if (!cfg.port || typeof cfg.port !== 'number') {
      return {
        valid: false,
        error: 'port is required and must be a number',
      };
    }

    if (cfg.port < 1 || cfg.port > 65535) {
      return {
        valid: false,
        error: 'port must be between 1 and 65535',
      };
    }

    return { valid: true };
  }

  getDefaultConfig(): WebChatConfig {
    return {
      port: 8080,
      host: '0.0.0.0',
      path: '/ws',
      maxConnections: 100,
      heartbeatInterval: 30000,
    };
  }

  private handleConnection(ws: WebSocket, _req: any): void {
    if (this.clients.size >= (this.config?.maxConnections || 100)) {
      ws.close(1013, 'Maximum connections reached');
      return;
    }

    const clientId = this.generateClientId();
    const peerId = clientId;

    const client: WebChatClient = {
      id: clientId,
      ws,
      peerId,
      lastHeartbeat: Date.now(),
    };

    this.clients.set(peerId, client);

    console.log(`[WebChat] Client connected: ${clientId}`);

    ws.on('message', (data: Buffer) => {
      this.handleMessage(client, data);
    });

    ws.on('close', () => {
      this.clients.delete(peerId);
      console.log(`[WebChat] Client disconnected: ${clientId}`);
    });

    ws.on('error', (error) => {
      console.error(`[WebChat] Client error (${clientId}):`, error);
      this.clients.delete(peerId);
    });

    ws.send(
      JSON.stringify({
        type: 'connected',
        clientId,
        timestamp: Date.now(),
      })
    );
  }

  private handleMessage(client: WebChatClient, data: Buffer): void {
    try {
      const msg: IncomingMessage = JSON.parse(data.toString());

      switch (msg.type) {
        case 'message':
          this.processIncomingMessage(client, msg);
          break;
        case 'heartbeat':
          client.lastHeartbeat = Date.now();
          client.ws.send(JSON.stringify({ type: 'heartbeat_ack' }));
          break;
        case 'auth':
          if (msg.peerId) {
            this.clients.delete(client.peerId);
            client.peerId = msg.peerId;
            this.clients.set(client.peerId, client);
          }
          break;
      }
    } catch (error) {
      console.error('[WebChat] Failed to parse message:', error);
    }
  }

  private processIncomingMessage(client: WebChatClient, msg: IncomingMessage): void {
    if (!this.messageCallback || !msg.content) return;

    const messageId = `webchat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const channelMessage: ChannelMessage = {
      id: messageId,
      channelId: 'webchat',
      messageId,
      peerId: client.peerId,
      peerType: 'direct',
      direction: 'inbound',
      content: msg.content,
      timestamp: Date.now(),
      metadata: {
        clientId: client.id,
      },
    };

    this.messageCallback(channelMessage);
  }

  private startHeartbeatCheck(): void {
    if (!this.config?.heartbeatInterval) return;

    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      const timeout = this.config!.heartbeatInterval! * 2;

      for (const [peerId, client] of this.clients) {
        if (now - client.lastHeartbeat > timeout) {
          console.log(`[WebChat] Client timeout: ${client.id}`);
          client.ws.close(1001, 'Heartbeat timeout');
          this.clients.delete(peerId);
        }
      }
    }, this.config.heartbeatInterval);
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getConnectedClients(): string[] {
    return Array.from(this.clients.keys());
  }
}

export const webChatChannel = new WebChatChannel();

channelRegistry.register(webChatChannel as any, {
  id: 'webchat',
  name: 'WebChat',
  description: 'Built-in web chat via WebSocket',
  icon: 'globe',
  capabilities: webChatChannel.capabilities,
  defaultConfig: {
    port: 8080,
    host: '0.0.0.0',
    path: '/ws',
    maxConnections: 100,
    heartbeatInterval: 30000,
  },
  configSchema: [
    {
      key: 'port',
      type: 'number',
      label: 'Port',
      placeholder: '8080',
      required: true,
      hint: 'WebSocket server port',
    },
    {
      key: 'host',
      type: 'text',
      label: 'Host',
      placeholder: '0.0.0.0',
      required: false,
      hint: 'Host to bind to (default: 0.0.0.0)',
    },
    {
      key: 'path',
      type: 'text',
      label: 'WebSocket Path',
      placeholder: '/ws',
      required: false,
      hint: 'WebSocket endpoint path',
    },
    {
      key: 'maxConnections',
      type: 'number',
      label: 'Max Connections',
      placeholder: '100',
      required: false,
      hint: 'Maximum simultaneous connections',
    },
    {
      key: 'heartbeatInterval',
      type: 'number',
      label: 'Heartbeat Interval (ms)',
      placeholder: '30000',
      required: false,
      hint: 'Heartbeat check interval in milliseconds',
    },
  ],
});
