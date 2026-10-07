/**
 * Context Auto Compressor
 *
 * When conversations approach the model's context limit, this module
 * generates a structured LLM summary of the middle turns, preserving
 * head (system prompt) and tail (recent messages).
 *
 * Features:
 * - Structured summary (Goal, Progress, Decisions, Files, Next Steps)
 * - Iterative summary updates across multiple compactions
 * - Tool output pruning (cheap pre-pass before LLM summarization)
 * - Token-budget tail protection
 */

import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { decrypt } from '../db/index.js';
import { getDatabase } from '../db/index.js';
import { createLogger } from './logger.js';
import { countMessagesTokens, getModelContextLimit } from './token-counter.js';

const compressLogger = createLogger('context-compressor');

export interface CompressOptions {
  thresholdPercent?: number; // Default 0.50
  protectFirstN?: number; // Default 3
  protectLastTokens?: number; // Default 20000
  summaryModelOverride?: string; // Use a specific cheap model
}

const SUMMARY_PROMPT = `You are a conversation compaction assistant. Summarize the conversation turns below into a structured summary with these sections:

## Goal
What is the user trying to accomplish?

## Progress
What has been done so far? List completed steps.

## Decisions
What key decisions were made?

## Files
What files were created, modified, or referenced?

## Next Steps
What remains to be done?

Be concise but comprehensive. Preserve all important details including file paths, variable names, error messages, and configuration values. Do NOT include greetings or pleasantries.`;

const ITERATIVE_PROMPT = `You are updating an existing conversation summary with new information. Merge the previous summary with the new conversation turns below. Keep the same sections (Goal, Progress, Decisions, Files, Next Steps). Update existing items and add new ones. Remove resolved items from Next Steps.`;

const PRUNED_PLACEHOLDER = '[Old tool output cleared to save context space]';

export interface CompressionResult {
  messages: Array<{ role: string; content: string; timestamp?: number }>;
  wasCompressed: boolean;
  summaryTokenCount: number;
  removedMessages: number;
}

/**
 * Compress messages when approaching context limit
 */
export async function compressContext(
  messages: Array<{ role: string; content: string; timestamp?: number }>,
  modelId: string,
  options?: CompressOptions
): Promise<CompressionResult> {
  const threshold = options?.thresholdPercent ?? 0.5;
  const contextLimit = getModelContextLimit(modelId);
  const currentTokens = countMessagesTokens(messages, modelId);
  const thresholdTokens = Math.floor(contextLimit * threshold);

  if (currentTokens < thresholdTokens) {
    return {
      messages,
      wasCompressed: false,
      summaryTokenCount: 0,
      removedMessages: 0,
    };
  }

  compressLogger.info(
    `Context compression triggered: ${currentTokens} tokens > ${thresholdTokens} threshold`
  );

  const protectFirstN = options?.protectFirstN ?? 3;
  const protectLastTokens = options?.protectLastTokens ?? 20000;

  // Step 1: Prune old tool results (cheap pre-pass)
  const pruned = pruneOldToolOutputs(messages);

  // Step 2: Split into head, middle, tail
  const { head, middle, tail } = splitMessages(pruned, protectFirstN, protectLastTokens, modelId);

  if (middle.length === 0) {
    return {
      messages: [...head, ...tail],
      wasCompressed: false,
      summaryTokenCount: 0,
      removedMessages: 0,
    };
  }

  // Step 3: Check for existing summary in head
  const existingSummary = head.find(
    (m) => m.role === 'user' && m.content.startsWith('[CONTEXT COMPACTION]')
  );

  // Step 4: Generate summary via LLM
  try {
    const summary = await generateSummary(middle, existingSummary?.content, modelId, options);

    // Step 5: Build compressed message list
    const summaryMessage = {
      role: 'user' as const,
      content: `[CONTEXT COMPACTION] Earlier turns were compacted to save context space. Use this summary and the current state to continue:\n\n${summary}`,
      timestamp: Date.now(),
    };

    // Remove old summary from head if exists
    const cleanHead = head.filter(
      (m) => !(m.role === 'user' && m.content.startsWith('[CONTEXT COMPACTION]'))
    );

    const compressed = [...cleanHead, summaryMessage, ...tail];
    const summaryTokens = countMessagesTokens([summaryMessage], modelId);

    compressLogger.info(
      `Compressed: removed ${middle.length} messages, summary ~${summaryTokens} tokens`
    );

    return {
      messages: compressed,
      wasCompressed: true,
      summaryTokenCount: summaryTokens,
      removedMessages: middle.length,
    };
  } catch (error) {
    compressLogger.error('Summary generation failed, keeping original messages');
    return {
      messages,
      wasCompressed: false,
      summaryTokenCount: 0,
      removedMessages: 0,
    };
  }
}

/**
 * Prune old tool outputs to save tokens (cheap, no LLM call)
 */
function pruneOldToolOutputs(
  messages: Array<{ role: string; content: string; timestamp?: number }>
): Array<{ role: string; content: string; timestamp?: number }> {
  const MAX_TOOL_RESULT_CHARS = 2000;
  let prunedCount = 0;

  const result = messages.map((m, i) => {
    // Only prune tool results that are not in the last 5 messages
    if (
      i < messages.length - 5 &&
      m.role === 'tool_result' &&
      m.content.length > MAX_TOOL_RESULT_CHARS
    ) {
      prunedCount++;
      return {
        ...m,
        content: m.content.substring(0, MAX_TOOL_RESULT_CHARS) + '\n' + PRUNED_PLACEHOLDER,
      };
    }
    return m;
  });

  if (prunedCount > 0) {
    compressLogger.debug(`Pruned ${prunedCount} old tool outputs`);
  }
  return result;
}

/**
 * Split messages into head, middle, tail
 */
function splitMessages(
  messages: Array<{ role: string; content: string; timestamp?: number }>,
  protectFirstN: number,
  protectLastTokens: number,
  modelId: string
): {
  head: Array<{ role: string; content: string; timestamp?: number }>;
  middle: Array<{ role: string; content: string; timestamp?: number }>;
  tail: Array<{ role: string; content: string; timestamp?: number }>;
} {
  const head = messages.slice(0, Math.min(protectFirstN, messages.length));

  // Calculate tail by token budget from the end
  let tailTokenBudget = 0;
  let tailStart = messages.length;
  for (let i = messages.length - 1; i >= protectFirstN; i--) {
    const msgTokens = countMessagesTokens([messages[i]], modelId);
    if (tailTokenBudget + msgTokens > protectLastTokens) break;
    tailTokenBudget += msgTokens;
    tailStart = i;
  }

  const tail = messages.slice(tailStart);
  const middle = messages.slice(head.length, tailStart);

  return { head, middle, tail };
}

/**
 * Generate summary using LLM
 */
async function generateSummary(
  middle: Array<{ role: string; content: string; timestamp?: number }>,
  existingSummary: string | undefined,
  _modelId: string,
  options?: CompressOptions
): Promise<string> {
  // Resolve a model to use for summarization (prefer cheap model)
  const summaryModelId = options?.summaryModelOverride || resolveSummaryModel();

  const db = getDatabase();
  const providerConfig = getProviderForModel(db, summaryModelId);

  if (!providerConfig) {
    throw new Error('No model available for summarization');
  }

  const apiKey = decrypt(providerConfig.apiKeyEncrypted);
  let client: any;
  switch (providerConfig.protocol) {
    case 'openai':
    case 'ollama':
    case 'custom':
      client = createOpenAI({ baseURL: providerConfig.baseUrl, apiKey });
      break;
    case 'anthropic':
      client = createAnthropic({ baseURL: providerConfig.baseUrl, apiKey });
      break;
    default:
      throw new Error(`Unsupported protocol: ${providerConfig.protocol}`);
  }

  // Format middle messages for the summarizer
  const formattedMiddle = middle
    .map((m) => `[${m.role}]: ${m.content.substring(0, 1000)}`)
    .join('\n\n');

  const systemPrompt = existingSummary ? ITERATIVE_PROMPT : SUMMARY_PROMPT;
  const userContent = existingSummary
    ? `PREVIOUS SUMMARY:\n${existingSummary.replace('[CONTEXT COMPACTION] Earlier turns were compacted to save context space. Use this summary and the current state to continue:\n\n', '')}\n\nNEW CONVERSATION TURNS:\n${formattedMiddle}`
    : formattedMiddle;

  const result = await generateText({
    model: client(providerConfig.modelId),
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    maxTokens: 4000,
    temperature: 0.3,
  });

  return result.text;
}

/**
 * Find the cheapest available model for summarization
 */
function resolveSummaryModel(): string {
  const db = getDatabase();
  // Prefer models with "mini" or "flash" or "haiku" or "cheap" in the name
  const cheapModel = db
    .prepare(
      `SELECT m.id FROM models m JOIN providers p ON m.provider_id = p.id
     WHERE LOWER(m.model_id) LIKE '%mini%' OR LOWER(m.model_id) LIKE '%flash%'
     OR LOWER(m.model_id) LIKE '%haiku%' OR LOWER(m.model_id) LIKE '%3.5%'
     OR LOWER(m.model_id) LIKE '%turbo%' LIMIT 1`
    )
    .get() as any;

  if (cheapModel) return cheapModel.id;

  // Fallback to first model
  const first = db.prepare('SELECT id FROM models LIMIT 1').get() as any;
  return first?.id || '';
}

function getProviderForModel(db: any, modelId: string) {
  return db
    .prepare(
      `SELECT p.protocol, p.base_url, p.api_key_encrypted, m.model_id
     FROM models m JOIN providers p ON m.provider_id = p.id WHERE m.id = ?`
    )
    .get(modelId) as any;
}
