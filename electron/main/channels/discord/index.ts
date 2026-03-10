/**
 * Discord Channel Adapter
 *
 * Integrates Discord Bot API for message sending/receiving.
 */

import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  type Message,
  type TextChannel,
  type DMChannel,
  type NewsChannel,
  type Channel,
} from 'discord.js';
import type { ChannelPlugin, ChannelMessage, SendOptions } from '../channel-plugin.js';
import { channelRegistry } from '../channel-registry.js';

export interface DiscordConfig {
  botToken: string;
  applicationId?: string;
  allowedGuilds?: string[];
  allowedUsers?: string[];
  prefix?: string;
}

export class DiscordChannel implements ChannelPlugin<DiscordConfig> {
  id = 'discord';
  name = 'Discord';
  description = 'Discord Bot integration';
  capabilities = {
    chatTypes: ['direct', 'group', 'channel'] as Array<'direct' | 'group' | 'channel' | 'thread'>,
    media: true,
    reactions: true,
    polls: true,
    nativeCommands: true,
    blockStreaming: false,
  };

  private client?: Client;
  private config?: DiscordConfig;
  private messageCallback?: (message: ChannelMessage) => void;
  private running = false;

  async initialize(config: DiscordConfig): Promise<void> {
    this.config = config;

    if (!config.botToken) {
      throw new Error('Discord bot token is required');
    }

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Channel, Partials.Message, Partials.Reaction],
    });

    this.setupHandlers();
  }

  async start(): Promise<void> {
    if (!this.client) {
      throw new Error('Channel not initialized. Call initialize() first.');
    }

    if (this.running) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.client!.once('ready', () => {
        this.running = true;
        console.log(`[Discord] Logged in as ${this.client!.user?.tag}`);
        resolve();
      });

      this.client!.once('error', (error) => {
        reject(error);
      });

      this.client!.login(this.config!.botToken).catch(reject);
    });
  }

  async stop(): Promise<void> {
    if (this.client) {
      this.client.destroy();
      this.running = false;
    }
  }

  isConnected(): boolean {
    return this.client !== undefined && this.running;
  }

  onMessage(callback: (message: ChannelMessage) => void): void {
    this.messageCallback = callback;
  }

  async sendMessage(peerId: string, content: string, options?: SendOptions): Promise<string> {
    if (!this.client) {
      throw new Error('Bot not initialized');
    }

    try {
      const channel = await this.client.channels.fetch(peerId);
      if (!channel || !channel.isTextBased()) {
        throw new Error(`Channel ${peerId} not found or not text-based`);
      }

      const messageOptions: any = {
        content,
      };

      if (options?.replyTo) {
        messageOptions.reply = { messageReference: options.replyTo };
      }

      const result = await (channel as TextChannel | DMChannel | NewsChannel).send(messageOptions);
      return result.id;
    } catch (error) {
      throw new Error(
        `Failed to send Discord message: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  validateConfig(config: unknown): { valid: boolean; error?: string } {
    if (typeof config !== 'object' || config === null) {
      return { valid: false, error: 'Config must be an object' };
    }

    const cfg = config as Partial<DiscordConfig>;

    if (!cfg.botToken || typeof cfg.botToken !== 'string') {
      return {
        valid: false,
        error: 'botToken is required and must be a string',
      };
    }

    return { valid: true };
  }

  getDefaultConfig(): DiscordConfig {
    return {
      botToken: '',
      prefix: '!',
    };
  }

  async getAccountInfo(): Promise<{
    id: string;
    username: string;
    discriminator: string;
    avatar?: string;
  }> {
    if (!this.client || !this.client.user) {
      throw new Error('Bot not initialized');
    }

    const user = this.client.user;
    return {
      id: user.id,
      username: user.username,
      discriminator: user.discriminator,
      avatar: user.avatarURL() || undefined,
    };
  }

  private setupHandlers(): void {
    if (!this.client) return;

    this.client.on(Events.MessageCreate, (message: Message) => {
      this.handleMessage(message);
    });

    this.client.on(Events.Error, (error) => {
      console.error('[Discord] Client error:', error);
    });
  }

  private async handleMessage(message: Message): Promise<void> {
    if (!this.messageCallback) return;
    if (message.author.bot) return;

    if (!this.isAllowed(message)) {
      return;
    }

    const channel = message.channel;
    const guild = message.guild;

    const channelMessage: ChannelMessage = {
      id: `discord_${message.id}`,
      channelId: channel.id,
      messageId: message.id,
      peerId: channel.id,
      peerType: this.getPeerType(channel),
      direction: 'inbound',
      content: message.content,
      timestamp: message.createdTimestamp,
      metadata: {
        from: {
          id: message.author.id,
          username: message.author.username,
          discriminator: message.author.discriminator,
          displayName: message.author.displayName,
        },
        guild: guild
          ? {
              id: guild.id,
              name: guild.name,
            }
          : undefined,
        channel: {
          id: channel.id,
          name: 'name' in channel ? channel.name : 'DM',
          type: channel.type,
        },
        attachments: message.attachments.map((a) => ({
          id: a.id,
          url: a.url,
          name: a.name,
          contentType: a.contentType,
        })),
        replyTo: message.reference?.messageId,
      },
    };

    this.messageCallback(channelMessage);
  }

  private isAllowed(message: Message): boolean {
    if (!this.config) return true;

    if (message.guild) {
      if (this.config.allowedGuilds && this.config.allowedGuilds.length > 0) {
        return this.config.allowedGuilds.includes(message.guild.id);
      }
    } else {
      if (this.config.allowedUsers && this.config.allowedUsers.length > 0) {
        return this.config.allowedUsers.includes(message.author.id);
      }
    }

    return true;
  }

  private getPeerType(channel: Channel): 'direct' | 'group' | 'channel' | 'thread' {
    if (channel.isDMBased()) {
      return 'direct';
    }
    if (channel.isThread()) {
      return 'thread';
    }
    if (channel.type === 0) {
      return 'group';
    }
    return 'channel';
  }
}

export const discordChannel = new DiscordChannel();

channelRegistry.register(discordChannel as any, {
  id: 'discord',
  name: 'Discord',
  description: 'Discord Bot integration',
  icon: 'message-square',
  capabilities: discordChannel.capabilities,
  defaultConfig: {
    botToken: '',
    prefix: '!',
  },
  configSchema: [
    {
      key: 'botToken',
      type: 'password',
      label: 'Bot Token',
      placeholder: 'ODk... (Your Discord Bot Token)',
      required: true,
      hint: 'Get your bot token from the Discord Developer Portal',
    },
    {
      key: 'applicationId',
      type: 'text',
      label: 'Application ID (optional)',
      placeholder: '123456789012345678',
      required: false,
      hint: 'Used for slash commands',
    },
    {
      key: 'allowedGuilds',
      type: 'text',
      label: 'Allowed Servers (optional)',
      placeholder: '123456789012345678,987654321098765432',
      required: false,
      hint: 'Comma-separated server IDs. Leave empty for all servers.',
    },
    {
      key: 'allowedUsers',
      type: 'text',
      label: 'Allowed Users (optional)',
      placeholder: '123456789012345678',
      required: false,
      hint: 'Comma-separated user IDs for DM access. Leave empty for all users.',
    },
  ],
});
