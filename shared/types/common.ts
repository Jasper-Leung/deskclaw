/**
 * Common Type Definitions
 *
 * This module provides shared type definitions to reduce usage of `any` type.
 */

// Database query result types
export interface DatabaseRow {
  [key: string]: string | number | boolean | null | undefined;
}

// Error types
export interface AppError extends Error {
  code?: string;
  statusCode?: number;
  details?: unknown;
}

export interface DatabaseError extends AppError {
  code: string;
}

// Configuration types
export interface ProviderConfig {
  id: string;
  name: string;
  protocol: 'openai' | 'anthropic' | 'ollama' | 'custom';
  baseUrl?: string;
  apiKey?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ModelConfig {
  id: string;
  providerId: string;
  modelId: string;
  displayName?: string;
  isCustom: boolean;
  createdAt: number;
}

// Channel types
export interface ChannelConfig {
  id: string;
  channelId: string;
  name: string;
  enabled: boolean;
  config: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

// Message types
export interface MessageMetadata {
  timestamp?: number;
  sender?: string;
  channel?: string;
  [key: string]: unknown;
}

// Workflow types
export interface WorkflowNodeData {
  label?: string;
  type?: string;
  config?: Record<string, unknown>;
  [key: string]: unknown;
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Tool execution types
export interface ToolExecutionContext {
  sessionId?: string;
  agentId?: string;
  userId?: string;
  [key: string]: unknown;
}

export interface ToolExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
  duration?: number;
}

// Scheduled task types
export interface ScheduledTaskConfig {
  workflowId?: string;
  toolName?: string;
  toolParams?: Record<string, unknown>;
  command?: string;
  prompt?: string;
  modelId?: string;
  message?: string;
  skillId?: string;
  skillInput?: Record<string, unknown>;
  skillAutoMatch?: boolean;
}

// Memory types
export interface MemoryMetadata {
  source?: string;
  importance?: number;
  tags?: string[];
  [key: string]: unknown;
}

// Generic key-value pair type
export interface KeyValuePair<T = unknown> {
  key: string;
  value: T;
}

// Type guards
export function isAppError(error: unknown): error is AppError {
  return error instanceof Error && 'code' in error && typeof (error as AppError).code === 'string';
}

export function isDatabaseRow(obj: unknown): obj is DatabaseRow {
  return typeof obj === 'object' && obj !== null && !Array.isArray(obj);
}
