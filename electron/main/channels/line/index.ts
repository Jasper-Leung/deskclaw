import type { ChannelPlugin, ChannelMessage, SendOptions, ChannelType } from '../channel-plugin.js';
import { channelRegistry } from '../channel-registry.js';
import { createHmac } from 'crypto';

export interface LINEConfig {
  channelAccessToken: string;
  channelSecret: string;
  webhookPath?: string;
  allowedUsers?: string[];
  allowedGroups?: string[];
}

interface LINEWebhookEvent {
  type: string;
  replyToken?: string;
  timestamp: number;
  source: {
    type: 'user' | 'group' | 'room';
    userId?: string;
    groupId?: string;
    roomId?: string;
  };
  message?: {
    id: string;
    type: string;
    text?: string;
    contentProvider?: { type: string; originalContentUrl?: string };
  };
}

interface LINEWebhookBody {
  destination: string;
  events: LINEWebhookEvent[];
}

interface LINESendMessageResponse {
  sentMessages: Array<{ id: string; quoteToken?: string }>;
}

export class LINEChannel implements ChannelPlugin<LINEConfig> {
  id = 'line';
  name = 'LINE';
  description = 'LINE Messaging API integration';
  capabilities = {
    chatTypes: ['direct', 'group'] as Array<'direct' | 'group' | 'channel' | 'thread'>,
    media: true,
    reactions: false,
    polls: false,
    nativeCommands: false,
    blockStreaming: false,
  };

  private config?: LINEConfig;
  private messageCallback?: (message: ChannelMessage) => void;
  private running = false;
  private apiBaseUrl = 'https://api.line.me/v2/bot';

  async initialize(config: LINEConfig): Promise<void> {
    this.config = config;

    if (!config.channelAccessToken || typeof config.channelAccessToken !== 'string') {
      throw new Error('channelAccessToken is required');
    }

    if (!config.channelSecret || typeof config.channelSecret !== 'string') {
      throw new Error('channelSecret is required');
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
      await this.verifyToken();
      this.running = true;
    } catch (error) {
      throw new Error(
        `Failed to connect to LINE: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  isConnected(): boolean {
    return this.config !== undefined && this.running;
  }

  onMessage(callback: (message: ChannelMessage) => void): void {
    this.messageCallback = callback;
  }

  async sendMessage(peerId: string, content: string, _options?: SendOptions): Promise<string> {
    if (!this.config) {
      throw new Error('Channel not initialized');
    }

    const messages = [
      {
        type: 'text',
        text: content,
      },
    ];

    try {
      const response = await fetch(`${this.apiBaseUrl}/message/push`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.channelAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: peerId,
          messages,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LINE API error: ${response.status} - ${errorText}`);
      }

      const data = (await response.json()) as LINESendMessageResponse;
      return data.sentMessages?.[0]?.id || Date.now().toString();
    } catch (error) {
      throw new Error(
        `Failed to send LINE message: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  validateConfig(config: unknown): { valid: boolean; error?: string } {
    if (typeof config !== 'object' || config === null) {
      return { valid: false, error: 'Config must be an object' };
    }

    const cfg = config as Partial<LINEConfig>;

    if (!cfg.channelAccessToken || typeof cfg.channelAccessToken !== 'string') {
      return {
        valid: false,
        error: 'channelAccessToken is required and must be a string',
      };
    }

    if (!cfg.channelSecret || typeof cfg.channelSecret !== 'string') {
      return {
        valid: false,
        error: 'channelSecret is required and must be a string',
      };
    }

    return { valid: true };
  }

  getDefaultConfig(): LINEConfig {
    return {
      channelAccessToken: '',
      channelSecret: '',
      webhookPath: '/webhook/line',
    };
  }

  async getAccountInfo(): Promise<{ botId: string; displayName: string }> {
    if (!this.config) {
      throw new Error('Channel not initialized');
    }

    const response = await fetch(`${this.apiBaseUrl}/info`, {
      headers: {
        Authorization: `Bearer ${this.config.channelAccessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to get bot info');
    }

    const data = (await response.json()) as { userId: string; displayName: string };
    return {
      botId: data.userId,
      displayName: data.displayName,
    };
  }

  handleWebhook(body: LINEWebhookBody): void {
    if (!this.messageCallback) return;

    for (const event of body.events) {
      if (event.type === 'message' && event.message) {
        this.processMessageEvent(event);
      }
    }
  }

  verifySignature(body: string, signature: string): boolean {
    if (!this.config?.channelSecret) return false;

    try {
      const expectedSignature = createHmac('sha256', this.config.channelSecret)
        .update(body)
        .digest('base64');
      return signature === expectedSignature;
    } catch {
      return false;
    }
  }

  private async verifyToken(): Promise<void> {
    if (!this.config) return;

    const response = await fetch(`${this.apiBaseUrl}/info`, {
      headers: {
        Authorization: `Bearer ${this.config.channelAccessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Invalid channel access token');
    }
  }

  private processMessageEvent(event: LINEWebhookEvent): void {
    if (!this.messageCallback || !event.message) return;

    const source = event.source;
    let peerId: string;
    let peerType: 'direct' | 'group' | 'channel' | 'thread';

    if (source.type === 'user') {
      peerId = source.userId || '';
      peerType = 'direct';
    } else if (source.type === 'group') {
      peerId = source.groupId || '';
      peerType = 'group';
    } else {
      peerId = source.roomId || '';
      peerType = 'group';
    }

    if (!this.isAllowed(source)) return;

    const message = event.message;
    let media: ChannelMessage['media'];

    if (message.type === 'image' && message.contentProvider?.originalContentUrl) {
      media = {
        type: 'image',
        url: message.contentProvider.originalContentUrl,
      };
    } else if (message.type === 'video' && message.contentProvider?.originalContentUrl) {
      media = {
        type: 'video',
        url: message.contentProvider.originalContentUrl,
      };
    } else if (message.type === 'audio' && message.contentProvider?.originalContentUrl) {
      media = {
        type: 'audio',
        url: message.contentProvider.originalContentUrl,
      };
    }

    const channelMessage: ChannelMessage = {
      id: `line_${message.id}`,
      channelId: 'line',
      messageId: message.id,
      peerId,
      peerType,
      direction: 'inbound',
      content: message.text,
      media,
      timestamp: event.timestamp,
      metadata: {
        replyToken: event.replyToken,
        sourceType: source.type,
        userId: source.userId,
      },
    };

    this.messageCallback(channelMessage);
  }

  private isAllowed(source: LINEWebhookEvent['source']): boolean {
    if (source.type === 'user') {
      if (this.config?.allowedUsers && this.config.allowedUsers.length > 0) {
        return this.config.allowedUsers.includes(source.userId || '');
      }
      return true;
    }

    if (source.type === 'group') {
      if (this.config?.allowedGroups && this.config.allowedGroups.length > 0) {
        return this.config.allowedGroups.includes(source.groupId || '');
      }
      return true;
    }

    return true;
  }
}

export const lineChannel = new LINEChannel();

const lineChannelType: ChannelType = {
  id: 'line',
  name: 'LINE',
  description: 'LINE Messaging API integration',
  icon: 'message-circle',
  capabilities: lineChannel.capabilities,
  defaultConfig: {
    channelAccessToken: '',
    channelSecret: '',
    webhookPath: '/webhook/line',
  },
  configSchema: [
    {
      key: 'channelAccessToken',
      type: 'password',
      label: 'Channel Access Token',
      placeholder: 'Enter your LINE Channel Access Token',
      required: true,
      hint: 'Get from LINE Developers Console > Channel settings',
    },
    {
      key: 'channelSecret',
      type: 'password',
      label: 'Channel Secret',
      placeholder: 'Enter your LINE Channel Secret',
      required: true,
      hint: 'Get from LINE Developers Console > Channel settings',
    },
    {
      key: 'webhookPath',
      type: 'text',
      label: 'Webhook Path',
      placeholder: '/webhook/line',
      required: false,
      hint: 'Path for receiving LINE webhook events',
    },
    {
      key: 'allowedUsers',
      type: 'text',
      label: 'Allowed Users (optional)',
      placeholder: 'U1234567890abcdef,U0987654321fedcba',
      required: false,
      hint: 'Comma-separated LINE user IDs. Leave empty for all users.',
    },
    {
      key: 'allowedGroups',
      type: 'text',
      label: 'Allowed Groups (optional)',
      placeholder: 'C1234567890abcdef,C0987654321fedcba',
      required: false,
      hint: 'Comma-separated LINE group IDs. Leave empty for all groups.',
    },
  ],
};

channelRegistry.register(lineChannel as unknown as ChannelPlugin, lineChannelType);
