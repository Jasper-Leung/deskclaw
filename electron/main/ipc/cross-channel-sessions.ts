/**
 * IPC Handlers for Cross-Channel Sessions
 */

import type { Database } from 'better-sqlite3';
import * as manager from '../sessions/cross-channel-manager.js';
import * as unification from '../sessions/unification.js';

// ============================================================================
// CROSS-CHANNEL MANAGER HANDLERS
// ============================================================================

export const crossChannelCreateConversation = (
  db: Database,
  conversation: Omit<manager.UnifiedConversation, 'id' | 'createdAt' | 'updatedAt'>
) => {
  return manager.createUnifiedConversation(db, conversation);
};

export const crossChannelGetConversation = (db: Database, conversationId: string) => {
  return manager.getUnifiedConversation(db, conversationId);
};

export const crossChannelGetConversations = (db: Database, limit?: number, offset?: number) => {
  return manager.getUnifiedConversations(db, limit, offset);
};

export const crossChannelUpdateConversation = (
  db: Database,
  conversationId: string,
  updates: Partial<Omit<manager.UnifiedConversation, 'id' | 'createdAt' | 'updatedAt'>>
) => {
  return manager.updateUnifiedConversation(db, conversationId, updates);
};

export const crossChannelDeleteConversation = (db: Database, conversationId: string) => {
  return manager.deleteUnifiedConversation(db, conversationId);
};

export const crossChannelAddSession = (
  db: Database,
  mapping: Omit<manager.ChannelSessionMapping, 'id'>
) => {
  return manager.addChannelSession(db, mapping);
};

export const crossChannelGetSessions = (db: Database, conversationId: string) => {
  return manager.getChannelSessions(db, conversationId);
};

export const crossChannelFindConversation = (db: Database, channelId: string, peerId: string) => {
  return manager.findConversationByChannelAndPeer(db, channelId, peerId);
};

export const crossChannelMergeSessions = (
  db: Database,
  conversationId: string,
  sessionIds: string[]
) => {
  return manager.mergeSessions(db, conversationId, sessionIds);
};

export const crossChannelResolveIdentity = (db: Database, channelId: string, peerId: string) => {
  return manager.resolveIdentity(db, channelId, peerId);
};

export const crossChannelGetByIdentity = (db: Database, identity: string) => {
  return manager.getConversationsByIdentity(db, identity);
};

export const crossChannelGetStats = (db: Database) => {
  return manager.getUnifiedConversationStats(db);
};

export const crossChannelSuggestMerge = (
  db: Database,
  conversationId1: string,
  conversationId2: string
) => {
  return manager.suggestMerge(db, conversationId1, conversationId2);
};

export const crossChannelExecuteMerge = (db: Database, targetId: string, sourceId: string) => {
  return manager.executeMerge(db, targetId, sourceId);
};

// ============================================================================
// SESSION UNIFICATION HANDLERS
// ============================================================================

export const crossChannelUnify = (
  db: Database,
  sessions: unification.SessionInfo[],
  config?: Partial<unification.UnificationConfig>
) => {
  return unification.unifySessions(db, sessions, config);
};

export const crossChannelFindMergeable = (
  db: Database,
  conversationId: string,
  threshold?: number
) => {
  return unification.findMergeableConversations(db, conversationId, threshold);
};

export const crossChannelGetTimeline = (db: Database, conversationId: string) => {
  return unification.getUnifiedTimeline(db, conversationId);
};

export const crossChannelGetContext = (db: Database, conversationId: string) => {
  return unification.getCrossChannelContext(db, conversationId);
};

export const crossChannelUpdateContext = (
  db: Database,
  conversationId: string,
  channelId: string,
  contextSummary: string,
  keyPoints: string[]
) => {
  return unification.updateCrossChannelContext(
    db,
    conversationId,
    channelId,
    contextSummary,
    keyPoints
  );
};
