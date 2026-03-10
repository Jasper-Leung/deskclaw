import * as net from 'net';
import type { ChannelPlugin, ChannelMessage, SendOptions } from '../channel-plugin.js';
import { channelRegistry } from '../channel-registry.js';

export interface IRCConfig {
  server: string;
  port: number;
  nick: string;
  user?: string;
  realname?: string;
  password?: string;
  channels: string[];
  autoReconnect?: boolean;
  reconnectInterval?: number;
  encoding?: string;
}

interface IRCMessage {
  prefix?: string;
  command: string;
  params: string[];
}

export class IRCChannel implements ChannelPlugin<IRCConfig> {
  id = 'irc';
  name = 'IRC';
  description = 'IRC protocol integration';
  capabilities = {
    chatTypes: ['direct', 'group', 'channel'] as Array<'direct' | 'group' | 'channel' | 'thread'>,
    media: false,
    reactions: false,
    polls: false,
    nativeCommands: true,
    blockStreaming: false,
  };

  private socket?: net.Socket;
  private config?: IRCConfig;
  private messageCallback?: (message: ChannelMessage) => void;
  private running = false;
  private buffer = '';
  private reconnectTimer?: NodeJS.Timeout;
  private joinedChannels = new Set<string>();
  private currentNick?: string;

  async initialize(config: IRCConfig): Promise<void> {
    this.config = config;
    this.currentNick = config.nick;

    if (!config.server || !config.nick) {
      throw new Error('IRC server and nick are required');
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

      this.socket = new net.Socket();
      this.socket.setEncoding((config.encoding as BufferEncoding) || 'utf8');

      const connectTimeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
        this.socket?.destroy();
      }, 30000);

      this.socket.connect(config.port, config.server, () => {
        clearTimeout(connectTimeout);
        console.log(`[IRC] Connected to ${config.server}:${config.port}`);

        if (config.password) {
          this.sendRaw(`PASS ${config.password}`);
        }

        this.sendRaw(`NICK ${config.nick}`);
        this.sendRaw(`USER ${config.user || config.nick} 0 * :${config.realname || config.nick}`);

        this.running = true;
        resolve();
      });

      this.socket.on('data', (data: string) => {
        this.handleData(data);
      });

      this.socket.on('error', (error: Error) => {
        console.error('[IRC] Socket error:', error);
        this.handleDisconnect();
      });

      this.socket.on('close', () => {
        console.log('[IRC] Connection closed');
        this.handleDisconnect();
      });
    });
  }

  private handleDisconnect(): void {
    this.running = false;
    this.joinedChannels.clear();

    if (this.config?.autoReconnect) {
      const interval = this.config.reconnectInterval || 5000;
      console.log(`[IRC] Reconnecting in ${interval}ms...`);
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
      this.sendRaw('QUIT :DeskClaw IRC Client');
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
      throw new Error('IRC not connected');
    }

    const lines = content.split('\n');
    const messageId = `${Date.now()}`;

    for (const line of lines) {
      if (line.trim()) {
        this.sendRaw(`PRIVMSG ${peerId} :${line}`);
      }
    }

    return messageId;
  }

  validateConfig(config: unknown): { valid: boolean; error?: string } {
    if (typeof config !== 'object' || config === null) {
      return { valid: false, error: 'Config must be an object' };
    }

    const cfg = config as Partial<IRCConfig>;

    if (!cfg.server || typeof cfg.server !== 'string') {
      return { valid: false, error: 'server is required and must be a string' };
    }

    if (!cfg.nick || typeof cfg.nick !== 'string') {
      return { valid: false, error: 'nick is required and must be a string' };
    }

    if (
      cfg.port !== undefined &&
      (typeof cfg.port !== 'number' || cfg.port < 1 || cfg.port > 65535)
    ) {
      return { valid: false, error: 'port must be a valid port number (1-65535)' };
    }

    return { valid: true };
  }

  getDefaultConfig(): IRCConfig {
    return {
      server: 'irc.libera.chat',
      port: 6667,
      nick: 'DeskClaw',
      channels: [],
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
      case '433':
        this.handleNickInUse(message);
        break;
      case 'JOIN':
        this.handleJoin(message);
        break;
      case 'PRIVMSG':
      case 'NOTICE':
        this.handlePrivMsg(message);
        break;
      case 'KICK':
        this.handleKick(message);
        break;
    }
  }

  private parseMessage(line: string): IRCMessage {
    let prefix: string | undefined;
    let remaining = line;

    if (line.startsWith(':')) {
      const spaceIndex = line.indexOf(' ');
      if (spaceIndex !== -1) {
        prefix = line.slice(1, spaceIndex);
        remaining = line.slice(spaceIndex + 1);
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

    return { prefix, command, params };
  }

  private handlePing(message: IRCMessage): void {
    this.sendRaw(`PONG :${message.params[0]}`);
  }

  private handleWelcome(_message: IRCMessage): void {
    console.log(`[IRC] Welcome! Logged in as ${this.currentNick}`);

    if (this.config?.channels) {
      for (const channel of this.config.channels) {
        this.sendRaw(`JOIN ${channel}`);
      }
    }
  }

  private handleNickInUse(_message: IRCMessage): void {
    const newNick = `${this.currentNick}_`;
    console.log(`[IRC] Nick in use, trying ${newNick}`);
    this.currentNick = newNick;
    this.sendRaw(`NICK ${newNick}`);
  }

  private handleJoin(message: IRCMessage): void {
    const channel = message.params[0];
    const nick = message.prefix?.split('!')[0];

    if (nick === this.currentNick) {
      this.joinedChannels.add(channel);
      console.log(`[IRC] Joined channel: ${channel}`);
    }
  }

  private handleKick(message: IRCMessage): void {
    const channel = message.params[0];
    const kickedNick = message.params[1];

    if (kickedNick === this.currentNick) {
      this.joinedChannels.delete(channel);
      console.log(`[IRC] Kicked from channel: ${channel}`);
    }
  }

  private handlePrivMsg(message: IRCMessage): void {
    if (!this.messageCallback || !message.prefix) return;

    const [nick, userAndHost] = message.prefix.split('!');
    const [user, host] = (userAndHost || '').split('@');
    const target = message.params[0];
    const content = message.params[1];

    if (nick === this.currentNick) return;

    const isChannel = target.startsWith('#') || target.startsWith('&');
    const peerId = isChannel ? target : nick;
    const peerType = isChannel ? 'channel' : 'direct';

    const channelMessage: ChannelMessage = {
      id: `irc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      channelId: peerId,
      messageId: `${Date.now()}`,
      peerId,
      peerType,
      direction: 'inbound',
      content,
      timestamp: Date.now(),
      metadata: {
        from: {
          nick,
          user,
          host,
        },
        target,
        command: message.command,
      },
    };

    this.messageCallback(channelMessage);
  }
}

export const ircChannel = new IRCChannel();

channelRegistry.register(ircChannel as any, {
  id: 'irc',
  name: 'IRC',
  description: 'IRC protocol integration',
  icon: 'hash',
  capabilities: ircChannel.capabilities,
  defaultConfig: {
    server: 'irc.libera.chat',
    port: 6667,
    nick: 'MiniClaw7',
    channels: [],
    autoReconnect: true,
    reconnectInterval: 5000,
  },
  configSchema: [
    {
      key: 'server',
      type: 'text',
      label: 'Server',
      placeholder: 'irc.libera.chat',
      required: true,
      hint: 'IRC server hostname',
    },
    {
      key: 'port',
      type: 'number',
      label: 'Port',
      placeholder: '6667',
      required: true,
      hint: 'IRC server port (usually 6667 for plain, 6697 for TLS)',
    },
    {
      key: 'nick',
      type: 'text',
      label: 'Nickname',
      placeholder: 'YourNick',
      required: true,
      hint: 'Your IRC nickname',
    },
    {
      key: 'user',
      type: 'text',
      label: 'Username (optional)',
      placeholder: 'username',
      required: false,
      hint: 'IRC username (defaults to nickname)',
    },
    {
      key: 'realname',
      type: 'text',
      label: 'Real Name (optional)',
      placeholder: 'Your Name',
      required: false,
      hint: 'Real name shown in whois',
    },
    {
      key: 'password',
      type: 'password',
      label: 'Password (optional)',
      placeholder: 'Server password',
      required: false,
      hint: 'IRC server password (if required)',
    },
    {
      key: 'channels',
      type: 'textarea',
      label: 'Auto-join Channels',
      placeholder: '#channel1\n#channel2',
      required: false,
      hint: 'Channels to join automatically (one per line)',
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
