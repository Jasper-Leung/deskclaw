/**
 * Tokens IPC Handlers
 *
 * Provides accurate token counting for different AI models.
 */

import { ipcMain } from 'electron';
import {
  countTokens,
  countMessageTokens,
  countMessagesTokens,
  estimateTokens,
} from '../lib/token-counter.js';

/**
 * Register all tokens IPC handlers
 */
export const registerTokensHandlers = (): void => {
  // Count tokens in a text string
  ipcMain.handle('tokens:countText', (_, text: string, modelId?: string) => {
    try {
      return {
        success: true,
        count: countTokens(text, modelId || 'gpt-4'),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        // Provide fallback estimate
        count: estimateTokens(text),
      };
    }
  });

  // Count tokens in a single message
  ipcMain.handle(
    'tokens:countMessage',
    (_, message: { role?: string; content?: string }, modelId?: string) => {
      try {
        return {
          success: true,
          count: countMessageTokens(message, modelId || 'gpt-4'),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          // Provide fallback estimate
          count: Math.ceil((message.content?.length || 0) / 4),
        };
      }
    }
  );

  // Count tokens in an array of messages
  ipcMain.handle(
    'tokens:countMessages',
    (_, messages: Array<{ role?: string; content?: string }>, modelId?: string) => {
      try {
        return {
          success: true,
          count: countMessagesTokens(messages, modelId || 'gpt-4'),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          // Provide fallback estimate
          count: messages.reduce((sum, msg) => sum + Math.ceil((msg.content?.length || 0) / 4), 0),
        };
      }
    }
  );
};
