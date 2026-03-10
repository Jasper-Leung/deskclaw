/**
 * Session Manager
 *
 * Manages Gateway sessions for multi-client support.
 */

import type { GatewaySession, GatewayMessageEntry } from '../../../shared/types/gateway.js';
import { randomUUID } from 'crypto';

export interface SessionFilter {
  channelId?: string;
  peerId?: string;
  model?: string;
  limit?: number;
  offset?: number;
}

export class SessionManager {
  private sessions = new Map<string, GatewaySession>();
  private peerSessionMap = new Map<string, string>();

  create(options: {
    channelId?: string;
    peerId?: string;
    model?: string;
    metadata?: Record<string, unknown>;
  }): GatewaySession {
    const id = randomUUID();
    const now = Date.now();

    const session: GatewaySession = {
      id,
      channelId: options.channelId,
      peerId: options.peerId,
      model: options.model,
      messages: [],
      createdAt: now,
      updatedAt: now,
      metadata: options.metadata,
    };

    this.sessions.set(id, session);

    if (options.channelId && options.peerId) {
      const key = `${options.channelId}:${options.peerId}`;
      this.peerSessionMap.set(key, id);
    }

    return session;
  }

  get(id: string): GatewaySession | undefined {
    return this.sessions.get(id);
  }

  getByPeer(channelId: string, peerId: string): GatewaySession | undefined {
    const key = `${channelId}:${peerId}`;
    const sessionId = this.peerSessionMap.get(key);
    if (sessionId) {
      return this.sessions.get(sessionId);
    }
    return undefined;
  }

  list(filter?: SessionFilter): GatewaySession[] {
    let result = Array.from(this.sessions.values());

    if (filter?.channelId) {
      result = result.filter((s) => s.channelId === filter.channelId);
    }
    if (filter?.peerId) {
      result = result.filter((s) => s.peerId === filter.peerId);
    }
    if (filter?.model) {
      result = result.filter((s) => s.model === filter.model);
    }

    result.sort((a, b) => b.updatedAt - a.updatedAt);

    if (filter?.offset) {
      result = result.slice(filter.offset);
    }
    if (filter?.limit) {
      result = result.slice(0, filter.limit);
    }

    return result;
  }

  appendMessage(sessionId: string, message: GatewayMessageEntry): GatewaySession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    session.messages.push(message);
    session.updatedAt = Date.now();

    return session;
  }

  patch(
    sessionId: string,
    updates: Partial<Pick<GatewaySession, 'model' | 'metadata'>>
  ): GatewaySession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    if (updates.model !== undefined) {
      session.model = updates.model;
    }
    if (updates.metadata !== undefined) {
      session.metadata = { ...session.metadata, ...updates.metadata };
    }
    session.updatedAt = Date.now();

    return session;
  }

  delete(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    if (session.channelId && session.peerId) {
      const key = `${session.channelId}:${session.peerId}`;
      this.peerSessionMap.delete(key);
    }

    return this.sessions.delete(sessionId);
  }

  compact(sessionId: string, summary: string): GatewaySession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    const systemMessage: GatewayMessageEntry = {
      role: 'system',
      content: `Previous conversation summary:\n${summary}`,
      timestamp: Date.now(),
    };

    session.messages = [systemMessage];
    session.updatedAt = Date.now();

    return session;
  }

  getHistory(sessionId: string, limit?: number): GatewayMessageEntry[] | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    if (limit && limit > 0) {
      return session.messages.slice(-limit);
    }
    return session.messages;
  }

  clear(): void {
    this.sessions.clear();
    this.peerSessionMap.clear();
  }

  get count(): number {
    return this.sessions.size;
  }
}

export const sessionManager = new SessionManager();
