import ws from 'ws';
import { createHash, createPublicKey, createSign } from 'crypto';
import type { ChannelPlugin, ChannelMessage, SendOptions } from '../channel-plugin.js';
import { channelRegistry } from '../channel-registry.js';

const WebSocket = ws;

export interface NostrConfig {
  privateKey: string;
  relays: string[];
  subscribeTo?: string[];
}

interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

interface NostrFilter {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  since?: number;
  until?: number;
  limit?: number;
  '#p'?: string[];
  '#e'?: string[];
}

type NostrMessage =
  | ['EVENT', string, NostrEvent]
  | ['OK', string, boolean, string]
  | ['EOSE', string]
  | ['NOTICE', string]
  | ['AUTH', string];

type WsConnection = ws & { readyState: number };

export class NostrChannel implements ChannelPlugin<NostrConfig> {
  id = 'nostr';
  name = 'Nostr';
  description = 'Decentralized protocol using nostr-tools';
  capabilities = {
    chatTypes: ['direct', 'group'] as Array<'direct' | 'group' | 'channel' | 'thread'>,
    media: false,
    reactions: true,
    polls: false,
    nativeCommands: false,
    blockStreaming: false,
  };

  private config?: NostrConfig;
  private connections = new Map<string, WsConnection>();
  private messageCallback?: (message: ChannelMessage) => void;
  private running = false;
  private pubkey?: string;
  private subscriptionId = 'deskclaw-sub';

  async initialize(config: NostrConfig): Promise<void> {
    this.config = config;

    if (!config.privateKey || !/^[0-9a-f]{64}$/.test(config.privateKey)) {
      throw new Error('Invalid private key. Must be 64 hex characters.');
    }

    if (!config.relays || config.relays.length === 0) {
      throw new Error('At least one relay is required');
    }

    this.pubkey = this.derivePubkey(config.privateKey);
  }

  async start(): Promise<void> {
    if (!this.config || !this.pubkey) {
      throw new Error('Channel not initialized. Call initialize() first.');
    }

    if (this.running) return;

    await Promise.all(this.config.relays.map((relay) => this.connectToRelay(relay)));
    this.running = true;
  }

  async stop(): Promise<void> {
    const entries = Array.from(this.connections.entries());
    for (const [relay, conn] of entries) {
      conn.close();
      this.connections.delete(relay);
    }
    this.running = false;
  }

  isConnected(): boolean {
    return this.running && this.connections.size > 0;
  }

  onMessage(callback: (message: ChannelMessage) => void): void {
    this.messageCallback = callback;
  }

  async sendMessage(peerId: string, content: string, options?: SendOptions): Promise<string> {
    if (!this.config || !this.pubkey) {
      throw new Error('Channel not initialized');
    }

    const tags: string[][] = [];

    if (peerId.startsWith('npub') || peerId.length === 64) {
      tags.push(['p', peerId]);
    }

    if (options?.replyTo) {
      tags.push(['e', options.replyTo, '', 'reply']);
    }

    const event: NostrEvent = {
      id: '',
      pubkey: this.pubkey,
      created_at: Math.floor(Date.now() / 1000),
      kind: 1,
      tags,
      content,
      sig: '',
    };

    event.id = this.computeEventId(event);
    event.sig = await this.signEvent(event, this.config.privateKey);

    const message = JSON.stringify(['EVENT', event]);

    const sockets = Array.from(this.connections.values());
    for (const conn of sockets) {
      if (conn.readyState === WebSocket.OPEN) {
        conn.send(message);
      }
    }

    return event.id;
  }

  validateConfig(config: unknown): { valid: boolean; error?: string } {
    if (typeof config !== 'object' || config === null) {
      return { valid: false, error: 'Config must be an object' };
    }

    const cfg = config as Partial<NostrConfig>;

    if (!cfg.privateKey || typeof cfg.privateKey !== 'string') {
      return { valid: false, error: 'privateKey is required' };
    }

    if (!/^[0-9a-f]{64}$/.test(cfg.privateKey)) {
      return { valid: false, error: 'Invalid private key format' };
    }

    if (!cfg.relays || !Array.isArray(cfg.relays) || cfg.relays.length === 0) {
      return { valid: false, error: 'At least one relay URL is required' };
    }

    for (const relay of cfg.relays) {
      if (!relay.startsWith('wss://') && !relay.startsWith('ws://')) {
        return { valid: false, error: `Invalid relay URL: ${relay}` };
      }
    }

    return { valid: true };
  }

  getDefaultConfig(): NostrConfig {
    return {
      privateKey: '',
      relays: ['wss://relay.damus.io', 'wss://nos.lol'],
    };
  }

  private async connectToRelay(relayUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(relayUrl) as WsConnection;

      socket.on('open', () => {
        this.connections.set(relayUrl, socket);
        this.subscribeToEvents(socket);
        resolve();
      });

      socket.on('message', (data) => {
        this.handleMessage(data.toString(), relayUrl);
      });

      socket.on('error', (error) => {
        console.error(`Nostr relay ${relayUrl} error:`, error.message);
        if (!this.connections.has(relayUrl)) {
          reject(error);
        }
      });

      socket.on('close', () => {
        this.connections.delete(relayUrl);
        if (this.running) {
          setTimeout(() => this.connectToRelay(relayUrl), 5000);
        }
      });
    });
  }

  private subscribeToEvents(conn: WsConnection): void {
    const filter: NostrFilter = {
      kinds: [1, 4],
      limit: 100,
    };

    if (this.config?.subscribeTo && this.config.subscribeTo.length > 0) {
      filter.authors = this.config.subscribeTo;
    }

    if (this.pubkey) {
      filter['#p'] = [this.pubkey];
    }

    const subscription = JSON.stringify(['REQ', this.subscriptionId, filter]);
    conn.send(subscription);
  }

  private handleMessage(data: string, relayUrl: string): void {
    if (!this.messageCallback) return;

    try {
      const message: NostrMessage = JSON.parse(data);

      if (message[0] === 'EVENT' && message[2]) {
        const event = message[2];
        const channelMessage = this.convertToChannelMessage(event, relayUrl);
        if (channelMessage) {
          this.messageCallback(channelMessage);
        }
      }
    } catch (error) {
      console.error('Failed to parse Nostr message:', error);
    }
  }

  private convertToChannelMessage(event: NostrEvent, relayUrl: string): ChannelMessage | null {
    const pTag = event.tags.find((tag) => tag[0] === 'p');
    const isDirect = event.kind === 4 || pTag !== undefined;

    return {
      id: `nostr_${event.id}`,
      channelId: 'nostr',
      messageId: event.id,
      peerId: pTag?.[1] || event.pubkey,
      peerType: isDirect ? 'direct' : 'group',
      direction: 'inbound',
      content: event.content,
      timestamp: event.created_at * 1000,
      metadata: {
        pubkey: event.pubkey,
        kind: event.kind,
        relay: relayUrl,
        tags: event.tags,
      },
    };
  }

  private derivePubkey(privateKey: string): string {
    const privKeyBytes = Buffer.from(privateKey, 'hex');
    const privKeyDer = Buffer.concat([
      Buffer.from('302e0201010420', 'hex'),
      privKeyBytes,
      Buffer.from('a00706052b8104000a', 'hex'),
    ]);

    const publicKey = createPublicKey({
      key: privKeyDer,
      format: 'der',
      type: 'pkcs8' as any,
    });

    const pubKeyRaw = publicKey.export({ type: 'spki', format: 'der' });
    return pubKeyRaw.slice(-32).toString('hex');
  }

  private computeEventId(event: NostrEvent): string {
    const serialized = JSON.stringify([
      0,
      event.pubkey,
      event.created_at,
      event.kind,
      event.tags,
      event.content,
    ]);
    return createHash('sha256').update(serialized).digest('hex');
  }

  private async signEvent(event: NostrEvent, privateKey: string): Promise<string> {
    const sign = createSign('sha256');
    sign.update(event.id);
    sign.end();

    const privKeyBytes = Buffer.from(privateKey, 'hex');
    const privKeyDer = Buffer.concat([
      Buffer.from('302e0201010420', 'hex'),
      privKeyBytes,
      Buffer.from('a00706052b8104000a', 'hex'),
    ]);

    const signature = sign.sign(privKeyDer);
    return signature.toString('hex');
  }
}

export const nostrChannel = new NostrChannel();

channelRegistry.register(nostrChannel as any, {
  id: 'nostr',
  name: 'Nostr',
  description: 'Decentralized protocol using nostr-tools',
  icon: 'radio',
  capabilities: nostrChannel.capabilities,
  defaultConfig: {
    privateKey: '',
    relays: ['wss://relay.damus.io', 'wss://nos.lol'],
  },
  configSchema: [
    {
      key: 'privateKey',
      type: 'password',
      label: 'Private Key (hex)',
      placeholder: '64 hex characters',
      required: true,
      hint: 'Your Nostr private key (nsec or hex format)',
    },
    {
      key: 'relays',
      type: 'textarea',
      label: 'Relay URLs',
      placeholder: 'wss://relay.damus.io\nwss://nos.lol',
      required: true,
      hint: 'One relay URL per line',
    },
    {
      key: 'subscribeTo',
      type: 'textarea',
      label: 'Subscribe to Pubkeys (optional)',
      placeholder: 'hex pubkey per line',
      required: false,
      hint: 'Only receive messages from these pubkeys',
    },
  ],
});
