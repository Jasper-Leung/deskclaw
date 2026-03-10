/**
 * Telegram Channel Adapter
 *
 * Integrates Telegram Bot API for message sending/receiving.
 */

import { Bot } from 'grammy';
import type { ChannelPlugin, ChannelMessage, SendOptions } from '../channel-plugin.js';
import { channelRegistry } from '../channel-registry.js';

/**
 * Telegram configuration
 */
export interface TelegramConfig {
  /** Bot token from @BotFather */
  botToken: string;
  /** Allowed user IDs (empty = all users) */
  allowedUsers?: string[];
  /** Allowed group IDs (empty = all groups) */
  allowedGroups?: string[];
  /** Whether to auto-handle commands */
  handleCommands?: boolean;
}

/**
 * Telegram channel plugin class
 */
export class TelegramChannel implements ChannelPlugin<TelegramConfig> {
  id = 'telegram';
  name = 'Telegram';
  description = 'Telegram Bot integration';
  capabilities = {
    chatTypes: ['direct', 'group', 'channel'] as Array<'direct' | 'group' | 'channel' | 'thread'>,
    media: true,
    reactions: true,
    polls: true,
    nativeCommands: true,
    blockStreaming: false,
  };

  private bot?: Bot;
  private config?: TelegramConfig;
  private messageCallback?: (message: ChannelMessage) => void;
  private running = false;

  async initialize(config: TelegramConfig): Promise<void> {
    this.config = config;

    // Validate token format
    if (!config.botToken || !config.botToken.match(/^\d+:[A-Za-z0-9_+-]+$/)) {
      throw new Error('Invalid Telegram bot token format');
    }

    this.bot = new Bot(config.botToken);

    // Set up handlers
    this.setupHandlers();
  }

  async start(): Promise<void> {
    if (!this.bot) {
      throw new Error('Channel not initialized. Call initialize() first.');
    }

    if (this.running) {
      return; // Already started
    }

    try {
      // Test connection
      await this.bot.api.getMe();
      this.running = true;
    } catch (error) {
      throw new Error(
        `Failed to connect to Telegram: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async stop(): Promise<void> {
    if (this.bot) {
      await this.bot.stop();
      this.running = false;
    }
  }

  isConnected(): boolean {
    return this.bot !== undefined && this.running;
  }

  onMessage(callback: (message: ChannelMessage) => void): void {
    this.messageCallback = callback;
  }

  async sendMessage(peerId: string, content: string, options?: SendOptions): Promise<string> {
    if (!this.bot) {
      throw new Error('Bot not initialized');
    }

    const parseMode = options?.parseMode === 'markdown' ? 'Markdown' : 'HTML';

    try {
      const result = await this.bot.api.sendMessage(peerId, content, {
        parse_mode: parseMode,
        link_preview_options: options?.disablePreview ? { is_disabled: true } : undefined,
        reply_parameters: options?.replyTo
          ? { message_id: parseInt(options.replyTo, 10) }
          : undefined,
      } as any);

      return result.message_id.toString();
    } catch (error) {
      throw new Error(
        `Failed to send Telegram message: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  validateConfig(config: unknown): { valid: boolean; error?: string } {
    if (typeof config !== 'object' || config === null) {
      return { valid: false, error: 'Config must be an object' };
    }

    const cfg = config as Partial<TelegramConfig>;

    if (!cfg.botToken || typeof cfg.botToken !== 'string') {
      return {
        valid: false,
        error: 'botToken is required and must be a string',
      };
    }

    if (!cfg.botToken.match(/^\d+:[A-Za-z0-9_+-]+$/)) {
      return {
        valid: false,
        error: 'Invalid bot token format. Expected format: 123456:ABC-DEF...',
      };
    }

    return { valid: true };
  }

  getDefaultConfig(): TelegramConfig {
    return {
      botToken: '',
      handleCommands: true,
    };
  }

  /**
   * Get bot information
   */
  async getAccountInfo(): Promise<{
    id: number;
    username: string;
    firstName: string;
    isBot: boolean;
  }> {
    if (!this.bot) {
      throw new Error('Bot not initialized');
    }

    const me = await this.bot.api.getMe();
    return {
      id: me.id,
      username: me.username || '',
      firstName: me.first_name,
      isBot: me.is_bot,
    };
  }

  /**
   * Set up message handlers
   */
  private setupHandlers(): void {
    if (!this.bot) return;

    // Handle text messages
    this.bot.on('message:text', (ctx) => this.handleMessage(ctx));

    // Handle photo messages
    this.bot.on('message:photo', (ctx) => this.handlePhoto(ctx));

    // Handle document messages
    this.bot.on('message:document', (ctx) => this.handleDocument(ctx));
  }

  /**
   * Handle incoming text message
   */
  private async handleMessage(ctx: any): Promise<void> {
    if (!this.messageCallback) return;

    const msg = ctx.msg;
    const chat = ctx.chat;

    // Check access control
    if (!this.isAllowed(chat)) {
      return;
    }

    const channelMessage: ChannelMessage = {
      id: `telegram_${msg.message_id}`,
      channelId: 'telegram',
      messageId: msg.message_id.toString(),
      peerId: chat.id.toString(),
      peerType: this.getPeerType(chat),
      direction: 'inbound',
      content: msg.text,
      timestamp: msg.date * 1000,
      metadata: {
        from: msg.from
          ? {
              id: msg.from.id,
              firstName: msg.from.first_name,
              lastName: msg.from.last_name,
              username: msg.from.username,
            }
          : undefined,
        replyTo: msg.reply_to_message_id ? { messageId: msg.reply_to_message_id } : undefined,
      },
    };

    this.messageCallback(channelMessage);
  }

  /**
   * Handle incoming photo message
   */
  private async handlePhoto(ctx: any): Promise<void> {
    if (!this.messageCallback) return;

    const msg = ctx.msg;
    const chat = ctx.chat;

    if (!this.isAllowed(chat)) return;

    // Get the largest photo
    const photo = msg.photo[msg.photo.length - 1];
    const caption = msg.caption || '';

    // Get file info
    const file = await ctx.api.getFile(photo.file_id);

    const channelMessage: ChannelMessage = {
      id: `telegram_${msg.message_id}`,
      channelId: 'telegram',
      messageId: msg.message_id.toString(),
      peerId: chat.id.toString(),
      peerType: this.getPeerType(chat),
      direction: 'inbound',
      content: caption || undefined,
      media: {
        type: 'photo',
        url: `https://api.telegram.org/file/bot${this.config?.botToken}/${file.file_path}`,
        caption: caption || undefined,
      },
      timestamp: msg.date * 1000,
      metadata: {
        fileSize: photo.file_size,
        width: photo.width,
        height: photo.height,
      },
    };

    this.messageCallback(channelMessage);
  }

  /**
   * Handle incoming document message
   */
  private async handleDocument(ctx: any): Promise<void> {
    if (!this.messageCallback) return;

    const msg = ctx.msg;
    const chat = ctx.chat;

    if (!this.isAllowed(chat)) return;

    const file = await ctx.api.getFile(msg.document.file_id);

    const channelMessage: ChannelMessage = {
      id: `telegram_${msg.message_id}`,
      channelId: 'telegram',
      messageId: msg.message_id.toString(),
      peerId: chat.id.toString(),
      peerType: this.getPeerType(chat),
      direction: 'inbound',
      content: msg.caption || undefined,
      media: {
        type: 'document',
        url: `https://api.telegram.org/file/bot${this.config?.botToken}/${file.file_path}`,
        caption: msg.caption || undefined,
      },
      timestamp: msg.date * 1000,
      metadata: {
        fileName: msg.document.file_name,
        mimeType: msg.document.mime_type,
        fileSize: msg.document.file_size,
      },
    };

    this.messageCallback(channelMessage);
  }

  /**
   * Check if a chat is allowed
   */
  private isAllowed(chat: any): boolean {
    const chatType = chat.type;
    const chatId = chat.id.toString();

    // Check direct messages
    if (chatType === 'private') {
      if (this.config?.allowedUsers && this.config.allowedUsers.length > 0) {
        return this.config.allowedUsers.includes(chatId);
      }
      return true;
    }

    // Check groups/channels
    if (this.config?.allowedGroups && this.config.allowedGroups.length > 0) {
      return this.config.allowedGroups.includes(chatId);
    }

    return true;
  }

  /**
   * Map Telegram chat type to peer type
   */
  private getPeerType(chat: any): 'direct' | 'group' | 'channel' | 'thread' {
    switch (chat.type) {
      case 'private':
        return 'direct';
      case 'group':
      case 'supergroup':
        return 'group';
      case 'channel':
        return 'channel';
      default:
        return 'direct';
    }
  }
}

/**
 * Export singleton instance
 */
export const telegramChannel = new TelegramChannel();

/**
 * Register the Telegram channel
 */
channelRegistry.register(telegramChannel as any, {
  id: 'telegram',
  name: 'Telegram',
  description: 'Telegram Bot integration',
  icon: 'message-circle',
  capabilities: telegramChannel.capabilities,
  defaultConfig: {
    botToken: '',
    handleCommands: true,
  },
  configSchema: [
    {
      key: 'botToken',
      type: 'password',
      label: 'Bot Token',
      placeholder: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
      required: true,
      hint: 'Send /newbot to @BotFather to create a new bot',
    },
    {
      key: 'allowedUsers',
      type: 'text',
      label: 'Allowed Users (optional)',
      placeholder: '123456789,987654321',
      required: false,
      hint: 'Comma-separated user IDs. Leave empty for all users.',
    },
    {
      key: 'allowedGroups',
      type: 'text',
      label: 'Allowed Groups (optional)',
      placeholder: '-1001234567890,-1009876543210',
      required: false,
      hint: 'Comma-separated group IDs. Leave empty for all groups.',
    },
  ],
});
