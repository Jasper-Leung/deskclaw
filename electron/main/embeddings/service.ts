/**
 * Embedding Service
 * Generates and manages vector embeddings for semantic search
 */

import type { Database } from 'better-sqlite3';
import { randomUUID } from 'crypto';

export type EmbeddingModel = 'local' | 'openai' | 'cohere';

export interface EmbeddingRecord {
  id: string;
  messageId: string;
  embedding: number[];
  embeddingModel: EmbeddingModel;
  createdAt: number;
}

export interface EmbeddingOptions {
  model: EmbeddingModel;
  dimensions?: number;
}

/**
 * Generate embedding for text
 */
export async function generateEmbedding(
  text: string,
  options: EmbeddingOptions = { model: 'local' }
): Promise<number[]> {
  switch (options.model) {
    case 'local':
      return generateLocalEmbedding(text);
    case 'openai':
      return await generateOpenAIEmbedding(text);
    case 'cohere':
      return await generateCohereEmbedding(text);
    default:
      throw new Error(`Unsupported embedding model: ${options.model}`);
  }
}

/**
 * Generate local embedding using simple TF-IDF-like approach
 * In production, use a proper local embedding model
 */
function generateLocalEmbedding(text: string): number[] {
  // Simple word frequency-based embedding (placeholder)
  const words = text.toLowerCase().split(/\s+/);
  const dimensions = 384; // Common embedding dimension
  const embedding = new Array(dimensions).fill(0);

  // Hash each word to determine which dimensions to update
  for (const word of words) {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = ((hash << 5) - hash + word.charCodeAt(i)) & 0xffffffff;
    }

    const index = Math.abs(hash) % dimensions;
    embedding[index] += 1;
  }

  // Normalize
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    return embedding.map((val) => val / magnitude);
  }

  return embedding;
}

/**
 * Generate embedding using OpenAI API
 */
async function generateOpenAIEmbedding(text: string): Promise<number[]> {
  try {
    const { getDatabase } = await import('../db/index.js');
    const db = getDatabase();

    // Get OpenAI provider
    const provider = db
      .prepare("SELECT * FROM providers WHERE protocol = 'openai' LIMIT 1")
      .get() as { api_key_encrypted: string } | undefined;

    if (!provider) {
      throw new Error('No OpenAI provider configured');
    }

    const { decrypt } = await import('../db/index.js');
    const apiKey = decrypt(provider.api_key_encrypted);

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  } catch (error: any) {
    console.error('Error generating OpenAI embedding:', error);
    // Fallback to local embedding
    return generateLocalEmbedding(text);
  }
}

/**
 * Generate embedding using Cohere API
 */
async function generateCohereEmbedding(text: string): Promise<number[]> {
  try {
    const { getDatabase } = await import('../db/index.js');
    const db = getDatabase();

    // Check for custom provider with Cohere
    const provider = db
      .prepare("SELECT * FROM providers WHERE base_url LIKE '%cohere%' LIMIT 1")
      .get() as { api_key_encrypted: string; base_url: string } | undefined;

    if (!provider) {
      throw new Error('No Cohere provider configured');
    }

    const { decrypt } = await import('../db/index.js');
    const apiKey = decrypt(provider.api_key_encrypted);

    const response = await fetch(`${provider.base_url}/v1/embed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        texts: [text],
        model: 'embed-english-v3.0',
        input_type: 'search_document',
      }),
    });

    if (!response.ok) {
      throw new Error(`Cohere API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.embeddings[0];
  } catch (error: any) {
    console.error('Error generating Cohere embedding:', error);
    // Fallback to local embedding
    return generateLocalEmbedding(text);
  }
}

/**
 * Save embedding to database
 */
export function saveEmbedding(
  db: Database,
  messageId: string,
  embedding: number[],
  model: EmbeddingModel
): EmbeddingRecord {
  const id = randomUUID();
  const now = Date.now();

  // Convert array to comma-separated string for storage
  const embeddingString = embedding.join(',');

  db.prepare(
    `INSERT INTO message_embeddings (id, message_id, embedding, embedding_model, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, messageId, embeddingString, model, now);

  return {
    id,
    messageId,
    embedding,
    embeddingModel: model,
    createdAt: now,
  };
}

/**
 * Get embedding for a message
 */
export function getEmbedding(db: Database, messageId: string): EmbeddingRecord | undefined {
  const result = db
    .prepare('SELECT * FROM message_embeddings WHERE message_id = ?')
    .get(messageId) as any;

  if (!result) return undefined;

  return {
    id: result.id,
    messageId: result.message_id,
    embedding: result.embedding.split(',').map(Number),
    embeddingModel: result.embedding_model,
    createdAt: result.created_at,
  };
}

/**
 * Calculate cosine similarity between two embeddings
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Generate embeddings for multiple messages
 */
export async function batchGenerateEmbeddings(
  db: Database,
  messages: Array<{ messageId: string; content: string }>,
  options: EmbeddingOptions = { model: 'local' }
): Promise<EmbeddingRecord[]> {
  const results: EmbeddingRecord[] = [];

  for (const message of messages) {
    try {
      const embedding = await generateEmbedding(message.content, options);
      const record = saveEmbedding(db, message.messageId, embedding, options.model);
      results.push(record);
    } catch (error) {
      console.error(`Error generating embedding for message ${message.messageId}:`, error);
    }
  }

  return results;
}

/**
 * Generate embedding for semantic index
 */
export async function generateSemanticIndexEmbedding(
  db: Database,
  contentType: 'message' | 'memory' | 'document',
  contentId: string,
  chunkText: string,
  options: EmbeddingOptions = { model: 'local' }
): Promise<string> {
  const id = randomUUID();
  const now = Date.now();

  const embedding = await generateEmbedding(chunkText, options);
  const embeddingString = embedding.join(',');

  db.prepare(
    `INSERT INTO semantic_index (id, content_type, content_id, chunk_text, embedding, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, contentType, contentId, chunkText, embeddingString, now);

  return id;
}

/**
 * Get embedding statistics
 */
export function getEmbeddingStats(db: Database): {
  totalMessageEmbeddings: number;
  totalSemanticIndexEntries: number;
  embeddingsByModel: Record<EmbeddingModel, number>;
} {
  const messageEmbeddings =
    (db.prepare('SELECT COUNT(*) as count FROM message_embeddings').get() as { count: number })
      .count || 0;

  const semanticIndex =
    (db.prepare('SELECT COUNT(*) as count FROM semantic_index').get() as { count: number }).count ||
    0;

  const byModel = db
    .prepare(
      'SELECT embedding_model, COUNT(*) as count FROM message_embeddings GROUP BY embedding_model'
    )
    .all() as Array<{ embedding_model: EmbeddingModel; count: number }>;

  const embeddingsByModel: Record<string, number> = {
    local: 0,
    openai: 0,
    cohere: 0,
  };

  for (const row of byModel) {
    embeddingsByModel[row.embedding_model] = row.count;
  }

  return {
    totalMessageEmbeddings: messageEmbeddings,
    totalSemanticIndexEntries: semanticIndex,
    embeddingsByModel: embeddingsByModel as Record<EmbeddingModel, number>,
  };
}

/**
 * Delete embedding
 */
export function deleteEmbedding(db: Database, messageId: string): boolean {
  const result = db.prepare('DELETE FROM message_embeddings WHERE message_id = ?').run(messageId);
  return result.changes > 0;
}

/**
 * Delete semantic index entry
 */
export function deleteSemanticIndexEntry(db: Database, entryId: string): boolean {
  const result = db.prepare('DELETE FROM semantic_index WHERE id = ?').run(entryId);
  return result.changes > 0;
}

/**
 * Clear all embeddings for a model
 */
export function clearModelEmbeddings(db: Database, model: EmbeddingModel): number {
  const result = db.prepare('DELETE FROM message_embeddings WHERE embedding_model = ?').run(model);
  return result.changes;
}
