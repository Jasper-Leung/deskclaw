/**
 * Memory Evaluator Service
 * Intelligently evaluates whether content should be saved as memory
 */

import type { Database } from 'better-sqlite3';

export type MemoryType =
  | 'fact'
  | 'preference'
  | 'task'
  | 'relationship'
  | 'decision'
  | 'skill'
  | 'event';

export interface MemoryEvaluationResult {
  shouldSave: boolean;
  confidence: number; // 0-1
  reason: string;
  suggestedImportance: number; // 0-1
  memoryType: MemoryType;
  extractedContent?: string; // Processed/summarized content
  metadata?: Record<string, unknown>;
}

export interface EvaluationContext {
  agentId: string;
  role: 'user' | 'assistant' | 'system';
  conversationLength: number;
  timeSinceLastMemory: number; // milliseconds
  recentMemoryCount: number;
  totalMemoryCount: number;
}

/**
 * Content pattern indicators for different memory types
 */
const MEMORY_PATTERNS = {
  fact: {
    indicators: [
      /\b(is|are|was|were)\s+(a|an|the)?\s*\w+/i,
      /\b(meaning|definition|refers to|means that)\b/i,
      /\b(remember|note|keep in mind)\b.*that\b/i,
      /\b(data|information|statistics|number)\b/i,
    ],
    importanceBoost: 0.1,
  },
  preference: {
    indicators: [
      /\b(I prefer|I like|I dislike|I hate|I love)\b/i,
      /\b(prefer|want|wish|desire)\b/i,
      /\b(don't|do not)\s+(like|want|need)\b/i,
      /\b(my\s+(favorite|preference|choice))\b/i,
    ],
    importanceBoost: 0.2,
  },
  task: {
    indicators: [
      /\b(to do|task|reminder|remember to)\b/i,
      /\b(need to|have to|must)\s+\w+/i,
      /\b(finish|complete|accomplish)\b/i,
      /\b(schedule|plan|agenda)\b/i,
    ],
    importanceBoost: 0.15,
  },
  relationship: {
    indicators: [
      /\b(my\s+(friend|colleague|boss|partner|family|mother|father|sister|brother))\b/i,
      /\b(works with|reports to|manages)\b/i,
      /\b(colleague|teammate|supervisor)\b/i,
    ],
    importanceBoost: 0.25,
  },
  decision: {
    indicators: [
      /\b(decided|chose|selected|agreed)\b/i,
      /\b(decision|choice|conclusion)\b/i,
      /\b(final|settled|determined)\b/i,
    ],
    importanceBoost: 0.2,
  },
  skill: {
    indicators: [
      /\b(can|knows how to|able to)\s+\w+/i,
      /\b(experienced in|skilled at|expert)\b/i,
      /\b(learned|mastered|practiced)\b/i,
      /\b(programming|coding|development|design|writing)\b/i,
    ],
    importanceBoost: 0.15,
  },
  event: {
    indicators: [
      /\b(yesterday|today|tomorrow|last week|next week)\b/i,
      /\b(meeting|call|conference|presentation)\b/i,
      /\b(happened|occurred|took place)\b/i,
    ],
    importanceBoost: 0.1,
  },
};

/**
 * Patterns that indicate content should NOT be saved
 */
const EXCLUSION_PATTERNS = [
  /^hello|^hi|^hey|^good morning|^good afternoon|^good evening/i, // Greetings
  /^(yes|no|ok|okay|sure|alright|thanks|thank you)$/i, // Simple responses
  /^\s*$/, // Empty
  /^(what|how|why|when|where|who)\s+(is|are|was|were)\b/i, // Questions (unless followed by facts)
  /^[\p{Emoji}]+$/u, // Only emojis
];

/**
 * Minimum content requirements
 */
const CONTENT_REQUIREMENTS = {
  minLength: 15, // Minimum characters
  maxLength: 2000, // Maximum characters for a single memory
  minWords: 3, // Minimum words
  maxWords: 300, // Maximum words
  minInformationDensity: 0.3, // Ratio of unique words to total words
};

/**
 * Evaluate content to determine if it should be saved as memory
 */
export function evaluateContentForMemory(
  db: Database,
  content: string,
  context: EvaluationContext
): MemoryEvaluationResult {
  // Check basic content requirements
  const contentCheck = checkContentRequirements(content);
  if (!contentCheck.passed) {
    return {
      shouldSave: false,
      confidence: 0.9,
      reason: contentCheck.reason || 'Content does not meet requirements',
      suggestedImportance: 0,
      memoryType: 'fact',
    };
  }

  // Check exclusion patterns
  const exclusionCheck = checkExclusionPatterns(content, context);
  if (exclusionCheck.shouldExclude) {
    return {
      shouldSave: false,
      confidence: exclusionCheck.confidence,
      reason: exclusionCheck.reason,
      suggestedImportance: 0,
      memoryType: 'fact',
    };
  }

  // Detect memory type and calculate base importance
  const typeDetection = detectMemoryType(content);
  const baseImportance = calculateBaseImportance(content, context, typeDetection);

  // Check for duplicates (basic check, will be enhanced by deduplication service)
  const duplicateCheck = checkForBasicDuplicates(db, context.agentId, content);

  if (duplicateCheck.isDuplicate) {
    return {
      shouldSave: false,
      confidence: 0.85,
      reason: `Similar memory already exists: "${duplicateCheck.existingContent?.substring(0, 50)}..."`,
      suggestedImportance: 0,
      memoryType: typeDetection.type,
    };
  }

  // Check memory density (avoid saving too many memories too quickly)
  const densityCheck = checkMemoryDensity(context);
  if (!densityCheck.shouldSave) {
    return {
      shouldSave: false,
      confidence: 0.7,
      reason: densityCheck.reason || 'Memory density too high',
      suggestedImportance: baseImportance,
      memoryType: typeDetection.type,
    };
  }

  // Extract and optimize content
  const extractedContent = extractAndOptimizeContent(content, typeDetection);

  // Calculate final importance
  const finalImportance = Math.min(1.0, baseImportance + typeDetection.importanceBoost);

  return {
    shouldSave: true,
    confidence: calculateConfidence(content, context),
    reason: `Identified as ${typeDetection.type} with relevance score`,
    suggestedImportance: finalImportance,
    memoryType: typeDetection.type,
    extractedContent,
    metadata: {
      originalLength: content.length,
      extractedLength: extractedContent.length,
      role: context.role,
      detectedIndicators: typeDetection.matchedIndicators,
    },
  };
}

/**
 * Check if content meets basic requirements
 */
function checkContentRequirements(content: string): { passed: boolean; reason?: string } {
  const trimmed = content.trim();
  const words = trimmed.split(/\s+/).filter((w) => w.length > 0);

  if (trimmed.length < CONTENT_REQUIREMENTS.minLength) {
    return {
      passed: false,
      reason: `Content too short (${trimmed.length} < ${CONTENT_REQUIREMENTS.minLength} chars)`,
    };
  }

  if (trimmed.length > CONTENT_REQUIREMENTS.maxLength) {
    return {
      passed: false,
      reason: `Content too long (${trimmed.length} > ${CONTENT_REQUIREMENTS.maxLength} chars)`,
    };
  }

  if (words.length < CONTENT_REQUIREMENTS.minWords) {
    return {
      passed: false,
      reason: `Too few words (${words.length} < ${CONTENT_REQUIREMENTS.minWords})`,
    };
  }

  if (words.length > CONTENT_REQUIREMENTS.maxWords) {
    return {
      passed: false,
      reason: `Too many words (${words.length} > ${CONTENT_REQUIREMENTS.maxWords})`,
    };
  }

  // Check information density
  const uniqueWords = new Set(words.map((w) => w.toLowerCase()));
  const density = uniqueWords.size / words.length;
  if (density < CONTENT_REQUIREMENTS.minInformationDensity) {
    return { passed: false, reason: `Low information density (${(density * 100).toFixed(1)}%)` };
  }

  return { passed: true };
}

/**
 * Check exclusion patterns
 */
function checkExclusionPatterns(
  content: string,
  context: EvaluationContext
): { shouldExclude: boolean; confidence: number; reason: string } {
  const trimmed = content.trim();

  // Check against exclusion patterns
  for (const pattern of EXCLUSION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        shouldExclude: true,
        confidence: 0.8,
        reason: 'Content matches exclusion pattern (greeting, simple response, etc.)',
      };
    }
  }

  // Assistant messages should be more selective
  if (context.role === 'assistant') {
    // Generic assistant responses
    if (/^(I understand|I see|Got it|Alright|Okay, I)/i.test(trimmed)) {
      return {
        shouldExclude: true,
        confidence: 0.7,
        reason: 'Generic assistant acknowledgment',
      };
    }
  }

  // User questions without answers (no value for memory)
  if (context.role === 'user') {
    if (/\?$/.test(trimmed) && trimmed.split(/\s+/).length < 10) {
      return {
        shouldExclude: true,
        confidence: 0.6,
        reason: 'Short question without contextual value',
      };
    }
  }

  return { shouldExclude: false, confidence: 0, reason: '' };
}

/**
 * Detect memory type based on content patterns
 */
function detectMemoryType(content: string): {
  type: MemoryType;
  confidence: number;
  importanceBoost: number;
  matchedIndicators: string[];
} {
  const scores: Record<MemoryType, { score: number; patterns: string[] }> = {
    fact: { score: 0, patterns: [] },
    preference: { score: 0, patterns: [] },
    task: { score: 0, patterns: [] },
    relationship: { score: 0, patterns: [] },
    decision: { score: 0, patterns: [] },
    skill: { score: 0, patterns: [] },
    event: { score: 0, patterns: [] },
  };

  // Check each pattern
  for (const entry of Object.entries(MEMORY_PATTERNS)) {
    const type = entry[0] as MemoryType;
    const config = entry[1] as (typeof MEMORY_PATTERNS)[MemoryType];
    for (const pattern of config.indicators) {
      if (pattern.test(content)) {
        scores[type].score++;
        scores[type].patterns.push(pattern.source);
      }
    }
  }

  // Find highest scoring type
  let bestType: MemoryType = 'fact';
  let bestScore = 0;

  for (const [type, result] of Object.entries(scores)) {
    if (result.score > bestScore) {
      bestScore = result.score;
      bestType = type as MemoryType;
    }
  }

  const config = MEMORY_PATTERNS[bestType];
  const confidence = Math.min(1.0, bestScore / 2); // Normalize to 0-1

  return {
    type: bestType,
    confidence,
    importanceBoost: bestScore > 0 ? config.importanceBoost : 0,
    matchedIndicators: scores[bestType].patterns,
  };
}

/**
 * Calculate base importance score
 */
function calculateBaseImportance(
  content: string,
  context: EvaluationContext,
  typeDetection: { type: MemoryType; confidence: number }
): number {
  let importance = 0.3; // Base importance

  // Content length factor (optimal length: 100-500 chars)
  const length = content.length;
  if (length >= 100 && length <= 500) {
    importance += 0.1;
  } else if (length > 500 && length <= 1000) {
    importance += 0.05;
  }

  // Conversation context
  if (context.conversationLength > 5) {
    importance += 0.05; // More context = potentially more important
  }

  // Time since last memory (avoid saving too frequently)
  const daysSinceLastMemory = context.timeSinceLastMemory / (24 * 60 * 60 * 1000);
  if (daysSinceLastMemory > 1) {
    importance += 0.1;
  } else if (daysSinceLastMemory < 0.01) {
    // Less than 15 minutes
    importance -= 0.1;
  }

  // Role-based adjustments
  if (context.role === 'user') {
    importance += 0.1; // User statements are typically more important
  } else if (context.role === 'assistant') {
    importance -= 0.05; // Assistant responses need to be more selective
  }

  // Type detection confidence
  importance += typeDetection.confidence * 0.15;

  return Math.max(0.1, Math.min(0.9, importance));
}

/**
 * Check for basic duplicates (exact/near-exact matches)
 */
function checkForBasicDuplicates(
  db: Database,
  agentId: string,
  content: string
): { isDuplicate: boolean; existingContent?: string } {
  const normalizedContent = content.toLowerCase().trim();

  // Check for exact matches
  const exactMatch = db
    .prepare('SELECT content FROM memories WHERE agent_id = ? AND LOWER(content) = ?')
    .get(agentId, normalizedContent) as { content: string } | undefined;

  if (exactMatch) {
    return { isDuplicate: true, existingContent: exactMatch.content };
  }

  // Check for near-exact matches (80% similarity)
  const recentMemories = db
    .prepare(
      `SELECT content FROM memories
       WHERE agent_id = ?
       ORDER BY created_at DESC
       LIMIT 20`
    )
    .all(agentId) as Array<{ content: string }>;

  for (const memory of recentMemories) {
    const similarity = calculateStringSimilarity(normalizedContent, memory.content.toLowerCase());
    if (similarity > 0.8) {
      return { isDuplicate: true, existingContent: memory.content };
    }
  }

  return { isDuplicate: false };
}

/**
 * Check memory density (avoid saving too many similar memories)
 */
function checkMemoryDensity(context: EvaluationContext): { shouldSave: boolean; reason?: string } {
  const { recentMemoryCount, totalMemoryCount, timeSinceLastMemory } = context;

  // If we have many recent memories, be more selective
  if (recentMemoryCount > 10) {
    return {
      shouldSave: false,
      reason: `Too many recent memories (${recentMemoryCount}). Waiting to consolidate.`,
    };
  }

  // If we just saved a memory very recently, be more selective
  const minutesSinceLastMemory = timeSinceLastMemory / (60 * 1000);
  if (minutesSinceLastMemory < 5 && recentMemoryCount > 3) {
    return {
      shouldSave: false,
      reason: 'Memory saved very recently. Avoiding rapid-fire memory creation.',
    };
  }

  return { shouldSave: true };
}

/**
 * Extract and optimize content for memory storage
 */
function extractAndOptimizeContent(content: string, typeDetection: { type: MemoryType }): string {
  let optimized = content.trim();

  // Remove filler phrases
  optimized = optimized
    .replace(/^(I think|I believe|I feel|In my opinion)\s*,?\s*/gi, '')
    .replace(/^(Basically|Essentially|Fundamentally)\s*,?\s*/gi, '')
    .replace(/\s+(you know|I mean|like|you see)\s+/gi, ' ');

  // Normalize whitespace
  optimized = optimized.replace(/\s+/g, ' ').trim();

  // For long content, try to extract the most important sentence
  if (optimized.length > 500) {
    const sentences = optimized.match(/[^.!?]+[.!?]+/g) || [optimized];

    // Prioritize sentences with key indicators
    const keySentences = sentences.filter((s) => {
      const lower = s.toLowerCase();
      return (
        lower.includes('remember') ||
        lower.includes('important') ||
        lower.includes('note that') ||
        lower.includes('prefer') ||
        lower.includes('decided')
      );
    });

    if (keySentences.length > 0) {
      optimized = keySentences[0].trim();
    } else {
      // Take the first meaningful sentence
      optimized = sentences[0].trim();
    }
  }

  return optimized;
}

/**
 * Calculate confidence in the evaluation
 */
function calculateConfidence(content: string, context: EvaluationContext): number {
  let confidence = 0.5;

  // Stronger confidence for clear patterns
  const words = content.split(/\s+/);
  if (words.length >= 10 && words.length <= 50) {
    confidence += 0.2;
  }

  // Stronger confidence for user input
  if (context.role === 'user') {
    confidence += 0.1;
  }

  // Weaker confidence for very long or very short content
  if (words.length < 5 || words.length > 100) {
    confidence -= 0.15;
  }

  return Math.max(0.1, Math.min(0.95, confidence));
}

/**
 * Calculate string similarity (Levenshtein-based)
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;

  if (len1 === 0) return len2 === 0 ? 1 : 0;
  if (len2 === 0) return 0;

  const matrix: number[][] = Array(len1 + 1)
    .fill(null)
    .map(() => Array(len2 + 1).fill(0));

  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);
  return 1 - distance / maxLen;
}

/**
 * Batch evaluate multiple messages
 */
export function evaluateBatchForMemory(
  db: Database,
  messages: Array<{ role: string; content: string }>,
  agentId: string
): Array<{ message: string; result: MemoryEvaluationResult }> {
  const results: Array<{ message: string; result: MemoryEvaluationResult }> = [];

  // Get context
  const lastMemory = db
    .prepare('SELECT created_at FROM memories WHERE agent_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(agentId) as { created_at: number } | undefined;

  const timeSinceLastMemory = lastMemory ? Date.now() - lastMemory.created_at : Infinity;
  const totalMemoryCount =
    (
      db.prepare('SELECT COUNT(*) as count FROM memories WHERE agent_id = ?').get(agentId) as {
        count: number;
      }
    ).count || 0;

  const recentMemoryCount =
    (
      db
        .prepare('SELECT COUNT(*) as count FROM memories WHERE agent_id = ? AND created_at > ?')
        .get(agentId, Date.now() - 24 * 60 * 60 * 1000) as { count: number }
    ).count || 0;

  for (const message of messages) {
    const context: EvaluationContext = {
      agentId,
      role: message.role as 'user' | 'assistant' | 'system',
      conversationLength: messages.length,
      timeSinceLastMemory,
      recentMemoryCount,
      totalMemoryCount,
    };

    const result = evaluateContentForMemory(db, message.content, context);
    results.push({ message: message.content, result });
  }

  return results;
}
