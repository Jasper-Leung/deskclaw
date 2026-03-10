import type { ChannelPlugin, ChannelMessage, SendOptions, ChannelType } from '../channel-plugin.js';
import { channelRegistry } from '../channel-registry.js';

export interface ZaloConfig {
  appId: string;
  appSecret: string;
  oaId: string;
  refreshToken?: string;
  webhookPath?: string;
  allowedUsers?: string[];
}

interface ZaloTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface ZaloMessageResponse {
  message_id: string;
  error?: number;
  message?: string;
}

interface ZaloWebhookEvent {
  event_name: string;
  message?: {
    msg_id: string;
    text?: string;
    attachments?: Array<{
      type: string;
      payload: { url?: string; thumbnail?: string };
    }>;
  };
  sender?: {
    id: string;
    name?: string;
  };
  recipient?: {
    id: string;
  };
  timestamp?: number;
  sender_id?: string;
}

interface ZaloOAInfo {
  oa_id: string;
  name: string;
  avatar?: string;
}

export class ZaloChannel implements ChannelPlugin<ZaloConfig> {
  id = 'zalo';
  name = 'Zalo';
  description = 'Zalo Official Account API integration';
  capabilities = {
    chatTypes: ['direct'] as Array<'direct' | 'group' | 'channel' | 'thread'>,
    media: true,
    reactions: false,
    polls: false,
    nativeCommands: false,
    blockStreaming: false,
  };

  private config?: ZaloConfig;
  private messageCallback?: (message: ChannelMessage) => void;
  private running = false;
  private accessToken?: string;
  private tokenExpiresAt?: number;
  private apiBaseUrl = 'https://openapi.zalo.me/v2.0/oa';

  async initialize(config: ZaloConfig): Promise<void> {
    this.config = config;

    if (!config.appId || typeof config.appId !== 'string') {
      throw new Error('appId is required');
    }

    if (!config.appSecret || typeof config.appSecret !== 'string') {
      throw new Error('appSecret is required');
    }

    if (!config.oaId || typeof config.oaId !== 'string') {
      throw new Error('oaId is required');
    }
  }

  async start(): Promise<void> {
    if (!this.config) {
      throw new Error('Channel not initialized. Call initialize() first.');
    }

    if (this.running) {
      return;
    }

    try {
      await this.refreshAccessToken();
      this.running = true;
    } catch (error) {
      throw new Error(
        `Failed to connect to Zalo: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    this.accessToken = undefined;
    this.tokenExpiresAt = undefined;
  }

  isConnected(): boolean {
    return this.config !== undefined && this.running && this.hasValidToken();
  }

  onMessage(callback: (message: ChannelMessage) => void): void {
    this.messageCallback = callback;
  }

  async sendMessage(peerId: string, content: string, _options?: SendOptions): Promise<string> {
    if (!this.config || !this.accessToken) {
      throw new Error('Channel not initialized or not connected');
    }

    await this.ensureValidToken();

    const messageData = {
      recipient: { user_id: peerId },
      message: {
        text: content,
      },
    };

    try {
      const response = await fetch(`${this.apiBaseUrl}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          access_token: this.accessToken,
        },
        body: JSON.stringify(messageData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Zalo API error: ${response.status} - ${errorText}`);
      }

      const data = (await response.json()) as ZaloMessageResponse;
      if (data.error) {
        throw new Error(`Zalo API error: ${data.error} - ${data.message}`);
      }

      return data.message_id || Date.now().toString();
    } catch (error) {
      throw new Error(
        `Failed to send Zalo message: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  validateConfig(config: unknown): { valid: boolean; error?: string } {
    if (typeof config !== 'object' || config === null) {
      return { valid: false, error: 'Config must be an object' };
    }

    const cfg = config as Partial<ZaloConfig>;

    if (!cfg.appId || typeof cfg.appId !== 'string') {
      return {
        valid: false,
        error: 'appId is required and must be a string',
      };
    }

    if (!cfg.appSecret || typeof cfg.appSecret !== 'string') {
      return {
        valid: false,
        error: 'appSecret is required and must be a string',
      };
    }

    if (!cfg.oaId || typeof cfg.oaId !== 'string') {
      return {
        valid: false,
        error: 'oaId is required and must be a string',
      };
    }

    return { valid: true };
  }

  getDefaultConfig(): ZaloConfig {
    return {
      appId: '',
      appSecret: '',
      oaId: '',
      webhookPath: '/webhook/zalo',
    };
  }

  async getAccountInfo(): Promise<ZaloOAInfo> {
    if (!this.config || !this.accessToken) {
      throw new Error('Channel not initialized or not connected');
    }

    await this.ensureValidToken();

    const response = await fetch(`${this.apiBaseUrl}/getoa`, {
      headers: {
        access_token: this.accessToken,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to get OA info');
    }

    const data = (await response.json()) as { data: ZaloOAInfo };
    return data.data;
  }

  handleWebhook(body: { events?: ZaloWebhookEvent[] }): void {
    if (!this.messageCallback) return;

    if (body.events) {
      for (const event of body.events) {
        if (event.event_name === 'user_send_text' || event.event_name === 'user_send_image') {
          this.processWebhookEvent(event);
        }
      }
    }
  }

  private processWebhookEvent(event: ZaloWebhookEvent): void {
    if (!this.messageCallback || !event.message) return;

    const senderId = event.sender?.id || event.sender_id || '';
    if (!senderId) return;

    if (this.config?.allowedUsers && this.config.allowedUsers.length > 0) {
      if (!this.config.allowedUsers.includes(senderId)) return;
    }

    let media: ChannelMessage['media'];
    const attachments = event.message.attachments;

    if (attachments && attachments.length > 0) {
      const attachment = attachments[0];
      const mediaType =
        attachment.type === 'image'
          ? 'image'
          : attachment.type === 'video'
            ? 'video'
            : attachment.type === 'audio'
              ? 'audio'
              : 'file';
      media = {
        type: mediaType,
        url: attachment.payload.url || attachment.payload.thumbnail || '',
      };
    }

    const channelMessage: ChannelMessage = {
      id: `zalo_${event.message.msg_id}`,
      channelId: 'zalo',
      messageId: event.message.msg_id,
      peerId: senderId,
      peerType: 'direct',
      direction: 'inbound',
      content: event.message.text,
      media,
      timestamp: event.timestamp || Date.now(),
      metadata: {
        senderName: event.sender?.name,
        eventName: event.event_name,
      },
    };

    this.messageCallback(channelMessage);
  }

  private hasValidToken(): boolean {
    return !!(this.accessToken && this.tokenExpiresAt && Date.now() < this.tokenExpiresAt);
  }

  private async ensureValidToken(): Promise<void> {
    if (this.hasValidToken()) return;
    await this.refreshAccessToken();
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.config?.refreshToken) {
      return;
    }

    try {
      const response = await fetch('https://oauth.zaloapp.com/v4/oa/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.config.refreshToken,
          app_id: this.config.appId,
          app_secret: this.config.appSecret,
        }).toString(),
      });

      if (!response.ok) {
        throw new Error('Failed to refresh access token');
      }

      const data = (await response.json()) as ZaloTokenResponse;
      this.accessToken = data.access_token;
      this.tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000;
    } catch (error) {
      console.error('Failed to refresh Zalo access token:', error);
    }
  }

  async generateLoginUrl(): Promise<string> {
    if (!this.config) {
      throw new Error('Channel not initialized');
    }

    const redirectUri = encodeURIComponent(
      `${this.config.webhookPath || '/webhook/zalo'}/callback`
    );
    return `https://oauth.zaloapp.com/v4/oa/permission?app_id=${this.config.appId}&redirect_uri=${redirectUri}`;
  }

  async exchangeCodeForToken(code: string): Promise<ZaloTokenResponse> {
    if (!this.config) {
      throw new Error('Channel not initialized');
    }

    const response = await fetch('https://oauth.zaloapp.com/v4/oa/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        app_id: this.config.appId,
        app_secret: this.config.appSecret,
      }).toString(),
    });

    if (!response.ok) {
      throw new Error('Failed to exchange code for token');
    }

    const data = (await response.json()) as ZaloTokenResponse;
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000;
    return data;
  }
}

export const zaloChannel = new ZaloChannel();

const zaloChannelType: ChannelType = {
  id: 'zalo',
  name: 'Zalo',
  description: 'Zalo Official Account API integration',
  icon: 'message-circle',
  capabilities: zaloChannel.capabilities,
  defaultConfig: {
    appId: '',
    appSecret: '',
    oaId: '',
    webhookPath: '/webhook/zalo',
  },
  configSchema: [
    {
      key: 'appId',
      type: 'text',
      label: 'App ID',
      placeholder: 'Enter your Zalo App ID',
      required: true,
      hint: 'Get from Zalo for Developers Console',
    },
    {
      key: 'appSecret',
      type: 'password',
      label: 'App Secret',
      placeholder: 'Enter your Zalo App Secret',
      required: true,
      hint: 'Get from Zalo for Developers Console',
    },
    {
      key: 'oaId',
      type: 'text',
      label: 'OA ID',
      placeholder: 'Enter your Official Account ID',
      required: true,
      hint: 'Your Zalo Official Account ID',
    },
    {
      key: 'refreshToken',
      type: 'password',
      label: 'Refresh Token (optional)',
      placeholder: 'Enter refresh token if available',
      required: false,
      hint: 'Used to automatically refresh access token',
    },
    {
      key: 'webhookPath',
      type: 'text',
      label: 'Webhook Path',
      placeholder: '/webhook/zalo',
      required: false,
      hint: 'Path for receiving Zalo webhook events',
    },
    {
      key: 'allowedUsers',
      type: 'text',
      label: 'Allowed Users (optional)',
      placeholder: 'user_id1,user_id2',
      required: false,
      hint: 'Comma-separated Zalo user IDs. Leave empty for all users.',
    },
  ],
};

channelRegistry.register(zaloChannel as unknown as ChannelPlugin, zaloChannelType);
