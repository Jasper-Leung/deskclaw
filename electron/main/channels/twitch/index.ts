import * as net from 'net';
import * as tls from 'tls';
import type { ChannelPlugin, ChannelMessage, SendOptions } from '../channel-plugin.js';
import { channelRegistry } from '../channel-registry.js';

export interface TwitchConfig {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  channels: string[];
  botName?: string;
  autoReconnect?: boolean;
  reconnectInterval?: number;
}

interface IRCMessage {
  prefix?: string;
  command: string;
  params: string[];
  tags?: Record<string, string>;
}

export class TwitchChannel implements ChannelPlugin<TwitchConfig> {
  id = 'twitch';
  name = 'Twitch';
  description = 'Twitch IRC integration for chat';
  capabilities = {
    chatTypes: ['direct', 'channel'] as Array<'direct' | 'group' | 'channel' | 'thread'>,
    media: false,
    reactions: false,
    polls: false,
    nativeCommands: true,
    blockStreaming: false,
  };

  private socket?: tls.TLSSocket;
  private config?: TwitchConfig;
  private messageCallback?: (message: ChannelMessage) => void;
  private running = false;
  private buffer = '';
  private reconnectTimer?: NodeJS.Timeout;
  private joinedChannels = new Set<string>();

  async initialize(config: TwitchConfig): Promise<void> {
    this.config = config;

    if (!config.accessToken) {
      throw new Error('Twitch access token is required');
    }

    if (!config.channels || config.channels.length === 0) {
      throw new Error('At least one channel is required');
    }
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.connect()
        .then(() => resolve())
        .catch(reject);
    });
  }

  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const config = this.config!;

      const rawSocket = new net.Socket();
      rawSocket.setTimeout(30000);

      rawSocket.on('error', (error) => {
        console.error('[Twitch] Socket error:', error);
        reject(error);
      });

      rawSocket.connect(443, 'irc.chat.twitch.tv', () => {
        this.socket = tls.connect(
          {
            socket: rawSocket,
            servername: 'irc.chat.twitch.tv',
          },
          () => {
            console.log('[Twitch] TLS connection established');
            this.running = true;

            this.sendRaw('CAP REQ :twitch.tv/tags twitch.tv/commands');
            this.sendRaw(`PASS oauth:${config.accessToken}`);
            this.sendRaw(`NICK ${config.botName || 'justinfan12345'}`);

            resolve();
          }
        );

        const socket = this.socket;
        if (socket) {
          socket.on('data', (data: Buffer) => {
            this.handleData(data.toString('utf8'));
          });

          socket.on('error', (error: Error) => {
            console.error('[Twitch] TLS error:', error);
            this.handleDisconnect();
          });

          socket.on('close', () => {
            console.log('[Twitch] Connection closed');
            this.handleDisconnect();
          });
        }
      });
    });
  }

  private handleDisconnect(): void {
    this.running = false;
    this.joinedChannels.clear();

    if (this.config?.autoReconnect) {
      const interval = this.config.reconnectInterval || 5000;
      console.log(`[Twitch] Reconnecting in ${interval}ms...`);
      this.reconnectTimer = setTimeout(() => {
        this.connect().catch(console.error);
      }, interval);
    }
  }

  async stop(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.socket) {
      this.sendRaw('QUIT :DeskClaw Twitch Client');
      this.socket.destroy();
      this.socket = undefined;
    }

    this.running = false;
    this.joinedChannels.clear();
  }

  isConnected(): boolean {
    return this.socket !== undefined && this.running;
  }

  onMessage(callback: (message: ChannelMessage) => void): void {
    this.messageCallback = callback;
  }

  async sendMessage(peerId: string, content: string, _options?: SendOptions): Promise<string> {
    if (!this.isConnected()) {
      throw new Error('Twitch not connected');
    }

    const channelName = peerId.startsWith('#') ? peerId : `#${peerId}`;
    const lines = content.split('\n');
    const messageId = `${Date.now()}`;

    for (const line of lines) {
      if (line.trim()) {
        this.sendRaw(`PRIVMSG ${channelName} :${line}`);
      }
    }

    return messageId;
  }

  validateConfig(config: unknown): { valid: boolean; error?: string } {
    if (typeof config !== 'object' || config === null) {
      return { valid: false, error: 'Config must be an object' };
    }

    const cfg = config as Partial<TwitchConfig>;

    if (!cfg.accessToken || typeof cfg.accessToken !== 'string') {
      return { valid: false, error: 'accessToken is required and must be a string' };
    }

    if (!cfg.channels || !Array.isArray(cfg.channels) || cfg.channels.length === 0) {
      return { valid: false, error: 'channels is required and must be a non-empty array' };
    }

    return { valid: true };
  }

  getDefaultConfig(): TwitchConfig {
    return {
      clientId: '',
      clientSecret: '',
      accessToken: '',
      channels: [],
      botName: '',
      autoReconnect: true,
      reconnectInterval: 5000,
    };
  }

  private sendRaw(data: string): void {
    if (this.socket && !this.socket.destroyed) {
      this.socket.write(data + '\r\n');
    }
  }

  private handleData(data: string): void {
    this.buffer += data;

    let lineEnd: number;
    while ((lineEnd = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, lineEnd).trim();
      this.buffer = this.buffer.slice(lineEnd + 1);

      if (line) {
        this.handleLine(line);
      }
    }
  }

  private handleLine(line: string): void {
    const message = this.parseMessage(line);

    switch (message.command) {
      case 'PING':
        this.handlePing(message);
        break;
      case '001':
        this.handleWelcome(message);
        break;
      case 'JOIN':
        this.handleJoin(message);
        break;
      case 'PART':
        this.handlePart(message);
        break;
      case 'PRIVMSG':
        this.handlePrivMsg(message);
        break;
      case 'NOTICE':
        this.handleNotice(message);
        break;
      case 'CLEARCHAT':
        this.handleClearChat(message);
        break;
      case 'USERNOTICE':
        this.handleUserNotice(message);
        break;
    }
  }

  private parseMessage(line: string): IRCMessage {
    let tags: Record<string, string> | undefined;
    let prefix: string | undefined;
    let remaining = line;

    if (line.startsWith('@')) {
      const spaceIndex = line.indexOf(' ');
      if (spaceIndex !== -1) {
        const tagsStr = line.slice(1, spaceIndex);
        tags = {};
        for (const tag of tagsStr.split(';')) {
          const [key, value] = tag.split('=');
          if (key) {
            tags[key] = this.decodeTagValue(value || '');
          }
        }
        remaining = line.slice(spaceIndex + 1);
      }
    }

    if (remaining.startsWith(':')) {
      const spaceIndex = remaining.indexOf(' ');
      if (spaceIndex !== -1) {
        prefix = remaining.slice(1, spaceIndex);
        remaining = remaining.slice(spaceIndex + 1);
      }
    }

    const parts = remaining.split(' ');
    const command = parts[0];
    const params: string[] = [];

    let i = 1;
    while (i < parts.length) {
      if (parts[i].startsWith(':')) {
        params.push(parts.slice(i).join(' ').slice(1));
        break;
      }
      params.push(parts[i]);
      i++;
    }

    return { prefix, command, params, tags };
  }

  private decodeTagValue(value: string): string {
    return value
      .replace(/\\:/g, ';')
      .replace(/\\s/g, ' ')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\/g, '\\');
  }

  private handlePing(message: IRCMessage): void {
    this.sendRaw(`PONG :${message.params[0]}`);
  }

  private handleWelcome(_message: IRCMessage): void {
    console.log('[Twitch] Connected successfully');

    if (this.config?.channels) {
      for (const channel of this.config.channels) {
        const channelName = channel.startsWith('#') ? channel : `#${channel}`;
        this.sendRaw(`JOIN ${channelName}`);
      }
    }
  }

  private handleJoin(message: IRCMessage): void {
    const channel = message.params[0];
    const nick = message.prefix?.split('!')[0];

    if (nick === (this.config?.botName || 'justinfan12345')) {
      this.joinedChannels.add(channel);
      console.log(`[Twitch] Joined channel: ${channel}`);
    }
  }

  private handlePart(message: IRCMessage): void {
    const channel = message.params[0];
    const nick = message.prefix?.split('!')[0];

    if (nick === (this.config?.botName || 'justinfan12345')) {
      this.joinedChannels.delete(channel);
      console.log(`[Twitch] Left channel: ${channel}`);
    }
  }

  private handleNotice(message: IRCMessage): void {
    const channel = message.params[0];
    const content = message.params[1];
    console.log(`[Twitch] Notice from ${channel}: ${content}`);
  }

  private handleClearChat(message: IRCMessage): void {
    const channel = message.params[0];
    const targetUser = message.params[1];
    const banDuration = message.tags?.['ban-duration'];

    if (targetUser) {
      console.log(
        `[Twitch] ${targetUser} was ${banDuration ? 'timed out' : 'banned'} in ${channel}`
      );
    } else {
      console.log(`[Twitch] Chat was cleared in ${channel}`);
    }
  }

  private handleUserNotice(message: IRCMessage): void {
    if (!this.messageCallback) return;

    const channel = message.params[0];
    const msgType = message.tags?.['msg-id'];
    const systemMsg = message.tags?.['system-msg'] || '';
    const login = message.tags?.['login'];

    const channelMessage: ChannelMessage = {
      id: `twitch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      channelId: channel,
      messageId: message.tags?.['id'] || `${Date.now()}`,
      peerId: channel,
      peerType: 'channel',
      direction: 'inbound',
      content: `[${msgType}] ${systemMsg}`,
      timestamp: parseInt(message.tags?.['tmi-sent-ts'] || `${Date.now()}`),
      metadata: {
        type: 'usernotice',
        msgId: msgType,
        login,
        systemMsg,
        tags: message.tags,
      },
    };

    this.messageCallback(channelMessage);
  }

  private handlePrivMsg(message: IRCMessage): void {
    if (!this.messageCallback || !message.prefix) return;

    const [nick] = message.prefix.split('!');
    const channel = message.params[0];
    const content = message.params[1];

    if (nick === (this.config?.botName || 'justinfan12345')) return;

    const tags = message.tags || {};

    const channelMessage: ChannelMessage = {
      id: `twitch_${tags['id'] || Date.now()}`,
      channelId: channel,
      messageId: tags['id'] || `${Date.now()}`,
      peerId: channel,
      peerType: 'channel',
      direction: 'inbound',
      content,
      timestamp: parseInt(tags['tmi-sent-ts'] || `${Date.now()}`),
      metadata: {
        from: {
          id: tags['user-id'],
          login: nick,
          displayName: tags['display-name'] || nick,
          color: tags['color'],
          badges: tags['badges']
            ?.split(',')
            .map((b) => {
              const [name, version] = b.split('/');
              return { name, version };
            })
            .filter((b) => b.name),
        },
        channel: {
          name: channel,
          roomId: tags['room-id'],
        },
        tags,
        isMod: tags['mod'] === '1',
        isSubscriber: tags['subscriber'] === '1',
        isVip: tags['vip'] === '1',
        isBroadcaster: tags['badges']?.includes('broadcaster'),
      },
    };

    this.messageCallback(channelMessage);
  }
}

export const twitchChannel = new TwitchChannel();

channelRegistry.register(twitchChannel as any, {
  id: 'twitch',
  name: 'Twitch',
  description: 'Twitch IRC integration for chat',
  icon: 'video',
  capabilities: twitchChannel.capabilities,
  defaultConfig: {
    clientId: '',
    clientSecret: '',
    accessToken: '',
    channels: [],
    botName: '',
    autoReconnect: true,
    reconnectInterval: 5000,
  },
  configSchema: [
    {
      key: 'clientId',
      type: 'text',
      label: 'Client ID',
      placeholder: 'abc123...',
      required: true,
      hint: 'Twitch application Client ID from dev.twitch.tv',
    },
    {
      key: 'clientSecret',
      type: 'password',
      label: 'Client Secret',
      placeholder: 'secret...',
      required: false,
      hint: 'Twitch application Client Secret (for EventSub)',
    },
    {
      key: 'accessToken',
      type: 'password',
      label: 'Access Token',
      placeholder: 'oauth:...',
      required: true,
      hint: 'OAuth access token for the bot account',
    },
    {
      key: 'botName',
      type: 'text',
      label: 'Bot Name',
      placeholder: 'YourBotName',
      required: false,
      hint: 'Bot account username (required for sending messages)',
    },
    {
      key: 'channels',
      type: 'textarea',
      label: 'Channels',
      placeholder: 'channel1\nchannel2',
      required: true,
      hint: 'Channels to join (one per line, without #)',
    },
    {
      key: 'autoReconnect',
      type: 'boolean',
      label: 'Auto Reconnect',
      placeholder: '',
      required: false,
      hint: 'Automatically reconnect on disconnect',
    },
  ],
});
