/**
 * IPC Handlers for Semantic Search & RAG
 */

import type { Database } from 'better-sqlite3';
import * as embeddings from '../embeddings/service.js';
import * as vectorStore from '../embeddings/vector-store.js';
import * as rag from '../rag/service.js';

// ============================================================================
// EMBEDDING SERVICE HANDLERS
// ============================================================================

export const embeddingsGenerate = async (text: string, options?: embeddings.EmbeddingOptions) => {
  return await embeddings.generateEmbedding(text, options);
};

export const embeddingsSave = (
  db: Database,
  messageId: string,
  embedding: number[],
  model: embeddings.EmbeddingModel
) => {
  return embeddings.saveEmbedding(db, messageId, embedding, model);
};

export const embeddingsGet = (db: Database, messageId: string) => {
  return embeddings.getEmbedding(db, messageId);
};

export const embeddingsCosineSimilarity = (a: number[], b: number[]) => {
  return embeddings.cosineSimilarity(a, b);
};

export const embeddingsBatchGenerate = async (
  db: Database,
  messages: Array<{ messageId: string; content: string }>,
  options?: embeddings.EmbeddingOptions
) => {
  return await embeddings.batchGenerateEmbeddings(db, messages, options);
};

export const embeddingsGenerateIndex = async (
  db: Database,
  contentType: 'message' | 'memory' | 'document',
  contentId: string,
  chunkText: string,
  options?: embeddings.EmbeddingOptions
) => {
  return await embeddings.generateSemanticIndexEmbedding(
    db,
    contentType,
    contentId,
    chunkText,
    options
  );
};

export const embeddingsGetStats = (db: Database) => {
  return embeddings.getEmbeddingStats(db);
};

export const embeddingsDelete = (db: Database, messageId: string) => {
  return embeddings.deleteEmbedding(db, messageId);
};

export const embeddingsDeleteIndex = (db: Database, entryId: string) => {
  return embeddings.deleteSemanticIndexEntry(db, entryId);
};

export const embeddingsClearModel = (db: Database, model: embeddings.EmbeddingModel) => {
  return embeddings.clearModelEmbeddings(db, model);
};

// ============================================================================
// VECTOR STORE HANDLERS
// ============================================================================

export const embeddingsVectorSearch = async (
  db: Database,
  query: string,
  options?: vectorStore.VectorSearchOptions
) => {
  return await vectorStore.vectorSearch(db, query, options);
};

export const embeddingsAddToIndex = async (
  db: Database,
  contentType: 'message' | 'memory' | 'document',
  contentId: string,
  text: string,
  chunkSize?: number,
  overlap?: number
) => {
  return await vectorStore.addToSemanticIndex(db, contentType, contentId, text, chunkSize, overlap);
};

export const embeddingsSearchMessages = async (
  db: Database,
  query: string,
  limit?: number,
  threshold?: number
) => {
  return await vectorStore.searchSimilarMessages(db, query, limit, threshold);
};

export const embeddingsSearchMemories = async (
  db: Database,
  query: string,
  limit?: number,
  threshold?: number
) => {
  return await vectorStore.searchSimilarMemories(db, query, limit, threshold);
};

export const embeddingsHybridSearch = async (
  db: Database,
  query: string,
  options?: vectorStore.VectorSearchOptions & { keywordWeight?: number; vectorWeight?: number }
) => {
  return await vectorStore.hybridSearch(db, query, options);
};

export const embeddingsGetIndexStats = (db: Database) => {
  return vectorStore.getSemanticIndexStats(db);
};

export const embeddingsClearIndex = (db: Database, contentType?: string) => {
  return vectorStore.clearSemanticIndex(db, contentType);
};

export const embeddingsDeleteFromIndex = (db: Database, contentId: string) => {
  return vectorStore.deleteFromSemanticIndex(db, contentId);
};

export const embeddingsRebuildIndex = async (
  db: Database,
  contentType: 'message' | 'memory' | 'document',
  options?: { chunkSize?: number; overlap?: number; model?: embeddings.EmbeddingModel }
) => {
  return await vectorStore.rebuildSemanticIndex(db, contentType, options);
};

export const embeddingsGetCacheStats = (db: Database) => {
  return vectorStore.getCacheStats(db);
};

export const embeddingsClearRAGCache = (db: Database, olderThan?: number) => {
  return vectorStore.clearRAGCache(db, olderThan);
};

// ============================================================================
// RAG SERVICE HANDLERS
// ============================================================================

export const ragRetrieveContexts = async (
  db: Database,
  query: string,
  options?: rag.RAGOptions
) => {
  return await rag.retrieveContexts(db, query, options);
};

export const ragBuildPrompt = (
  basePrompt: string,
  query: string,
  ragResult: rag.RAGResult,
  options?: { includeRelevanceScores?: boolean; maxContextLength?: number }
) => {
  return rag.buildAugmentedPrompt(basePrompt, query, ragResult, options);
};

export const ragHybridRetrieve = async (
  db: Database,
  query: string,
  options?: rag.RAGOptions & { keywordWeight?: number; vectorWeight?: number }
) => {
  return await rag.hybridRetrieveContexts(db, query, options);
};

export const ragClearCache = (db: Database, olderThan?: number) => {
  return rag.clearCache(db, olderThan);
};

export const ragGetCacheStats = (db: Database) => {
  return rag.getCacheStats(db);
};

export const ragPrefetch = async (db: Database, queries: string[], options?: rag.RAGOptions) => {
  return await rag.prefetchContexts(db, queries, options);
};

export const ragGetStats = (db: Database) => {
  return rag.getRAGStats(db);
};

export const ragUpdateCacheMetadata = (
  db: Database,
  queryHash: string,
  metadata: Record<string, unknown>
) => {
  return rag.updateCacheMetadata(db, queryHash, metadata);
};

export const ragDeleteCacheEntry = (db: Database, query: string) => {
  return rag.deleteCacheEntry(db, query);
};

export const ragExportCache = (db: Database, limit?: number) => {
  return rag.exportCacheEntries(db, limit);
};
