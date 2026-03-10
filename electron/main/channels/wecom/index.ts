/**
 * WeCom (企业微信) Channel Adapter
 *
 * Integrates WeCom Robot and API for message sending/receiving.
 */

import type { ChannelPlugin, ChannelMessage, SendOptions } from '../channel-plugin.js';
import { channelRegistry } from '../channel-registry.js';
import crypto from 'crypto';

export interface WeComConfig {
  corpId: string;
  agentId: string;
  agentSecret: string;
  webhookKey?: string;
  token?: string;
  encodingAESKey?: string;
  allowedUsers?: string[];
  allowedParties?: string[];
}

interface WeComAccessToken {
  access_token: string;
  expires_in: number;
}

interface WeComMessageEvent {
  ToUserName: string;
  FromUserName: string;
  CreateTime: number;
  MsgType: string;
  Content?: string;
  Event?: string;
  EventKey?: string;
  ChatId?: string;
  UserId?: string;
  ChangeType?: string;
}

export class WeComChannel implements ChannelPlugin<WeComConfig> {
  id = 'wecom';
  name = 'WeCom (企业微信)';
  description = '企业微信应用机器人集成';
  capabilities = {
    chatTypes: ['direct', 'group'] as Array<'direct' | 'group' | 'channel' | 'thread'>,
    media: true,
    reactions: false,
    polls: false,
    nativeCommands: false,
    blockStreaming: false,
  };

  private config?: WeComConfig;
  private accessToken?: string;
  private tokenExpireTime = 0;
  private messageCallback?: (message: ChannelMessage) => void;
  private running = false;

  async initialize(config: WeComConfig): Promise<void> {
    this.config = config;

    if (!config.corpId || !config.agentId || !config.agentSecret) {
      throw new Error('CorpId, AgentId, and AgentSecret are required');
    }
  }

  async start(): Promise<void> {
    if (this.running) return;

    await this.refreshAccessToken();
    this.running = true;
    console.log('[WeCom] Channel started');
  }

  async stop(): Promise<void> {
    this.running = false;
    console.log('[WeCom] Channel stopped');
  }

  isConnected(): boolean {
    return this.running && !!this.accessToken;
  }

  onMessage(callback: (message: ChannelMessage) => void): void {
    this.messageCallback = callback;
  }

  async sendMessage(peerId: string, content: string, _options?: SendOptions): Promise<string> {
    if (!this.config) {
      throw new Error('Channel not initialized');
    }

    try {
      if (this.config.webhookKey) {
        return await this.sendViaWebhook(content);
      }

      if (!this.accessToken) {
        await this.refreshAccessToken();
      }

      const isGroup = peerId.startsWith('wr') || peerId.startsWith('ww');

      const endpoint = isGroup
        ? `https://qyapi.weixin.qq.com/cgi-bin/appchat/send?access_token=${this.accessToken}`
        : `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${this.accessToken}`;

      const body = isGroup
        ? {
            chatid: peerId,
            msgtype: 'text',
            text: { content },
            safe: 0,
          }
        : {
            touser: peerId,
            msgtype: 'text',
            agentid: parseInt(this.config.agentId),
            text: { content },
            safe: 0,
          };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const result = (await response.json()) as any;

      if (result.errcode !== 0) {
        throw new Error(`WeCom API error: ${result.errmsg}`);
      }

      return result.msgid || Date.now().toString();
    } catch (error) {
      throw new Error(
        `Failed to send WeCom message: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async sendViaWebhook(content: string): Promise<string> {
    if (!this.config?.webhookKey) {
      throw new Error('Webhook key not configured');
    }

    const url = `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${this.config.webhookKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'text',
        text: { content },
      }),
    });

    const result = (await response.json()) as any;

    if (result.errcode !== 0) {
      throw new Error(`WeCom webhook error: ${result.errmsg}`);
    }

    return Date.now().toString();
  }

  validateConfig(config: unknown): { valid: boolean; error?: string } {
    if (typeof config !== 'object' || config === null) {
      return { valid: false, error: 'Config must be an object' };
    }

    const cfg = config as Partial<WeComConfig>;

    if (!cfg.corpId || typeof cfg.corpId !== 'string') {
      return { valid: false, error: 'corpId is required' };
    }

    if (!cfg.agentId || typeof cfg.agentId !== 'string') {
      return { valid: false, error: 'agentId is required' };
    }

    if (!cfg.agentSecret || typeof cfg.agentSecret !== 'string') {
      return { valid: false, error: 'agentSecret is required' };
    }

    return { valid: true };
  }

  getDefaultConfig(): WeComConfig {
    return {
      corpId: '',
      agentId: '',
      agentSecret: '',
    };
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.config) return;

    if (this.accessToken && Date.now() < this.tokenExpireTime - 300000) {
      return;
    }

    const response = await fetch(
      `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${this.config.corpId}&corpsecret=${this.config.agentSecret}`
    );

    const result = (await response.json()) as WeComAccessToken;

    if (!result.access_token) {
      throw new Error('Failed to get access token');
    }

    this.accessToken = result.access_token;
    this.tokenExpireTime = Date.now() + result.expires_in * 1000;
  }

  async handleEvent(event: WeComMessageEvent): Promise<void> {
    if (!this.messageCallback || !this.config) return;

    const userId = event.FromUserName;

    if (!this.isAllowed(userId)) {
      return;
    }

    if (event.MsgType === 'event') {
      return;
    }

    const content = event.Content || '';

    const channelMessage: ChannelMessage = {
      id: `wecom_${event.CreateTime}_${userId}`,
      channelId: 'wecom',
      messageId: `${event.CreateTime}`,
      peerId: event.ChatId || userId,
      peerType: event.ChatId ? 'group' : 'direct',
      direction: 'inbound',
      content,
      timestamp: event.CreateTime * 1000,
      metadata: {
        userId,
        msgType: event.MsgType,
        chatId: event.ChatId,
      },
    };

    this.messageCallback(channelMessage);
  }

  private isAllowed(userId: string): boolean {
    if (this.config?.allowedUsers && this.config.allowedUsers.length > 0) {
      return this.config.allowedUsers.includes(userId);
    }
    return true;
  }

  decryptMessage(encrypted: string): string {
    if (!this.config?.encodingAESKey) {
      return encrypted;
    }

    const key = Buffer.from(this.config.encodingAESKey + '=', 'base64');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, key.slice(0, 16));
    decipher.setAutoPadding(false);

    let decrypted = decipher.update(Buffer.from(encrypted, 'base64'));
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    const content = decrypted.slice(16);
    const len = content.readUInt32BE(0);
    return content.slice(4, 4 + len).toString();
  }

  getWebhookHandler() {
    return async (event: WeComMessageEvent) => {
      await this.handleEvent(event);
    };
  }
}

export const weComChannel = new WeComChannel();

channelRegistry.register(weComChannel as any, {
  id: 'wecom',
  name: 'WeCom (企业微信)',
  description: '企业微信应用机器人集成',
  icon: 'message-circle',
  capabilities: weComChannel.capabilities,
  defaultConfig: {
    corpId: '',
    agentId: '',
    agentSecret: '',
  },
  configSchema: [
    {
      key: 'corpId',
      type: 'text',
      label: '企业ID (CorpId)',
      placeholder: 'wwxxxxxxxxxxxxxxxxxx',
      required: true,
      hint: '企业微信管理后台获取',
    },
    {
      key: 'agentId',
      type: 'text',
      label: '应用AgentId',
      placeholder: '1000001',
      required: true,
      hint: '应用的AgentId',
    },
    {
      key: 'agentSecret',
      type: 'password',
      label: '应用Secret',
      placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      required: true,
      hint: '应用的Secret',
    },
    {
      key: 'webhookKey',
      type: 'text',
      label: '群机器人Key (可选)',
      placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      required: false,
      hint: '群机器人Webhook的key参数',
    },
    {
      key: 'token',
      type: 'password',
      label: 'Token (可选)',
      placeholder: '用于接收消息回调验证',
      required: false,
      hint: '设置接收消息的Token',
    },
    {
      key: 'encodingAESKey',
      type: 'password',
      label: 'EncodingAESKey (可选)',
      placeholder: '用于消息加解密',
      required: false,
      hint: '消息加解密密钥',
    },
    {
      key: 'allowedUsers',
      type: 'textarea',
      label: 'Allowed Users (可选)',
      placeholder: 'user001\nuser002',
      required: false,
      hint: '每行一个用户ID，留空允许所有用户',
    },
  ],
});
