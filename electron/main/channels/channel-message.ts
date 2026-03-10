/**
 * Channel Message Utilities
 *
 * Helper functions for standardizing and handling messages
 * across different channel platforms.
 */

import type { ChannelMessage } from './channel-plugin.js';

/**
 * Generate a unique message ID
 */
export function generateMessageId(channelType: string, platformMessageId: string): string {
  return `${channelType}_${platformMessageId}`;
}

/**
 * Parse a message ID to extract channel type and platform ID
 */
export function parseMessageId(messageId: string): {
  channelType: string;
  platformMessageId: string;
} {
  const parts = messageId.split('_', 2);
  if (parts.length !== 2) {
    throw new Error(`Invalid message ID format: ${messageId}`);
  }
  return {
    channelType: parts[0],
    platformMessageId: parts[1],
  };
}

/**
 * Create a standardized channel message
 */
export function createChannelMessage(
  channelId: string,
  platformMessageId: string,
  data: Omit<ChannelMessage, 'id' | 'channelId' | 'messageId'>
): ChannelMessage {
  const channelType = channelId.split(':')[0] || channelId;
  return {
    id: generateMessageId(channelType, platformMessageId),
    channelId,
    messageId: platformMessageId,
    ...data,
  };
}

/**
 * Validate a channel message
 */
export function validateChannelMessage(message: unknown): message is ChannelMessage {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const msg = message as Partial<ChannelMessage>;

  return (
    typeof msg.id === 'string' &&
    typeof msg.channelId === 'string' &&
    typeof msg.messageId === 'string' &&
    typeof msg.peerId === 'string' &&
    ['direct', 'group', 'channel', 'thread'].includes(msg.peerType || '') &&
    ['inbound', 'outbound'].includes(msg.direction || '') &&
    typeof msg.timestamp === 'number'
  );
}

/**
 * Extract text content from a message
 */
export function getMessageText(message: ChannelMessage): string {
  if (message.content) {
    return message.content;
  }

  if (message.media) {
    return `[${message.media.type}${message.media.caption ? ': ' + message.media.caption : ''}]`;
  }

  return '';
}

/**
 * Format a message for display
 */
export function formatMessageForDisplay(message: ChannelMessage): string {
  const text = getMessageText(message);
  const direction = message.direction === 'inbound' ? '←' : '→';
  return `${direction} ${text}`;
}

/**
 * Filter messages by peer
 */
export function filterByPeer(messages: ChannelMessage[], peerId: string): ChannelMessage[] {
  return messages.filter((m) => m.peerId === peerId);
}

/**
 * Filter messages by direction
 */
export function filterByDirection(
  messages: ChannelMessage[],
  direction: 'inbound' | 'outbound'
): ChannelMessage[] {
  return messages.filter((m) => m.direction === direction);
}

/**
 * Sort messages by timestamp
 */
export function sortByTimestamp(
  messages: ChannelMessage[],
  order: 'asc' | 'desc' = 'asc'
): ChannelMessage[] {
  return [...messages].sort((a, b) => {
    const diff = a.timestamp - b.timestamp;
    return order === 'asc' ? diff : -diff;
  });
}

/**
 * Get conversation context (recent messages)
 */
export function getConversationContext(
  messages: ChannelMessage[],
  peerId: string,
  limit = 10
): ChannelMessage[] {
  return sortByTimestamp(filterByPeer(messages, peerId), 'desc').slice(0, limit);
}
