/**
 * BlueBubbles (iMessage) Channel Adapter
 *
 * Integrates BlueBubbles Server REST API for iMessage messaging.
 * BlueBubbles is a macOS server that exposes iMessage via REST API.
 */

import type { ChannelPlugin, ChannelMessage, SendOptions } from '../channel-plugin.js';
import { channelRegistry } from '../channel-registry.js';

/**
 * BlueBubbles configuration
 */
export interface BlueBubblesConfig {
  /** BlueBubbles server URL (e.g., http://localhost:1234 or https://server.com) */
  serverUrl: string;
  /** API password configured in BlueBubbles server */
  password: string;
  /** Allowed phone numbers/emails (empty = all) */
  allowedUsers?: string[];
  /** Polling interval in milliseconds for new messages */
  pollInterval?: number;
  /** Whether to auto-mark messages as read */
  markAsRead?: boolean;
}

/**
 * BlueBubbles API response types
 */
interface BlueBubblesResponse<T> {
  status: number;
  message: string;
  data?: T;
  error?: string;
}

interface BlueBubblesChat {
  guid: string;
  chatIdentifier: string;
  displayName?: string;
  style: number;
  participants: BlueBubblesParticipant[];
}

interface BlueBubblesParticipant {
  address: string;
  displayName?: string;
}

interface BlueBubblesMessage {
  guid: string;
  text?: string;
  date: number;
  dateDelivered?: number;
  dateRead?: number;
  isFromMe: boolean;
  handle?: {
    address: string;
    displayName?: string;
  };
  attachments?: BlueBubblesAttachment[];
  chatGuid: string;
}

interface BlueBubblesAttachment {
  guid: string;
  mimeType: string;
  fileName?: string;
  filePath?: string;
}

/**
 * BlueBubbles channel plugin class
 */
export class BlueBubblesChannel implements ChannelPlugin<BlueBubblesConfig> {
  id = 'bluebubbles';
  name = 'BlueBubbles (iMessage)';
  description = 'iMessage integration via BlueBubbles Server';
  capabilities = {
    chatTypes: ['direct', 'group'] as Array<'direct' | 'group' | 'channel' | 'thread'>,
    media: true,
    reactions: false,
    polls: false,
    nativeCommands: false,
    blockStreaming: false,
  };

  private config?: BlueBubblesConfig;
  private messageCallback?: (message: ChannelMessage) => void;
  private running = false;
  private pollTimer?: ReturnType<typeof setInterval>;
  private lastMessageDate = 0;

  async initialize(config: BlueBubblesConfig): Promise<void> {
    this.config = config;

    if (!config.serverUrl) {
      throw new Error('BlueBubbles server URL is required');
    }

    if (!config.password) {
      throw new Error('BlueBubbles password is required');
    }

    const normalizedUrl = config.serverUrl.replace(/\/+$/, '');
    this.config.serverUrl = normalizedUrl;
  }

  async start(): Promise<void> {
    if (!this.config) {
      throw new Error('Channel not initialized. Call initialize() first.');
    }

    if (this.running) {
      return;
    }

    try {
      await this.testConnection();
      this.running = true;
      this.startPolling();
    } catch (error) {
      throw new Error(
        `Failed to connect to BlueBubbles: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  isConnected(): boolean {
    return this.config !== undefined && this.running;
  }

  onMessage(callback: (message: ChannelMessage) => void): void {
    this.messageCallback = callback;
  }

  async sendMessage(peerId: string, content: string, options?: SendOptions): Promise<string> {
    if (!this.config) {
      throw new Error('Channel not initialized');
    }

    const body: Record<string, unknown> = {
      chatGuid: peerId,
      message: content,
      method: 'private-api',
    };

    if (options?.extra?.effectId) {
      body.effectId = options.extra.effectId;
    }

    try {
      const response = await this.request<{ guid: string; date: number }>(
        'POST',
        '/api/v1/message/text',
        body
      );

      if (response.status !== 200) {
        throw new Error(response.message || 'Failed to send message');
      }

      return response.data?.guid || '';
    } catch (error) {
      throw new Error(
        `Failed to send BlueBubbles message: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  validateConfig(config: unknown): { valid: boolean; error?: string } {
    if (typeof config !== 'object' || config === null) {
      return { valid: false, error: 'Config must be an object' };
    }

    const cfg = config as Partial<BlueBubblesConfig>;

    if (!cfg.serverUrl || typeof cfg.serverUrl !== 'string') {
      return {
        valid: false,
        error: 'serverUrl is required and must be a string',
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

    if (!cfg.password || typeof cfg.password !== 'string') {
      return {
        valid: false,
        error: 'password is required and must be a string',
      };
    }

    return { valid: true };
  }

  getDefaultConfig(): BlueBubblesConfig {
    return {
      serverUrl: '',
      password: '',
      pollInterval: 3000,
      markAsRead: true,
    };
  }

  /**
   * Get server information
   */
  async getAccountInfo(): Promise<{
    serverVersion: string;
    macOSVersion: string;
    deviceName: string;
  }> {
    if (!this.config) {
      throw new Error('Channel not initialized');
    }

    const response = await this.request<{
      serverVersion: string;
      macOSVersion: string;
      deviceName: string;
    }>('GET', '/api/v1/server/info');

    return {
      serverVersion: response.data?.serverVersion || '',
      macOSVersion: response.data?.macOSVersion || '',
      deviceName: response.data?.deviceName || '',
    };
  }

  /**
   * Get chats list
   */
  async getChats(): Promise<BlueBubblesChat[]> {
    const response = await this.request<BlueBubblesChat[]>('GET', '/api/v1/chat?with=participants');

    return response.data || [];
  }

  /**
   * Test connection to BlueBubbles server
   */
  private async testConnection(): Promise<void> {
    const response = await this.request<unknown>('GET', '/api/v1/server/info');
    if (response.status !== 200) {
      throw new Error(response.message || 'Connection test failed');
    }
  }

  /**
   * Start polling for new messages
   */
  private startPolling(): void {
    const interval = this.config?.pollInterval || 3000;

    this.pollTimer = setInterval(() => {
      this.pollMessages().catch((error) => {
        console.error('BlueBubbles poll error:', error);
      });
    }, interval);

    this.pollMessages().catch((error) => {
      console.error('BlueBubbles initial poll error:', error);
    });
  }

  /**
   * Poll for new messages
   */
  private async pollMessages(): Promise<void> {
    if (!this.messageCallback || !this.running) return;

    try {
      const response = await this.request<BlueBubblesMessage[]>(
        'GET',
        `/api/v1/message?after=${this.lastMessageDate}&with=attachments,handle`
      );

      if (response.status !== 200 || !response.data) {
        return;
      }

      const messages = response.data;

      for (const msg of messages) {
        if (!msg.isFromMe) {
          await this.processMessage(msg);
        }

        if (msg.date > this.lastMessageDate) {
          this.lastMessageDate = msg.date;
        }
      }
    } catch (error) {
      console.error('BlueBubbles poll error:', error);
    }
  }

  /**
   * Process an incoming message
   */
  private async processMessage(msg: BlueBubblesMessage): Promise<void> {
    if (!this.messageCallback || !this.config) return;

    const sender = msg.handle?.address || 'unknown';

    if (!this.isAllowed(sender)) {
      return;
    }

    const channelMessage: ChannelMessage = {
      id: `bluebubbles_${msg.guid}`,
      channelId: 'bluebubbles',
      messageId: msg.guid,
      peerId: msg.chatGuid,
      peerType: this.getPeerType(msg.chatGuid),
      direction: 'inbound',
      content: msg.text,
      timestamp: msg.date,
      metadata: {
        sender: {
          address: sender,
          displayName: msg.handle?.displayName,
        },
        dateDelivered: msg.dateDelivered,
        dateRead: msg.dateRead,
      },
    };

    if (msg.attachments && msg.attachments.length > 0) {
      const attachment = msg.attachments[0];
      channelMessage.media = {
        type: this.getMediaType(attachment.mimeType),
        url: await this.getAttachmentUrl(attachment),
        caption: msg.text,
      };
    }

    this.messageCallback(channelMessage);

    if (this.config.markAsRead) {
      await this.markMessageRead(msg.guid);
    }
  }

  /**
   * Check if a sender is allowed
   */
  private isAllowed(sender: string): boolean {
    if (!this.config?.allowedUsers || this.config.allowedUsers.length === 0) {
      return true;
    }

    const normalizedSender = sender.toLowerCase().replace(/\s/g, '');
    return this.config.allowedUsers.some(
      (allowed) => allowed.toLowerCase().replace(/\s/g, '') === normalizedSender
    );
  }

  /**
   * Determine peer type from chat GUID
   */
  private getPeerType(chatGuid: string): 'direct' | 'group' | 'channel' | 'thread' {
    if (chatGuid.includes(';')) {
      return 'group';
    }
    return 'direct';
  }

  /**
   * Get media type from MIME type
   */
  private getMediaType(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'photo';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    return 'document';
  }

  /**
   * Get attachment URL
   */
  private async getAttachmentUrl(attachment: BlueBubblesAttachment): Promise<string> {
    if (!this.config) return '';

    const response = await this.request<{ url: string }>(
      'GET',
      `/api/v1/attachment/${attachment.guid}`
    );

    return response.data?.url || '';
  }

  /**
   * Mark a message as read
   */
  private async markMessageRead(messageGuid: string): Promise<void> {
    try {
      await this.request('POST', `/api/v1/message/${messageGuid}/read`);
    } catch (error) {
      console.error('Failed to mark message as read:', error);
    }
  }

  /**
   * Make an API request to BlueBubbles server
   */
  private async request<T>(
    method: string,
    endpoint: string,
    body?: Record<string, unknown>
  ): Promise<BlueBubblesResponse<T>> {
    if (!this.config) {
      throw new Error('Channel not initialized');
    }

    const url = `${this.config.serverUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.password) {
      headers['Authorization'] = `Bearer ${this.config.password}`;
    }

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = (await response.json()) as Record<string, unknown>;

    return {
      status: response.status,
      message: (data.message as string) || '',
      data: data.data as T | undefined,
      error: data.error as string | undefined,
    };
  }
}

/**
 * Export singleton instance
 */
export const blueBubblesChannel = new BlueBubblesChannel();

/**
 * Register the BlueBubbles channel
 */
channelRegistry.register(
  blueBubblesChannel as unknown as Parameters<typeof channelRegistry.register>[0],
  {
    id: 'bluebubbles',
    name: 'BlueBubbles (iMessage)',
    description: 'iMessage integration via BlueBubbles Server on macOS',
    icon: 'message-square',
    capabilities: blueBubblesChannel.capabilities,
    defaultConfig: {
      serverUrl: '',
      password: '',
      pollInterval: 3000,
      markAsRead: true,
    },
    configSchema: [
      {
        key: 'serverUrl',
        type: 'text',
        label: 'Server URL',
        placeholder: 'http://localhost:1234 or https://your-server.com',
        required: true,
        hint: 'The URL of your BlueBubbles server',
      },
      {
        key: 'password',
        type: 'password',
        label: 'API Password',
        placeholder: 'Your BlueBubbles password',
        required: true,
        hint: 'Password configured in BlueBubbles server settings',
      },
      {
        key: 'allowedUsers',
        type: 'textarea',
        label: 'Allowed Contacts (optional)',
        placeholder: '+1234567890\nemail@example.com',
        required: false,
        hint: 'Phone numbers or emails (one per line). Leave empty for all.',
      },
      {
        key: 'pollInterval',
        type: 'number',
        label: 'Poll Interval (ms)',
        placeholder: '3000',
        required: false,
        hint: 'How often to check for new messages (default: 3000ms)',
      },
      {
        key: 'markAsRead',
        type: 'boolean',
        label: 'Mark Messages as Read',
        required: false,
        hint: 'Automatically mark received messages as read',
      },
    ],
  }
);
