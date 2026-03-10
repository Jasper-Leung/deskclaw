/**
 * Cross-Channel Session Manager
 * Manages unified conversations across multiple messaging channels
 */

import type { Database } from 'better-sqlite3';
import { randomUUID } from 'crypto';

export interface UnifiedConversation {
  id: string;
  title: string;
  participantIdentity: string;
  channelsInvolved: string[];
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface ChannelSessionMapping {
  id: string;
  unifiedConversationId: string;
  channelId: string;
  sessionId?: string;
  peerId: string;
  roleInConversation: 'primary' | 'secondary' | 'observer';
  joinedAt: number;
  leftAt?: number;
}

export interface IdentityMatch {
  confidence: number;
  evidence: string[];
  suggestedIdentity: string;
}

/**
 * Create a unified conversation
 */
export function createUnifiedConversation(
  db: Database,
  conversation: Omit<UnifiedConversation, 'id' | 'createdAt' | 'updatedAt'>
): UnifiedConversation {
  const now = Date.now();
  const id = randomUUID();

  db.prepare(
    `INSERT INTO unified_conversations (id, title, participant_identity, channels_involved_json, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    conversation.title,
    conversation.participantIdentity,
    JSON.stringify(conversation.channelsInvolved),
    conversation.metadata ? JSON.stringify(conversation.metadata) : null,
    now,
    now
  );

  return {
    ...conversation,
    id,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Get a unified conversation by ID
 */
export function getUnifiedConversation(
  db: Database,
  conversationId: string
): UnifiedConversation | undefined {
  const result = db
    .prepare('SELECT * FROM unified_conversations WHERE id = ?')
    .get(conversationId) as any;
  if (!result) return undefined;

  return {
    id: result.id,
    title: result.title,
    participantIdentity: result.participant_identity,
    channelsInvolved: JSON.parse(result.channels_involved_json),
    metadata: result.metadata_json ? JSON.parse(result.metadata_json) : undefined,
    createdAt: result.created_at,
    updatedAt: result.updated_at,
  };
}

/**
 * Get all unified conversations
 */
export function getUnifiedConversations(
  db: Database,
  limit?: number,
  offset?: number
): UnifiedConversation[] {
  let query = 'SELECT * FROM unified_conversations ORDER BY updated_at DESC';
  const params: any[] = [];

  if (limit) {
    query += ' LIMIT ?';
    params.push(limit);
    if (offset) {
      query += ' OFFSET ?';
      params.push(offset);
    }
  }

  const results = db.prepare(query).all(...params) as any[];
  return results.map((row) => ({
    id: row.id,
    title: row.title,
    participantIdentity: row.participant_identity,
    channelsInvolved: JSON.parse(row.channels_involved_json),
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Update a unified conversation
 */
export function updateUnifiedConversation(
  db: Database,
  conversationId: string,
  updates: Partial<Omit<UnifiedConversation, 'id' | 'createdAt' | 'updatedAt'>>
): UnifiedConversation | undefined {
  const existing = getUnifiedConversation(db, conversationId);
  if (!existing) return undefined;

  const now = Date.now();
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.title !== undefined) {
    fields.push('title = ?');
    values.push(updates.title);
  }
  if (updates.participantIdentity !== undefined) {
    fields.push('participant_identity = ?');
    values.push(updates.participantIdentity);
  }
  if (updates.channelsInvolved !== undefined) {
    fields.push('channels_involved_json = ?');
    values.push(JSON.stringify(updates.channelsInvolved));
  }
  if (updates.metadata !== undefined) {
    fields.push('metadata_json = ?');
    values.push(updates.metadata ? JSON.stringify(updates.metadata) : null);
  }

  fields.push('updated_at = ?');
  values.push(now);
  values.push(conversationId);

  db.prepare(`UPDATE unified_conversations SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  return getUnifiedConversation(db, conversationId);
}

/**
 * Delete a unified conversation
 */
export function deleteUnifiedConversation(db: Database, conversationId: string): boolean {
  const result = db.prepare('DELETE FROM unified_conversations WHERE id = ?').run(conversationId);
  return result.changes > 0;
}

/**
 * Add a channel session mapping to a unified conversation
 */
export function addChannelSession(
  db: Database,
  mapping: Omit<ChannelSessionMapping, 'id'>
): ChannelSessionMapping {
  const id = randomUUID();

  db.prepare(
    `INSERT INTO channel_session_mappings (id, unified_conversation_id, channel_id, session_id, peer_id, role_in_conversation, joined_at, left_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    mapping.unifiedConversationId,
    mapping.channelId,
    mapping.sessionId || null,
    mapping.peerId,
    mapping.roleInConversation,
    mapping.joinedAt,
    mapping.leftAt || null
  );

  // Update the unified conversation's channels list
  const conversation = getUnifiedConversation(db, mapping.unifiedConversationId);
  if (conversation && !conversation.channelsInvolved.includes(mapping.channelId)) {
    updateUnifiedConversation(db, mapping.unifiedConversationId, {
      channelsInvolved: [...conversation.channelsInvolved, mapping.channelId],
    });
  }

  return {
    ...mapping,
    id,
  };
}

/**
 * Get channel session mappings for a unified conversation
 */
export function getChannelSessions(db: Database, conversationId: string): ChannelSessionMapping[] {
  const results = db
    .prepare(
      'SELECT * FROM channel_session_mappings WHERE unified_conversation_id = ? ORDER BY joined_at ASC'
    )
    .all(conversationId) as any[];

  return results.map((row) => ({
    id: row.id,
    unifiedConversationId: row.unified_conversation_id,
    channelId: row.channel_id,
    sessionId: row.session_id,
    peerId: row.peer_id,
    roleInConversation: row.role_in_conversation,
    joinedAt: row.joined_at,
    leftAt: row.left_at,
  }));
}

/**
 * Find unified conversation by channel and peer
 */
export function findConversationByChannelAndPeer(
  db: Database,
  channelId: string,
  peerId: string
): UnifiedConversation | undefined {
  const result = db
    .prepare(
      `SELECT uc.* FROM unified_conversations uc
       INNER JOIN channel_session_mappings csm ON uc.id = csm.unified_conversation_id
       WHERE csm.channel_id = ? AND csm.peer_id = ? AND csm.left_at IS NULL
       ORDER BY uc.updated_at DESC
       LIMIT 1`
    )
    .get(channelId, peerId) as any;

  if (!result) return undefined;

  return {
    id: result.id,
    title: result.title,
    participantIdentity: result.participant_identity,
    channelsInvolved: JSON.parse(result.channels_involved_json),
    metadata: result.metadata_json ? JSON.parse(result.metadata_json) : undefined,
    createdAt: result.created_at,
    updatedAt: result.updated_at,
  };
}

/**
 * Merge sessions into a unified conversation
 */
export function mergeSessions(
  db: Database,
  conversationId: string,
  sessionIds: string[]
): UnifiedConversation | undefined {
  const conversation = getUnifiedConversation(db, conversationId);
  if (!conversation) return undefined;

  for (const sessionId of sessionIds) {
    // Get session details
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any;
    if (!session) continue;

    // Find associated channel (this would need additional metadata in sessions table)
    // For now, we'll skip this step
  }

  // Trigger a touch to update the timestamp
  return updateUnifiedConversation(db, conversationId, {
    metadata: {},
  });
}

/**
 * Resolve identity across channels
 */
export function resolveIdentity(db: Database, channelId: string, peerId: string): IdentityMatch {
  const evidence: string[] = [];
  let confidence = 0;
  let suggestedIdentity = peerId;

  // Check if this peer exists in other channels with similar patterns
  const crossChannelMatches = db
    .prepare(
      `SELECT csm.channel_id, csm.peer_id, uc.participant_identity
       FROM channel_session_mappings csm
       INNER JOIN unified_conversations uc ON csm.unified_conversation_id = uc.id
       WHERE csm.peer_id = ? AND csm.channel_id != ?`
    )
    .all(peerId, channelId) as Array<{
    channel_id: string;
    peer_id: string;
    participant_identity: string;
  }>;

  if (crossChannelMatches.length > 0) {
    evidence.push(`Found ${crossChannelMatches.length} cross-channel matches with same peer ID`);
    confidence = 0.9;
    suggestedIdentity = crossChannelMatches[0].participant_identity;
  }

  // Check for similar usernames (heuristic)
  const similarPeers = db
    .prepare(
      `SELECT DISTINCT peer_id, channel_id
       FROM channel_session_mappings
       WHERE peer_id LIKE ?`
    )
    .all(`%${peerId}%`) as Array<{ peer_id: string; channel_id: string }>;

  if (similarPeers.length > 1) {
    evidence.push(`Found ${similarPeers.length} peers with similar IDs`);
    confidence = Math.max(confidence, 0.6);
  }

  return {
    confidence,
    evidence,
    suggestedIdentity,
  };
}

/**
 * Get conversations by participant identity
 */
export function getConversationsByIdentity(db: Database, identity: string): UnifiedConversation[] {
  const results = db
    .prepare(
      'SELECT * FROM unified_conversations WHERE participant_identity = ? ORDER BY updated_at DESC'
    )
    .all(identity) as any[];

  return results.map((row) => ({
    id: row.id,
    title: row.title,
    participantIdentity: row.participant_identity,
    channelsInvolved: JSON.parse(row.channels_involved_json),
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Get unified conversation statistics
 */
export function getUnifiedConversationStats(db: Database): {
  totalConversations: number;
  totalChannelsInvolved: number;
  avgChannelsPerConversation: number;
  activeConversations: number;
} {
  const total = db.prepare('SELECT COUNT(*) as count FROM unified_conversations').get() as {
    count: number;
  };

  const channelCounts = db
    .prepare(
      `SELECT
        SUM(json_array_length(channels_involved_json)) as total_channels,
        AVG(json_array_length(channels_involved_json)) as avg_channels
       FROM unified_conversations`
    )
    .get() as any;

  // Active conversations (updated in last 7 days)
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const active = db
    .prepare('SELECT COUNT(*) as count FROM unified_conversations WHERE updated_at > ?')
    .get(weekAgo) as { count: number };

  return {
    totalConversations: total.count,
    totalChannelsInvolved: channelCounts.total_channels || 0,
    avgChannelsPerConversation: channelCounts.avg_channels || 0,
    activeConversations: active.count,
  };
}

/**
 * Suggest conversation merge
 */
export function suggestMerge(
  db: Database,
  conversationId1: string,
  conversationId2: string
): { shouldMerge: boolean; confidence: number; reason: string } {
  const conv1 = getUnifiedConversation(db, conversationId1);
  const conv2 = getUnifiedConversation(db, conversationId2);

  if (!conv1 || !conv2) {
    return {
      shouldMerge: false,
      confidence: 0,
      reason: 'One or both conversations not found',
    };
  }

  // Check if participant identities match
  if (conv1.participantIdentity === conv2.participantIdentity) {
    return {
      shouldMerge: true,
      confidence: 0.9,
      reason: 'Same participant identity',
    };
  }

  // Check for shared channels
  const sharedChannels = conv1.channelsInvolved.filter((c) => conv2.channelsInvolved.includes(c));
  if (sharedChannels.length > 0) {
    return {
      shouldMerge: true,
      confidence: 0.7,
      reason: `Shares ${sharedChannels.length} channel(s)`,
    };
  }

  return {
    shouldMerge: false,
    confidence: 0,
    reason: 'No strong evidence for merge',
  };
}

/**
 * Execute conversation merge
 */
export function executeMerge(
  db: Database,
  targetConversationId: string,
  sourceConversationId: string
): UnifiedConversation | undefined {
  const target = getUnifiedConversation(db, targetConversationId);
  const source = getUnifiedConversation(db, sourceConversationId);

  if (!target || !source) return undefined;

  // Move all channel session mappings from source to target
  db.prepare(
    'UPDATE channel_session_mappings SET unified_conversation_id = ? WHERE unified_conversation_id = ?'
  ).run(targetConversationId, sourceConversationId);

  // Combine channels
  const combinedChannels = [...new Set([...target.channelsInvolved, ...source.channelsInvolved])];

  // Update target conversation
  const updated = updateUnifiedConversation(db, targetConversationId, {
    channelsInvolved: combinedChannels,
  });

  // Delete source conversation
  deleteUnifiedConversation(db, sourceConversationId);

  return updated;
}
