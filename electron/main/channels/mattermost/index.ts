import type { ChannelPlugin, ChannelMessage, SendOptions } from '../channel-plugin.js';
import { channelRegistry } from '../channel-registry.js';

export interface MattermostConfig {
  serverUrl: string;
  accessToken: string;
  teamId?: string;
  allowedChannels?: string[];
  allowedUsers?: string[];
}

interface MattermostPost {
  id: string;
  create_at: number;
  update_at: number;
  user_id: string;
  channel_id: string;
  message: string;
  type: string;
  parent_id?: string;
  root_id?: string;
  props?: Record<string, unknown>;
}

interface MattermostUser {
  id: string;
  username: string;
  nickname: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface MattermostChannelInfo {
  id: string;
  name: string;
  display_name: string;
  type: 'O' | 'P' | 'D' | 'G';
  team_id: string;
}

interface WebSocketMessage {
  event: string;
  data: Record<string, unknown>;
  broadcast?: {
    channel_id: string;
    user_id: string;
  };
}

export class MattermostChannel implements ChannelPlugin<MattermostConfig> {
  id = 'mattermost';
  name = 'Mattermost';
  description = 'Mattermost integration via REST API and WebSocket';
  capabilities = {
    chatTypes: ['direct', 'group', 'channel', 'thread'] as Array<
      'direct' | 'group' | 'channel' | 'thread'
    >,
    media: true,
    reactions: true,
    polls: false,
    nativeCommands: true,
    blockStreaming: false,
  };

  private config?: MattermostConfig;
  private ws?: WebSocket;
  private messageCallback?: (message: ChannelMessage) => void;
  private running = false;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelay = 5000;

  async initialize(config: MattermostConfig): Promise<void> {
    this.config = config;

    if (!config.serverUrl || !config.accessToken) {
      throw new Error('Mattermost serverUrl and accessToken are required');
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
        `Failed to verify Mattermost connection: ${
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

    await this.connectWebSocket();
    this.running = true;
    console.log('[Mattermost] Channel started');
  }

  async stop(): Promise<void> {
    this.running = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }

    console.log('[Mattermost] Channel stopped');
  }

  isConnected(): boolean {
    return this.ws !== undefined && this.ws.readyState === WebSocket.OPEN && this.running;
  }

  onMessage(callback: (message: ChannelMessage) => void): void {
    this.messageCallback = callback;
  }

  async sendMessage(peerId: string, content: string, options?: SendOptions): Promise<string> {
    if (!this.config) {
      throw new Error('Channel not initialized');
    }

    const post: Record<string, unknown> = {
      channel_id: peerId,
      message: content,
    };

    if (options?.replyTo) {
      post.root_id = options.replyTo;
    }

    try {
      const response = await this.apiRequest<MattermostPost>('POST', '/api/v4/posts', post);
      return response.id;
    } catch (error) {
      throw new Error(
        `Failed to send Mattermost message: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  validateConfig(config: unknown): { valid: boolean; error?: string } {
    if (typeof config !== 'object' || config === null) {
      return { valid: false, error: 'Config must be an object' };
    }

    const cfg = config as Partial<MattermostConfig>;

    if (!cfg.serverUrl || typeof cfg.serverUrl !== 'string') {
      return {
        valid: false,
        error: 'serverUrl is required and must be a string',
      };
    }

    if (!cfg.accessToken || typeof cfg.accessToken !== 'string') {
      return {
        valid: false,
        error: 'accessToken is required and must be a string',
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

  getDefaultConfig(): MattermostConfig {
    return {
      serverUrl: '',
      accessToken: '',
      teamId: '',
    };
  }

  async getAccountInfo(): Promise<{
    userId: string;
    username: string;
    email: string;
  }> {
    if (!this.config) {
      throw new Error('Channel not initialized');
    }

    const user = await this.apiRequest<MattermostUser>('GET', '/api/v4/users/me');

    return {
      userId: user.id,
      username: user.username,
      email: user.email,
    };
  }

  private async verifyConnection(): Promise<void> {
    await this.apiRequest<MattermostUser>('GET', '/api/v4/users/me');
  }

  private async apiRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.config) {
      throw new Error('Not configured');
    }

    const url = `${this.config.serverUrl}${path}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.accessToken}`,
      'Content-Type': 'application/json',
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

    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  private async connectWebSocket(): Promise<void> {
    if (!this.config) {
      return;
    }

    const wsUrl = this.config.serverUrl.replace(/^http/, 'ws') + '/api/v4/websocket';

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log('[Mattermost] WebSocket connected');
          this.reconnectAttempts = 0;

          this.ws?.send(
            JSON.stringify({
              seq: 1,
              action: 'authentication_challenge',
              data: {
                token: this.config!.accessToken,
              },
            })
          );

          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            this.handleWebSocketMessage(message);
          } catch (error) {
            console.error('[Mattermost] Failed to parse WebSocket message:', error);
          }
        };

        this.ws.onclose = (event) => {
          console.log('[Mattermost] WebSocket closed:', event.code, event.reason);
          this.ws = undefined;

          if (this.running && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
          }
        };

        this.ws.onerror = (error) => {
          console.error('[Mattermost] WebSocket error:', error);
          reject(new Error('WebSocket connection failed'));
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    console.log(
      `[Mattermost] Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`
    );

    this.reconnectTimer = setTimeout(async () => {
      if (this.running) {
        try {
          await this.connectWebSocket();
        } catch (error) {
          console.error('[Mattermost] Reconnect failed:', error);
        }
      }
    }, this.reconnectDelay * this.reconnectAttempts);
  }

  private handleWebSocketMessage(message: WebSocketMessage): void {
    if (message.event === 'posted' && message.data?.post) {
      this.handleNewPost(message);
    }
  }

  private async handleNewPost(message: WebSocketMessage): Promise<void> {
    if (!this.messageCallback || !this.config) return;

    try {
      const postJson = message.data.post as string;
      const post: MattermostPost = JSON.parse(postJson);

      if (post.type === 'system_post' || post.type === 'joinleave') {
        return;
      }

      if (!this.isAllowed(post)) {
        return;
      }

      const [userInfo, channelInfo] = await Promise.all([
        this.apiRequest<MattermostUser>('GET', `/api/v4/users/${post.user_id}`),
        this.apiRequest<MattermostChannelInfo>('GET', `/api/v4/channels/${post.channel_id}`),
      ]);

      const channelMessage: ChannelMessage = {
        id: `mattermost_${post.id}`,
        channelId: post.channel_id,
        messageId: post.id,
        peerId: post.channel_id,
        peerType: this.getPeerType(channelInfo),
        direction: 'inbound',
        content: post.message,
        timestamp: post.create_at,
        metadata: {
          from: {
            id: post.user_id,
            name: userInfo.nickname || userInfo.username,
            username: userInfo.username,
          },
          channel: {
            id: post.channel_id,
            name: channelInfo.name,
            displayName: channelInfo.display_name,
            type: channelInfo.type,
          },
          rootId: post.root_id,
          parentId: post.parent_id,
        },
      };

      this.messageCallback(channelMessage);
    } catch (error) {
      console.error('[Mattermost] Failed to handle new post:', error);
    }
  }

  private isAllowed(post: MattermostPost): boolean {
    if (!this.config) return true;

    if (this.config.allowedChannels && this.config.allowedChannels.length > 0) {
      if (!this.config.allowedChannels.includes(post.channel_id)) {
        return false;
      }
    }

    if (this.config.allowedUsers && this.config.allowedUsers.length > 0) {
      if (!this.config.allowedUsers.includes(post.user_id)) {
        return false;
      }
    }

    return true;
  }

  private getPeerType(channel: MattermostChannelInfo): 'direct' | 'group' | 'channel' | 'thread' {
    switch (channel.type) {
      case 'D':
        return 'direct';
      case 'G':
        return 'group';
      case 'P':
        return 'group';
      case 'O':
      default:
        return 'channel';
    }
  }
}

export const mattermostChannel = new MattermostChannel();

channelRegistry.register(mattermostChannel as unknown as ChannelPlugin, {
  id: 'mattermost',
  name: 'Mattermost',
  description: 'Mattermost integration via REST API and WebSocket',
  icon: 'message-circle',
  capabilities: mattermostChannel.capabilities,
  defaultConfig: {
    serverUrl: '',
    accessToken: '',
    teamId: '',
  },
  configSchema: [
    {
      key: 'serverUrl',
      type: 'text',
      label: 'Server URL',
      placeholder: 'https://mattermost.example.com',
      required: true,
      hint: 'Your Mattermost server URL',
    },
    {
      key: 'accessToken',
      type: 'password',
      label: 'Access Token',
      placeholder: 'Your personal access token',
      required: true,
      hint: 'Personal Access Token from Account Settings > Security',
    },
    {
      key: 'teamId',
      type: 'text',
      label: 'Team ID (optional)',
      placeholder: 'team-id',
      required: false,
      hint: 'Specific team ID to use. Leave empty for all teams.',
    },
    {
      key: 'allowedChannels',
      type: 'text',
      label: 'Allowed Channels (optional)',
      placeholder: 'channel-id1,channel-id2',
      required: false,
      hint: 'Comma-separated channel IDs. Leave empty for all channels.',
    },
    {
      key: 'allowedUsers',
      type: 'text',
      label: 'Allowed Users (optional)',
      placeholder: 'user-id1,user-id2',
      required: false,
      hint: 'Comma-separated user IDs. Leave empty for all users.',
    },
  ],
});
