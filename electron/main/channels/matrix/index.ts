/**
 * Matrix Channel Adapter
 *
 * Integrates Matrix protocol via HTTP API (no SDK dependency).
 */

import type { ChannelPlugin, ChannelMessage, SendOptions, ChannelType } from '../channel-plugin.js';
import { channelRegistry } from '../channel-registry.js';

export interface MatrixConfig {
  homeserverUrl: string;
  accessToken: string;
  userId: string;
  deviceId?: string;
  allowedRooms?: string[];
  allowedUsers?: string[];
  autoJoinRooms?: boolean;
  pollInterval?: number;
}

interface MatrixAccountInfo {
  userId: string;
  displayName?: string;
  avatarUrl?: string;
  deviceId?: string;
}

interface MatrixEvent {
  type: string;
  content: {
    msgtype?: string;
    body?: string;
    formatted_body?: string;
    url?: string;
    info?: Record<string, unknown>;
  };
  sender: string;
  event_id: string;
  origin_server_ts: number;
}

interface MatrixRoomEvent {
  chunk: MatrixEvent[];
  end: string;
}

export class MatrixChannel implements ChannelPlugin<MatrixConfig, MatrixAccountInfo> {
  id = 'matrix';
  name = 'Matrix';
  description = 'Matrix protocol messaging via HTTP API';
  capabilities = {
    chatTypes: ['direct', 'group', 'channel'] as Array<'direct' | 'group' | 'channel' | 'thread'>,
    media: true,
    reactions: true,
    polls: false,
    nativeCommands: false,
    blockStreaming: false,
  };

  private config?: MatrixConfig;
  private messageCallback?: (message: ChannelMessage) => void;
  private connected = false;
  private pollTimer?: ReturnType<typeof setInterval>;
  private syncToken?: string;

  async initialize(config: MatrixConfig): Promise<void> {
    this.config = config;

    if (!config.homeserverUrl) {
      throw new Error('Matrix homeserver URL is required');
    }

    if (!config.accessToken) {
      throw new Error('Matrix access token is required');
    }

    if (!config.userId) {
      throw new Error('Matrix user ID is required');
    }
  }

  async start(): Promise<void> {
    if (!this.config) {
      throw new Error('Channel not initialized. Call initialize() first.');
    }

    if (this.connected) {
      return;
    }

    try {
      await this.sync();
      this.startPolling();
      this.connected = true;
    } catch (error) {
      throw new Error(
        `Failed to connect to Matrix: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  onMessage(callback: (message: ChannelMessage) => void): void {
    this.messageCallback = callback;
  }

  async sendMessage(peerId: string, content: string, options?: SendOptions): Promise<string> {
    if (!this.config) {
      throw new Error('Matrix not initialized');
    }

    const formattedBody = options?.parseMode === 'html' ? content : undefined;

    const messageContent: Record<string, unknown> = {
      msgtype: 'm.text',
      body: content,
    };

    if (formattedBody) {
      messageContent.format = 'org.matrix.custom.html';
      messageContent.formatted_body = formattedBody;
    }

    if (options?.replyTo) {
      messageContent['m.relates_to'] = {
        'm.in_reply_to': {
          event_id: options.replyTo,
        },
      };
    }

    const txnId = `m${Date.now()}`;
    const url = `${this.config.homeserverUrl}/_matrix/client/v3/rooms/${encodeURIComponent(peerId)}/send/m.room.message/${txnId}`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messageContent),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to send Matrix message: ${error}`);
    }

    const result = (await response.json()) as { event_id: string };
    return result.event_id;
  }

  validateConfig(config: unknown): { valid: boolean; error?: string } {
    if (typeof config !== 'object' || config === null) {
      return { valid: false, error: 'Config must be an object' };
    }

    const cfg = config as Partial<MatrixConfig>;

    if (!cfg.homeserverUrl || typeof cfg.homeserverUrl !== 'string') {
      return {
        valid: false,
        error: 'homeserverUrl is required and must be a string',
      };
    }

    try {
      new URL(cfg.homeserverUrl);
    } catch {
      return {
        valid: false,
        error: 'homeserverUrl must be a valid URL',
      };
    }

    if (!cfg.accessToken || typeof cfg.accessToken !== 'string') {
      return {
        valid: false,
        error: 'accessToken is required and must be a string',
      };
    }

    if (!cfg.userId || typeof cfg.userId !== 'string') {
      return {
        valid: false,
        error: 'userId is required and must be a string',
      };
    }

    if (!cfg.userId.startsWith('@') || !cfg.userId.includes(':')) {
      return {
        valid: false,
        error: 'userId must be a valid Matrix ID (e.g., @user:server.com)',
      };
    }

    return { valid: true };
  }

  getDefaultConfig(): MatrixConfig {
    return {
      homeserverUrl: 'https://matrix.org',
      accessToken: '',
      userId: '',
      autoJoinRooms: true,
      pollInterval: 30000,
    };
  }

  async getAccountInfo(): Promise<MatrixAccountInfo> {
    if (!this.config) {
      throw new Error('Matrix not initialized');
    }

    const url = `${this.config.homeserverUrl}/_matrix/client/v3/profile/${encodeURIComponent(this.config.userId)}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to get account info');
    }

    const profile = (await response.json()) as { displayname?: string; avatar_url?: string };

    return {
      userId: this.config.userId,
      displayName: profile.displayname,
      avatarUrl: profile.avatar_url,
      deviceId: this.config.deviceId,
    };
  }

  private async sync(): Promise<void> {
    if (!this.config) return;

    const params = new URLSearchParams({
      filter: JSON.stringify({ room: { timeline: { limit: 10 } } }),
      timeout: '0',
    });

    if (this.syncToken) {
      params.set('since', this.syncToken);
    }

    const url = `${this.config.homeserverUrl}/_matrix/client/v3/sync?${params}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Sync failed');
    }

    const data = (await response.json()) as { next_batch?: string };
    this.syncToken = data.next_batch;
  }

  private startPolling(): void {
    const interval = this.config?.pollInterval || 30000;
    this.pollTimer = setInterval(() => {
      this.poll().catch(console.error);
    }, interval);
  }

  private async poll(): Promise<void> {
    if (!this.config || !this.syncToken) return;

    const params = new URLSearchParams({
      timeout: '10000',
      since: this.syncToken,
    });

    const url = `${this.config.homeserverUrl}/_matrix/client/v3/sync?${params}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
      },
    });

    if (!response.ok) return;

    const data = (await response.json()) as {
      next_batch?: string;
      rooms?: {
        join?: Record<string, { timeline?: MatrixRoomEvent }>;
      };
    };

    this.syncToken = data.next_batch;

    if (data.rooms?.join) {
      for (const [roomId, roomData] of Object.entries(data.rooms.join)) {
        if (roomData.timeline?.chunk) {
          for (const event of roomData.timeline.chunk) {
            this.processEvent(event, roomId);
          }
        }
      }
    }
  }

  private processEvent(event: MatrixEvent, roomId: string): void {
    if (!this.messageCallback || !this.config) return;

    if (event.type !== 'm.room.message') return;

    if (event.sender === this.config.userId) return;

    if (!this.isRoomAllowed(roomId)) return;

    const msgtype = event.content.msgtype;
    if (msgtype !== 'm.text' && msgtype !== 'm.emote' && msgtype !== 'm.notice') {
      return;
    }

    if (!this.isUserAllowed(event.sender)) return;

    const channelMessage: ChannelMessage = {
      id: `matrix_${event.event_id}`,
      channelId: 'matrix',
      messageId: event.event_id,
      peerId: roomId,
      peerType: 'group',
      direction: 'inbound',
      content: event.content.body || '',
      timestamp: event.origin_server_ts,
      metadata: {
        sender: event.sender,
        eventId: event.event_id,
        msgtype,
      },
    };

    if (event.content.url) {
      const mxcUrl = event.content.url;
      if (mxcUrl.startsWith('mxc://')) {
        const [serverName, mediaId] = mxcUrl.slice(6).split('/');
        const contentType =
          event.content.msgtype === 'm.image'
            ? 'image'
            : event.content.msgtype === 'm.video'
              ? 'video'
              : 'file';
        channelMessage.media = {
          type: contentType,
          url: `${this.config?.homeserverUrl}/_matrix/media/v3/download/${serverName}/${mediaId}`,
          caption: event.content.body,
        };
      }
    }

    this.messageCallback(channelMessage);
  }

  private isRoomAllowed(roomId: string): boolean {
    if (!this.config?.allowedRooms || this.config.allowedRooms.length === 0) {
      return true;
    }
    return this.config.allowedRooms.includes(roomId);
  }

  private isUserAllowed(userId: string): boolean {
    if (!this.config?.allowedUsers || this.config.allowedUsers.length === 0) {
      return true;
    }
    return this.config.allowedUsers.includes(userId);
  }
}

export const matrixChannel = new MatrixChannel();

const matrixChannelType: ChannelType = {
  id: 'matrix',
  name: 'Matrix',
  description: 'Matrix protocol messaging via HTTP API',
  icon: 'grid-3x3',
  capabilities: matrixChannel.capabilities,
  defaultConfig: {
    homeserverUrl: 'https://matrix.org',
    accessToken: '',
    userId: '',
    autoJoinRooms: true,
    pollInterval: 30000,
  },
  configSchema: [
    {
      key: 'homeserverUrl',
      type: 'text',
      label: 'Homeserver URL',
      placeholder: 'https://matrix.org',
      required: true,
      hint: 'Your Matrix homeserver URL',
    },
    {
      key: 'userId',
      type: 'text',
      label: 'User ID',
      placeholder: '@user:matrix.org',
      required: true,
      hint: 'Your Matrix user ID',
    },
    {
      key: 'accessToken',
      type: 'password',
      label: 'Access Token',
      placeholder: '',
      required: true,
      hint: 'Your Matrix access token',
    },
    {
      key: 'deviceId',
      type: 'text',
      label: 'Device ID (optional)',
      placeholder: '',
      required: false,
      hint: 'Optional device ID',
    },
    {
      key: 'autoJoinRooms',
      type: 'boolean',
      label: 'Auto-join invited rooms',
      required: false,
      hint: 'Automatically join rooms when invited',
    },
    {
      key: 'allowedRooms',
      type: 'textarea',
      label: 'Allowed Rooms (optional)',
      placeholder: '!roomid:server.com\n!another:server.com',
      required: false,
      hint: 'One room ID per line. Leave empty for all rooms.',
    },
    {
      key: 'allowedUsers',
      type: 'textarea',
      label: 'Allowed Users (optional)',
      placeholder: '@user1:server.com\n@user2:server.com',
      required: false,
      hint: 'One user ID per line. Leave empty for all users.',
    },
  ],
};

channelRegistry.register(matrixChannel as unknown as ChannelPlugin, matrixChannelType);
