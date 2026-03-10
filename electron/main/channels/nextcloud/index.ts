import type { ChannelPlugin, ChannelMessage, SendOptions } from '../channel-plugin.js';
import { channelRegistry } from '../channel-registry.js';

export interface NextcloudConfig {
  serverUrl: string;
  username: string;
  password: string;
  allowedConversations?: string[];
  allowedUsers?: string[];
}

interface NextcloudConversation {
  id: number;
  token: string;
  name: string;
  displayName: string;
  type: number;
  participantType: number;
  lastPing: number;
  sessionId: string;
  hasPassword: boolean;
  sessionIdHasPassword: boolean;
  unreadMessages: number;
  unreadMention: boolean;
  isFavorite: boolean;
  lastActivity: number;
  lastReadMessage: number;
  hasCall: boolean;
  callFlag: number;
  notificationLevel: number;
  lobbyState: number;
  lobbyTimer: number;
  lastMessage?: NextcloudMessage;
  canStartCall: boolean;
  canLeaveConversation: boolean;
  canDeleteConversation: boolean;
}

interface NextcloudMessage {
  id: number;
  token: string;
  actorType: string;
  actorId: string;
  actorDisplayName: string;
  timestamp: number;
  message: string;
  messageParameters: Record<string, unknown>;
  systemMessage: string;
  messageType: string;
  isReplyable: boolean;
  referenceId: string;
}

interface NextcloudUser {
  id: string;
  label: string;
  source: string;
}

interface NextcloudSignalingMessage {
  type: string;
  data?: Record<string, unknown>;
}

export class NextcloudChannel implements ChannelPlugin<NextcloudConfig> {
  id = 'nextcloud';
  name = 'Nextcloud Talk';
  description = 'Nextcloud Talk integration via REST API';
  capabilities = {
    chatTypes: ['direct', 'group', 'channel'] as Array<'direct' | 'group' | 'channel'>,
    media: true,
    reactions: false,
    polls: false,
    nativeCommands: false,
    blockStreaming: false,
  };

  private config?: NextcloudConfig;
  private ws?: WebSocket;
  private messageCallback?: (message: ChannelMessage) => void;
  private running = false;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelay = 5000;
  private pollInterval?: ReturnType<typeof setInterval>;

  async initialize(config: NextcloudConfig): Promise<void> {
    this.config = config;

    if (!config.serverUrl || !config.username || !config.password) {
      throw new Error('Nextcloud serverUrl, username, and password are required');
    }

    let normalizedUrl = config.serverUrl.trim();
    if (normalizedUrl.endsWith('/')) {
      normalizedUrl = normalizedUrl.slice(0, -1);
    }

    this.config.serverUrl = normalizedUrl;

    try {
      await this.verifyConnection();
    } catch (error) {
      throw new Error(
        `Failed to verify Nextcloud connection: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async start(): Promise<void> {
    if (!this.config) {
      throw new Error('Channel not initialized. Call initialize() first.');
    }

    if (this.running) {
      return;
    }

    await this.connectSignaling();
    this.startPolling();
    this.running = true;
    console.log('[Nextcloud] Channel started');
  }

  async stop(): Promise<void> {
    this.running = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }

    console.log('[Nextcloud] Channel stopped');
  }

  isConnected(): boolean {
    return this.running;
  }

  onMessage(callback: (message: ChannelMessage) => void): void {
    this.messageCallback = callback;
  }

  async sendMessage(peerId: string, content: string, options?: SendOptions): Promise<string> {
    if (!this.config) {
      throw new Error('Channel not initialized');
    }

    const body: Record<string, unknown> = {
      message: content,
    };

    if (options?.replyTo) {
      body.replyTo = options.replyTo;
    }

    try {
      const response = await this.apiRequest<NextcloudMessage>(
        'POST',
        `/ocs/v2.php/apps/spreed/api/v1/chat/${peerId}`,
        body
      );
      return String(response.id);
    } catch (error) {
      throw new Error(
        `Failed to send Nextcloud message: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  validateConfig(config: unknown): { valid: boolean; error?: string } {
    if (typeof config !== 'object' || config === null) {
      return { valid: false, error: 'Config must be an object' };
    }

    const cfg = config as Partial<NextcloudConfig>;

    if (!cfg.serverUrl || typeof cfg.serverUrl !== 'string') {
      return {
        valid: false,
        error: 'serverUrl is required and must be a string',
      };
    }

    if (!cfg.username || typeof cfg.username !== 'string') {
      return {
        valid: false,
        error: 'username is required and must be a string',
      };
    }

    if (!cfg.password || typeof cfg.password !== 'string') {
      return {
        valid: false,
        error: 'password is required and must be a string',
      };
    }

    try {
      new URL(cfg.serverUrl);
    } catch {
      return {
        valid: false,
        error: 'serverUrl must be a valid URL',
      };
    }

    return { valid: true };
  }

  getDefaultConfig(): NextcloudConfig {
    return {
      serverUrl: '',
      username: '',
      password: '',
    };
  }

  async getAccountInfo(): Promise<{
    userId: string;
    username: string;
    displayName: string;
  }> {
    if (!this.config) {
      throw new Error('Channel not initialized');
    }

    const user = await this.apiRequest<{ id: string; displayName: string }>(
      'GET',
      '/ocs/v2.php/cloud/user'
    );

    return {
      userId: user.id,
      username: this.config.username,
      displayName: user.displayName,
    };
  }

  private async verifyConnection(): Promise<void> {
    await this.apiRequest<NextcloudUser[]>('GET', '/ocs/v2.php/cloud/user');
  }

  private getAuthHeader(): string {
    if (!this.config) {
      return '';
    }
    const credentials = Buffer.from(`${this.config.username}:${this.config.password}`).toString(
      'base64'
    );
    return `Basic ${credentials}`;
  }

  private async apiRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.config) {
      throw new Error('Not configured');
    }

    const url = `${this.config.serverUrl}${path}`;

    const headers: Record<string, string> = {
      Authorization: this.getAuthHeader(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'OCS-APIRequest': 'true',
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `API request failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const data = (await response.json()) as { ocs?: { data?: T } };

    if (data.ocs && data.ocs.data !== undefined) {
      return data.ocs.data;
    }

    return data as T;
  }

  private async connectSignaling(): Promise<void> {
    if (!this.config) {
      return;
    }

    try {
      const signalingSettings = await this.apiRequest<{
        server: string;
        ticket: string;
      }>('GET', '/ocs/v2.php/apps/spreed/api/v4/signaling/settings');

      if (!signalingSettings.server || !signalingSettings.ticket) {
        console.log('[Nextcloud] No signaling server configured, using polling only');
        return;
      }

      const wsUrl = signalingSettings.server.replace(/^http/, 'ws');

      return new Promise((resolve, reject) => {
        try {
          this.ws = new WebSocket(wsUrl);

          this.ws.onopen = () => {
            console.log('[Nextcloud] Signaling WebSocket connected');
            this.reconnectAttempts = 0;

            this.ws?.send(
              JSON.stringify({
                type: 'hello',
                hello: {
                  version: '1.0',
                  auth: {
                    token: signalingSettings.ticket,
                  },
                },
              })
            );

            resolve();
          };

          this.ws.onmessage = (event) => {
            try {
              const message: NextcloudSignalingMessage = JSON.parse(event.data);
              this.handleSignalingMessage(message);
            } catch (error) {
              console.error('[Nextcloud] Failed to parse signaling message:', error);
            }
          };

          this.ws.onclose = (event) => {
            console.log('[Nextcloud] Signaling WebSocket closed:', event.code, event.reason);
            this.ws = undefined;

            if (this.running && this.reconnectAttempts < this.maxReconnectAttempts) {
              this.scheduleReconnect();
            }
          };

          this.ws.onerror = (error) => {
            console.error('[Nextcloud] Signaling WebSocket error:', error);
            reject(new Error('Signaling WebSocket connection failed'));
          };
        } catch (error) {
          reject(error);
        }
      });
    } catch (error) {
      console.log('[Nextcloud] Failed to connect signaling, using polling only:', error);
    }
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    console.log(
      `[Nextcloud] Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`
    );

    this.reconnectTimer = setTimeout(async () => {
      if (this.running) {
        try {
          await this.connectSignaling();
        } catch (error) {
          console.error('[Nextcloud] Reconnect failed:', error);
        }
      }
    }, this.reconnectDelay * this.reconnectAttempts);
  }

  private handleSignalingMessage(message: NextcloudSignalingMessage): void {
    switch (message.type) {
      case 'hello':
        break;
      case 'message':
        if (message.data?.type === 'chat') {
          this.handleChatMessage(message.data);
        }
        break;
      case 'event':
        if (message.data?.target === 'room' && message.data?.type === 'message') {
          this.fetchNewMessages();
        }
        break;
    }
  }

  private handleChatMessage(data: Record<string, unknown>): void {
    if (!this.messageCallback || !this.config) return;

    const message = data.message as Record<string, unknown>;
    if (!message) return;

    const channelMessage: ChannelMessage = {
      id: `nextcloud_${message.id}`,
      channelId: data.room as string,
      messageId: String(message.id),
      peerId: data.room as string,
      peerType: this.getPeerType(data.roomType as number),
      direction: 'inbound',
      content: message.message as string,
      timestamp: (message.timestamp as number) * 1000,
      metadata: {
        from: {
          id: message.actorId as string,
          name: message.actorDisplayName as string,
          type: message.actorType as string,
        },
      },
    };

    this.messageCallback(channelMessage);
  }

  private startPolling(): void {
    this.pollInterval = setInterval(async () => {
      if (this.running) {
        await this.fetchNewMessages();
      }
    }, 5000);
  }

  private async fetchNewMessages(): Promise<void> {
    if (!this.config || !this.messageCallback) return;

    try {
      const conversations = await this.apiRequest<NextcloudConversation[]>(
        'GET',
        '/ocs/v2.php/apps/spreed/api/v4/room'
      );

      for (const conversation of conversations) {
        if (conversation.unreadMessages > 0) {
          await this.fetchConversationMessages(conversation);
        }
      }
    } catch (error) {
      console.error('[Nextcloud] Failed to fetch new messages:', error);
    }
  }

  private async fetchConversationMessages(conversation: NextcloudConversation): Promise<void> {
    if (!this.config || !this.messageCallback) return;

    try {
      const messages = await this.apiRequest<NextcloudMessage[]>(
        'GET',
        `/ocs/v2.php/apps/spreed/api/v1/chat/${conversation.token}?lookIntoFuture=1&limit=50`
      );

      for (const message of messages) {
        if (message.systemMessage || message.actorId === this.config.username) {
          continue;
        }

        if (!this.isAllowed(conversation, message)) {
          continue;
        }

        const channelMessage: ChannelMessage = {
          id: `nextcloud_${message.id}`,
          channelId: conversation.token,
          messageId: String(message.id),
          peerId: conversation.token,
          peerType: this.getPeerType(conversation.type),
          direction: 'inbound',
          content: message.message,
          timestamp: message.timestamp * 1000,
          metadata: {
            from: {
              id: message.actorId,
              name: message.actorDisplayName,
              type: message.actorType,
            },
            conversation: {
              token: conversation.token,
              name: conversation.name,
              displayName: conversation.displayName,
              type: conversation.type,
            },
            referenceId: message.referenceId,
          },
        };

        this.messageCallback(channelMessage);
      }
    } catch (error) {
      console.error('[Nextcloud] Failed to fetch conversation messages:', error);
    }
  }

  private isAllowed(conversation: NextcloudConversation, message: NextcloudMessage): boolean {
    if (!this.config) return true;

    if (this.config.allowedConversations && this.config.allowedConversations.length > 0) {
      if (!this.config.allowedConversations.includes(conversation.token)) {
        return false;
      }
    }

    if (this.config.allowedUsers && this.config.allowedUsers.length > 0) {
      if (!this.config.allowedUsers.includes(message.actorId)) {
        return false;
      }
    }

    return true;
  }

  private getPeerType(type: number): 'direct' | 'group' | 'channel' {
    switch (type) {
      case 1:
        return 'direct';
      case 2:
        return 'group';
      case 3:
        return 'channel';
      case 4:
        return 'group';
      default:
        return 'group';
    }
  }
}

export const nextcloudChannel = new NextcloudChannel();

channelRegistry.register(nextcloudChannel as unknown as ChannelPlugin, {
  id: 'nextcloud',
  name: 'Nextcloud Talk',
  description: 'Nextcloud Talk integration via REST API',
  icon: 'cloud',
  capabilities: nextcloudChannel.capabilities,
  defaultConfig: {
    serverUrl: '',
    username: '',
    password: '',
  },
  configSchema: [
    {
      key: 'serverUrl',
      type: 'text',
      label: 'Server URL',
      placeholder: 'https://nextcloud.example.com',
      required: true,
      hint: 'Your Nextcloud server URL',
    },
    {
      key: 'username',
      type: 'text',
      label: 'Username',
      placeholder: 'your-username',
      required: true,
      hint: 'Your Nextcloud username',
    },
    {
      key: 'password',
      type: 'password',
      label: 'Password / App Password',
      placeholder: 'Your password or app password',
      required: true,
      hint: 'Use an App Password from Security settings for better security',
    },
    {
      key: 'allowedConversations',
      type: 'text',
      label: 'Allowed Conversations (optional)',
      placeholder: 'conversation-token1,conversation-token2',
      required: false,
      hint: 'Comma-separated conversation tokens. Leave empty for all.',
    },
    {
      key: 'allowedUsers',
      type: 'text',
      label: 'Allowed Users (optional)',
      placeholder: 'user1,user2',
      required: false,
      hint: 'Comma-separated user IDs. Leave empty for all users.',
    },
  ],
});
