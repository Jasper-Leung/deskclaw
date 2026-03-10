import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText, generateText } from 'ai';
import { decrypt } from '../db/index.js';
const getProviderForModel = (db, modelId) => {
  const stmt = db.prepare(`
    SELECT p.protocol, p.base_url, p.api_key_encrypted
    FROM models m
    JOIN providers p ON m.provider_id = p.id
    WHERE m.id = ?
  `);
  const result = stmt.get(modelId);
  if (!result) {
    throw new Error(`Model not found: ${modelId}`);
  }
  return {
    protocol: result.protocol,
    baseUrl: result.base_url,
    apiKeyEncrypted: result.api_key_encrypted,
  };
};
const createClient = (config) => {
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
export const chat = async (db, request) => {
  const providerConfig = getProviderForModel(db, request.model);
  const client = createClient(providerConfig);
  try {
    const result = await generateText({
      model: client(request.model),
      messages: request.messages.map((m) => {
        if (m.role === 'system') {
          return { role: 'system', content: m.content };
        }
        if (m.role === 'user') {
          return { role: 'user', content: m.content };
        }
        return { role: 'assistant', content: m.content };
      }),
      temperature: request.temperature ?? 0.7,
      maxTokens: request.maxTokens ?? 4096,
    });
    return {
      role: 'assistant',
      content: result.text,
      timestamp: Date.now(),
    };
  } catch (error) {
    throw new Error(`LLM call failed: ${error.message}`);
  }
};
export const chatStream = async function* (db, request) {
  const providerConfig = getProviderForModel(db, request.model);
  const client = createClient(providerConfig);
  try {
    const result = await streamText({
      model: client(request.model),
      messages: request.messages.map((m) => {
        if (m.role === 'system') {
          return { role: 'system', content: m.content };
        }
        if (m.role === 'user') {
          return { role: 'user', content: m.content };
        }
        return { role: 'assistant', content: m.content };
      }),
      temperature: request.temperature ?? 0.7,
      maxTokens: request.maxTokens ?? 4096,
    });
    for await (const chunk of result.textStream) {
      yield chunk;
    }
  } catch (error) {
    throw new Error(`LLM stream failed: ${error.message}`);
  }
};
