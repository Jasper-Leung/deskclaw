/**
 * DingTalk (钉钉) Channel Adapter
 *
 * Integrates DingTalk Robot and API for message sending/receiving.
 */

import type { ChannelPlugin, ChannelMessage, SendOptions } from '../channel-plugin.js';
import { channelRegistry } from '../channel-registry.js';
import crypto from 'crypto';

export interface DingTalkConfig {
  appKey: string;
  appSecret: string;
  agentId?: string;
  webhookUrl?: string;
  signSecret?: string;
  allowedUsers?: string[];
  allowedDepts?: string[];
}

interface DingTalkMessageEvent {
  conversationId: string;
  conversationType: '1' | '2';
  conversationTitle?: string;
  senderId: string;
  senderNick?: string;
  senderCorpId?: string;
  senderStaffId?: string;
  msgtype: string;
  text?: { content: string };
  content?: string;
  createTime: number;
}

export class DingTalkChannel implements ChannelPlugin<DingTalkConfig> {
  id = 'dingtalk';
  name = 'DingTalk (钉钉)';
  description = '钉钉企业内部应用机器人集成';
  capabilities = {
    chatTypes: ['direct', 'group'] as Array<'direct' | 'group' | 'channel' | 'thread'>,
    media: true,
    reactions: false,
    polls: false,
    nativeCommands: false,
    blockStreaming: false,
  };

  private config?: DingTalkConfig;
  private accessToken?: string;
  private tokenExpireTime = 0;
  private messageCallback?: (message: ChannelMessage) => void;
  private running = false;

  async initialize(config: DingTalkConfig): Promise<void> {
    this.config = config;

    if (!config.appKey || !config.appSecret) {
      throw new Error('AppKey and AppSecret are required');
    }
  }

  async start(): Promise<void> {
    if (this.running) return;

    await this.refreshAccessToken();
    this.running = true;
    console.log('[DingTalk] Channel started');
  }

  async stop(): Promise<void> {
    this.running = false;
    console.log('[DingTalk] Channel stopped');
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
      if (this.config.webhookUrl) {
        return await this.sendViaWebhook(content);
      }

      if (!this.accessToken) {
        await this.refreshAccessToken();
      }

      const isGroup = peerId.startsWith('cid');
      const endpoint = isGroup
        ? `https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2?access_token=${this.accessToken}`
        : `https://oapi.dingtalk.com/v1.0/robot/oToMessages/batchSend`;

      const body = isGroup
        ? {
            agent_id: this.config.agentId,
            userid_list: peerId,
            msg: {
              msgtype: 'text',
              text: { content },
            },
          }
        : {
            robotCode: this.config.appKey,
            userIds: [peerId],
            msgKey: 'sampleText',
            msgParam: JSON.stringify({ content }),
          };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const result = (await response.json()) as {
        errcode?: number;
        errmsg?: string;
        task_id?: string;
        processQueryKey?: string;
      };

      if (result.errcode && result.errcode !== 0) {
        throw new Error(`DingTalk API error: ${result.errmsg}`);
      }

      return result.task_id || result.processQueryKey || Date.now().toString();
    } catch (error) {
      throw new Error(
        `Failed to send DingTalk message: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async sendViaWebhook(content: string): Promise<string> {
    if (!this.config?.webhookUrl) {
      throw new Error('Webhook URL not configured');
    }

    let url = this.config.webhookUrl;

    if (this.config.signSecret) {
      const timestamp = Date.now();
      const sign = this.generateSign(timestamp);
      url += `&timestamp=${timestamp}&sign=${encodeURIComponent(sign)}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'text',
        text: { content },
      }),
    });

    const result = (await response.json()) as { errcode?: number; errmsg?: string };

    if (result.errcode !== 0) {
      throw new Error(`DingTalk webhook error: ${result.errmsg}`);
    }

    return Date.now().toString();
  }

  private generateSign(timestamp: number): string {
    if (!this.config?.signSecret) return '';

    const stringToSign = `${timestamp}\n${this.config.signSecret}`;
    const hmac = crypto.createHmac('sha256', this.config.signSecret);
    hmac.update(stringToSign);
    return hmac.digest('base64');
  }

  validateConfig(config: unknown): { valid: boolean; error?: string } {
    if (typeof config !== 'object' || config === null) {
      return { valid: false, error: 'Config must be an object' };
    }

    const cfg = config as Partial<DingTalkConfig>;

    if (!cfg.appKey || typeof cfg.appKey !== 'string') {
      return { valid: false, error: 'appKey is required' };
    }

    if (!cfg.appSecret || typeof cfg.appSecret !== 'string') {
      return { valid: false, error: 'appSecret is required' };
    }

    return { valid: true };
  }

  getDefaultConfig(): DingTalkConfig {
    return {
      appKey: '',
      appSecret: '',
    };
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.config) return;

    if (this.accessToken && Date.now() < this.tokenExpireTime - 300000) {
      return;
    }

    const response = await fetch(
      `https://oapi.dingtalk.com/gettoken?appkey=${this.config.appKey}&appsecret=${this.config.appSecret}`
    );

    const result = (await response.json()) as {
      errcode?: number;
      errmsg?: string;
      access_token?: string;
      expires_in?: number;
    };

    if (result.errcode !== 0) {
      throw new Error(`Failed to get access token: ${result.errmsg}`);
    }

    this.accessToken = result.access_token;
    this.tokenExpireTime = Date.now() + (result.expires_in ?? 0) * 1000;
  }

  async handleEvent(event: DingTalkMessageEvent): Promise<void> {
    if (!this.messageCallback || !this.config) return;

    const senderId = event.senderStaffId || event.senderId;

    if (!this.isAllowed(senderId, event.conversationId)) {
      return;
    }

    const content = event.text?.content || event.content || '';

    const channelMessage: ChannelMessage = {
      id: `dingtalk_${event.createTime}_${senderId}`,
      channelId: 'dingtalk',
      messageId: `${event.createTime}`,
      peerId: event.conversationId,
      peerType: event.conversationType === '1' ? 'direct' : 'group',
      direction: 'inbound',
      content,
      timestamp: event.createTime,
      metadata: {
        senderId,
        senderNick: event.senderNick,
        conversationTitle: event.conversationTitle,
        msgtype: event.msgtype,
      },
    };

    this.messageCallback(channelMessage);
  }

  private isAllowed(userId: string, _conversationId: string): boolean {
    if (this.config?.allowedUsers && this.config.allowedUsers.length > 0) {
      if (!this.config.allowedUsers.includes(userId)) {
        return false;
      }
    }

    return true;
  }

  getWebhookHandler() {
    return async (event: DingTalkMessageEvent) => {
      await this.handleEvent(event);
    };
  }
}

export const dingTalkChannel = new DingTalkChannel();

channelRegistry.register(
  dingTalkChannel as unknown as Parameters<typeof channelRegistry.register>[0],
  {
    id: 'dingtalk',
    name: 'DingTalk (钉钉)',
    description: '钉钉企业内部应用机器人集成',
    icon: 'message-square',
    capabilities: dingTalkChannel.capabilities,
    defaultConfig: {
      appKey: '',
      appSecret: '',
    },
    configSchema: [
      {
        key: 'appKey',
        type: 'text',
        label: 'AppKey',
        placeholder: 'dingxxxxxxxxxxxxxxx',
        required: true,
        hint: '钉钉开放平台应用的AppKey',
      },
      {
        key: 'appSecret',
        type: 'password',
        label: 'AppSecret',
        placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
        required: true,
        hint: '钉钉开放平台应用的AppSecret',
      },
      {
        key: 'agentId',
        type: 'text',
        label: 'AgentId (可选)',
        placeholder: '123456789',
        required: false,
        hint: '企业内部应用的AgentId',
      },
      {
        key: 'webhookUrl',
        type: 'text',
        label: 'Webhook URL (可选)',
        placeholder: 'https://oapi.dingtalk.com/robot/send?access_token=xxx',
        required: false,
        hint: '群机器人Webhook地址',
      },
      {
        key: 'signSecret',
        type: 'password',
        label: '加签密钥 (可选)',
        placeholder: 'SECxxxxxxxxxxxxxxxxxxxxxxxx',
        required: false,
        hint: '群机器人加签密钥',
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
  }
);
