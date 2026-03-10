/**
 * Memory Deduplication Service
 * Uses semantic similarity to prevent duplicate memories
 */

import type { Database } from 'better-sqlite3';
import * as embeddings from '../embeddings/service.js';

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  similarity: number;
  similarMemories: Array<{
    id: string;
    content: string;
    similarity: number;
    importance: number;
  }>;
  reason: string;
}

export interface DeduplicationOptions {
  similarityThreshold?: number; // Default: 0.85
  checkCount?: number; // Number of recent memories to check
  useSemanticSearch?: boolean; // Use embeddings for comparison
}

/**
 * Check for duplicate or near-duplicate memories using semantic similarity
 */
export async function checkForDuplicateMemories(
  db: Database,
  agentId: string,
  content: string,
  options: DeduplicationOptions = {}
): Promise<DuplicateCheckResult> {
  const { similarityThreshold = 0.85, checkCount = 50, useSemanticSearch = true } = options;

  // Get recent memories to check against
  const memories = db
    .prepare(
      `SELECT id, content, importance, created_at
       FROM memories
       WHERE agent_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(agentId, checkCount) as Array<{
    id: string;
    content: string;
    importance: number;
    created_at: number;
  }>;

  if (memories.length === 0) {
    return {
      isDuplicate: false,
      similarity: 0,
      similarMemories: [],
      reason: 'No existing memories to compare against',
    };
  }

  // Generate embedding for new content
  const contentEmbedding = await embeddings.generateEmbedding(content);

  // Calculate similarity for each memory
  const similarMemories: DuplicateCheckResult['similarMemories'] = [];

  for (const memory of memories) {
    let memoryEmbedding: number[];

    if (useSemanticSearch) {
      // Try to get cached embedding
      const cached = db
        .prepare('SELECT embedding FROM semantic_index WHERE content_id = ? AND content_type = ?')
        .get(memory.id, 'memory') as { embedding: string } | undefined;

      if (cached) {
        memoryEmbedding = cached.embedding.split(',').map(Number);
      } else {
        // Generate and cache embedding
        memoryEmbedding = await embeddings.generateEmbedding(memory.content);
        await embeddings.generateSemanticIndexEmbedding(db, 'memory', memory.id, memory.content);
      }
    } else {
      // Generate on-the-fly without caching
      memoryEmbedding = await embeddings.generateEmbedding(memory.content);
    }

    const similarity = embeddings.cosineSimilarity(contentEmbedding, memoryEmbedding);

    if (similarity >= similarityThreshold * 0.5) {
      // Include memories with similarity >= 50% of threshold for context
      similarMemories.push({
        id: memory.id,
        content: memory.content,
        similarity,
        importance: memory.importance,
      });
    }
  }

  // Sort by similarity (highest first)
  similarMemories.sort((a, b) => b.similarity - a.similarity);

  // Check if we have a duplicate
  const highestSimilarity = similarMemories.length > 0 ? similarMemories[0].similarity : 0;
  const isDuplicate = highestSimilarity >= similarityThreshold;

  let reason = '';
  if (isDuplicate) {
    const duplicate = similarMemories[0];
    reason = `Duplicate found with ${(duplicate.similarity * 100).toFixed(1)}% similarity: "${duplicate.content.substring(0, 100)}..."`;
  } else if (similarMemories.length > 0) {
    reason = `Found ${similarMemories.length} similar memories, but none above ${(similarityThreshold * 100).toFixed(0)}% threshold`;
  } else {
    reason = 'No similar memories found';
  }

  return {
    isDuplicate,
    similarity: highestSimilarity,
    similarMemories,
    reason,
  };
}

/**
 * Find and merge duplicate memories
 */
export async function findAndMergeDuplicateMemories(
  db: Database,
  agentId: string,
  options: {
    similarityThreshold?: number;
    mergeStrategy?: 'highest_importance' | 'most_recent' | 'combined';
  } = {}
): Promise<{ merged: number; duplicatesFound: number }> {
  const { similarityThreshold = 0.9, mergeStrategy = 'highest_importance' } = options;

  // Get all memories for the agent
  const memories = db
    .prepare(
      `SELECT id, content, importance, created_at
       FROM memories
       WHERE agent_id = ?
       ORDER BY created_at ASC`
    )
    .all(agentId) as Array<{
    id: string;
    content: string;
    importance: number;
    created_at: number;
  }>;

  const duplicateGroups: Array<
    Array<{ id: string; content: string; importance: number; created_at: number }>
  > = [];
  const processedIds = new Set<string>();

  // Generate embeddings for all memories
  const memoryEmbeddings = new Map<string, number[]>();
  for (const memory of memories) {
    const cached = db
      .prepare('SELECT embedding FROM semantic_index WHERE content_id = ? AND content_type = ?')
      .get(memory.id, 'memory') as { embedding: string } | undefined;

    if (cached) {
      memoryEmbeddings.set(memory.id, cached.embedding.split(',').map(Number));
    } else {
      const embedding = await embeddings.generateEmbedding(memory.content);
      await embeddings.generateSemanticIndexEmbedding(db, 'memory', memory.id, memory.content);
      memoryEmbeddings.set(memory.id, embedding);
    }
  }

  // Find duplicate groups
  for (let i = 0; i < memories.length; i++) {
    if (processedIds.has(memories[i].id)) continue;

    const group = [memories[i]];
    const embedding1 = memoryEmbeddings.get(memories[i].id)!;

    for (let j = i + 1; j < memories.length; j++) {
      if (processedIds.has(memories[j].id)) continue;

      const embedding2 = memoryEmbeddings.get(memories[j].id)!;
      const similarity = embeddings.cosineSimilarity(embedding1, embedding2);

      if (similarity >= similarityThreshold) {
        group.push(memories[j]);
        processedIds.add(memories[j].id);
      }
    }

    if (group.length > 1) {
      duplicateGroups.push(group);
    }

    processedIds.add(memories[i].id);
  }

  // Merge duplicate groups
  let merged = 0;
  for (const group of duplicateGroups) {
    let keeper: (typeof group)[0];
    let toDelete: string[];

    if (mergeStrategy === 'highest_importance') {
      group.sort((a, b) => b.importance - a.importance);
      keeper = group[0];
      toDelete = group.slice(1).map((m) => m.id);
    } else if (mergeStrategy === 'most_recent') {
      group.sort((a, b) => b.created_at - a.created_at);
      keeper = group[0];
      toDelete = group.slice(1).map((m) => m.id);
    } else {
      // Combined: keep the longest, most important one
      group.sort((a, b) => {
        const score1 = a.importance * (a.content.length / 1000);
        const score2 = b.importance * (b.content.length / 1000);
        return score2 - score1;
      });
      keeper = group[0];
      toDelete = group.slice(1).map((m) => m.id);
    }

    // Delete duplicates
    for (const id of toDelete) {
      db.prepare('DELETE FROM memories WHERE id = ?').run(id);
      // Also delete from semantic index
      db.prepare('DELETE FROM semantic_index WHERE content_id = ? AND content_type = ?').run(
        id,
        'memory'
      );
      merged++;
    }
  }

  return {
    merged,
    duplicatesFound: duplicateGroups.reduce((sum, group) => sum + group.length - 1, 0),
  };
}

/**
 * Get statistics about potential duplicates
 */
export async function getDuplicateStatistics(
  db: Database,
  agentId: string,
  similarityThreshold: number = 0.85
): Promise<{
  totalMemories: number;
  potentialDuplicates: number;
  duplicateGroups: number;
  averageSimilarity: number;
}> {
  const memories = db
    .prepare('SELECT id, content FROM memories WHERE agent_id = ?')
    .all(agentId) as Array<{ id: string; content: string }>;

  const totalMemories = memories.length;
  if (totalMemories < 2) {
    return {
      totalMemories,
      potentialDuplicates: 0,
      duplicateGroups: 0,
      averageSimilarity: 0,
    };
  }

  // Check all pairs for duplicates
  let potentialDuplicates = 0;
  let totalSimilarity = 0;
  let comparisons = 0;

  const memoryEmbeddings = new Map<string, number[]>();
  for (const memory of memories) {
    const cached = db
      .prepare('SELECT embedding FROM semantic_index WHERE content_id = ? AND content_type = ?')
      .get(memory.id, 'memory') as { embedding: string } | undefined;

    if (cached) {
      memoryEmbeddings.set(memory.id, cached.embedding.split(',').map(Number));
    } else {
      const embedding = await embeddings.generateEmbedding(memory.content);
      memoryEmbeddings.set(memory.id, embedding);
    }
  }

  for (let i = 0; i < memories.length; i++) {
    for (let j = i + 1; j < memories.length; j++) {
      const similarity = embeddings.cosineSimilarity(
        memoryEmbeddings.get(memories[i].id)!,
        memoryEmbeddings.get(memories[j].id)!
      );
      totalSimilarity += similarity;
      comparisons++;

      if (similarity >= similarityThreshold) {
        potentialDuplicates++;
      }
    }
  }

  return {
    totalMemories,
    potentialDuplicates,
    duplicateGroups: Math.ceil(potentialDuplicates / 2),
    averageSimilarity: comparisons > 0 ? totalSimilarity / comparisons : 0,
  };
}

/**
 * Suggest memories for manual review (potential duplicates)
 */
export async function suggestDuplicateReview(
  db: Database,
  agentId: string,
  limit: number = 20
): Promise<
  Array<{
    group: string;
    memories: Array<{
      id: string;
      content: string;
      importance: number;
      createdAt: number;
    }>;
    similarity: number;
  }>
> {
  const memories = db
    .prepare(
      `SELECT id, content, importance, created_at
       FROM memories
       WHERE agent_id = ?
       ORDER BY importance DESC, created_at DESC
       LIMIT 100`
    )
    .all(agentId) as Array<{
    id: string;
    content: string;
    importance: number;
    created_at: number;
  }>;

  const groups: Array<{
    group: string;
    memories: Array<{ id: string; content: string; importance: number; createdAt: number }>;
    similarity: number;
  }> = [];
  const processed = new Set<string>();

  const memoryEmbeddings = new Map<string, number[]>();
  for (const memory of memories) {
    const cached = db
      .prepare('SELECT embedding FROM semantic_index WHERE content_id = ? AND content_type = ?')
      .get(memory.id, 'memory') as { embedding: string } | undefined;

    if (cached) {
      memoryEmbeddings.set(memory.id, cached.embedding.split(',').map(Number));
    } else {
      const embedding = await embeddings.generateEmbedding(memory.content);
      memoryEmbeddings.set(memory.id, embedding);
    }
  }

  for (let i = 0; i < memories.length && groups.length < limit; i++) {
    if (processed.has(memories[i].id)) continue;

    const embedding1 = memoryEmbeddings.get(memories[i].id)!;
    const group = [memories[i]];
    let maxSimilarity = 0;

    for (let j = i + 1; j < memories.length; j++) {
      if (processed.has(memories[j].id)) continue;

      const embedding2 = memoryEmbeddings.get(memories[j].id)!;
      const similarity = embeddings.cosineSimilarity(embedding1, embedding2);

      if (similarity >= 0.75) {
        // Lower threshold for review suggestions
        if (similarity > maxSimilarity) maxSimilarity = similarity;
        group.push(memories[j]);
        processed.add(memories[j].id);
      }
    }

    if (group.length > 1) {
      groups.push({
        group: `Group ${groups.length + 1}`,
        memories: group.map((m) => ({
          id: m.id,
          content: m.content,
          importance: m.importance,
          createdAt: m.created_at,
        })),
        similarity: maxSimilarity,
      });
    }

    processed.add(memories[i].id);
  }

  return groups;
}
