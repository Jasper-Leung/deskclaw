/**
 * Channel Plugin System
 *
 * Defines the plugin interface for integrating various messaging platforms
 * (Telegram, Discord, WhatsApp, etc.) into DeskClaw.
 */

/**
 * Standardized message format across all channels
 */
export interface ChannelMessage {
  /** Unique message ID (prefixed with channel type) */
  id: string;
  /** Channel ID this message belongs to */
  channelId: string;
  /** Original message ID from the platform */
  messageId: string;
  /** Chat ID, user ID, or group ID */
  peerId: string;
  /** Type of conversation */
  peerType: 'direct' | 'group' | 'channel' | 'thread';
  /** Message direction */
  direction: 'inbound' | 'outbound';
  /** Text content */
  content?: string;
  /** Media attachment (if any) */
  media?: { type: string; url: string; caption?: string };
  /** Additional platform-specific metadata */
  metadata?: Record<string, unknown>;
  /** Message timestamp in milliseconds */
  timestamp: number;
}

/**
 * Options when sending a message
 */
export interface SendOptions {
  /** Parse mode for formatted text */
  parseMode?: 'markdown' | 'html';
  /** Disable link preview */
  disablePreview?: boolean;
  /** Reply to message ID */
  replyTo?: string;
  /** Additional platform-specific options */
  extra?: Record<string, unknown>;
}

/**
 * Channel capabilities - what features the platform supports
 */
export interface ChannelCapabilities {
  /** Supported chat types */
  chatTypes: Array<'direct' | 'group' | 'channel' | 'thread'>;
  /** Supports media attachments */
  media?: boolean;
  /** Supports message reactions */
  reactions?: boolean;
  /** Supports polls */
  polls?: boolean;
  /** Has native command handling (like Telegram bot commands) */
  nativeCommands?: boolean;
  /** Should block streaming responses (send complete message only) */
  blockStreaming?: boolean;
}

/**
 * Channel Plugin Interface
 *
 * All messaging platform adapters must implement this interface.
 */
export interface ChannelPlugin<TConfig = Record<string, unknown>, TAccount = unknown> {
  /** Unique plugin identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of the platform */
  description: string;
  /** Supported capabilities */
  capabilities: ChannelCapabilities;

  // ========== Lifecycle Management ==========

  /**
   * Initialize the plugin with configuration
   * @param config Platform-specific configuration
   */
  initialize(config: TConfig): Promise<void>;

  /**
   * Start the plugin (connect to platform)
   */
  start(): Promise<void>;

  /**
   * Stop the plugin (disconnect from platform)
   */
  stop(): Promise<void>;

  /**
   * Check if the plugin is connected and ready
   */
  isConnected(): boolean;

  // ========== Message Handling ==========

  /**
   * Register callback for incoming messages
   * @param callback Function to call when a message is received
   */
  onMessage(callback: (message: ChannelMessage) => void): void;

  /**
   * Send a message to a peer
   * @param peerId Chat/user/group ID
   * @param content Message content
   * @param options Sending options
   * @returns The sent message ID
   */
  sendMessage(peerId: string, content: string, options?: SendOptions): Promise<string>;

  // ========== Configuration Management ==========

  /**
   * Validate configuration before saving
   * @param config Configuration to validate
   * @returns Valid flag and optional error message
   */
  validateConfig(config: unknown): { valid: boolean; error?: string };

  /**
   * Get default configuration for new instances
   */
  getDefaultConfig(): TConfig;

  // ========== Authentication (Optional) ==========

  /**
   * Perform login if platform requires interactive authentication
   * @returns Login status and optional QR code data
   */
  login?(): Promise<{ status: 'pending' | 'success'; qrCode?: string }>;

  // ========== Account Info (Optional) ==========

  /**
   * Get account information
   * @returns Account details
   */
  getAccountInfo?(): Promise<TAccount>;
}

/**
 * Channel type definition for UI
 */
export interface ChannelType {
  /** Unique type identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Icon name (for UI) */
  icon: string;
  /** Capabilities */
  capabilities: ChannelCapabilities;
  /** Default configuration */
  defaultConfig: Record<string, unknown>;
  /** Configuration schema for form generation */
  configSchema: Array<{
    key: string;
    type: 'text' | 'password' | 'number' | 'boolean' | 'textarea' | 'select';
    label: string;
    placeholder?: string;
    required: boolean;
    hint?: string;
    options?: Array<{ value: string; label: string }>;
  }>;
}

/**
 * Channel instance stored in database
 */
export interface Channel {
  id: string;
  channel_type: string;
  account_id: string;
  name: string;
  enabled: number;
  config_json: string;
  created_at: number;
  updated_at: number;
}
