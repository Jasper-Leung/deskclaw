/**
 * Slack Channel Adapter
 *
 * Integrates Slack Bot API for message sending/receiving.
 */

import type { ChannelPlugin, ChannelMessage, SendOptions } from '../channel-plugin.js';
import { channelRegistry } from '../channel-registry.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AppType = any;

export interface SlackConfig {
  botToken: string;
  appToken: string;
  signingSecret: string;
  allowedChannels?: string[];
  allowedUsers?: string[];
}

export class SlackChannel implements ChannelPlugin<SlackConfig> {
  id = 'slack';
  name = 'Slack';
  description = 'Slack Bot integration';
  capabilities = {
    chatTypes: ['direct', 'group', 'channel'] as Array<'direct' | 'group' | 'channel' | 'thread'>,
    media: true,
    reactions: true,
    polls: false,
    nativeCommands: true,
    blockStreaming: false,
  };

  private app?: AppType;
  private config?: SlackConfig;
  private messageCallback?: (message: ChannelMessage) => void;
  private running = false;

  async initialize(config: SlackConfig): Promise<void> {
    this.config = config;

    if (!config.botToken || !config.appToken || !config.signingSecret) {
      throw new Error('Slack botToken, appToken, and signingSecret are required');
    }

    // Dynamic import for @slack/bolt (CJS module in ESM context)
    const bolt = await import('@slack/bolt');
    const { App, ExpressReceiver } = bolt;

    const receiver = new ExpressReceiver({
      signingSecret: config.signingSecret,
      processBeforeResponse: true,
    });

    this.app = new App({
      token: config.botToken,
      appToken: config.appToken,
      socketMode: true,
      receiver,
    });

    this.setupHandlers();
  }

  async start(): Promise<void> {
    if (!this.app) {
      throw new Error('Channel not initialized. Call initialize() first.');
    }

    if (this.running) {
      return;
    }

    await this.app.start();
    this.running = true;
    console.log('[Slack] Bot started');
  }

  async stop(): Promise<void> {
    if (this.app) {
      await this.app.stop();
      this.running = false;
    }
  }

  isConnected(): boolean {
    return this.app !== undefined && this.running;
  }

  onMessage(callback: (message: ChannelMessage) => void): void {
    this.messageCallback = callback;
  }

  async sendMessage(peerId: string, content: string, options?: SendOptions): Promise<string> {
    if (!this.app) {
      throw new Error('Bot not initialized');
    }

    try {
      const messageOptions: any = {
        channel: peerId,
        text: content,
      };

      if (options?.replyTo) {
        messageOptions.thread_ts = options.replyTo;
      }

      const result = await this.app.client.chat.postMessage(messageOptions);
      return (result.ts as string) || '';
    } catch (error) {
      throw new Error(
        `Failed to send Slack message: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  validateConfig(config: unknown): { valid: boolean; error?: string } {
    if (typeof config !== 'object' || config === null) {
      return { valid: false, error: 'Config must be an object' };
    }

    const cfg = config as Partial<SlackConfig>;

    if (!cfg.botToken || typeof cfg.botToken !== 'string') {
      return {
        valid: false,
        error: 'botToken is required and must be a string',
      };
    }

    if (!cfg.appToken || typeof cfg.appToken !== 'string') {
      return {
        valid: false,
        error: 'appToken is required and must be a string',
      };
    }

    if (!cfg.signingSecret || typeof cfg.signingSecret !== 'string') {
      return {
        valid: false,
        error: 'signingSecret is required and must be a string',
      };
    }

    return { valid: true };
  }

  getDefaultConfig(): SlackConfig {
    return {
      botToken: '',
      appToken: '',
      signingSecret: '',
    };
  }

  async getAccountInfo(): Promise<{
    botId: string;
    botUserId: string;
    teamId: string;
    teamName: string;
  }> {
    if (!this.app) {
      throw new Error('Bot not initialized');
    }

    const auth = await this.app.client.auth.test();
    return {
      botId: auth.bot_id as string,
      botUserId: auth.user_id as string,
      teamId: auth.team_id as string,
      teamName: auth.team as string,
    };
  }

  private setupHandlers(): void {
    if (!this.app) return;

    this.app.message(async ({ message, client }: { message: any; client: any }) => {
      if (message.subtype) return;
      await this.handleMessage(message as any, client);
    });
  }

  private async handleMessage(
    message: MessageEvent & { channel: string; user: string; text?: string; ts: string },
    client: any
  ): Promise<void> {
    if (!this.messageCallback) return;

    if (!this.isAllowed(message)) {
      return;
    }

    const channelInfo = await client.conversations.info({ channel: message.channel });
    const userInfo = await client.users.info({ user: message.user });

    const channelMessage: ChannelMessage = {
      id: `slack_${message.ts}`,
      channelId: message.channel,
      messageId: message.ts,
      peerId: message.channel,
      peerType: this.getPeerType(channelInfo.channel),
      direction: 'inbound',
      content: message.text,
      timestamp: parseFloat(message.ts) * 1000,
      metadata: {
        from: {
          id: message.user,
          name: userInfo.user?.real_name || userInfo.user?.name,
          username: userInfo.user?.name,
        },
        channel: {
          id: message.channel,
          name: channelInfo.channel?.name,
          isPrivate: channelInfo.channel?.is_private,
        },
        threadTs: (message as any).thread_ts,
      },
    };

    this.messageCallback(channelMessage);
  }

  private isAllowed(message: any): boolean {
    if (!this.config) return true;

    if (this.config.allowedChannels && this.config.allowedChannels.length > 0) {
      if (!this.config.allowedChannels.includes(message.channel)) {
        return false;
      }
    }

    if (this.config.allowedUsers && this.config.allowedUsers.length > 0) {
      if (!this.config.allowedUsers.includes(message.user)) {
        return false;
      }
    }

    return true;
  }

  private getPeerType(channel: any): 'direct' | 'group' | 'channel' | 'thread' {
    if (channel?.is_im) {
      return 'direct';
    }
    if (channel?.is_mpim) {
      return 'group';
    }
    if (channel?.is_private) {
      return 'group';
    }
    return 'channel';
  }
}

export const slackChannel = new SlackChannel();

channelRegistry.register(slackChannel as any, {
  id: 'slack',
  name: 'Slack',
  description: 'Slack Bot integration',
  icon: 'hash',
  capabilities: slackChannel.capabilities,
  defaultConfig: {
    botToken: '',
    appToken: '',
    signingSecret: '',
  },
  configSchema: [
    {
      key: 'botToken',
      type: 'password',
      label: 'Bot Token (xoxb-)',
      placeholder: 'xoxb-...',
      required: true,
      hint: 'Bot User OAuth Token from Slack App',
    },
    {
      key: 'appToken',
      type: 'password',
      label: 'App Token (xapp-)',
      placeholder: 'xapp-...',
      required: true,
      hint: 'App-Level Token from Slack App (Socket Mode)',
    },
    {
      key: 'signingSecret',
      type: 'password',
      label: 'Signing Secret',
      placeholder: 'abc123...',
      required: true,
      hint: 'Signing Secret from Slack App credentials',
    },
    {
      key: 'allowedChannels',
      type: 'text',
      label: 'Allowed Channels (optional)',
      placeholder: 'C1234567890,C0987654321',
      required: false,
      hint: 'Comma-separated channel IDs. Leave empty for all channels.',
    },
    {
      key: 'allowedUsers',
      type: 'text',
      label: 'Allowed Users (optional)',
      placeholder: 'U1234567890',
      required: false,
      hint: 'Comma-separated user IDs for DM access. Leave empty for all users.',
    },
  ],
});
