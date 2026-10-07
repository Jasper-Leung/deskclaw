/**
 * Sub-Agent Delegation System
 *
 * Allows the main agent to delegate tasks to sub-agents running
 * isolated LLM calls with a subset of tools.
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { getDatabase } from '../db/index.js';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { decrypt } from '../db/index.js';
import { createLogger } from '../lib/logger.js';

const delegationLogger = createLogger('delegation');

export interface DelegationConfig {
  maxConcurrent: number;
  maxDepth: number;
  timeoutMs: number;
}

const DEFAULT_CONFIG: DelegationConfig = {
  maxConcurrent: 3,
  maxDepth: 2,
  timeoutMs: 60000,
};

export interface DelegatedTask {
  prompt: string;
  context?: string;
}

export interface DelegationResult {
  id: string;
  prompt: string;
  result: string;
  success: boolean;
  error?: string;
  durationMs: number;
}

interface ProviderInfo {
  protocol: string;
  baseUrl: string;
  apiKeyEncrypted: string;
  modelId: string;
}

/**
 * Get provider info for a model
 */
function getProviderForModel(db: Database.Database, modelId: string): ProviderInfo {
  const result = db
    .prepare(
      `SELECT p.protocol, p.base_url, p.api_key_encrypted, m.model_id
       FROM models m JOIN providers p ON m.provider_id = p.id
       WHERE m.id = ?`
    )
    .get(modelId) as any;

  if (!result) {
    throw new Error(`Model not found: ${modelId}`);
  }

  return {
    protocol: result.protocol,
    baseUrl: result.base_url,
    apiKeyEncrypted: result.api_key_encrypted,
    modelId: result.model_id,
  };
}

/**
 * Create an AI client from provider info
 */
function createClient(provider: ProviderInfo) {
  const apiKey = decrypt(provider.apiKeyEncrypted);
  switch (provider.protocol) {
    case 'openai':
    case 'ollama':
    case 'custom':
      return createOpenAI({ baseURL: provider.baseUrl, apiKey });
    case 'anthropic':
      return createAnthropic({ baseURL: provider.baseUrl, apiKey });
    default:
      throw new Error(`Unsupported protocol: ${provider.protocol}`);
  }
}

export class SubAgentDelegator {
  private config: DelegationConfig;
  private activeCount = 0;

  constructor(config?: Partial<DelegationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Delegate a single task to a sub-agent
   */
  async delegateTask(
    task: DelegatedTask,
    modelId: string,
    depth: number = 0
  ): Promise<DelegationResult> {
    if (depth >= this.config.maxDepth) {
      return {
        id: randomUUID(),
        prompt: task.prompt,
        result: '',
        success: false,
        error: `Maximum delegation depth (${this.config.maxDepth}) exceeded`,
        durationMs: 0,
      };
    }

    if (this.activeCount >= this.config.maxConcurrent) {
      return {
        id: randomUUID(),
        prompt: task.prompt,
        result: '',
        success: false,
        error: `Maximum concurrent delegations (${this.config.maxConcurrent}) reached`,
        durationMs: 0,
      };
    }

    this.activeCount++;
    const startTime = Date.now();
    const id = randomUUID();

    try {
      const db = getDatabase();
      const provider = getProviderForModel(db, modelId);
      const client = createClient(provider);

      const systemPrompt = `You are a sub-agent tasked with a specific job. Focus only on the task at hand and provide a clear, concise response. Do not delegate further.`;

      const userContent = task.context
        ? `Context:\n${task.context}\n\nTask:\n${task.prompt}`
        : task.prompt;

      const result = await generateText({
        model: client(provider.modelId),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        maxTokens: 4096,
      });

      const durationMs = Date.now() - startTime;

      // Log to agent_handoffs
      try {
        db.prepare(
          `INSERT INTO agent_handoffs (id, session_id, from_agent_id, to_agent_id, reason, context_json, timestamp)
           VALUES (?, ?, NULL, NULL, ?, ?, ?)`
        ).run(
          id,
          `delegation-${Date.now()}`,
          `Sub-agent task: ${task.prompt.slice(0, 100)}`,
          JSON.stringify({ prompt: task.prompt, context: task.context }),
          Date.now()
        );
      } catch {
        // Handoff logging is best-effort
      }

      delegationLogger.info(
        `Sub-agent task completed in ${durationMs}ms: ${task.prompt.slice(0, 50)}...`
      );

      return {
        id,
        prompt: task.prompt,
        result: result.text,
        success: true,
        durationMs,
      };
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      delegationLogger.error(`Sub-agent task failed after ${durationMs}ms: ${error.message}`);
      return {
        id,
        prompt: task.prompt,
        result: '',
        success: false,
        error: error.message,
        durationMs,
      };
    } finally {
      this.activeCount--;
    }
  }

  /**
   * Delegate multiple tasks in parallel
   */
  async delegateMultipleTasks(
    tasks: DelegatedTask[],
    modelId: string,
    depth: number = 0
  ): Promise<DelegationResult[]> {
    const limitedTasks = tasks.slice(0, this.config.maxConcurrent);

    const results = await Promise.all(
      limitedTasks.map((task) =>
        Promise.race([
          this.delegateTask(task, modelId, depth),
          new Promise<DelegationResult>((resolve) =>
            setTimeout(
              () =>
                resolve({
                  id: randomUUID(),
                  prompt: task.prompt,
                  result: '',
                  success: false,
                  error: `Task timed out after ${this.config.timeoutMs}ms`,
                  durationMs: this.config.timeoutMs,
                }),
              this.config.timeoutMs
            )
          ),
        ])
      )
    );

    return results;
  }

  /**
   * Get current delegation status
   */
  getStatus() {
    return {
      activeCount: this.activeCount,
      maxConcurrent: this.config.maxConcurrent,
      maxDepth: this.config.maxDepth,
      timeoutMs: this.config.timeoutMs,
    };
  }
}

// Singleton instance
let delegator: SubAgentDelegator | null = null;

export function getDelegator(config?: Partial<DelegationConfig>): SubAgentDelegator {
  if (!delegator) {
    delegator = new SubAgentDelegator(config);
  }
  return delegator;
}

export function getDelegationConfig(): DelegationConfig {
  return { ...DEFAULT_CONFIG };
}
