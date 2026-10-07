import Database from 'better-sqlite3';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText, generateText } from 'ai';
import { decrypt } from '../db/index.js';
import type { LLMRequest, Message } from '../../../shared/types/index.js';
import { BrowserWindow } from 'electron';
import { redactSecrets } from '../lib/redact.js';
import {
  selectCredential,
  reportSuccess,
  reportError,
  getCredentialApiKey,
} from '../keys/credential-pool.js';
import { recordUsage } from '../lib/usage-tracker.js';
import { countMessagesTokens } from '../lib/token-counter.js';

interface ProviderConfig {
  protocol: 'openai' | 'anthropic' | 'ollama' | 'custom';
  baseUrl: string;
  apiKeyEncrypted: string;
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

  // Fallback to provider's own key
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

export const chat = async (db: Database.Database, request: LLMRequest): Promise<Message> => {
  const providerConfig = getProviderForModel(db, request.model);
  const client = createClient(providerConfig);

  try {
    // Filter and format messages for the LLM
    const filteredMessages = request.messages
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

    // Record usage tracking
    try {
      const inputTokens = countMessagesTokens(filteredMessages, providerConfig.modelId);
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
  mainWindow: BrowserWindow | null
): Promise<void> => {
  const providerConfig = getProviderForModel(db, request.model);
  const client = createClient(providerConfig);

  try {
    // Filter and format messages for the LLM
    // Skip tool-related messages and convert tool results to user messages
    const filteredMessages = request.messages
      .filter((m) => m.role !== 'tool' && m.role !== 'tool_error')
      .map((m) => {
        if (m.role === 'system') {
          return { role: 'system' as const, content: m.content };
        }
        if (m.role === 'user') {
          return { role: 'user' as const, content: m.content };
        }
        if (m.role === 'tool_result') {
          // Convert tool results to user messages so the AI knows the result
          return { role: 'user' as const, content: `[Tool Result]: ${m.content}` };
        }
        return { role: 'assistant' as const, content: m.content };
      });

    const result = await streamText({
      model: client(providerConfig.modelId),
      messages: filteredMessages,
      temperature: request.temperature ?? 0.7,
      maxTokens: request.maxTokens ?? 16384, // Increased for long tool calls
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

    // Record usage tracking (estimate output tokens from streamed text)
    try {
      const inputTokens = countMessagesTokens(filteredMessages, providerConfig.modelId);
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
  request: LLMRequest
): AsyncGenerator<{ content: string; done: boolean }> {
  const providerConfig = getProviderForModel(db, request.model);
  const client = createClient(providerConfig);

  const filteredMessages = request.messages
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

    let streamedText = '';
    for await (const chunk of result.textStream) {
      streamedText += chunk;
      yield { content: chunk, done: false };
    }

    yield { content: '', done: true };

    // Report success to credential pool
    if (providerConfig.credentialId) {
      reportSuccess(db, providerConfig.credentialId);
    }

    // Record usage tracking
    try {
      const inputTokens = countMessagesTokens(filteredMessages, providerConfig.modelId);
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
