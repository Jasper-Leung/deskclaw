/**
 * Auto Session Title Generator
 *
 * Generates short, descriptive titles from the first user/assistant exchange.
 * Runs asynchronously after the first response so it never adds latency.
 */

import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { decrypt } from '../db/index.js';
import { getDatabase } from '../db/index.js';
import { createLogger } from './logger.js';

const titleLogger = createLogger('title-generator');

const TITLE_PROMPT = `Generate a short, descriptive title (3-7 words) for a conversation that starts with the following exchange. The title should capture the main topic or intent. Return ONLY the title text, nothing else. No quotes, no punctuation at the end, no prefixes like "Title:".`;

/**
 * Generate a session title from the first exchange
 */
export async function generateTitle(
  userMessage: string,
  assistantResponse: string
): Promise<string | null> {
  const userSnippet = (userMessage || '').substring(0, 500);
  const assistantSnippet = (assistantResponse || '').substring(0, 500);

  if (!userSnippet || !assistantSnippet) return null;

  try {
    const db = getDatabase();
    const model = resolveCheapestModel(db);
    if (!model) return null;

    const provider = getProviderForModel(db, model);
    if (!provider) return null;

    const apiKey = decrypt(provider.api_key_encrypted);
    let client: any;
    switch (provider.protocol) {
      case 'openai':
      case 'ollama':
      case 'custom':
        client = createOpenAI({ baseURL: provider.base_url, apiKey });
        break;
      case 'anthropic':
        client = createAnthropic({ baseURL: provider.base_url, apiKey });
        break;
      default:
        return null;
    }

    const result = await generateText({
      model: client(provider.model_id),
      messages: [
        { role: 'system', content: TITLE_PROMPT },
        { role: 'user', content: `User: ${userSnippet}\n\nAssistant: ${assistantSnippet}` },
      ],
      maxTokens: 30,
      temperature: 0.3,
    });

    let title = (result.text || '').trim();
    // Clean up
    title = title.replace(/^["']|["']$/g, '');
    if (title.toLowerCase().startsWith('title:')) {
      title = title.substring(6).trim();
    }
    if (title.length > 80) {
      title = title.substring(0, 77) + '...';
    }
    return title || null;
  } catch (error) {
    titleLogger.debug('Title generation failed:', error);
    return null;
  }
}

/**
 * Auto-generate and save a session title if one doesn't exist
 */
export async function autoTitleSession(
  sessionId: string,
  userMessage: string,
  assistantResponse: string
): Promise<void> {
  if (!sessionId || !userMessage || !assistantResponse) return;

  const db = getDatabase();

  // Check if session already has a custom title
  const session = db.prepare('SELECT title FROM sessions WHERE id = ?').get(sessionId) as any;
  if (!session) return;

  // Skip if already has a meaningful title (not the default)
  const defaultPatterns = /^(New Conversation|new conversation|untitled)/i;
  if (session.title && !defaultPatterns.test(session.title)) return;

  const title = await generateTitle(userMessage, assistantResponse);
  if (!title) return;

  try {
    db.prepare('UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?').run(
      title,
      Date.now(),
      sessionId
    );
    titleLogger.info(`Auto-generated title for session ${sessionId}: "${title}"`);
  } catch (error) {
    titleLogger.debug('Failed to save auto-generated title:', error);
  }
}

function resolveCheapestModel(db: any): string | null {
  const cheap = db
    .prepare(
      `SELECT m.id FROM models m JOIN providers p ON m.provider_id = p.id
     WHERE LOWER(m.model_id) LIKE '%mini%' OR LOWER(m.model_id) LIKE '%flash%'
     OR LOWER(m.model_id) LIKE '%haiku%' OR LOWER(m.model_id) LIKE '%3.5%'
     LIMIT 1`
    )
    .get() as any;
  if (cheap) return cheap.id;
  const first = db.prepare('SELECT id FROM models LIMIT 1').get() as any;
  return first?.id || null;
}

function getProviderForModel(db: any, modelId: string) {
  return db
    .prepare(
      `SELECT p.protocol, p.base_url, p.api_key_encrypted, m.model_id
     FROM models m JOIN providers p ON m.provider_id = p.id WHERE m.id = ?`
    )
    .get(modelId) as any;
}
