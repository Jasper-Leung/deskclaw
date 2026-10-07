/**
 * Usage & Cost Tracking
 *
 * Tracks LLM token usage and costs per model. Stores records in the database
 * and provides aggregate statistics.
 */

import Database from 'better-sqlite3';
import { getDatabase } from '../db/index.js';
import { createLogger } from './logger.js';

const usageLogger = createLogger('usage-tracker');

// Pricing per million tokens (USD). Extend as needed.
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
  'gpt-4': { input: 30.0, output: 60.0 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  // Anthropic
  'claude-3-opus': { input: 15.0, output: 75.0 },
  'claude-3-sonnet': { input: 3.0, output: 15.0 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },
  'claude-3-5-sonnet': { input: 3.0, output: 15.0 },
  'claude-3-5-haiku': { input: 0.8, output: 4.0 },
  // Google
  'gemini-pro': { input: 0.5, output: 1.5 },
  'gemini-flash': { input: 0.075, output: 0.3 },
  // DeepSeek
  'deepseek-chat': { input: 0.14, output: 0.28 },
  'deepseek-reasoner': { input: 0.55, output: 2.19 },
};

export interface UsageRecord {
  id: string;
  sessionId?: string;
  modelId: string;
  providerProtocol: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  timestamp: number;
}

export interface UsageStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  totalRequests: number;
  byModel: Record<
    string,
    { inputTokens: number; outputTokens: number; cost: number; requests: number }
  >;
  byDay: Array<{ date: string; inputTokens: number; outputTokens: number; cost: number }>;
}

/**
 * Initialize usage tracking table
 */
export function initUsageTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS llm_usage (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      model_id TEXT NOT NULL,
      provider_protocol TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      timestamp INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_llm_usage_model ON llm_usage(model_id);
    CREATE INDEX IF NOT EXISTS idx_llm_usage_timestamp ON llm_usage(timestamp);
    CREATE INDEX IF NOT EXISTS idx_llm_usage_session ON llm_usage(session_id);
  `);
}

/**
 * Get pricing for a model
 */
export function getModelPricing(modelId: string): { input: number; output: number } {
  const normalized = modelId.toLowerCase();
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return pricing;
    }
  }
  // Default: assume mid-range pricing
  return { input: 3.0, output: 15.0 };
}

/**
 * Calculate cost for a request
 */
export function calculateCost(modelId: string, inputTokens: number, outputTokens: number): number {
  const pricing = getModelPricing(modelId);
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

/**
 * Record a usage entry
 */
export function recordUsage(
  db: Database.Database,
  entry: {
    id: string;
    sessionId?: string;
    modelId: string;
    providerProtocol: string;
    inputTokens: number;
    outputTokens: number;
  }
): void {
  const costUsd = calculateCost(entry.modelId, entry.inputTokens, entry.outputTokens);

  try {
    db.prepare(
      `INSERT INTO llm_usage (id, session_id, model_id, provider_protocol, input_tokens, output_tokens, cost_usd, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      entry.id,
      entry.sessionId || null,
      entry.modelId,
      entry.providerProtocol,
      entry.inputTokens,
      entry.outputTokens,
      costUsd,
      Date.now()
    );
  } catch (error) {
    usageLogger.debug('Failed to record usage:', error);
  }
}

/**
 * Get usage statistics
 */
export function getUsageStats(
  db: Database.Database,
  options?: { since?: number; until?: number; sessionId?: string }
): UsageStats {
  let whereClause = '1=1';
  const params: any[] = [];

  if (options?.since) {
    whereClause += ' AND timestamp >= ?';
    params.push(options.since);
  }
  if (options?.until) {
    whereClause += ' AND timestamp <= ?';
    params.push(options.until);
  }
  if (options?.sessionId) {
    whereClause += ' AND session_id = ?';
    params.push(options.sessionId);
  }

  // Overall totals
  const totals = db
    .prepare(
      `SELECT
       COALESCE(SUM(input_tokens), 0) as totalInputTokens,
       COALESCE(SUM(output_tokens), 0) as totalOutputTokens,
       COALESCE(SUM(cost_usd), 0) as totalCost,
       COUNT(*) as totalRequests
     FROM llm_usage WHERE ${whereClause}`
    )
    .get(...params) as any;

  // Per-model breakdown
  const modelRows = db
    .prepare(
      `SELECT model_id,
       SUM(input_tokens) as inputTokens,
       SUM(output_tokens) as outputTokens,
       SUM(cost_usd) as cost,
       COUNT(*) as requests
     FROM llm_usage WHERE ${whereClause}
     GROUP BY model_id
     ORDER BY cost DESC`
    )
    .all(...params) as any[];

  const byModel: Record<string, any> = {};
  for (const row of modelRows) {
    byModel[row.model_id] = {
      inputTokens: row.inputTokens || 0,
      outputTokens: row.outputTokens || 0,
      cost: row.cost || 0,
      requests: row.requests || 0,
    };
  }

  // Daily breakdown (last 30 days)
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const dailyRows = db
    .prepare(
      `SELECT
       date(timestamp / 1000, 'unixepoch') as date,
       SUM(input_tokens) as inputTokens,
       SUM(output_tokens) as outputTokens,
       SUM(cost_usd) as cost
     FROM llm_usage
     WHERE ${whereClause} AND timestamp >= ?
     GROUP BY date
     ORDER BY date DESC`
    )
    .all(...params, thirtyDaysAgo) as any[];

  return {
    totalInputTokens: totals?.totalInputTokens || 0,
    totalOutputTokens: totals?.totalOutputTokens || 0,
    totalCost: totals?.totalCost || 0,
    totalRequests: totals?.totalRequests || 0,
    byModel,
    byDay: dailyRows.map((r) => ({
      date: r.date,
      inputTokens: r.inputTokens || 0,
      outputTokens: r.outputTokens || 0,
      cost: r.cost || 0,
    })),
  };
}

/**
 * Get usage for a specific session
 */
export function getSessionUsage(db: Database.Database, sessionId: string): UsageStats {
  return getUsageStats(db, { sessionId });
}
