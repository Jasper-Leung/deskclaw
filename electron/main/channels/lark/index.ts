/**
 * Lark/Feishu Channel Adapter
 *
 * Integrates Lark/Feishu (飞书) messaging platform using Webhook and Open API.
 */

import type { ChannelPlugin, ChannelMessage, SendOptions } from '../channel-plugin.js';
import { channelRegistry } from '../channel-registry.js';

/**
 * Lark configuration
 */
export interface LarkConfig {
  /** App ID from Lark Open Platform */
  appId: string;
  /** App Secret from Lark Open Platform */
  appSecret: string;
  /** Encrypt Key (for event verification, optional) */
  encryptKey?: string;
  /** Verification Token (for event verification, optional) */
  verificationToken?: string;
  /** Allowed user OpenIDs (empty = all users) */
  allowedUsers?: string[];
  /** Allowed group OpenIDs (empty = all groups) */
  allowedGroups?: string[];
}

/**
 * Lark access token response
 */
interface LarkAccessTokenResponse {
  code: number;
  app_access_token: string;
  expire: number;
}

/**
 * Lark event message
 */
interface LarkEvent {
  header: {
    event_id: string;
    timestamp: string;
    token: string;
    event_type: string;
  };
  event: {
    sender: {
      sender_id: {
        open_id: string;
        union_id: string;
      };
      sender_type: 'user' | 'app' | 'group';
    };
    message: {
      message_id: string;
      chat_type: 'p2p' | 'group' | 'public';
      chat_id: string;
      content: string;
      create_time: string;
    };
  };
}

/**
 * Send message response
 */
interface LarkSendMessageResponse {
  code: number;
  msg: string;
  data: {
    message_id: string;
  };
}

/**
 * Lark channel plugin class
 */
export class LarkChannel implements ChannelPlugin<LarkConfig> {
  id = 'lark';
  name = 'Lark (Feishu)';
  description = 'Lark/Feishu (飞书) integration';
  capabilities = {
    chatTypes: ['direct', 'group', 'channel'] as Array<'direct' | 'group' | 'channel' | 'thread'>,
    media: true,
    reactions: false,
    polls: false,
    nativeCommands: false,
    blockStreaming: false,
  };

  private config?: LarkConfig;
  private accessToken?: string;
  private tokenExpireTime = 0;
  private messageCallback?: (message: ChannelMessage) => void;
  private running = false;
  private webhookServer?: any;

  async initialize(config: LarkConfig): Promise<void> {
    this.config = config;

    // Validate credentials
    if (!config.appId || !config.appSecret) {
      throw new Error('App ID and App Secret are required');
    }
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    // Get access token
    await this.refreshAccessToken();

    this.running = true;
    console.log('[Lark] Channel started');
  }

  async stop(): Promise<void> {
    if (this.webhookServer) {
      await this.webhookServer.close();
      this.webhookServer = undefined;
    }

    this.running = false;
    console.log('[Lark] Channel stopped');
  }

  isConnected(): boolean {
    return this.running && !!this.accessToken;
  }

  onMessage(callback: (message: ChannelMessage) => void): void {
    this.messageCallback = callback;
  }

  async sendMessage(peerId: string, content: string, _options?: SendOptions): Promise<string> {
    if (!this.config || !this.accessToken) {
      throw new Error('Channel not initialized or not connected');
    }

    try {
      // Determine receive_id_type based on peerId format
      // Group chat_id format: oc_xxxxxxxxxxxxxxxx
      // User open_id format: ou_xxxxxxxxxxxxxxxx
      const receiveIdType = peerId.startsWith('oc_') ? 'chat_id' : 'open_id';

      const response = await fetch(
        `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${receiveIdType}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            receive_id: peerId,
            msg_type: 'text',
            content: JSON.stringify({ text: content }),
          }),
        }
      );

      const result = (await response.json()) as LarkSendMessageResponse;

      if (result.code !== 0) {
        throw new Error(`Lark API error: ${result.msg} (code: ${result.code})`);
      }

      return result.data.message_id;
    } catch (error) {
      throw new Error(
        `Failed to send Lark message: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  validateConfig(config: unknown): { valid: boolean; error?: string } {
    if (typeof config !== 'object' || config === null) {
      return { valid: false, error: 'Config must be an object' };
    }

    const cfg = config as Partial<LarkConfig>;

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

    return { valid: true };
  }

  getDefaultConfig(): LarkConfig {
    return {
      appId: '',
      appSecret: '',
    };
  }

  /**
   * Get access token for API calls
   */
  private async refreshAccessToken(): Promise<void> {
    if (!this.config) {
      throw new Error('Config not initialized');
    }

    // Check if token is still valid (with 5 min buffer)
    if (this.accessToken && Date.now() < this.tokenExpireTime - 300000) {
      return;
    }

    try {
      const response = await fetch(
        'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            app_id: this.config.appId,
            app_secret: this.config.appSecret,
          }),
        }
      );

      const result = (await response.json()) as LarkAccessTokenResponse;

      if (result.code !== 0) {
        throw new Error('Failed to get access token');
      }

      this.accessToken = result.app_access_token;
      this.tokenExpireTime = Date.now() + result.expire * 1000;

      console.log('[Lark] Access token refreshed');
    } catch (error) {
      throw new Error(
        `Failed to refresh access token: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Handle incoming event from webhook
   */
  async handleEvent(event: LarkEvent): Promise<void> {
    if (!this.messageCallback || !this.config) return;

    const { sender, message } = event.event;

    // Check access control
    if (!this.isAllowed(sender.sender_id.open_id, message.chat_id)) {
      return;
    }

    // Parse message content
    let content: string | undefined;
    let media: { type: string; url: string; caption?: string } | undefined;

    try {
      const contentJson = JSON.parse(message.content);

      if (message.chat_type === 'p2p') {
        // Direct message
        if (contentJson.text) {
          content = contentJson.text;
        } else if (contentJson.post && contentJson.post.content) {
          // Rich text
          content = this.extractTextFromRichText(contentJson.post.content);
        }
      } else if (message.chat_type === 'group') {
        // Group message
        if (contentJson.text) {
          content = contentJson.text;
        } else if (contentJson.content) {
          content = contentJson.content;
        }
      }

      // Handle media
      if (contentJson.image_key) {
        media = {
          type: 'image',
          url: `https://open.feishu.cn/open-apis/im/v1/images/${contentJson.image_key}`,
        };
      } else if (contentJson.file_key) {
        media = {
          type: 'file',
          url: `https://open.feishu.cn/open-apis/drive/v1/files/${contentJson.file_key}`,
        };
      }
    } catch {
      // If parsing fails, try to use raw content
      content = message.content;
    }

    const channelMessage: ChannelMessage = {
      id: `lark_${message.message_id}`,
      channelId: 'lark',
      messageId: message.message_id,
      peerId: message.chat_type === 'p2p' ? sender.sender_id.open_id : message.chat_id,
      peerType: message.chat_type === 'p2p' ? 'direct' : 'group',
      direction: 'inbound',
      content,
      media,
      timestamp: parseInt(message.create_time) * 1000,
      metadata: {
        senderId: sender.sender_id.open_id,
        senderType: sender.sender_type,
        chatType: message.chat_type,
      },
    };

    this.messageCallback(channelMessage);
  }

  /**
   * Extract text from rich text content
   */
  private extractTextFromRichText(content: any): string {
    if (!content) return '';

    if (Array.isArray(content)) {
      return content.map((item) => this.extractTextFromRichText(item)).join('');
    }

    if (typeof content === 'string') return content;

    if (content.text) return content.text;

    if (content.content) {
      return this.extractTextFromRichText(content.content);
    }

    return '';
  }

  /**
   * Check if a sender/chat is allowed
   */
  private isAllowed(senderOpenId: string, chatId: string): boolean {
    // Always allow app messages
    // Check user whitelist
    if (this.config?.allowedUsers && this.config.allowedUsers.length > 0) {
      if (!this.config.allowedUsers.includes(senderOpenId)) {
        return false;
      }
    }

    // Check group whitelist
    if (this.config?.allowedGroups && this.config.allowedGroups.length > 0) {
      if (!this.config.allowedGroups.includes(chatId)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get webhook handler function for Express/Hono
   */
  getWebhookHandler() {
    return async (event: LarkEvent) => {
      await this.handleEvent(event);
    };
  }
}

/**
 * Export singleton instance
 */
export const larkChannel = new LarkChannel();

/**
 * Register the Lark channel
 */
channelRegistry.register(larkChannel as any, {
  id: 'lark',
  name: 'Lark (Feishu)',
  description: '飞书/Lark integration with webhook support',
  icon: 'feather',
  capabilities: larkChannel.capabilities,
  defaultConfig: {
    appId: '',
    appSecret: '',
  },
  configSchema: [
    {
      key: 'appId',
      type: 'text',
      label: 'App ID',
      placeholder: 'cli_xxxxxxxxxxxxxxxx',
      required: true,
      hint: '从飞书开放平台获取应用ID',
    },
    {
      key: 'appSecret',
      type: 'password',
      label: 'App Secret',
      placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      required: true,
      hint: '从飞书开放平台获取应用密钥',
    },
    {
      key: 'encryptKey',
      type: 'password',
      label: 'Encrypt Key (可选)',
      placeholder: '用于验证webhook事件',
      required: false,
      hint: '如果启用了事件加密，需要填写加密密钥',
    },
    {
      key: 'verificationToken',
      type: 'password',
      label: 'Verification Token (可选)',
      placeholder: '用于验证webhook事件',
      required: false,
      hint: '用于验证webhook请求的令牌',
    },
    {
      key: 'allowedUsers',
      type: 'textarea',
      label: 'Allowed Users (可选)',
      placeholder: 'ou_xxxxxxxxxxxxxxxx\nou_yyyyyyyyyyyyyyyy',
      required: false,
      hint: '每行一个用户的OpenID，留空允许所有用户',
    },
    {
      key: 'allowedGroups',
      type: 'textarea',
      label: 'Allowed Groups (可选)',
      placeholder: 'oc_xxxxxxxxxxxxxxxx\noc_yyyyyyyyyyyyyyyy',
      required: false,
      hint: '每行一个群的Chat ID，留空允许所有群',
    },
  ],
});
