/**
 * Session Unification Service
 * Provides intelligent merging and unification of cross-channel sessions
 */

import type { Database } from 'better-sqlite3';
import {
  createUnifiedConversation,
  findConversationByChannelAndPeer,
  addChannelSession,
  resolveIdentity,
  suggestMerge,
  executeMerge,
  getConversationsByIdentity,
} from './cross-channel-manager.js';

export interface UnificationConfig {
  autoMerge: boolean;
  confidenceThreshold: number;
  identityResolutionStrategy: 'exact' | 'similarity' | 'ml';
}

export interface UnificationResult {
  unifiedConversationId: string;
  merged: boolean;
  confidence: number;
  actions: string[];
}

export interface SessionInfo {
  sessionId: string;
  channelId: string;
  peerId: string;
  messages: Array<{ role: string; content: string; timestamp: number }>;
}

/**
 * Default unification configuration
 */
const DEFAULT_CONFIG: UnificationConfig = {
  autoMerge: true,
  confidenceThreshold: 0.7,
  identityResolutionStrategy: 'similarity',
};

/**
 * Unify sessions across channels
 */
export function unifySessions(
  db: Database,
  sessions: SessionInfo[],
  config: Partial<UnificationConfig> = {}
): UnificationResult {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const actions: string[] = [];
  let unifiedConversationId = '';
  let merged = false;
  let confidence = 0;

  if (sessions.length === 0) {
    return {
      unifiedConversationId: '',
      merged: false,
      confidence: 0,
      actions: ['No sessions to unify'],
    };
  }

  if (sessions.length === 1) {
    // Single session - create or find existing unified conversation
    const session = sessions[0];
    const existing = findConversationByChannelAndPeer(db, session.channelId, session.peerId);

    if (existing) {
      unifiedConversationId = existing.id;
      actions.push('Found existing unified conversation');
      confidence = 1.0;
    } else {
      const identity = resolveIdentity(db, session.channelId, session.peerId);
      const newConv = createUnifiedConversation(db, {
        title: generateConversationTitle(session.messages),
        participantIdentity: identity.suggestedIdentity,
        channelsInvolved: [session.channelId],
        metadata: {
          createdAt: Date.now(),
          messageCount: session.messages.length,
        },
      });

      addChannelSession(db, {
        unifiedConversationId: newConv.id,
        channelId: session.channelId,
        sessionId: session.sessionId,
        peerId: session.peerId,
        roleInConversation: 'primary',
        joinedAt: Date.now(),
      });

      unifiedConversationId = newConv.id;
      actions.push('Created new unified conversation');
      confidence = identity.confidence;
    }
  } else {
    // Multiple sessions - attempt to merge
    const primarySession = sessions[0];
    const existing = findConversationByChannelAndPeer(
      db,
      primarySession.channelId,
      primarySession.peerId
    );

    if (existing) {
      // Try to merge other sessions into this conversation
      for (let i = 1; i < sessions.length; i++) {
        const session = sessions[i];
        const sessionConv = findConversationByChannelAndPeer(db, session.channelId, session.peerId);

        if (sessionConv) {
          const suggestion = suggestMerge(db, existing.id, sessionConv.id);

          if (suggestion.shouldMerge && suggestion.confidence >= fullConfig.confidenceThreshold) {
            if (fullConfig.autoMerge) {
              executeMerge(db, existing.id, sessionConv.id);
              actions.push(`Merged conversation ${sessionConv.id} into ${existing.id}`);
              merged = true;
              confidence = Math.max(confidence, suggestion.confidence);
            } else {
              actions.push(
                `Suggested merge of ${sessionConv.id} (confidence: ${suggestion.confidence})`
              );
            }
          } else {
            // Add as a new channel session
            addChannelSession(db, {
              unifiedConversationId: existing.id,
              channelId: session.channelId,
              sessionId: session.sessionId,
              peerId: session.peerId,
              roleInConversation: 'secondary',
              joinedAt: Date.now(),
            });
            actions.push(`Added channel session from ${session.channelId}`);
          }
        } else {
          // Create new channel session
          addChannelSession(db, {
            unifiedConversationId: existing.id,
            channelId: session.channelId,
            sessionId: session.sessionId,
            peerId: session.peerId,
            roleInConversation: 'secondary',
            joinedAt: Date.now(),
          });
          actions.push(`Added new channel session from ${session.channelId}`);
        }
      }

      unifiedConversationId = existing.id;
    } else {
      // Create new unified conversation with all sessions
      const allChannels = sessions.map((s) => s.channelId);
      const identity = resolveIdentity(db, primarySession.channelId, primarySession.peerId);

      const newConv = createUnifiedConversation(db, {
        title: generateConversationTitle(
          sessions.flatMap((s) => s.messages).sort((a, b) => a.timestamp - b.timestamp)
        ),
        participantIdentity: identity.suggestedIdentity,
        channelsInvolved: allChannels,
        metadata: {
          createdAt: Date.now(),
          messageCount: sessions.reduce((sum, s) => sum + s.messages.length, 0),
        },
      });

      for (const session of sessions) {
        addChannelSession(db, {
          unifiedConversationId: newConv.id,
          channelId: session.channelId,
          sessionId: session.sessionId,
          peerId: session.peerId,
          roleInConversation: session === primarySession ? 'primary' : 'secondary',
          joinedAt: Date.now(),
        });
      }

      unifiedConversationId = newConv.id;
      actions.push('Created new unified conversation with multiple channels');
      confidence = identity.confidence;
      merged = true;
    }
  }

  return {
    unifiedConversationId,
    merged,
    confidence,
    actions,
  };
}

/**
 * Generate a conversation title from messages
 */
function generateConversationTitle(
  messages: Array<{ role: string; content: string; timestamp: number }>
): string {
  if (messages.length === 0) return 'New Conversation';

  // Find the first user message
  const firstUserMessage = messages.find((m) => m.role === 'user');
  if (!firstUserMessage) return 'New Conversation';

  // Use first 50 characters of the first message
  const content = firstUserMessage.content.trim();
  const title = content.length > 50 ? content.substring(0, 47) + '...' : content;

  return title;
}

/**
 * Find potentially mergeable conversations
 */
export function findMergeableConversations(
  db: Database,
  conversationId: string,
  threshold: number = 0.7
): Array<{ conversationId: string; confidence: number; reason: string }> {
  const target = db
    .prepare('SELECT * FROM unified_conversations WHERE id = ?')
    .get(conversationId) as any;

  if (!target) return [];

  const results: Array<{ conversationId: string; confidence: number; reason: string }> = [];
  const allConversations = db
    .prepare('SELECT * FROM unified_conversations WHERE id != ?')
    .all(conversationId) as any[];

  for (const conv of allConversations) {
    // Check for same participant identity
    if (conv.participant_identity === target.participant_identity) {
      results.push({
        conversationId: conv.id,
        confidence: 0.9,
        reason: 'Same participant identity',
      });
      continue;
    }

    // Check for shared channels
    const targetChannels = JSON.parse(target.channels_involved_json);
    const convChannels = JSON.parse(conv.channels_involved_json);
    const sharedChannels = targetChannels.filter((c: string) => convChannels.includes(c));

    if (sharedChannels.length > 0) {
      results.push({
        conversationId: conv.id,
        confidence: 0.7,
        reason: `Shares ${sharedChannels.length} channel(s)`,
      });
    }
  }

  return results.filter((r) => r.confidence >= threshold);
}

/**
 * Get unified timeline for a conversation
 */
export function getUnifiedTimeline(
  db: Database,
  conversationId: string
): Array<{
  source: string;
  role: string;
  content: string;
  timestamp: number;
}> {
  const channelSessions = db
    .prepare(
      `SELECT csm.*, c.name as channel_name
       FROM channel_session_mappings csm
       LEFT JOIN channels c ON csm.channel_id = c.id
       WHERE csm.unified_conversation_id = ?
       ORDER BY csm.joined_at ASC`
    )
    .all(conversationId) as Array<{
    session_id: string;
    channel_name: string;
    channel_id: string;
  }>;

  const timeline: Array<{
    source: string;
    role: string;
    content: string;
    timestamp: number;
  }> = [];

  for (const channelSession of channelSessions) {
    if (!channelSession.session_id) continue;

    const session = db
      .prepare('SELECT messages_json FROM sessions WHERE id = ?')
      .get(channelSession.session_id) as { messages_json: string } | undefined;

    if (session) {
      try {
        const messages = JSON.parse(session.messages_json) as Array<{
          role: string;
          content: string;
          timestamp?: number;
        }>;

        for (const msg of messages) {
          timeline.push({
            source: channelSession.channel_name || channelSession.channel_id,
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp || Date.now(),
          });
        }
      } catch {
        // Invalid JSON, skip
      }
    }
  }

  return timeline.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Get cross-channel context for a conversation
 */
export function getCrossChannelContext(
  db: Database,
  conversationId: string
): Array<{
  channelId: string;
  contextSummary: string;
  keyPoints: string[];
  lastSync: number;
}> {
  const contexts = db
    .prepare(
      `SELECT * FROM cross_channel_context WHERE unified_conversation_id = ? ORDER BY last_sync DESC`
    )
    .all(conversationId) as any[];

  return contexts.map((row) => ({
    channelId: row.channel_id,
    contextSummary: row.context_summary,
    keyPoints: row.key_points_json ? JSON.parse(row.key_points_json) : [],
    lastSync: row.last_sync,
  }));
}

/**
 * Update cross-channel context
 */
export function updateCrossChannelContext(
  db: Database,
  conversationId: string,
  channelId: string,
  contextSummary: string,
  keyPoints: string[]
): void {
  const now = Date.now();
  const existing = db
    .prepare(
      'SELECT id FROM cross_channel_context WHERE unified_conversation_id = ? AND channel_id = ?'
    )
    .get(conversationId, channelId) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE cross_channel_context
       SET context_summary = ?, key_points_json = ?, last_sync = ?
       WHERE id = ?`
    ).run(contextSummary, JSON.stringify(keyPoints), now, existing.id);
  } else {
    const id = Date.now().toString() + Math.random().toString(36).substring(2);
    db.prepare(
      `INSERT INTO cross_channel_context (id, unified_conversation_id, channel_id, context_summary, key_points_json, last_sync)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, conversationId, channelId, contextSummary, JSON.stringify(keyPoints), now);
  }
}
