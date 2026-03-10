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
}

/**
 * Global channel router instance
 */
export const channelRouter = new ChannelRouter();
