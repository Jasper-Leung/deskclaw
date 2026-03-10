/**
 * Google Chat Channel Adapter
 *
 * Integrates Google Chat API for message sending/receiving.
 */

import type { ChannelPlugin, ChannelMessage, SendOptions } from '../channel-plugin.js';
import { channelRegistry } from '../channel-registry.js';

interface JWTToken {
  access_token?: string | null;
  expires_in?: number | null;
  token_type?: string | null;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const buffer = Buffer.from(pemContents, 'base64');
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

async function createJWTAndAuthorize(
  email: string,
  key: string,
  scopes: string[]
): Promise<JWTToken> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: email,
    sub: email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: scopes.join(' '),
  };

  const header = { alg: 'RS256', typ: 'JWT' };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');

  const signatureInput = `${headerB64}.${payloadB64}`;

  const keyObj = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    keyObj,
    new TextEncoder().encode(signatureInput)
  );

  const signatureB64 = Buffer.from(signature).toString('base64url');
  const jwt = `${signatureInput}.${signatureB64}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }).toString(),
  });

  if (!response.ok) {
    throw new Error(`Failed to get access token: ${response.status}`);
  }

  return (await response.json()) as JWTToken;
}

export interface GoogleChatConfig {
  serviceAccountKey: string;
  spaceId: string;
  projectId?: string;
  subscriptionId?: string;
  pollInterval?: number;
}

interface ServiceAccountKey {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

interface GoogleChatMessage {
  name: string;
  sender: {
    name: string;
    displayName?: string;
    type: string;
  };
  createTime: string;
  text?: string;
  argumentText?: string;
  thread?: {
    name: string;
    threadKey?: string;
  };
  space: {
    name: string;
    displayName?: string;
    type: string;
  };
}

interface GoogleChatSpace {
  name: string;
  displayName?: string;
  type: string;
}

export class GoogleChatChannel implements ChannelPlugin<GoogleChatConfig> {
  id = 'googlechat';
  name = 'Google Chat';
  description = 'Google Chat Bot integration via Google Chat API';
  capabilities = {
    chatTypes: ['direct', 'group', 'channel', 'thread'] as Array<
      'direct' | 'group' | 'channel' | 'thread'
    >,
    media: true,
    reactions: false,
    polls: false,
    nativeCommands: true,
    blockStreaming: false,
  };

  private config?: GoogleChatConfig;
  private serviceAccount?: ServiceAccountKey;
  private messageCallback?: (message: ChannelMessage) => void;
  private running = false;
  private pollTimer?: ReturnType<typeof setInterval>;
  private lastMessageTime?: string;
  private accessToken?: string;

  async initialize(config: GoogleChatConfig): Promise<void> {
    this.config = config;

    if (!config.serviceAccountKey) {
      throw new Error('Google Chat serviceAccountKey is required');
    }

    if (!config.spaceId) {
      throw new Error('Google Chat spaceId is required');
    }

    try {
      this.serviceAccount = JSON.parse(config.serviceAccountKey) as ServiceAccountKey;
    } catch {
      throw new Error('Invalid service account key JSON');
    }
  }

  async start(): Promise<void> {
    if (!this.serviceAccount || !this.config) {
      throw new Error('Channel not initialized. Call initialize() first.');
    }

    if (this.running) {
      return;
    }

    try {
      await this.getAccessToken();
      this.running = true;
      this.startPolling();
      console.log('[GoogleChat] Bot started');
    } catch (error) {
      throw new Error(
        `Failed to start Google Chat: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
    this.running = false;
  }

  isConnected(): boolean {
    return this.serviceAccount !== undefined && this.running;
  }

  onMessage(callback: (message: ChannelMessage) => void): void {
    this.messageCallback = callback;
  }

  async sendMessage(peerId: string, content: string, options?: SendOptions): Promise<string> {
    if (!this.accessToken || !this.config) {
      throw new Error('Not authenticated');
    }

    const spaceName = peerId.startsWith('spaces/') ? peerId : `spaces/${peerId}`;

    const messageBody: {
      text: string;
      thread?: { name?: string; threadKey?: string };
    } = {
      text: content,
    };

    if (options?.replyTo) {
      messageBody.thread = { name: options.replyTo };
    }

    try {
      const response = await fetch(`https://chat.googleapis.com/v1/${spaceName}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messageBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      const result = (await response.json()) as GoogleChatMessage;
      return result.name;
    } catch (error) {
      throw new Error(
        `Failed to send Google Chat message: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  validateConfig(config: unknown): { valid: boolean; error?: string } {
    if (typeof config !== 'object' || config === null) {
      return { valid: false, error: 'Config must be an object' };
    }

    const cfg = config as Partial<GoogleChatConfig>;

    if (!cfg.serviceAccountKey || typeof cfg.serviceAccountKey !== 'string') {
      return {
        valid: false,
        error: 'serviceAccountKey is required and must be a string',
      };
    }

    try {
      JSON.parse(cfg.serviceAccountKey);
    } catch {
      return { valid: false, error: 'serviceAccountKey must be valid JSON' };
    }

    if (!cfg.spaceId || typeof cfg.spaceId !== 'string') {
      return {
        valid: false,
        error: 'spaceId is required and must be a string',
      };
    }

    return { valid: true };
  }

  getDefaultConfig(): GoogleChatConfig {
    return {
      serviceAccountKey: '',
      spaceId: '',
      pollInterval: 5000,
    };
  }

  async getAccountInfo(): Promise<{
    botEmail: string;
    projectId: string;
    spaceName: string;
  }> {
    if (!this.serviceAccount || !this.config) {
      throw new Error('Not initialized');
    }

    return {
      botEmail: this.serviceAccount.client_email,
      projectId: this.serviceAccount.project_id,
      spaceName: this.config.spaceId,
    };
  }

  private async getAccessToken(): Promise<string> {
    if (!this.serviceAccount) {
      throw new Error('Not initialized');
    }

    const scopes = [
      'https://www.googleapis.com/auth/chat.bot',
      'https://www.googleapis.com/auth/chat.messages',
      'https://www.googleapis.com/auth/chat.messages.readonly',
      'https://www.googleapis.com/auth/chat.spaces',
      'https://www.googleapis.com/auth/chat.spaces.readonly',
    ];

    const tokens = await createJWTAndAuthorize(
      this.serviceAccount.client_email,
      this.serviceAccount.private_key,
      scopes
    );

    if (!tokens.access_token) {
      throw new Error('Failed to obtain access token');
    }

    this.accessToken = tokens.access_token;
    return tokens.access_token;
  }

  private startPolling(): void {
    const interval = this.config?.pollInterval || 5000;

    this.pollTimer = setInterval(() => {
      this.pollMessages().catch((error) => {
        console.error('[GoogleChat] Poll error:', error);
      });
    }, interval);
  }

  private async pollMessages(): Promise<void> {
    if (!this.accessToken || !this.config || !this.messageCallback) {
      return;
    }

    try {
      const spaceName = this.config.spaceId.startsWith('spaces/')
        ? this.config.spaceId
        : `spaces/${this.config.spaceId}`;

      let url = `https://chat.googleapis.com/v1/${spaceName}/messages?pageSize=50&orderBy=createTime DESC`;

      if (this.lastMessageTime) {
        url += `&filter=createTime > "${this.lastMessageTime}"`;
      }

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          await this.getAccessToken();
        }
        return;
      }

      const result = (await response.json()) as {
        messages?: GoogleChatMessage[];
      };

      if (result.messages && result.messages.length > 0) {
        for (const msg of result.messages.reverse()) {
          await this.handleMessage(msg);
        }
        this.lastMessageTime = result.messages[result.messages.length - 1].createTime;
      }
    } catch (error) {
      console.error('[GoogleChat] Failed to poll messages:', error);
    }
  }

  private async handleMessage(msg: GoogleChatMessage): Promise<void> {
    if (!this.messageCallback || !this.config) return;

    if (msg.sender.type === 'BOT') return;

    const channelMessage: ChannelMessage = {
      id: `googlechat_${msg.name.replace(/\//g, '_')}`,
      channelId: this.config.spaceId,
      messageId: msg.name,
      peerId: msg.space.name,
      peerType: this.getPeerType(msg.space),
      direction: 'inbound',
      content: msg.argumentText || msg.text,
      timestamp: new Date(msg.createTime).getTime(),
      metadata: {
        from: {
          id: msg.sender.name,
          name: msg.sender.displayName,
          type: msg.sender.type,
        },
        space: {
          id: msg.space.name,
          name: msg.space.displayName,
          type: msg.space.type,
        },
        thread: msg.thread?.name,
        threadKey: msg.thread?.threadKey,
      },
    };

    this.messageCallback(channelMessage);
  }

  private getPeerType(space: GoogleChatSpace): 'direct' | 'group' | 'channel' | 'thread' {
    switch (space.type) {
      case 'DM':
        return 'direct';
      case 'GROUP':
        return 'group';
      default:
        return 'channel';
    }
  }
}

export const googleChatChannel = new GoogleChatChannel();

channelRegistry.register(googleChatChannel as any, {
  id: 'googlechat',
  name: 'Google Chat',
  description: 'Google Chat Bot integration via Google Chat API',
  icon: 'message-circle',
  capabilities: googleChatChannel.capabilities,
  defaultConfig: {
    serviceAccountKey: '',
    spaceId: '',
    pollInterval: 5000,
  },
  configSchema: [
    {
      key: 'serviceAccountKey',
      type: 'textarea',
      label: 'Service Account Key (JSON)',
      placeholder: '{"type": "service_account", ...}',
      required: true,
      hint: 'Google Cloud Service Account JSON key with Chat API access',
    },
    {
      key: 'spaceId',
      type: 'text',
      label: 'Space ID',
      placeholder: 'spaces/AAAAxxxxx or AAAAxxxxx',
      required: true,
      hint: 'Google Chat Space ID (from space URL or API)',
    },
    {
      key: 'pollInterval',
      type: 'number',
      label: 'Poll Interval (ms)',
      placeholder: '5000',
      required: false,
      hint: 'Interval for polling new messages (default: 5000ms)',
    },
    {
      key: 'projectId',
      type: 'text',
      label: 'Project ID (optional)',
      placeholder: 'my-project-id',
      required: false,
      hint: 'GCP Project ID for Pub/Sub (if using push notifications)',
    },
    {
      key: 'subscriptionId',
      type: 'text',
      label: 'Subscription ID (optional)',
      placeholder: 'my-subscription',
      required: false,
      hint: 'Pub/Sub subscription ID for push notifications',
    },
  ],
});
