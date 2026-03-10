/**
 * WhatsApp Channel Adapter
 *
 * Integrates WhatsApp Web API using @whiskeysockets/baileys for message sending/receiving.
 */

import {
  makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  type WASocket,
  type WAMessage,
} from '@whiskeysockets/baileys';
import { pino } from 'pino';
import * as path from 'path';
import * as fs from 'fs';
import type { ChannelPlugin, ChannelMessage, SendOptions } from '../channel-plugin.js';
import { channelRegistry } from '../channel-registry.js';

export interface WhatsAppConfig {
  authDir: string;
  allowedUsers?: string[];
  allowedGroups?: string[];
  autoReconnect?: boolean;
  printQRInTerminal?: boolean;
}

export interface WhatsAppAccount {
  id: string;
  name: string;
  pushName?: string;
  profilePicture?: string;
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'qr_pending';

export class WhatsAppChannel implements ChannelPlugin<WhatsAppConfig, WhatsAppAccount> {
  id = 'whatsapp';
  name = 'WhatsApp';
  description = 'WhatsApp Web integration via QR code';
  capabilities = {
    chatTypes: ['direct', 'group'] as Array<'direct' | 'group' | 'channel' | 'thread'>,
    media: true,
    reactions: false,
    polls: false,
    nativeCommands: false,
    blockStreaming: true,
  };

  private socket?: WASocket;
  private config?: WhatsAppConfig;
  private messageCallback?: (message: ChannelMessage) => void;
  private connectionStatus: ConnectionStatus = 'disconnected';
  private qrCode?: string;
  private authState?: {
    state: any;
    saveCreds: () => Promise<void>;
  };
  private channelId: string = 'whatsapp';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  async initialize(config: WhatsAppConfig): Promise<void> {
    this.config = config;

    if (!config.authDir) {
      throw new Error('authDir is required for WhatsApp authentication');
    }

    const authPath = path.resolve(config.authDir);
    if (!fs.existsSync(authPath)) {
      fs.mkdirSync(authPath, { recursive: true });
    }

    this.authState = await useMultiFileAuthState(authPath);
  }

  async start(): Promise<void> {
    if (!this.authState) {
      throw new Error('Channel not initialized. Call initialize() first.');
    }

    if (this.connectionStatus === 'connected' || this.connectionStatus === 'connecting') {
      return;
    }

    await this.connect();
  }

  private async connect(): Promise<void> {
    const { version } = await fetchLatestBaileysVersion();

    const logger = pino({
      level: 'silent',
    });

    this.socket = makeWASocket({
      version,
      logger,
      auth: this.authState!.state,
      printQRInTerminal: this.config?.printQRInTerminal ?? false,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      markOnlineOnConnect: false,
      browser: ['DeskClaw', 'Chrome', '1.0.0'],
    });

    this.setupEventHandlers();
    this.connectionStatus = 'connecting';
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.qrCode = qr;
        this.connectionStatus = 'qr_pending';
        console.log('[WhatsApp] QR code generated, scan to connect');
      }

      if (connection === 'close') {
        this.connectionStatus = 'disconnected';
        const shouldReconnect =
          (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;

        console.log('[WhatsApp] Connection closed:', lastDisconnect?.error?.message);

        if (shouldReconnect && this.config?.autoReconnect !== false) {
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`[WhatsApp] Reconnecting... (attempt ${this.reconnectAttempts})`);
            await this.connect();
          }
        }
      } else if (connection === 'open') {
        this.connectionStatus = 'connected';
        this.qrCode = undefined;
        this.reconnectAttempts = 0;
        console.log('[WhatsApp] Connected successfully');
      }
    });

    this.socket.ev.on('creds.update', async () => {
      if (this.authState) {
        await this.authState.saveCreds();
      }
    });

    this.socket.ev.on('messages.upsert', ({ messages, type }: any) => {
      if (type === 'notify') {
        for (const message of messages) {
          this.handleMessage(message);
        }
      }
    });
  }

  async stop(): Promise<void> {
    if (this.socket) {
      this.socket.end(undefined);
      this.socket = undefined;
    }
    this.connectionStatus = 'disconnected';
    this.qrCode = undefined;
  }

  isConnected(): boolean {
    return this.connectionStatus === 'connected';
  }

  onMessage(callback: (message: ChannelMessage) => void): void {
    this.messageCallback = callback;
  }

  async sendMessage(peerId: string, content: string, _options?: SendOptions): Promise<string> {
    if (!this.socket) {
      throw new Error('WhatsApp not connected');
    }

    if (!this.isConnected()) {
      throw new Error('WhatsApp connection not ready');
    }

    const jid = this.formatJid(peerId);

    try {
      const result = await this.socket.sendMessage(jid, { text: content });

      if (result?.key?.id) {
        return result.key.id;
      }

      throw new Error('Failed to get message ID');
    } catch (error) {
      throw new Error(
        `Failed to send WhatsApp message: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  validateConfig(config: unknown): { valid: boolean; error?: string } {
    if (typeof config !== 'object' || config === null) {
      return { valid: false, error: 'Config must be an object' };
    }

    const cfg = config as Partial<WhatsAppConfig>;

    if (!cfg.authDir || typeof cfg.authDir !== 'string') {
      return {
        valid: false,
        error: 'authDir is required and must be a string',
      };
    }

    return { valid: true };
  }

  getDefaultConfig(): WhatsAppConfig {
    return {
      authDir: './auth/whatsapp',
      autoReconnect: true,
      printQRInTerminal: false,
    };
  }

  async login(): Promise<{ status: 'pending' | 'success'; qrCode?: string }> {
    if (this.connectionStatus === 'connected') {
      return { status: 'success' };
    }

    if (this.connectionStatus === 'qr_pending' && this.qrCode) {
      return { status: 'pending', qrCode: this.qrCode };
    }

    if (!this.socket) {
      await this.start();
    }

    if (this.qrCode) {
      return { status: 'pending', qrCode: this.qrCode };
    }

    return { status: 'pending' };
  }

  async getAccountInfo(): Promise<WhatsAppAccount> {
    if (!this.socket || !this.isConnected()) {
      throw new Error('WhatsApp not connected');
    }

    const user = this.socket.user;
    if (!user) {
      throw new Error('Unable to get user info');
    }

    let profilePicture: string | undefined;
    try {
      const pic = await this.socket.profilePictureUrl(user.id, 'image');
      profilePicture = pic;
    } catch {
      // Profile picture not available
    }

    return {
      id: user.id,
      name: user.name || user.id.split('@')[0],
      pushName: user.name,
      profilePicture,
    };
  }

  private handleMessage(message: WAMessage): void {
    if (!this.messageCallback) return;

    if (message.key.fromMe) return;

    const from = message.key.remoteJid;
    if (!from) return;

    if (!this.isAllowed(from)) return;

    const content = this.extractMessageContent(message);
    if (!content && !message.message) return;

    const channelMessage: ChannelMessage = {
      id: `whatsapp_${message.key.id}`,
      channelId: this.channelId,
      messageId: message.key.id || '',
      peerId: from,
      peerType: this.getPeerType(from),
      direction: 'inbound',
      content: content || undefined,
      timestamp: message.messageTimestamp
        ? typeof message.messageTimestamp === 'number'
          ? message.messageTimestamp * 1000
          : message.messageTimestamp.toNumber() * 1000
        : Date.now(),
      metadata: {
        from: message.key.participant || from,
        pushName: message.pushName,
        isGroup: from.endsWith('@g.us'),
      },
    };

    if (message.message?.imageMessage) {
      channelMessage.media = {
        type: 'image',
        url: message.message.imageMessage.url || '',
        caption: message.message.imageMessage.caption || undefined,
      };
    } else if (message.message?.videoMessage) {
      channelMessage.media = {
        type: 'video',
        url: message.message.videoMessage.url || '',
        caption: message.message.videoMessage.caption || undefined,
      };
    } else if (message.message?.audioMessage) {
      channelMessage.media = {
        type: 'audio',
        url: message.message.audioMessage.url || '',
      };
    } else if (message.message?.documentMessage) {
      channelMessage.media = {
        type: 'document',
        url: message.message.documentMessage.url || '',
        caption: message.message.documentMessage.fileName || undefined,
      };
    }

    this.messageCallback(channelMessage);
  }

  private extractMessageContent(message: WAMessage): string | null {
    const msg = message.message;
    if (!msg) return null;

    if (msg.conversation) {
      return msg.conversation;
    }

    if (msg.extendedTextMessage?.text) {
      return msg.extendedTextMessage.text;
    }

    if (msg.imageMessage?.caption) {
      return msg.imageMessage.caption;
    }

    if (msg.videoMessage?.caption) {
      return msg.videoMessage.caption;
    }

    return null;
  }

  private isAllowed(jid: string): boolean {
    if (!this.config) return true;

    const isGroup = jid.endsWith('@g.us');
    const userId = jid.split('@')[0];

    if (isGroup) {
      if (this.config.allowedGroups && this.config.allowedGroups.length > 0) {
        return this.config.allowedGroups.some((g) => jid.includes(g));
      }
    } else {
      if (this.config.allowedUsers && this.config.allowedUsers.length > 0) {
        return this.config.allowedUsers.includes(userId);
      }
    }

    return true;
  }

  private getPeerType(jid: string): 'direct' | 'group' | 'channel' | 'thread' {
    if (jid.endsWith('@g.us')) {
      return 'group';
    }
    return 'direct';
  }

  private formatJid(peerId: string): string {
    if (peerId.includes('@')) {
      return peerId;
    }

    if (peerId.includes('-') || peerId.length > 15) {
      return `${peerId}@g.us`;
    }

    return `${peerId}@s.whatsapp.net`;
  }

  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  getQrCode(): string | undefined {
    return this.qrCode;
  }
}

export const whatsappChannel = new WhatsAppChannel();

channelRegistry.register(whatsappChannel as any, {
  id: 'whatsapp',
  name: 'WhatsApp',
  description: 'WhatsApp Web integration via QR code scanning',
  icon: 'message-circle',
  capabilities: whatsappChannel.capabilities,
  defaultConfig: {
    authDir: './auth/whatsapp',
    autoReconnect: true,
    printQRInTerminal: false,
  },
  configSchema: [
    {
      key: 'authDir',
      type: 'text',
      label: 'Authentication Directory',
      placeholder: './auth/whatsapp',
      required: true,
      hint: 'Directory to store WhatsApp session data',
    },
    {
      key: 'allowedUsers',
      type: 'textarea',
      label: 'Allowed Users (optional)',
      placeholder: '1234567890,0987654321',
      required: false,
      hint: 'Phone numbers (without +) allowed to message. One per line or comma-separated.',
    },
    {
      key: 'allowedGroups',
      type: 'textarea',
      label: 'Allowed Groups (optional)',
      placeholder: '1234567890-1234567890@g.us',
      required: false,
      hint: 'Group IDs allowed. Leave empty for all groups.',
    },
    {
      key: 'autoReconnect',
      type: 'boolean',
      label: 'Auto Reconnect',
      required: false,
      hint: 'Automatically reconnect if connection is lost',
    },
  ],
});
