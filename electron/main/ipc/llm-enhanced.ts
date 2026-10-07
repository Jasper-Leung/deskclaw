import Database from 'better-sqlite3';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText, generateText } from 'ai';
import { decrypt } from '../db/index.js';
import type { LLMRequest } from '../../../shared/types/index.js';
import { getModelContextLimit, countMessagesTokens } from '../lib/token-counter.js';
import { redactSecrets } from '../lib/redact.js';
import {
  analyzeAndRoute,
  getDefaultSmartRoutingConfig,
  type SmartRoutingConfig,
} from '../lib/smart-routing.js';
import { expandReferences, parseReferences } from '../lib/context-references.js';
import {
  selectCredential,
  reportSuccess,
  reportError,
  getCredentialApiKey,
} from '../keys/credential-pool.js';
import { compressContext } from '../lib/context-compressor.js';
import { autoTitleSession } from '../lib/title-generator.js';
import { recordUsage, calculateCost } from '../lib/usage-tracker.js';

interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool' | 'tool_result' | 'tool_error';
  content: string;
  timestamp?: number;
}
import { BrowserWindow } from 'electron';
import * as memory from '../memory/service.js';

interface ProviderConfig {
  protocol: 'openai' | 'anthropic' | 'ollama' | 'custom';
  baseUrl: string;
  apiKeyEncrypted: string;
}

interface MemoryInjectionOptions {
  enabled?: boolean;
  agentId?: string;
  maxMemories?: number;
  minImportance?: number;
  useSemantic?: boolean;
}

const getProviderForModel = (
  db: Database.Database,
  modelId: string
): ProviderConfig & { modelId: string; credentialId?: string } => {
  const stmt = db.prepare(`
    SELECT p.protocol, p.base_url, p.api_key_encrypted, m.model_id, m.provider_id
    FROM models m
    JOIN providers p ON m.provider_id = p.id
    WHERE m.id = ?
  `);

  const result = stmt.get(modelId) as any;

  if (!result) {
    throw new Error(`Model not found: ${modelId}`);
  }

  // Try credential pool first
  const poolCredential = selectCredential(db, result.provider_id);
  if (poolCredential) {
    return {
      protocol: result.protocol,
      baseUrl: result.base_url,
      apiKeyEncrypted: getCredentialApiKey(poolCredential),
      modelId: result.model_id,
      credentialId: poolCredential.id,
    };
  }

  return {
    protocol: result.protocol,
    baseUrl: result.base_url,
    apiKeyEncrypted: result.api_key_encrypted,
    modelId: result.model_id,
  };
};

const createClient = (config: ProviderConfig) => {
  const apiKey = decrypt(config.apiKeyEncrypted);

  switch (config.protocol) {
    case 'openai':
    case 'ollama':
    case 'custom':
      return createOpenAI({
        baseURL: config.baseUrl,
        apiKey,
      });
    case 'anthropic':
      return createAnthropic({
        baseURL: config.baseUrl,
        apiKey,
      });
    default:
      throw new Error(`Unsupported protocol: ${config.protocol}`);
  }
};

/**
 * Inject memories into messages before LLM call
 */
async function injectMemoriesIfNeeded(
  db: Database.Database,
  request: LLMRequest,
  options?: MemoryInjectionOptions
): Promise<{ messages: Message[]; memoryContext?: memory.MemoryContext }> {
  // Default: enable memory injection if agentId is provided
  const opts: Required<MemoryInjectionOptions> = {
    enabled: options?.enabled !== false,
    agentId: options?.agentId || '',
    maxMemories: options?.maxMemories || 5,
    minImportance: options?.minImportance || 0.5,
    useSemantic: options?.useSemantic !== false,
  };

  // Skip if memory injection is disabled or no agentId
  if (!opts.enabled || !opts.agentId) {
    return { messages: request.messages };
  }

  // Inject memories into messages
  const messagesWithMemories = await memory.injectMemoriesIntoMessages(
    db,
    opts.agentId,
    request.messages,
    {
      maxMemories: opts.maxMemories,
      minImportance: opts.minImportance,
      useSemantic: opts.useSemantic,
    }
  );

  // Cast to Message[] to satisfy the type system
  return { messages: messagesWithMemories as Message[] };
}

/**
 * Apply smart routing to determine the best model for the request
 */
function applySmartRouting(db: Database.Database, request: LLMRequest): string {
  try {
    // Get smart routing config from settings
    const row = db
      .prepare("SELECT value FROM settings WHERE key = 'smartRoutingConfig'")
      .get() as any;
    if (!row) return request.model;

    const config: SmartRoutingConfig = {
      ...getDefaultSmartRoutingConfig(),
      ...JSON.parse(row.value),
    };
    if (!config.enabled || !config.cheapModelId) return request.model;

    // Find last user message
    const lastUserMsg = [...request.messages].reverse().find((m) => m.role === 'user');
    if (!lastUserMsg) return request.model;

    const decision = analyzeAndRoute(lastUserMsg.content, config, request.model);
    return decision.selectedModelId;
  } catch {
    return request.model;
  }
}

/**
 * Expand context references in the last user message
 */
async function expandContextRefsInMessages(messages: Message[]): Promise<Message[]> {
  // Find last user message
  const lastUserIdx = [...messages]
    .map((m, i) => ({ m, i }))
    .reverse()
    .find(({ m }) => m.role === 'user');
  if (!lastUserIdx) return messages;

  const lastUserMsg = lastUserIdx.m;
  if (!parseReferences(lastUserMsg.content).length) return messages;

  try {
    const { expandedText } = await expandReferences(lastUserMsg.content);
    const updated = [...messages];
    updated[lastUserIdx.i] = { ...lastUserMsg, content: expandedText };
    return updated;
  } catch {
    return messages;
  }
}

export const chat = async (
  db: Database.Database,
  request: LLMRequest,
  memoryOptions?: MemoryInjectionOptions
): Promise<Message> => {
  // Inject memories if needed
  const { messages: messagesWithMemories } = await injectMemoriesIfNeeded(
    db,
    request,
    memoryOptions
  );

  // Expand context references (@file:, @folder:, @url:)
  const messagesWithRefs = await expandContextRefsInMessages(messagesWithMemories);

  // Apply smart routing
  const routedModelId = applySmartRouting(db, request);

  const providerConfig = getProviderForModel(db, routedModelId);
  const client = createClient(providerConfig);

  try {
    // Filter and format messages for the LLM
    let filteredMessages = messagesWithRefs
      .filter((m) => m.role !== 'tool' && m.role !== 'tool_error')
      .map((m) => {
        if (m.role === 'system') {
          return { role: 'system' as const, content: m.content };
        }
        if (m.role === 'user') {
          return { role: 'user' as const, content: m.content };
        }
        if (m.role === 'tool_result') {
          return { role: 'user' as const, content: `[Tool Result]: ${m.content}` };
        }
        return { role: 'assistant' as const, content: m.content };
      });

    // Context compression when approaching token limit
    try {
      const compressionResult = await compressContext(
        filteredMessages as any,
        providerConfig.modelId
      );
      if (compressionResult.wasCompressed) {
        filteredMessages = compressionResult.messages as any;
      }
    } catch {
      // Compression failed, continue with original messages
    }

    // Calculate available tokens for output
    // Reserve space for: input messages + response format overhead
    const modelContextLimit = getModelContextLimit(providerConfig.modelId);
    const inputTokens = countMessagesTokens(filteredMessages, providerConfig.modelId);
    const reservedTokens = 1000; // Reserve for response overhead
    const availableOutputTokens = modelContextLimit - inputTokens - reservedTokens;

    // Ensure we don't exceed requested maxTokens or available tokens
    const requestedMaxTokens = request.maxTokens ?? 16384;
    const actualMaxTokens = Math.max(
      256, // Minimum tokens to ensure meaningful response
      Math.min(requestedMaxTokens, availableOutputTokens)
    );

    const result = await generateText({
      model: client(providerConfig.modelId),
      messages: filteredMessages,
      temperature: request.temperature ?? 0.7,
      maxTokens: actualMaxTokens,
    });

    // Report success to credential pool
    if (providerConfig.credentialId) {
      reportSuccess(db, providerConfig.credentialId);
    }

    // Record usage tracking
    try {
      const outputTokens = countMessagesTokens(
        [{ role: 'assistant', content: result.text }],
        providerConfig.modelId
      );
      recordUsage(db, {
        id: `usage_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        modelId: providerConfig.modelId,
        providerProtocol: providerConfig.protocol,
        inputTokens,
        outputTokens,
      });
    } catch {
      // Usage tracking is non-critical
    }

    // Auto-title session (fire-and-forget)
    const lastUserMsg = [...messagesWithRefs].reverse().find((m) => m.role === 'user');
    if (lastUserMsg && result.text) {
      const sessionId = (request as any).sessionId;
      if (sessionId) {
        autoTitleSession(sessionId, lastUserMsg.content, result.text).catch(() => {});
      }
    }

    return {
      role: 'assistant',
      content: result.text,
      timestamp: Date.now(),
    };
  } catch (error: any) {
    // Report error to credential pool
    if (providerConfig.credentialId) {
      reportError(db, providerConfig.credentialId, {
        statusCode: error.statusCode || error.status,
        message: error.message,
      });
    }
    throw new Error(`LLM call failed: ${redactSecrets(error.message)}`);
  }
};

export const chatStream = async (
  db: Database.Database,
  request: LLMRequest,
  mainWindow: BrowserWindow | null,
  memoryOptions?: MemoryInjectionOptions
): Promise<void> => {
  // Inject memories if needed
  const { messages: messagesWithMemories } = await injectMemoriesIfNeeded(
    db,
    request,
    memoryOptions
  );

  // Expand context references (@file:, @folder:, @url:)
  const messagesWithRefs = await expandContextRefsInMessages(messagesWithMemories);

  // Apply smart routing
  const routedModelId = applySmartRouting(db, request);

  const providerConfig = getProviderForModel(db, routedModelId);
  const client = createClient(providerConfig);

  try {
    // Filter and format messages for the LLM
    let filteredMessages = messagesWithRefs
      .filter((m) => m.role !== 'tool' && m.role !== 'tool_error')
      .map((m) => {
        if (m.role === 'system') {
          return { role: 'system' as const, content: m.content };
        }
        if (m.role === 'user') {
          return { role: 'user' as const, content: m.content };
        }
        if (m.role === 'tool_result') {
          return { role: 'user' as const, content: `[Tool Result]: ${m.content}` };
        }
        return { role: 'assistant' as const, content: m.content };
      });

    // Context compression when approaching token limit
    try {
      const compressionResult = await compressContext(
        filteredMessages as any,
        providerConfig.modelId
      );
      if (compressionResult.wasCompressed) {
        filteredMessages = compressionResult.messages as any;
      }
    } catch {
      // Compression failed, continue with original messages
    }

    // Calculate available tokens for output
    const modelContextLimit = getModelContextLimit(providerConfig.modelId);
    const inputTokens = countMessagesTokens(filteredMessages, providerConfig.modelId);
    const reservedTokens = 1000; // Reserve for response overhead
    const availableOutputTokens = modelContextLimit - inputTokens - reservedTokens;

    const requestedMaxTokens = request.maxTokens ?? 16384;
    const actualMaxTokens = Math.max(
      256, // Minimum tokens to ensure meaningful response
      Math.min(requestedMaxTokens, availableOutputTokens)
    );

    const result = await streamText({
      model: client(providerConfig.modelId),
      messages: filteredMessages,
      temperature: request.temperature ?? 0.7,
      maxTokens: actualMaxTokens,
    });

    let streamedText = '';
    for await (const chunk of result.textStream) {
      streamedText += chunk;
      mainWindow?.webContents.send('llm:stream:chunk', {
        content: chunk,
        done: false,
      });
    }

    mainWindow?.webContents.send('llm:stream:chunk', {
      content: '',
      done: true,
    });

    // Report success to credential pool
    if (providerConfig.credentialId) {
      reportSuccess(db, providerConfig.credentialId);
    }

    // Record usage tracking (estimate output tokens)
    try {
      const outputTokens = countMessagesTokens(
        [{ role: 'assistant', content: streamedText }],
        providerConfig.modelId
      );
      recordUsage(db, {
        id: `usage_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        modelId: providerConfig.modelId,
        providerProtocol: providerConfig.protocol,
        inputTokens,
        outputTokens,
      });
    } catch {
      // Usage tracking is non-critical
    }

    // Auto-title session (fire-and-forget)
    const lastUserMsg = [...messagesWithRefs].reverse().find((m) => m.role === 'user');
    if (lastUserMsg && streamedText) {
      const sessionId = (request as any).sessionId;
      if (sessionId) {
        autoTitleSession(sessionId, lastUserMsg.content, streamedText).catch(() => {});
      }
    }
  } catch (error: any) {
    // Report error to credential pool
    if (providerConfig.credentialId) {
      reportError(db, providerConfig.credentialId, {
        statusCode: error.statusCode || error.status,
        message: error.message,
      });
    }
    mainWindow?.webContents.send('llm:stream:error', {
      message: redactSecrets(error.message),
    });
    throw new Error(`LLM stream failed: ${redactSecrets(error.message)}`);
  }
};

export async function* streamChat(
  db: Database.Database,
  request: LLMRequest,
  memoryOptions?: MemoryInjectionOptions
): AsyncGenerator<{ content: string; done: boolean }> {
  // Inject memories if needed
  const { messages: messagesWithMemories } = await injectMemoriesIfNeeded(
    db,
    request,
    memoryOptions
  );

  // Expand context references
  const messagesWithRefs = await expandContextRefsInMessages(messagesWithMemories);

  // Apply smart routing
  const routedModelId = applySmartRouting(db, request);

  const providerConfig = getProviderForModel(db, routedModelId);
  const client = createClient(providerConfig);

  const filteredMessages = messagesWithRefs
    .filter((m) => m.role !== 'tool' && m.role !== 'tool_error')
    .map((m) => {
      if (m.role === 'system') {
        return { role: 'system' as const, content: m.content };
      }
      if (m.role === 'user') {
        return { role: 'user' as const, content: m.content };
      }
      return { role: 'assistant' as const, content: m.content };
    });

  try {
    const result = await streamText({
      model: client(providerConfig.modelId),
      messages: filteredMessages,
      temperature: request.temperature ?? 0.7,
      maxTokens: request.maxTokens ?? 16384,
    });

    for await (const chunk of result.textStream) {
      yield { content: chunk, done: false };
    }

    yield { content: '', done: true };

    // Report success to credential pool
    if (providerConfig.credentialId) {
      reportSuccess(db, providerConfig.credentialId);
    }
  } catch (error: any) {
    // Report error to credential pool
    if (providerConfig.credentialId) {
      reportError(db, providerConfig.credentialId, {
        statusCode: error.statusCode || error.status,
        message: error.message,
      });
    }
    throw error;
  }
}

/**
 * Chat with explicit memory context (returns memory info along with response)
 */
export const chatWithMemoryContext = async (
  db: Database.Database,
  request: LLMRequest,
  memoryOptions: MemoryInjectionOptions
): Promise<{ message: Message; memoryContext?: memory.MemoryContext }> => {
  // Inject memories and get context info
  const { messages: messagesWithMemories, memoryContext } = await injectMemoriesIfNeeded(
    db,
    request,
    memoryOptions
  );

  // Expand context references
  const messagesWithRefs = await expandContextRefsInMessages(messagesWithMemories);

  // Apply smart routing
  const routedModelId = applySmartRouting(db, request);

  const providerConfig = getProviderForModel(db, routedModelId);
  const client = createClient(providerConfig);

  try {
    const filteredMessages = messagesWithRefs
      .filter((m) => m.role !== 'tool' && m.role !== 'tool_error')
      .map((m) => {
        if (m.role === 'system') {
          return { role: 'system' as const, content: m.content };
        }
        if (m.role === 'user') {
          return { role: 'user' as const, content: m.content };
        }
        if (m.role === 'tool_result') {
          return { role: 'user' as const, content: `[Tool Result]: ${m.content}` };
        }
        return { role: 'assistant' as const, content: m.content };
      });

    const result = await generateText({
      model: client(providerConfig.modelId),
      messages: filteredMessages,
      temperature: request.temperature ?? 0.7,
      maxTokens: request.maxTokens ?? 16384,
    });

    // Report success to credential pool
    if (providerConfig.credentialId) {
      reportSuccess(db, providerConfig.credentialId);
    }

    return {
      message: {
        role: 'assistant',
        content: result.text,
        timestamp: Date.now(),
      },
      memoryContext,
    };
  } catch (error: any) {
    // Report error to credential pool
    if (providerConfig.credentialId) {
      reportError(db, providerConfig.credentialId, {
        statusCode: error.statusCode || error.status,
        message: error.message,
      });
    }
    throw new Error(`LLM call failed: ${redactSecrets(error.message)}`);
  }
};

/**
 * Get memory preview for a query (shows what memories would be injected)
 */
export const getMemoryPreview = async (
  db: Database.Database,
  agentId: string,
  query: string,
  options?: Partial<MemoryInjectionOptions>
): Promise<{
  memories: memory.Memory[];
  formattedPreview: string;
  retrievalMethod: memory.MemoryContext['retrievalMethod'];
}> => {
  const memoryContext = await memory.retrieveMemoriesForLLM(db, agentId, query, undefined, {
    maxMemories: options?.maxMemories || 5,
    minImportance: options?.minImportance || 0.5,
    useSemantic: options?.useSemantic !== false,
  });

  return {
    memories: memoryContext.memories,
    formattedPreview: memoryContext.formattedForLLM,
    retrievalMethod: memoryContext.retrievalMethod,
  };
};
