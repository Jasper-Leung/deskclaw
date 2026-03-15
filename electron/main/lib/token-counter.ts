/**
 * Token Counter Utility
 *
 * Provides accurate token counting for different AI models using js-tiktoken.
 * Supports Claude, GPT-4, GPT-3.5, and other popular models.
 */

import { getEncoding, Tiktoken } from 'js-tiktoken';

/**
 * Supported model encodings
 */
export type ModelEncoding =
  | 'cl100k_base' // GPT-4, GPT-3.5-turbo, Claude (approximate)
  | 'o200k_base' // GPT-4o, GPT-4o-mini
  | 'p50k_base' // Older GPT-3 models
  | 'r50k_base' // Original GPT-3
  | 'gpt2'; // GPT-2

/**
 * Model context window limits (tokens)
 * These are the maximum context window sizes for each model
 */
export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  // Claude models (Anthropic)
  'claude-3-5-sonnet': 200000,
  'claude-3-5-haiku': 200000,
  'claude-3-opus': 200000,
  'claude-3-sonnet': 200000,
  'claude-3-haiku': 200000,
  'claude-2.1': 100000,
  'claude-2.0': 100000,
  'claude-instant-1.2': 100000,

  // GPT-4o and GPT-4o-mini (OpenAI)
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'chatgpt-4o-latest': 128000,

  // GPT-4 Turbo and GPT-4 (OpenAI)
  'gpt-4-turbo': 128000,
  'gpt-4-turbo-preview': 128000,
  'gpt-4-1106-preview': 128000,
  'gpt-4-0125-preview': 128000,
  'gpt-4-vision-preview': 128000,
  'gpt-4': 8192,
  'gpt-4-32k': 32768,

  // GPT-3.5 Turbo (OpenAI)
  'gpt-3.5-turbo': 16385,
  'gpt-3.5-turbo-16k': 16385,
  'gpt-3.5-turbo-1106': 16385,
  'gpt-3.5-turbo-0125': 16385,

  // Legacy models
  'text-davinci-003': 4096,
  'text-davinci-002': 4096,
  'code-davinci-002': 8000,
  'gpt-3.5-turbo-instruct': 4096,
};

/**
 * Default model to use for context limit lookups
 */
export const DEFAULT_MODEL = 'gpt-4o';

/**
 * Default compression threshold (tokens)
 * When message history exceeds this, compression will be triggered
 */
export const DEFAULT_COMPRESSION_THRESHOLD = 100000;

/**
 * Get context limit for a specific model
 * Returns the maximum context window size for the given model
 *
 * @param modelId - The model ID
 * @returns The maximum context window size in tokens
 */
export function getModelContextLimit(modelId: string = DEFAULT_MODEL): number {
  const normalizedId = modelId.toLowerCase().split(':')[0];

  // Find exact match or prefix match
  for (const [model, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
    if (normalizedId === model || normalizedId.includes(model) || model.includes(normalizedId)) {
      return limit;
    }
  }

  // Default to GPT-4o limit if not found
  return MODEL_CONTEXT_LIMITS[DEFAULT_MODEL];
}

/**
 * Get user-configurable context limit override from settings
 * This allows users to adjust the context limit for their specific needs
 *
 * @param modelId - The model ID
 * @returns The user-configured limit, or null if not set
 */
export function getUserConfigurableLimit(modelId: string = DEFAULT_MODEL): number | null {
  try {
    // Try to get user override from database/settings
    const { getDatabase } = require('../db/index.js');
    const db = getDatabase();
    const result = db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(`context_limit_${modelId}`);

    if (result) {
      const limit = parseInt(result.value, 10);
      if (!isNaN(limit) && limit > 0) {
        return limit;
      }
    }
  } catch {
    // Ignore database errors
  }
  return null;
}

/**
 * Get effective context limit for a model
 * Returns user-configured limit if set, otherwise returns model's default limit
 *
 * @param modelId - The model ID
 * @returns The effective context limit in tokens
 */
export function getEffectiveContextLimit(modelId: string = DEFAULT_MODEL): number {
  const userLimit = getUserConfigurableLimit(modelId);
  if (userLimit !== null) {
    return userLimit;
  }
  return getModelContextLimit(modelId);
}

/**
 * Model to encoding mapping
 */
const MODEL_TO_ENCODING: Record<string, ModelEncoding> = {
  // GPT-4o and GPT-4o-mini
  'gpt-4o': 'o200k_base',
  'gpt-4o-mini': 'o200k_base',
  'chatgpt-4o-latest': 'o200k_base',

  // GPT-4 Turbo and GPT-4
  'gpt-4-turbo': 'cl100k_base',
  'gpt-4-turbo-preview': 'cl100k_base',
  'gpt-4-1106-preview': 'cl100k_base',
  'gpt-4-0125-preview': 'cl100k_base',
  'gpt-4-vision-preview': 'cl100k_base',
  'gpt-4': 'cl100k_base',
  'gpt-4-32k': 'cl100k_base',

  // GPT-3.5 Turbo
  'gpt-3.5-turbo': 'cl100k_base',
  'gpt-3.5-turbo-16k': 'cl100k_base',
  'gpt-3.5-turbo-1106': 'cl100k_base',
  'gpt-3.5-turbo-0125': 'cl100k_base',

  // Claude (uses cl100k_base as approximation)
  // Claude uses its own tokenizer, but cl100k_base is a reasonable approximation
  'claude-3-opus': 'cl100k_base',
  'claude-3-sonnet': 'cl100k_base',
  'claude-3-haiku': 'cl100k_base',
  'claude-3.5-sonnet': 'cl100k_base',
  'claude-3.5-haiku': 'cl100k_base',
  'claude-2.1': 'cl100k_base',
  'claude-2.0': 'cl100k_base',
  'claude-instant-1.2': 'cl100k_base',

  // Legacy models
  'text-davinci-003': 'p50k_base',
  'text-davinci-002': 'p50k_base',
  'code-davinci-002': 'p50k_base',
  'gpt-3.5-turbo-instruct': 'cl100k_base',
};

/**
 * Cache for encoding instances
 */
const encodingCache = new Map<ModelEncoding, Tiktoken>();

/**
 * Get encoding for a model, using cache for performance
 */
function getEncodingForModel(modelId: string): Tiktoken {
  // Normalize model ID to lowercase and remove variant suffixes
  const normalizedId = modelId.toLowerCase().split(':')[0];

  // Find matching encoding (use prefix match for model variants)
  let encoding: ModelEncoding = 'cl100k_base'; // Default encoding

  for (const [model, enc] of Object.entries(MODEL_TO_ENCODING)) {
    if (normalizedId.includes(model) || model.includes(normalizedId)) {
      encoding = enc;
      break;
    }
  }

  // Return cached encoding or create new one
  if (!encodingCache.has(encoding)) {
    encodingCache.set(encoding, getEncoding(encoding));
  }

  return encodingCache.get(encoding)!;
}

/**
 * Count tokens in a string for a specific model
 *
 * @param text - The text to count tokens for
 * @param modelId - The model ID (e.g., 'gpt-4', 'claude-3-sonnet')
 * @returns The number of tokens
 */
export function countTokens(text: string, modelId: string = 'gpt-4'): number {
  if (!text || text.length === 0) {
    return 0;
  }

  try {
    const encoding = getEncodingForModel(modelId);
    const tokens = encoding.encode(text);
    return tokens.length;
  } catch (error) {
    // Fallback to rough estimate if encoding fails
    console.warn(`Token counting failed for model ${modelId}, using fallback estimate`, error);
    return Math.ceil(text.length / 4);
  }
}

/**
 * Count tokens in a message object
 *
 * @param message - The message object with role and content
 * @param modelId - The model ID
 * @returns The number of tokens
 */
export function countMessageTokens(
  message: { role?: string; content?: string; name?: string },
  modelId: string = 'gpt-4'
): number {
  // Base tokens for message structure (role, etc.)
  let tokens = 3; // Every message follows <im_start>{role/name}\n{content}<im_end>\n

  if (message.name) {
    tokens += countTokens(message.name, modelId);
  }

  if (message.content) {
    tokens += countTokens(message.content, modelId);
  }

  return tokens;
}

/**
 * Count tokens in an array of messages
 *
 * @param messages - Array of message objects
 * @param modelId - The model ID
 * @returns The total number of tokens
 */
export function countMessagesTokens(
  messages: Array<{ role?: string; content?: string; name?: string }>,
  modelId: string = 'gpt-4'
): number {
  // Add tokens for primer (system message base)
  let tokens = 3;

  for (const message of messages) {
    tokens += countMessageTokens(message, modelId);
  }

  // Add reply tokens
  tokens += 3;

  return tokens;
}

/**
 * Estimate tokens using fallback method (character-based)
 * This is used when the actual tokenizer is unavailable
 *
 * @param text - The text to estimate tokens for
 * @returns The estimated number of tokens
 */
export function estimateTokens(text: string): number {
  if (!text || text.length === 0) {
    return 0;
  }

  // More accurate character-based estimation:
  // - English: ~4 chars per token
  // - Code: ~3-4 chars per token (more dense)
  // - Chinese: ~2 chars per token (less dense)
  // - JSON: can vary widely

  // Detect if text contains mostly non-ASCII characters (like Chinese)
  // eslint-disable-next-line no-control-regex
  const nonAsciiRatio = (text.match(/[^\x00-\x7F]/g) || []).length / text.length;

  if (nonAsciiRatio > 0.5) {
    // Mostly CJK characters
    return Math.ceil(text.length / 2);
  } else if (text.includes('{') && text.includes('}')) {
    // Likely JSON or code - more tokens per character
    return Math.ceil(text.length / 3);
  } else {
    // Standard English text
    return Math.ceil(text.length / 4);
  }
}

/**
 * Get the encoding name for a model
 *
 * @param modelId - The model ID
 * @returns The encoding name
 */
export function getModelEncoding(modelId: string): ModelEncoding {
  const normalizedId = modelId.toLowerCase().split(':')[0];

  for (const [model, enc] of Object.entries(MODEL_TO_ENCODING)) {
    if (normalizedId.includes(model) || model.includes(normalizedId)) {
      return enc;
    }
  }

  return 'cl100k_base'; // Default
}

/**
 * Clean up cached encodings (call when shutting down)
 */
export function cleanupEncodingCache(): void {
  for (const encoding of encodingCache.values()) {
    if (typeof (encoding as any).free === 'function') {
      (encoding as any).free();
    }
  }
  encodingCache.clear();
}

/**
 * Get token limit for a model (alias for getModelContextLimit)
 *
 * @param modelId - The model ID
 * @returns The maximum context window size in tokens
 */
export function getTokenLimit(modelId: string = DEFAULT_MODEL): number {
  return getModelContextLimit(modelId);
}

/**
 * Check if token count is near the model's context limit
 *
 * @param tokenCount - Current token count
 * @param modelId - The model ID
 * @param threshold - Threshold ratio (default 0.9)
 * @returns True if near or over limit
 */
export function isNearTokenLimit(
  tokenCount: number,
  modelId: string = DEFAULT_MODEL,
  threshold: number = 0.9
): boolean {
  const limit = getEffectiveContextLimit(modelId);
  return tokenCount >= limit * threshold;
}

/**
 * Truncate content to fit within token limit
 *
 * @param content - The content to truncate
 * @param modelId - The model ID
 * @param targetTokens - Target token count (default to 90% of context limit)
 * @returns Truncated content with indicator if truncated
 */
export function truncateToTokenLimit(
  content: string,
  modelId: string = DEFAULT_MODEL,
  targetTokens?: number
): string {
  if (!content || content.length === 0) {
    return content;
  }

  const limit = getEffectiveContextLimit(modelId);
  const target = targetTokens || Math.floor(limit * 0.9);

  const currentTokens = countTokens(content, modelId);
  if (currentTokens <= target) {
    return content;
  }

  // Estimate truncation ratio
  const ratio = target / currentTokens;
  const targetLength = Math.floor(content.length * ratio);

  // Truncate and add indicator
  let truncated = content.substring(0, targetLength);

  // Try to end at a word boundary
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > truncated.length - 50) {
    truncated = truncated.substring(0, lastSpace);
  }

  return truncated + '...';
}
