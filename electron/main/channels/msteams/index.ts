/**
 * Microsoft Teams Channel Adapter
 *
 * Integrates Microsoft Teams Bot Framework for message sending/receiving.
 */

import {
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication,
  ConfigurationBotFrameworkAuthenticationOptions,
  TurnContext,
  ActivityTypes,
  Activity,
  MessageFactory,
} from 'botbuilder';
import type { ChannelPlugin, ChannelMessage, SendOptions, ChannelType } from '../channel-plugin.js';
import { channelRegistry } from '../channel-registry.js';

export interface MSTeamsConfig {
  appId: string;
  appPassword: string;
  tenantId?: string;
  allowedTenants?: string[];
  allowedChannels?: string[];
  allowedUsers?: string[];
}

export class MSTeamsChannel implements ChannelPlugin<MSTeamsConfig> {
  id = 'msteams';
  name = 'Microsoft Teams';
  description = 'Microsoft Teams Bot integration using Bot Framework';
  capabilities = {
    chatTypes: ['direct', 'group', 'channel'] as Array<'direct' | 'group' | 'channel' | 'thread'>,
    media: true,
    reactions: false,
    polls: false,
    nativeCommands: true,
    blockStreaming: false,
  };

  private adapter?: CloudAdapter;
  private config?: MSTeamsConfig;
  private messageCallback?: (message: ChannelMessage) => void;
  private running = false;
  private authentication?: ConfigurationBotFrameworkAuthentication;

  async initialize(config: MSTeamsConfig): Promise<void> {
    this.config = config;

    if (!config.appId || !config.appPassword) {
      throw new Error('Microsoft Teams appId and appPassword are required');
    }

    const authOptions: ConfigurationBotFrameworkAuthenticationOptions = {
      MicrosoftAppId: config.appId,
      MicrosoftAppPassword: config.appPassword,
      MicrosoftAppTenantId: config.tenantId,
    };

    this.authentication = new ConfigurationBotFrameworkAuthentication(authOptions);
    this.adapter = new CloudAdapter(this.authentication);

    this.setupHandlers();
  }

  async start(): Promise<void> {
    if (!this.adapter) {
      throw new Error('Channel not initialized. Call initialize() first.');
    }

    if (this.running) {
      return;
    }

    this.running = true;
    console.log('[MSTeams] Bot started and ready to receive messages');
  }

  async stop(): Promise<void> {
    this.running = false;
    console.log('[MSTeams] Bot stopped');
  }

  isConnected(): boolean {
    return this.adapter !== undefined && this.running;
  }

  onMessage(callback: (message: ChannelMessage) => void): void {
    this.messageCallback = callback;
  }

  async sendMessage(peerId: string, content: string, options?: SendOptions): Promise<string> {
    if (!this.adapter) {
      throw new Error('Bot not initialized');
    }

    const [conversationId, serviceUrl, tenantId] = peerId.split('|');

    if (!conversationId || !serviceUrl) {
      throw new Error('Invalid peerId format. Expected: conversationId|serviceUrl|tenantId');
    }

    try {
      const conversationReference = {
        conversation: { id: conversationId },
        serviceUrl: serviceUrl,
        tenantId: tenantId || this.config?.tenantId,
        channelId: 'msteams',
      } as any;

      await this.adapter.continueConversationAsync(
        this.config!.appId,
        conversationReference,
        async (context: TurnContext) => {
          const message = MessageFactory.text(content);
          if (options?.replyTo) {
            message.replyToId = options.replyTo;
          }
          await context.sendActivity(message);
        }
      );

      return `${Date.now()}`;
    } catch (error) {
      throw new Error(
        `Failed to send Teams message: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  validateConfig(config: unknown): { valid: boolean; error?: string } {
    if (typeof config !== 'object' || config === null) {
      return { valid: false, error: 'Config must be an object' };
    }

    const cfg = config as Partial<MSTeamsConfig>;

    if (!cfg.appId || typeof cfg.appId !== 'string') {
      return {
        valid: false,
        error: 'appId is required and must be a string',
      };
    }

    if (!cfg.appPassword || typeof cfg.appPassword !== 'string') {
      return {
        valid: false,
        error: 'appPassword is required and must be a string',
      };
    }

    return { valid: true };
  }

  getDefaultConfig(): MSTeamsConfig {
    return {
      appId: '',
      appPassword: '',
      tenantId: '',
    };
  }

  async getAccountInfo(): Promise<{
    appId: string;
    tenantId?: string;
  }> {
    if (!this.config) {
      throw new Error('Bot not initialized');
    }

    return {
      appId: this.config.appId,
      tenantId: this.config.tenantId,
    };
  }

  private setupHandlers(): void {
    if (!this.adapter) return;
  }

  async processActivity(req: any, res: any): Promise<void> {
    if (!this.adapter) {
      throw new Error('Bot not initialized');
    }

    await this.adapter.process(req, res, async (context: TurnContext) => {
      if (context.activity.type === ActivityTypes.Message) {
        await this.handleMessage(context);
      }
    });
  }

  private async handleMessage(context: TurnContext): Promise<void> {
    if (!this.messageCallback) return;

    const activity = context.activity;

    if (!this.isAllowed(activity)) {
      return;
    }

    const peerId = this.buildPeerId(activity);
    const peerType = this.getPeerType(activity);

    const channelMessage: ChannelMessage = {
      id: `msteams_${activity.id || Date.now()}`,
      channelId: activity.conversation.id,
      messageId: activity.id || '',
      peerId: peerId,
      peerType: peerType,
      direction: 'inbound',
      content: activity.text,
      timestamp: activity.timestamp ? new Date(activity.timestamp).getTime() : Date.now(),
      metadata: {
        from: {
          id: activity.from.id,
          name: activity.from.name,
          aadObjectId: activity.from.aadObjectId,
        },
        conversation: {
          id: activity.conversation.id,
          name: activity.conversation.name,
          tenantId: activity.conversation.tenantId,
          conversationType: activity.conversation.conversationType,
        },
        serviceUrl: activity.serviceUrl,
        replyToId: activity.replyToId,
      },
    };

    this.messageCallback(channelMessage);
  }

  private isAllowed(activity: Activity): boolean {
    if (!this.config) return true;

    if (this.config.allowedTenants && this.config.allowedTenants.length > 0) {
      const tenantId = activity.conversation.tenantId;
      if (tenantId && !this.config.allowedTenants.includes(tenantId)) {
        return false;
      }
    }

    if (this.config.allowedChannels && this.config.allowedChannels.length > 0) {
      if (!this.config.allowedChannels.includes(activity.conversation.id)) {
        return false;
      }
    }

    if (this.config.allowedUsers && this.config.allowedUsers.length > 0) {
      if (!this.config.allowedUsers.includes(activity.from.id)) {
        return false;
      }
    }

    return true;
  }

  private buildPeerId(activity: Activity): string {
    const parts = [activity.conversation.id, activity.serviceUrl, activity.conversation.tenantId];
    return parts.filter(Boolean).join('|');
  }

  private getPeerType(activity: Activity): 'direct' | 'group' | 'channel' | 'thread' {
    const conversationType = activity.conversation.conversationType;

    switch (conversationType) {
      case 'personal':
        return 'direct';
      case 'groupChat':
        return 'group';
      case 'channel':
      default:
        return 'channel';
    }
  }
}

export const msTeamsChannel = new MSTeamsChannel();

const msTeamsChannelType: ChannelType = {
  id: 'msteams',
  name: 'Microsoft Teams',
  description: 'Microsoft Teams Bot integration using Bot Framework',
  icon: 'microsoft',
  capabilities: msTeamsChannel.capabilities,
  defaultConfig: {
    appId: '',
    appPassword: '',
    tenantId: '',
  },
  configSchema: [
    {
      key: 'appId',
      type: 'text',
      label: 'App ID (Microsoft App ID)',
      placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      required: true,
      hint: 'Microsoft App ID from Azure Portal',
    },
    {
      key: 'appPassword',
      type: 'password',
      label: 'App Password (Client Secret)',
      placeholder: 'Enter app password...',
      required: true,
      hint: 'Client Secret from Azure Portal > App Registrations',
    },
    {
      key: 'tenantId',
      type: 'text',
      label: 'Tenant ID (optional)',
      placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      required: false,
      hint: 'Azure AD Tenant ID. Leave empty for multi-tenant apps.',
    },
    {
      key: 'allowedTenants',
      type: 'text',
      label: 'Allowed Tenants (optional)',
      placeholder: 'tenant-id-1,tenant-id-2',
      required: false,
      hint: 'Comma-separated tenant IDs. Leave empty for all tenants.',
    },
    {
      key: 'allowedChannels',
      type: 'text',
      label: 'Allowed Channels (optional)',
      placeholder: '19:xxx@thread.tacv2',
      required: false,
      hint: 'Comma-separated channel IDs. Leave empty for all channels.',
    },
    {
      key: 'allowedUsers',
      type: 'text',
      label: 'Allowed Users (optional)',
      placeholder: '29:xxx',
      required: false,
      hint: 'Comma-separated user IDs. Leave empty for all users.',
    },
  ],
};

channelRegistry.register(msTeamsChannel as any, msTeamsChannelType);
