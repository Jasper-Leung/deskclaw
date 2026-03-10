/**
 * Evolution and Proactive Content Types
 *
 * Shared types for the evolution system.
 */

// ============================================================================
// Evolution Analytics Types
// ============================================================================

export type EventType =
  | 'click'
  | 'command'
  | 'workflow_execution'
  | 'chat_message'
  | 'agent_creation'
  | 'tool_execution'
  | 'error'
  | 'page_view';

export interface EventContext {
  elementId?: string;
  elementType?: string;
  command?: string;
  args?: Record<string, unknown>;
  workflowId?: string;
  workflowName?: string;
  executionTime?: number;
  success?: boolean;
  agentId?: string;
  modelId?: string;
  messageLength?: number;
  errorType?: string;
  errorMessage?: string;
  page?: string;
  duration?: number;
  [key: string]: unknown;
}

// ============================================================================
// Evolution Suggestions Types
// ============================================================================

export interface EvolutionSuggestion {
  id: string;
  type: 'optimization' | 'suggestion' | 'automation' | 'warning' | 'opportunity';
  title: string;
  description: string;
  priority: number;
  actionable: boolean;
  suggestedActions?: SuggestedAction[];
  estimatedImpact?: string;
  confidence: number;
  metadata?: Record<string, unknown>;
}

export interface SuggestedAction {
  type: 'workflow' | 'setting' | 'automation';
  description: string;
  parameters?: Record<string, unknown>;
  estimatedImpact?: string;
}

// ============================================================================
// Evolution Metrics Types
// ============================================================================

export interface EvolutionMetrics {
  totalEvents: number;
  eventsByType: Record<string, number>;
  topPatterns: Array<{
    type: string;
    description: string;
    confidence: number;
  }>;
  insightCount: number;
}

// ============================================================================
// Proactive Content Types
// ============================================================================

export interface UserIntent {
  id: string;
  type: 'information' | 'task' | 'monitoring' | 'recommendation';
  topic: string;
  keywords: string[];
  confidence: number;
  frequency: 'realtime' | 'hourly' | 'daily' | 'weekly';
  preferredTime?: TimeOfDay;
  sources: ContentSource[];
  lastMatched: number;
  timesMatched: number;
}

export interface TimeOfDay {
  hour: number;
  minute: number;
  timezone?: string;
}

export interface ContentSource {
  type: 'web' | 'api' | 'workflow' | 'agent';
  config: Record<string, unknown>;
  priority: number;
}

export interface PredictedTask {
  id: string;
  intentId: string;
  name: string;
  description: string;
  cronExpression: string;
  taskType: 'prompt' | 'workflow' | 'reminder';
  taskConfig: Record<string, unknown>;
  estimatedValue: number;
  enabled: boolean;
  topic?: string;
  preferredTime?: TimeOfDay;
  nextRun?: string;
  lastRun?: string;
}

export interface DeliveredContent {
  id: string;
  taskId: string;
  type: 'notification' | 'chat_message' | 'dashboard_update' | 'email';
  title: string;
  body: string;
  data?: Record<string, unknown>;
  actions?: ContentAction[];
  timestamp: number;
  delivered: boolean;
  viewed: boolean;
  feedback?: 'positive' | 'neutral' | 'negative';
}

export interface ContentAction {
  label: string;
  type: 'open' | 'reply' | 'dismiss' | 'snooze';
  parameters?: Record<string, unknown>;
}

// ============================================================================
// Learning Insights Types
// ============================================================================

export interface LearningInsights {
  totalIntents: number;
  highConfidenceIntents: number;
  topIntents: Array<{
    type: string;
    topic: string;
    confidence: number;
    frequency: string;
    timesDetected: number;
    preferredTime?: string;
  }>;
}

// ============================================================================
// Pattern Types
// ============================================================================

export interface UsagePattern {
  id: string;
  type: 'sequence' | 'frequency' | 'correlation';
  description: string;
  confidence: number;
  occurrences: number;
  lastOccurrence: number;
  data: PatternData;
}

export interface PatternData {
  sequence?: string[];
  frequency?: Record<string, number>;
  correlation?: Record<string, number>;
  timePatterns?: Array<{
    hourOfDay: number;
    dayOfWeek: number;
  }>;
}
