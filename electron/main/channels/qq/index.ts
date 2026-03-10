/**
 * QQ Channel Adapter
 *
 * Integrates QQ Bot API (go-cqhttp/OneBot) for message sending/receiving.
 * Supports both official QQ Bot API and OneBot (go-cqhttp) protocol.
 */

import type { ChannelPlugin, ChannelMessage, SendOptions } from '../channel-plugin.js';
import { channelRegistry } from '../channel-registry.js';
import WebSocket from 'ws';

export interface QQConfig {
  mode: 'onebot' | 'official';
  onebot?: {
    httpUrl?: string;
    wsUrl?: string;
    accessToken?: string;
  };
  official?: {
    appId: string;
    appSecret: string;
  };
  allowedUsers?: string[];
  allowedGroups?: string[];
}

interface OneBotMessage {
  time: number;
  self_id: number;
  post_type: string;
  message_type: string;
  sub_type?: string;
  user_id: number;
  group_id?: number;
  message: string | any[];
  raw_message: string;
  message_id: number;
  sender: {
    user_id: number;
    nickname: string;
    card?: string;
  };
}

interface QQAccessToken {
  access_token: string;
  expires_in: number;
}

export class QQChannel implements ChannelPlugin<QQConfig> {
  id = 'qq';
  name = 'QQ';
  description = 'QQ机器人集成 (支持OneBot/官方API)';
  capabilities = {
    chatTypes: ['direct', 'group'] as Array<'direct' | 'group' | 'channel' | 'thread'>,
    media: true,
    reactions: false,
    polls: false,
    nativeCommands: false,
    blockStreaming: false,
  };

  private config?: QQConfig;
  private ws?: WebSocket;
  private accessToken?: string;
  private messageCallback?: (message: ChannelMessage) => void;
  private running = false;

  async initialize(config: QQConfig): Promise<void> {
    this.config = config;

    if (config.mode === 'onebot') {
      if (!config.onebot?.httpUrl && !config.onebot?.wsUrl) {
        throw new Error('OneBot mode requires httpUrl or wsUrl');
      }
    } else if (config.mode === 'official') {
      if (!config.official?.appId || !config.official?.appSecret) {
        throw new Error('Official mode requires appId and appSecret');
      }
    }
  }

  async start(): Promise<void> {
    if (this.running) return;

    if (this.config?.mode === 'onebot' && this.config.onebot?.wsUrl) {
      await this.startOneBotWS();
    } else if (this.config?.mode === 'official') {
      await this.refreshOfficialToken();
    }

    this.running = true;
    console.log('[QQ] Channel started');
  }

  async stop(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }
    this.running = false;
    console.log('[QQ] Channel stopped');
  }

  isConnected(): boolean {
    return this.running;
  }

  onMessage(callback: (message: ChannelMessage) => void): void {
    this.messageCallback = callback;
  }

  async sendMessage(peerId: string, content: string, _options?: SendOptions): Promise<string> {
    if (!this.config) {
      throw new Error('Channel not initialized');
    }

    try {
      if (this.config.mode === 'onebot') {
        return await this.sendOneBotMessage(peerId, content);
      } else {
        return await this.sendOfficialMessage(peerId, content);
      }
    } catch (error) {
      throw new Error(
        `Failed to send QQ message: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async sendOneBotMessage(peerId: string, content: string): Promise<string> {
    if (!this.config?.onebot?.httpUrl) {
      throw new Error('OneBot HTTP URL not configured');
    }

    const isGroup = peerId.includes('group:') || (!isNaN(parseInt(peerId)) && parseInt(peerId) < 0);
    const targetId = peerId.replace('group:', '').replace('user:', '');

    const endpoint = isGroup
      ? `${this.config.onebot.httpUrl}/send_group_msg`
      : `${this.config.onebot.httpUrl}/send_private_msg`;

    const body = isGroup
      ? { group_id: parseInt(targetId), message: content }
      : { user_id: parseInt(targetId), message: content };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.onebot.accessToken) {
      headers['Authorization'] = `Bearer ${this.config.onebot.accessToken}`;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const result = (await response.json()) as any;

    if (result.status !== 'ok') {
      throw new Error(`OneBot error: ${result.msg || 'Unknown error'}`);
    }

    return result.data?.message_id?.toString() || Date.now().toString();
  }

  private async sendOfficialMessage(peerId: string, content: string): Promise<string> {
    if (!this.accessToken) {
      await this.refreshOfficialToken();
    }

    const isGroup = peerId.startsWith('group:');
    const targetId = peerId.replace('group:', '').replace('user:', '');

    const endpoint = isGroup
      ? `https://api.qq.com/bot/group/${targetId}/message`
      : `https://api.qq.com/bot/private/${targetId}/message`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content,
        msg_type: 0,
      }),
    });

    const result = (await response.json()) as any;

    if (result.code !== 0) {
      throw new Error(`QQ API error: ${result.message}`);
    }

    return result.data?.id || Date.now().toString();
  }

  private async startOneBotWS(): Promise<void> {
    const wsUrl = this.config?.onebot?.wsUrl;
    if (!wsUrl) return;

    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = {};

      if (this.config?.onebot?.accessToken) {
        headers['Authorization'] = `Bearer ${this.config.onebot.accessToken}`;
      }

      this.ws = new WebSocket(wsUrl, { headers });

      this.ws.on('open', () => {
        console.log('[QQ] OneBot WebSocket connected');
        resolve();
      });

      this.ws.on('message', (data) => {
        this.handleOneBotMessage(data.toString());
      });

      this.ws.on('error', (error) => {
        console.error('[QQ] WebSocket error:', error);
        reject(error);
      });

      this.ws.on('close', () => {
        console.log('[QQ] WebSocket disconnected');
      });
    });
  }

  private handleOneBotMessage(data: string): void {
    if (!this.messageCallback || !this.config) return;

    try {
      const event = JSON.parse(data) as OneBotMessage;

      if (event.post_type !== 'message') return;

      const isGroup = event.message_type === 'group';
      const peerId = isGroup ? `group:${event.group_id}` : `user:${event.user_id}`;

      if (!this.isAllowed(event.user_id.toString(), event.group_id?.toString())) {
        return;
      }

      const content =
        typeof event.message === 'string'
          ? event.message
          : event.message
              .filter((m: any) => m.type === 'text')
              .map((m: any) => m.data?.text || '')
              .join('');

      const channelMessage: ChannelMessage = {
        id: `qq_${event.message_id}`,
        channelId: 'qq',
        messageId: event.message_id.toString(),
        peerId,
        peerType: isGroup ? 'group' : 'direct',
        direction: 'inbound',
        content,
        timestamp: event.time * 1000,
        metadata: {
          userId: event.user_id,
          groupId: event.group_id,
          sender: event.sender,
          rawMessage: event.raw_message,
        },
      };

      this.messageCallback(channelMessage);
    } catch (error) {
      console.error('[QQ] Failed to parse message:', error);
    }
  }

  private async refreshOfficialToken(): Promise<void> {
    if (!this.config?.official) return;

    const response = await fetch('https://api.qq.com/bot/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: this.config.official.appId,
        client_secret: this.config.official.appSecret,
      }),
    });

    const result = (await response.json()) as QQAccessToken;

    if (!result.access_token) {
      throw new Error('Failed to get QQ access token');
    }

    this.accessToken = result.access_token;
  }

  private isAllowed(userId: string, groupId?: string): boolean {
    if (this.config?.allowedUsers && this.config.allowedUsers.length > 0) {
      if (!this.config.allowedUsers.includes(userId)) {
        return false;
      }
    }

    if (groupId && this.config?.allowedGroups && this.config.allowedGroups.length > 0) {
      if (!this.config.allowedGroups.includes(groupId)) {
        return false;
      }
    }

    return true;
  }

  validateConfig(config: unknown): { valid: boolean; error?: string } {
    if (typeof config !== 'object' || config === null) {
      return { valid: false, error: 'Config must be an object' };
    }

    const cfg = config as Partial<QQConfig>;

    if (!cfg.mode) {
      return { valid: false, error: 'mode is required (onebot or official)' };
    }

    if (cfg.mode === 'onebot') {
      if (!cfg.onebot?.httpUrl && !cfg.onebot?.wsUrl) {
        return { valid: false, error: 'OneBot mode requires httpUrl or wsUrl' };
      }
    } else if (cfg.mode === 'official') {
      if (!cfg.official?.appId || !cfg.official?.appSecret) {
        return { valid: false, error: 'Official mode requires appId and appSecret' };
      }
    }

    return { valid: true };
  }

  getDefaultConfig(): QQConfig {
    return {
      mode: 'onebot',
      onebot: {
        httpUrl: 'http://localhost:5700',
        wsUrl: 'ws://localhost:6700',
      },
    };
  }
}

export const qqChannel = new QQChannel();

channelRegistry.register(qqChannel as any, {
  id: 'qq',
  name: 'QQ',
  description: 'QQ机器人集成 (支持OneBot/官方API)',
  icon: 'message-circle',
  capabilities: qqChannel.capabilities,
  defaultConfig: {
    mode: 'onebot',
    onebot: {
      httpUrl: 'http://localhost:5700',
    },
  },
  configSchema: [
    {
      key: 'mode',
      type: 'select',
      label: '模式',
      required: true,
      options: [
        { value: 'onebot', label: 'OneBot (go-cqhttp)' },
        { value: 'official', label: '官方API' },
      ],
    },
    {
      key: 'onebot.httpUrl',
      type: 'text',
      label: 'OneBot HTTP URL',
      placeholder: 'http://localhost:5700',
      required: false,
      hint: 'go-cqhttp HTTP API地址',
    },
    {
      key: 'onebot.wsUrl',
      type: 'text',
      label: 'OneBot WebSocket URL',
      placeholder: 'ws://localhost:6700',
      required: false,
      hint: 'go-cqhttp WebSocket地址',
    },
    {
      key: 'onebot.accessToken',
      type: 'password',
      label: 'Access Token (可选)',
      placeholder: 'your_access_token',
      required: false,
      hint: 'go-cqhttp 配置的 access_token',
    },
    {
      key: 'official.appId',
      type: 'text',
      label: 'App ID (官方API)',
      placeholder: '10xxxxxxxxx',
      required: false,
      hint: 'QQ开放平台应用的App ID',
    },
    {
      key: 'official.appSecret',
      type: 'password',
      label: 'App Secret (官方API)',
      placeholder: 'xxxxxxxx',
      required: false,
      hint: 'QQ开放平台应用的App Secret',
    },
    {
      key: 'allowedUsers',
      type: 'textarea',
      label: 'Allowed Users (可选)',
      placeholder: '123456789\n987654321',
      required: false,
      hint: '每行一个QQ号，留空允许所有用户',
    },
    {
      key: 'allowedGroups',
      type: 'textarea',
      label: 'Allowed Groups (可选)',
      placeholder: '123456789\n987654321',
      required: false,
      hint: '每行一个群号，留空允许所有群',
    },
  ],
});
