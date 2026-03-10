import type { ChannelPlugin, ChannelMessage, SendOptions } from '../channel-plugin.js';
import { channelRegistry } from '../channel-registry.js';

export interface SynologyConfig {
  serverUrl: string;
  token: string;
  webhookUrl?: string;
  allowedChannels?: string[];
  allowedUsers?: string[];
}

interface SynologyChatResponse<T = unknown> {
  success: boolean;
  error?: {
    code: number;
    message: string;
  };
  data?: T;
}

interface SynologyMessage {
  message_id: string;
  channel_id: string;
  user_id: string;
  text: string;
  timestamp: number;
  user_name?: string;
  channel_name?: string;
  thread_id?: string;
}

interface SynologyUserInfo {
  user_id: string;
  username: string;
  display_name?: string;
  email?: string;
}

interface SynologyChannelInfo {
  channel_id: string;
  name: string;
  type: 'private' | 'public' | 'direct';
  members?: string[];
}

export class SynologyChannel implements ChannelPlugin<SynologyConfig> {
  id = 'synology';
  name = 'Synology Chat';
  description = 'Synology Chat integration via Webhook and API';
  capabilities = {
    chatTypes: ['direct', 'group', 'channel'] as Array<'direct' | 'group' | 'channel'>,
    media: true,
    reactions: false,
    polls: false,
    nativeCommands: false,
    blockStreaming: false,
  };

  private config?: SynologyConfig;
  private messageCallback?: (message: ChannelMessage) => void;
  private running = false;
  private pollInterval?: ReturnType<typeof setInterval>;
  private lastMessageTimestamp = 0;
  private readonly pollIntervalMs = 3000;

  async initialize(config: SynologyConfig): Promise<void> {
    this.config = config;

    if (!config.serverUrl || !config.token) {
      throw new Error('Synology serverUrl and token are required');
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
        `Failed to verify Synology connection: ${
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

    this.running = true;
    this.startPolling();
    console.log('[Synology] Channel started');
  }

  async stop(): Promise<void> {
    this.running = false;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }

    console.log('[Synology] Channel stopped');
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

    const payload: Record<string, unknown> = {
      text: content,
      channel_id: peerId,
    };

    if (options?.replyTo) {
      payload.thread_id = options.replyTo;
    }

    try {
      if (this.config.webhookUrl) {
        return await this.sendViaWebhook(content, peerId, options?.replyTo);
      }

      const response = await this.apiRequest<SynologyChatResponse<{ message_id: string }>>(
        'POST',
        '/webapi/entry.cgi',
        {
          api: 'SYNO.Chat.Message',
          version: 2,
          method: 'send',
          token: this.config.token,
          payload: JSON.stringify(payload),
        }
      );

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to send message');
      }

      return response.data?.message_id || `synology_${Date.now()}`;
    } catch (error) {
      throw new Error(
        `Failed to send Synology message: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async sendViaWebhook(
    content: string,
    channelId: string,
    threadId?: string
  ): Promise<string> {
    if (!this.config?.webhookUrl) {
      throw new Error('Webhook URL not configured');
    }

    const payload: Record<string, unknown> = {
      text: content,
      channel_id: channelId,
    };

    if (threadId) {
      payload.thread_id = threadId;
    }

    const response = await fetch(this.config.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Webhook request failed: ${response.status} - ${errorText}`);
    }

    return `synology_${Date.now()}`;
  }

  validateConfig(config: unknown): { valid: boolean; error?: string } {
    if (typeof config !== 'object' || config === null) {
      return { valid: false, error: 'Config must be an object' };
    }

    const cfg = config as Partial<SynologyConfig>;

    if (!cfg.serverUrl || typeof cfg.serverUrl !== 'string') {
      return {
        valid: false,
        error: 'serverUrl is required and must be a string',
      };
    }

    if (!cfg.token || typeof cfg.token !== 'string') {
      return {
        valid: false,
        error: 'token is required and must be a string',
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

  getDefaultConfig(): SynologyConfig {
    return {
      serverUrl: '',
      token: '',
      webhookUrl: '',
    };
  }

  async getAccountInfo(): Promise<{
    userId: string;
    username: string;
  }> {
    if (!this.config) {
      throw new Error('Channel not initialized');
    }

    const response = await this.apiRequest<SynologyChatResponse<SynologyUserInfo>>(
      'GET',
      '/webapi/entry.cgi',
      {
        api: 'SYNO.Chat.User',
        version: 1,
        method: 'getinfo',
        token: this.config.token,
      }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to get user info');
    }

    return {
      userId: response.data.user_id,
      username: response.data.username,
    };
  }

  private async verifyConnection(): Promise<void> {
    await this.apiRequest<SynologyChatResponse>('GET', '/webapi/entry.cgi', {
      api: 'SYNO.Chat.User',
      version: 1,
      method: 'getinfo',
      token: this.config!.token,
    });
  }

  private async apiRequest<T>(
    method: string,
    path: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    if (!this.config) {
      throw new Error('Not configured');
    }

    const url = new URL(`${this.config.serverUrl}${path}`);

    if (method === 'GET' && params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    };

    if (method === 'POST' && params) {
      const formData = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          formData.append(key, String(value));
        }
      });
      options.body = formData.toString();
    }

    const response = await fetch(url.toString(), options);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `API request failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    return response.json() as Promise<T>;
  }

  private startPolling(): void {
    this.pollInterval = setInterval(async () => {
      if (!this.running) return;

      try {
        await this.pollMessages();
      } catch (error) {
        console.error('[Synology] Failed to poll messages:', error);
      }
    }, this.pollIntervalMs);
  }

  private async pollMessages(): Promise<void> {
    if (!this.config || !this.messageCallback) return;

    try {
      const response = await this.apiRequest<SynologyChatResponse<{ messages: SynologyMessage[] }>>(
        'GET',
        '/webapi/entry.cgi',
        {
          api: 'SYNO.Chat.Message',
          version: 2,
          method: 'list',
          token: this.config.token,
          since: this.lastMessageTimestamp || undefined,
        }
      );

      if (!response.success || !response.data?.messages) {
        return;
      }

      const messages = response.data.messages;

      for (const msg of messages) {
        if (!this.isAllowed(msg)) {
          continue;
        }

        if (msg.timestamp > this.lastMessageTimestamp) {
          this.lastMessageTimestamp = msg.timestamp;
        }

        const channelMessage: ChannelMessage = {
          id: `synology_${msg.message_id}`,
          channelId: msg.channel_id,
          messageId: msg.message_id,
          peerId: msg.channel_id,
          peerType: await this.getPeerType(msg.channel_id),
          direction: 'inbound',
          content: msg.text,
          timestamp: msg.timestamp,
          metadata: {
            from: {
              id: msg.user_id,
              name: msg.user_name,
            },
            channel: {
              id: msg.channel_id,
              name: msg.channel_name,
            },
            threadId: msg.thread_id,
          },
        };

        this.messageCallback(channelMessage);
      }
    } catch (error) {
      console.error('[Synology] Error polling messages:', error);
    }
  }

  private isAllowed(msg: SynologyMessage): boolean {
    if (!this.config) return true;

    if (this.config.allowedChannels && this.config.allowedChannels.length > 0) {
      if (!this.config.allowedChannels.includes(msg.channel_id)) {
        return false;
      }
    }

    if (this.config.allowedUsers && this.config.allowedUsers.length > 0) {
      if (!this.config.allowedUsers.includes(msg.user_id)) {
        return false;
      }
    }

    return true;
  }

  private async getPeerType(channelId: string): Promise<'direct' | 'group' | 'channel'> {
    if (!this.config) return 'channel';

    try {
      const response = await this.apiRequest<SynologyChatResponse<SynologyChannelInfo>>(
        'GET',
        '/webapi/entry.cgi',
        {
          api: 'SYNO.Chat.Channel',
          version: 1,
          method: 'get',
          token: this.config.token,
          channel_id: channelId,
        }
      );

      if (!response.success || !response.data) {
        return 'channel';
      }

      switch (response.data.type) {
        case 'direct':
          return 'direct';
        case 'private':
          return 'group';
        case 'public':
        default:
          return 'channel';
      }
    } catch {
      return 'channel';
    }
  }
}

export const synologyChannel = new SynologyChannel();

channelRegistry.register(synologyChannel as unknown as ChannelPlugin, {
  id: 'synology',
  name: 'Synology Chat',
  description: 'Synology Chat integration via Webhook and API',
  icon: 'message-square',
  capabilities: synologyChannel.capabilities,
  defaultConfig: {
    serverUrl: '',
    token: '',
    webhookUrl: '',
  },
  configSchema: [
    {
      key: 'serverUrl',
      type: 'text',
      label: 'Server URL',
      placeholder: 'https://your-nas:port',
      required: true,
      hint: 'Your Synology NAS URL with Chat Server enabled',
    },
    {
      key: 'token',
      type: 'password',
      label: 'Integration Token',
      placeholder: 'Your integration token',
      required: true,
      hint: 'Token from Synology Chat Integration settings',
    },
    {
      key: 'webhookUrl',
      type: 'text',
      label: 'Webhook URL (optional)',
      placeholder: 'https://your-nas:port/webapi/entry.cgi...',
      required: false,
      hint: 'Incoming webhook URL for sending messages',
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
