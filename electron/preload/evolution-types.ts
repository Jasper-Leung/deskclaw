/**
 * Evolution Types for Preload
 *
 * These types are specifically for the preload context where
 * we need to reference them without the full database context.
 */

import type {
  EvolutionSuggestion,
  EvolutionMetrics,
  UsagePattern,
  PredictedTask,
  DeliveredContent,
  LearningInsights,
  TimeOfDay,
  ContentSource,
  EventContext,
  EventType,
  SuggestedAction,
} from '../../shared/types/evolution.js';

// Evolution API interface
export interface EvolutionAPI {
  // Analytics
  trackEvent: (type: EventType, context: EventContext) => Promise<{ success: boolean }>;
  getMetrics: () => Promise<EvolutionMetrics | null>;
  getPatterns: (timeRange?: number) => Promise<UsagePattern[]>;
  getSuggestions: () => Promise<EvolutionSuggestion[]>;
  dismissSuggestion: (id: string) => Promise<{ success: boolean }>;
  applySuggestion: (id: string, actions: SuggestedAction[]) => Promise<{ success: boolean }>;

  // Proactive Content
  getPredictedTasks: () => Promise<PredictedTask[]>;
  getDeliveries: (limit?: number) => Promise<DeliveredContent[]>;
  togglePredictedTask: (id: string, enabled: boolean) => Promise<{ success: boolean }>;
  deletePredictedTask: (id: string) => Promise<{ success: boolean }>;
  provideDeliveryFeedback: (
    id: string,
    feedback: 'positive' | 'negative'
  ) => Promise<{ success: boolean }>;
  triggerDelivery: (taskId: string) => Promise<{ success: boolean }>;
  generatePredictions: () => Promise<PredictedTask[]>;
  getLearningInsights: () => Promise<LearningInsights | null>;

  // Listen for proactive content deliveries
  onContentDelivery: (
    callback: (data: { type: string; title: string; content: string; actions?: unknown[] }) => void
  ) => () => void;
}

// Re-export types for convenience
export type {
  EvolutionSuggestion,
  EvolutionMetrics,
  UsagePattern,
  PredictedTask,
  DeliveredContent,
  LearningInsights,
  TimeOfDay,
  ContentSource,
  EventContext,
  EventType,
  SuggestedAction,
};
