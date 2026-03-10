/**
 * Signal Channel Adapter
 *
 * Integrates signal-cli REST API for message sending/receiving.
 */

import type { ChannelPlugin, ChannelMessage, SendOptions, ChannelType } from '../channel-plugin.js';
import { channelRegistry } from '../channel-registry.js';

/**
 * Signal configuration
 */
export interface SignalConfig {
  /** signal-cli REST API URL */
  httpUrl: string;
  /** Signal phone number (with country code, e.g., +1234567890) */
  account: string;
  /** Allowed user phone numbers (empty = all users) */
  allowedUsers?: string[];
  /** Allowed group IDs (empty = all groups) */
  allowedGroups?: string[];
  /** Whether to auto-handle commands */
  handleCommands?: boolean;
}

/**
 * Signal API response types
 */
interface SignalMessage {
  envelope: {
    source: string;
    sourceNumber: string;
    sourceUuid: string;
    sourceName: string;
    timestamp: number;
    dataMessage?: {
      message: string;
      timestamp: number;
      expiresInSeconds: number;
      attachments?: Array<{
        contentType: string;
        filename: string;
        id: string;
        size: number;
      }>;
      groupInfo?: {
        groupId: string;
        groupName: string;
      };
    };
    syncMessage?: {
      sentMessage?: {
        message: string;
        timestamp: number;
        destination?: string;
        groupInfo?: {
          groupId: string;
          groupName: string;
        };
      };
    };
  };
}

interface SignalSendResponse {
  timestamp: number;
}

interface SignalAccountInfo {
  number: string;
  uuid: string;
  name?: string;
}

/**
 * Signal channel plugin class
 */
export class SignalChannel implements ChannelPlugin<SignalConfig> {
  id = 'signal';
  name = 'Signal';
  description = 'Signal messaging via signal-cli REST API';
  capabilities = {
    chatTypes: ['direct', 'group'] as Array<'direct' | 'group' | 'channel' | 'thread'>,
    media: true,
    reactions: false,
    polls: false,
    nativeCommands: false,
    blockStreaming: false,
  };

  private config?: SignalConfig;
  private messageCallback?: (message: ChannelMessage) => void;
  private running = false;
  private pollInterval?: ReturnType<typeof setInterval>;
  private lastTimestamp = 0;

  async initialize(config: SignalConfig): Promise<void> {
    this.config = config;

    if (!config.httpUrl) {
      throw new Error('Signal REST API URL is required');
    }

    if (!config.account) {
      throw new Error('Signal account phone number is required');
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
      await this.testConnection();
      this.running = true;
      this.startPolling();
    } catch (error) {
      throw new Error(
        `Failed to connect to Signal API: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }
  }

  isConnected(): boolean {
    return this.config !== undefined && this.running;
  }

  onMessage(callback: (message: ChannelMessage) => void): void {
    this.messageCallback = callback;
  }

  async sendMessage(peerId: string, content: string, _options?: SendOptions): Promise<string> {
    if (!this.config) {
      throw new Error('Signal not initialized');
    }

    const url = `${this.config.httpUrl}/v2/send`;

    const body: Record<string, unknown> = {
      message: content,
      number: this.config.account,
      recipients: [peerId],
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      const result = (await response.json()) as SignalSendResponse;
      return result.timestamp.toString();
    } catch (error) {
      throw new Error(
        `Failed to send Signal message: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  validateConfig(config: unknown): { valid: boolean; error?: string } {
    if (typeof config !== 'object' || config === null) {
      return { valid: false, error: 'Config must be an object' };
    }

    const cfg = config as Partial<SignalConfig>;

    if (!cfg.httpUrl || typeof cfg.httpUrl !== 'string') {
      return {
        valid: false,
        error: 'httpUrl is required and must be a string',
      };
    }

    try {
      new URL(cfg.httpUrl);
    } catch {
      return {
        valid: false,
        error: 'httpUrl must be a valid URL',
      };
    }

    if (!cfg.account || typeof cfg.account !== 'string') {
      return {
        valid: false,
        error: 'account is required and must be a phone number string',
      };
    }

    return { valid: true };
  }

  getDefaultConfig(): SignalConfig {
    return {
      httpUrl: 'http://localhost:8080',
      account: '',
      handleCommands: true,
    };
  }

  async getAccountInfo(): Promise<SignalAccountInfo> {
    if (!this.config) {
      throw new Error('Signal not initialized');
    }

    const url = `${this.config.httpUrl}/v1/accounts/${this.config.account}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to get account info: ${response.status}`);
    }

    return (await response.json()) as SignalAccountInfo;
  }

  private async testConnection(): Promise<void> {
    if (!this.config) return;

    const url = `${this.config.httpUrl}/v1/about`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Connection test failed: ${response.status}`);
      }
    } catch (error) {
      throw new Error(
        `Cannot reach Signal REST API at ${this.config.httpUrl}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private startPolling(): void {
    this.pollInterval = setInterval(() => {
      this.pollMessages().catch((error) => {
        console.error('Signal polling error:', error);
      });
    }, 2000);
  }

  private async pollMessages(): Promise<void> {
    if (!this.config || !this.messageCallback) return;

    const url = `${this.config.httpUrl}/v1/receive/${this.config.account}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 204) {
          return;
        }
        return;
      }

      const messages = (await response.json()) as SignalMessage[];

      for (const msg of messages) {
        this.processMessage(msg);
      }
    } catch (error) {
      console.error('Failed to poll Signal messages:', error);
    }
  }

  private processMessage(msg: SignalMessage): void {
    if (!this.messageCallback || !this.config) return;

    const envelope = msg.envelope;
    const dataMessage = envelope.dataMessage;
    const syncMessage = envelope.syncMessage;

    if (dataMessage) {
      const groupInfo = dataMessage.groupInfo;

      if (groupInfo && !this.isGroupAllowed(groupInfo.groupId)) {
        return;
      }

      if (!groupInfo && !this.isUserAllowed(envelope.sourceNumber)) {
        return;
      }

      const channelMessage: ChannelMessage = {
        id: `signal_${dataMessage.timestamp}`,
        channelId: 'signal',
        messageId: dataMessage.timestamp.toString(),
        peerId: groupInfo ? groupInfo.groupId : envelope.sourceNumber,
        peerType: groupInfo ? 'group' : 'direct',
        direction: 'inbound',
        content: dataMessage.message,
        timestamp: dataMessage.timestamp,
        metadata: {
          from: {
            number: envelope.sourceNumber,
            uuid: envelope.sourceUuid,
            name: envelope.sourceName,
          },
          group: groupInfo
            ? {
                id: groupInfo.groupId,
                name: groupInfo.groupName,
              }
            : undefined,
          attachments: dataMessage.attachments,
        },
      };

      if (dataMessage.timestamp > this.lastTimestamp) {
        this.lastTimestamp = dataMessage.timestamp;
        this.messageCallback(channelMessage);
      }
    }

    if (syncMessage?.sentMessage) {
      const sentMsg = syncMessage.sentMessage;
      const groupInfo = sentMsg.groupInfo;

      const channelMessage: ChannelMessage = {
        id: `signal_${sentMsg.timestamp}_sync`,
        channelId: 'signal',
        messageId: sentMsg.timestamp.toString(),
        peerId: groupInfo ? groupInfo.groupId : sentMsg.destination || '',
        peerType: groupInfo ? 'group' : 'direct',
        direction: 'outbound',
        content: sentMsg.message,
        timestamp: sentMsg.timestamp,
        metadata: {
          sync: true,
          group: groupInfo
            ? {
                id: groupInfo.groupId,
                name: groupInfo.groupName,
              }
            : undefined,
        },
      };

      if (sentMsg.timestamp > this.lastTimestamp) {
        this.lastTimestamp = sentMsg.timestamp;
        this.messageCallback(channelMessage);
      }
    }
  }

  private isUserAllowed(phoneNumber: string): boolean {
    if (!this.config?.allowedUsers || this.config.allowedUsers.length === 0) {
      return true;
    }
    return this.config.allowedUsers.includes(phoneNumber);
  }

  private isGroupAllowed(groupId: string): boolean {
    if (!this.config?.allowedGroups || this.config.allowedGroups.length === 0) {
      return true;
    }
    return this.config.allowedGroups.includes(groupId);
  }
}

export const signalChannel = new SignalChannel();

const signalChannelType: ChannelType = {
  id: 'signal',
  name: 'Signal',
  description: 'Signal messaging via signal-cli REST API',
  icon: 'message-circle',
  capabilities: signalChannel.capabilities,
  defaultConfig: {
    httpUrl: 'http://localhost:8080',
    account: '',
    handleCommands: true,
  },
  configSchema: [
    {
      key: 'httpUrl',
      type: 'text',
      label: 'REST API URL',
      placeholder: 'http://localhost:8080',
      required: true,
      hint: 'URL of your signal-cli REST API server',
    },
    {
      key: 'account',
      type: 'text',
      label: 'Phone Number',
      placeholder: '+1234567890',
      required: true,
      hint: 'Your Signal phone number with country code',
    },
    {
      key: 'allowedUsers',
      type: 'text',
      label: 'Allowed Users (optional)',
      placeholder: '+1234567890,+0987654321',
      required: false,
      hint: 'Comma-separated phone numbers. Leave empty for all users.',
    },
    {
      key: 'allowedGroups',
      type: 'text',
      label: 'Allowed Groups (optional)',
      placeholder: 'group-id-1,group-id-2',
      required: false,
      hint: 'Comma-separated group IDs. Leave empty for all groups.',
    },
  ],
};

channelRegistry.register(signalChannel as unknown as ChannelPlugin, signalChannelType);
