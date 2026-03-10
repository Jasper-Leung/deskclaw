/**
 * Message Router
 *
 * Routes messages between channels, sessions, and agents.
 */

import type { ChannelMessage } from '../channels/channel-plugin.js';
import type { GatewaySession } from '../../../shared/types/gateway.js';
import { sessionManager } from './sessions.js';
import { EventEmitter } from 'events';

export interface RoutingRule {
  id: string;
  channelId: string;
  peerPattern?: string | RegExp;
  agentId?: string;
  model?: string;
  priority: number;
  enabled: boolean;
}

export interface RoutingContext {
  channelId: string;
  peerId: string;
  peerType: 'direct' | 'group' | 'channel' | 'thread';
  content?: string;
  metadata?: Record<string, unknown>;
}

export class MessageRouter extends EventEmitter {
  private rules: RoutingRule[] = [];
  private autoReplyEnabled = new Map<string, boolean>();
  private peerSessions = new Map<string, string>();

  addRule(rule: RoutingRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  removeRule(ruleId: string): void {
    this.rules = this.rules.filter((r) => r.id !== ruleId);
  }

  getRules(): RoutingRule[] {
    return [...this.rules];
  }

  route(message: ChannelMessage): GatewaySession | undefined {
    const context: RoutingContext = {
      channelId: message.channelId,
      peerId: message.peerId,
      peerType: message.peerType,
      content: message.content,
      metadata: message.metadata,
    };

    const rule = this.findMatchingRule(context);
    if (!rule) {
      return undefined;
    }

    let session = sessionManager.getByPeer(message.channelId, message.peerId);
    if (!session) {
      session = sessionManager.create({
        channelId: message.channelId,
        peerId: message.peerId,
        model: rule.model,
        metadata: {
          agentId: rule.agentId,
          ruleId: rule.id,
        },
      });

      this.emit('session:created', session);
    }

    const peerKey = `${message.channelId}:${message.peerId}`;
    this.peerSessions.set(peerKey, session.id);

    return session;
  }

  private findMatchingRule(context: RoutingContext): RoutingRule | undefined {
    for (const rule of this.rules) {
      if (!rule.enabled) continue;
      if (rule.channelId !== '*' && rule.channelId !== context.channelId) {
        continue;
      }

      if (rule.peerPattern) {
        const pattern =
          typeof rule.peerPattern === 'string' ? new RegExp(rule.peerPattern) : rule.peerPattern;
        if (!pattern.test(context.peerId)) {
          continue;
        }
      }

      return rule;
    }

    return undefined;
  }

  setAutoReply(channelId: string, peerId: string, enabled: boolean): void {
    const key = `${channelId}:${peerId}`;
    if (enabled) {
      this.autoReplyEnabled.set(key, true);
    } else {
      this.autoReplyEnabled.delete(key);
    }
  }

  isAutoReplyEnabled(channelId: string, peerId: string): boolean {
    const key = `${channelId}:${peerId}`;
    return this.autoReplyEnabled.has(key);
  }

  getPeerSession(channelId: string, peerId: string): string | undefined {
    const key = `${channelId}:${peerId}`;
    return this.peerSessions.get(key);
  }

  mapPeerToSession(channelId: string, peerId: string, sessionId: string): void {
    const key = `${channelId}:${peerId}`;
    this.peerSessions.set(key, sessionId);
  }

  listActivePeers(channelId: string): Array<{ peerId: string; sessionId: string }> {
    const result: Array<{ peerId: string; sessionId: string }> = [];
    for (const [key, sessionId] of this.peerSessions) {
      if (key.startsWith(`${channelId}:`)) {
        const peerId = key.slice(channelId.length + 1);
        result.push({ peerId, sessionId });
      }
    }
    return result;
  }

  clearChannelSessions(channelId: string): void {
    for (const [key] of this.peerSessions) {
      if (key.startsWith(`${channelId}:`)) {
        this.peerSessions.delete(key);
        this.autoReplyEnabled.delete(key);
      }
    }
  }

  cleanupInactiveSessions(maxAgeMs: number): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, sessionId] of this.peerSessions) {
      const session = sessionManager.get(sessionId);
      if (session && now - session.updatedAt > maxAgeMs) {
        this.peerSessions.delete(key);
        this.autoReplyEnabled.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }

  getStats(): {
    totalPeerSessions: number;
    activeSessions24h: number;
    autoReplyEnabled: number;
  } {
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;

    let activeSessions24h = 0;
    for (const sessionId of this.peerSessions.values()) {
      const session = sessionManager.get(sessionId);
      if (session && session.updatedAt > dayAgo) {
        activeSessions24h++;
      }
    }

    return {
      totalPeerSessions: this.peerSessions.size,
      activeSessions24h,
      autoReplyEnabled: this.autoReplyEnabled.size,
    };
  }
}

export const messageRouter = new MessageRouter();
