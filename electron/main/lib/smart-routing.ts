/**
 * Smart Model Routing
 *
 * Analyzes user messages and routes them to the appropriate model
 * based on complexity. Simple messages go to a cheap model,
 * complex messages go to the primary model.
 */

export interface SmartRoutingConfig {
  enabled: boolean;
  cheapModelId: string;
  charThreshold: number;
  wordThreshold: number;
  complexKeywords: string[];
}

const DEFAULT_CONFIG: SmartRoutingConfig = {
  enabled: false,
  cheapModelId: '',
  charThreshold: 160,
  wordThreshold: 28,
  complexKeywords: [
    'analyze',
    'compare',
    'evaluate',
    'synthesize',
    'create',
    'design',
    'architect',
    'debug',
    'refactor',
    'optimize',
    'explain',
    'summarize',
    'translate',
    'convert',
    'implement',
    'develop',
    'write',
    'code',
    'program',
    'algorithm',
    'function',
    'class',
    'module',
    'system',
    'architecture',
    'database',
    'security',
    'performance',
  ],
};

export interface RoutingDecision {
  selectedModelId: string;
  reason: string;
  originalModelId: string;
}

/**
 * Analyze a message and determine which model should handle it
 */
export function analyzeAndRoute(
  message: string,
  config: SmartRoutingConfig,
  defaultModelId: string
): RoutingDecision {
  // If routing is disabled, use primary model
  if (!config.enabled || !config.cheapModelId) {
    return {
      selectedModelId: defaultModelId,
      reason: 'Smart routing disabled or no cheap model configured',
      originalModelId: defaultModelId,
    };
  }

  const trimmed = message.trim();

  // Check character threshold
  if (trimmed.length > config.charThreshold) {
    return {
      selectedModelId: defaultModelId,
      reason: `Message exceeds ${config.charThreshold} character threshold (${trimmed.length} chars)`,
      originalModelId: defaultModelId,
    };
  }

  // Check word threshold
  const words = trimmed.split(/\s+/);
  if (words.length > config.wordThreshold) {
    return {
      selectedModelId: defaultModelId,
      reason: `Message exceeds ${config.wordThreshold} word threshold (${words.length} words)`,
      originalModelId: defaultModelId,
    };
  }

  // Check for multi-line content
  if (trimmed.includes('\n')) {
    return {
      selectedModelId: defaultModelId,
      reason: 'Multi-line message detected',
      originalModelId: defaultModelId,
    };
  }

  // Check for code patterns
  if (/```|`[^`]+`|\bfunction\b|\bclass\b|\bdef\b|\bimport\b|\breturn\b/.test(trimmed)) {
    return {
      selectedModelId: defaultModelId,
      reason: 'Code patterns detected in message',
      originalModelId: defaultModelId,
    };
  }

  // Check for URLs
  if (/https?:\/\/\S+/.test(trimmed)) {
    return {
      selectedModelId: defaultModelId,
      reason: 'URL detected in message',
      originalModelId: defaultModelId,
    };
  }

  // Check for complex keywords
  const lowerMessage = trimmed.toLowerCase();
  const foundKeywords = config.complexKeywords.filter((kw) => lowerMessage.includes(kw));
  if (foundKeywords.length > 0) {
    return {
      selectedModelId: defaultModelId,
      reason: `Complex keywords detected: ${foundKeywords.join(', ')}`,
      originalModelId: defaultModelId,
    };
  }

  // Route to cheap model
  return {
    selectedModelId: config.cheapModelId,
    reason: 'Simple message routed to cheap model',
    originalModelId: defaultModelId,
  };
}

export function getDefaultSmartRoutingConfig(): SmartRoutingConfig {
  return { ...DEFAULT_CONFIG };
}
