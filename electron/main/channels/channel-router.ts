/**
 * Channel Router
 *
 * Manages message routing, session mapping, and conversation tracking
 * for channel integrations.
 */

import type { ChannelMessage } from './channel-plugin.js';

/**
 * Peer session mapping
 */
interface PeerSession {
  channelId: string;
  peerId: string;
  peerType: 'direct' | 'group' | 'channel' | 'thread';
  sessionId?: string;
  autoReply: boolean;
  lastActivity: number;
}

/**
 * Conversation state for tracking conversation turns
 */
export interface ConversationState {
  channelId: string;
  peerId: string;
  sessionId: string; // Database session ID (for memory association)
  messageCount: number; // Message count in current conversation
  lastMessageTime: number; // Timestamp of last message
  conversationStartTime: number; // When this conversation started
}

/**
 * Conversation configuration
 */
export interface ConversationConfig {
  timeWindowMs: number; // Time window for auto-reset
  maxMessages: number; // Max messages before auto-reset
  enableAutoReset: boolean; // Enable automatic conversation reset
}

/**
 * Message routing options
 */
export interface RoutingOptions {
  /** Map peer to a chat session */
  mapToSession?: boolean;
  /** Enable auto-reply for this peer */
  autoReply?: boolean;
  /** Custom handler for the message */
  handler?: (message: ChannelMessage) => Promise<void>;
}

/**
 * Channel Router class
 */
export class ChannelRouter {
  private peerSessions = new Map<string, PeerSession>();
  private conversations = new Map<string, ConversationState>();
  private messageHandlers: Array<(message: ChannelMessage) => Promise<boolean>> = [];

  /**
   * Register a message handler
   * Returns true if the message was handled
   */
  use(handler: (message: ChannelMessage) => Promise<boolean>): void {
    this.messageHandlers.push(handler);
  }

  /**
   * Route an incoming message
   */
  async route(message: ChannelMessage): Promise<void> {
    // Update peer activity
    this.updatePeerActivity(message);

    // Run through handlers
    for (const handler of this.messageHandlers) {
      const handled = await handler(message);
      if (handled) break;
    }
  }

  /**
   * Map a peer to a session
   */
  mapPeerToSession(channelId: string, peerId: string, sessionId: string): void {
    const key = this.getPeerKey(channelId, peerId);
    const existing = this.peerSessions.get(key);

    this.peerSessions.set(key, {
      channelId,
      peerId,
      peerType: existing?.peerType || 'direct',
      sessionId,
      autoReply: existing?.autoReply || false,
      lastActivity: Date.now(),
    });
  }

  /**
   * Get session ID for a peer
   */
  getSessionId(channelId: string, peerId: string): string | undefined {
    const key = this.getPeerKey(channelId, peerId);
    return this.peerSessions.get(key)?.sessionId;
  }

  /**
   * Set auto-reply for a peer
   */
  setAutoReply(channelId: string, peerId: string, enabled: boolean): void {
    const key = this.getPeerKey(channelId, peerId);
    const existing = this.peerSessions.get(key);

    if (existing) {
      existing.autoReply = enabled;
    } else {
      this.peerSessions.set(key, {
        channelId,
        peerId,
        peerType: 'direct',
        autoReply: enabled,
        lastActivity: Date.now(),
      });
    }
  }

  /**
   * Check if auto-reply is enabled for a peer
   */
  isAutoReplyEnabled(channelId: string, peerId: string): boolean {
    const key = this.getPeerKey(channelId, peerId);
    return this.peerSessions.get(key)?.autoReply || false;
  }

  /**
   * Get peer session info
   */
  getPeerSession(channelId: string, peerId: string): PeerSession | undefined {
    return this.peerSessions.get(this.getPeerKey(channelId, peerId));
  }

  /**
   * List all active peers for a channel
   */
  listActivePeers(channelId: string): PeerSession[] {
    return Array.from(this.peerSessions.values()).filter((p) => p.channelId === channelId);
  }

  /**
   * Remove a peer session
   */
  removePeerSession(channelId: string, peerId: string): void {
    this.peerSessions.delete(this.getPeerKey(channelId, peerId));
  }

  /**
   * Clear all sessions for a channel
   */
  clearChannelSessions(channelId: string): void {
    const keyPrefix = `${channelId}:`;
    for (const key of this.peerSessions.keys()) {
      if (key.startsWith(keyPrefix)) {
        this.peerSessions.delete(key);
      }
    }
  }

  /**
   * Clean up inactive sessions
   */
  cleanupInactiveSessions(maxAgeMs = 7 * 24 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - maxAgeMs;

    for (const [key, session] of this.peerSessions.entries()) {
      if (session.lastActivity < cutoff) {
        this.peerSessions.delete(key);
      }
    }
  }

  /**
   * Generate peer key for map
   */
  private getPeerKey(channelId: string, peerId: string): string {
    return `${channelId}:${peerId}`;
  }

  /**
   * Update peer last activity time
   */
  private updatePeerActivity(message: ChannelMessage): void {
    const key = this.getPeerKey(message.channelId, message.peerId);
    const existing = this.peerSessions.get(key);

    if (existing) {
      existing.lastActivity = message.timestamp;
    } else {
      this.peerSessions.set(key, {
        channelId: message.channelId,
        peerId: message.peerId,
        peerType: message.peerType,
        autoReply: false,
        lastActivity: message.timestamp,
      });
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalPeerSessions: number;
    activeSessions24h: number;
    autoReplyEnabled: number;
  } {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const sessions = Array.from(this.peerSessions.values());

    return {
      totalPeerSessions: sessions.length,
      activeSessions24h: sessions.filter((s) => s.lastActivity >= cutoff).length,
      autoReplyEnabled: sessions.filter((s) => s.autoReply).length,
    };
  }

  // ============================================================================
  // CONVERSATION MANAGEMENT
  // ============================================================================

  /**
   * Check if a new conversation should be started
   * @param channelId Channel ID
   * @param peerId Peer ID
   * @param timeWindowMs Time window in milliseconds (default: 30 minutes)
   * @param maxMessages Maximum messages before reset (default: 20)
   */
  shouldStartNewConversation(
    channelId: string,
    peerId: string,
    timeWindowMs: number = 30 * 60 * 1000,
    maxMessages: number = 20
  ): boolean {
    const key = this.getPeerKey(channelId, peerId);
    const conv = this.conversations.get(key);

    if (!conv) {
      return true;
    }

    const now = Date.now();
    const timeExceeded = now - conv.lastMessageTime > timeWindowMs;
    const messageCountExceeded = conv.messageCount >= maxMessages;

    return timeExceeded || messageCountExceeded;
  }

  /**
   * Start a new conversation (clears session messages but keeps session ID for memory)
   */
  startNewConversation(channelId: string, peerId: string, db: any): void {
    const key = this.getPeerKey(channelId, peerId);
    const session = this.peerSessions.get(key);

    if (session?.sessionId) {
      // Clear session messages in database
      db.prepare('UPDATE sessions SET messages_json = ?, updated_at = ? WHERE id = ?').run(
        '[]',
        Date.now(),
        session.sessionId
      );

      // Reset conversation state
      this.conversations.set(key, {
        channelId,
        peerId,
        sessionId: session.sessionId,
        messageCount: 0,
        lastMessageTime: Date.now(),
        conversationStartTime: Date.now(),
      });

      console.log(`[ChannelRouter] Started new conversation for ${channelId}:${peerId}`);
    }
  }

  /**
   * Update conversation state after a message
   */
  updateConversation(channelId: string, peerId: string, messageContent: string): void {
    const key = this.getPeerKey(channelId, peerId);
    const session = this.peerSessions.get(key);

    if (session?.sessionId) {
      const existing = this.conversations.get(key);
      const now = Date.now();

      this.conversations.set(key, {
        channelId,
        peerId,
        sessionId: session.sessionId,
        messageCount: (existing?.messageCount || 0) + 1,
        lastMessageTime: now,
        conversationStartTime: existing?.conversationStartTime || now,
      });
    }
  }

  /**
   * Get current conversation state
   */
  getConversation(channelId: string, peerId: string): ConversationState | undefined {
    return this.conversations.get(this.getPeerKey(channelId, peerId));
  }

  /**
   * Reset conversation for a peer (manual trigger)
   */
  resetConversation(channelId: string, peerId: string, db: any): void {
    this.startNewConversation(channelId, peerId, db);
  }

  /**
   * Clear conversation state for a peer
   */
  clearConversation(channelId: string, peerId: string): void {
    const key = this.getPeerKey(channelId, peerId);
    this.conversations.delete(key);
  }

  /**
   * Clear all conversations for a channel
   */
  clearChannelConversations(channelId: string): void {
    const keyPrefix = `${channelId}:`;
    for (const key of this.conversations.keys()) {
      if (key.startsWith(keyPrefix)) {
        this.conversations.delete(key);
      }
    }
  }

  /**
   * Get all conversation states
   */
  getAllConversations(): ConversationState[] {
    return Array.from(this.conversations.values());
  }
}

/**
 * Global channel router instance
 */
export const channelRouter = new ChannelRouter();
