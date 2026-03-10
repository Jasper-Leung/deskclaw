/**
 * LLM-powered workflow generator
 * Converts natural language descriptions into executable workflows
 */

import Database from 'better-sqlite3';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { randomUUID } from 'crypto';
import type { WorkflowNode, WorkflowEdge } from '../../../shared/types/index.js';
import { decrypt } from '../db/index.js';
import {
  getWorkflowGenerationPrompt,
  getWorkflowRefinementPrompt,
  getWorkflowExplanationPrompt,
} from '../prompts/workflow-generation.js';
import { workflowLogger } from '../lib/logger.js';

interface ProviderConfig {
  protocol: 'openai' | 'anthropic' | 'ollama' | 'custom';
  baseUrl: string;
  apiKeyEncrypted: string;
}

interface GeneratedWorkflow {
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

interface WorkflowGenerationResult {
  success: boolean;
  workflow?: GeneratedWorkflow;
  explanation?: string;
  error?: string;
}

/**
 * Get provider configuration for a model
 */
function getProviderForModel(
  db: Database.Database,
  modelId: string
): ProviderConfig & { modelId: string } {
  const stmt = db.prepare(`
    SELECT p.protocol, p.base_url, p.api_key_encrypted, m.model_id
    FROM models m
    JOIN providers p ON m.provider_id = p.id
    WHERE m.id = ?
  `);

  const result = stmt.get(modelId) as any;

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
 * Create AI client for the provider
 */
function createClient(config: ProviderConfig) {
  const apiKey = decrypt(config.apiKeyEncrypted);

  switch (config.protocol) {
    case 'openai':
    case 'ollama':
    case 'custom':
      return createOpenAI({
        baseURL: config.baseUrl,
        apiKey,
      });
    case 'anthropic':
      return createAnthropic({
        baseURL: config.baseUrl,
        apiKey,
      });
    default:
      throw new Error(`Unsupported protocol: ${config.protocol}`);
  }
}

/**
 * Get list of available tools for workflow generation
 */
function getAvailableTools(): string[] {
  return [
    // File operations
    'file_read',
    'file_write',
    'file_list',
    // Web operations
    'web_search',
    'http_request',
    // System operations
    'execute_command',
    'get_time',
    // Stock data
    'stock_quote',
    // Mouse/keyboard control
    'mouse_move',
    'mouse_click',
    'mouse_drag',
    'mouse_scroll',
    'keyboard_type',
    'keyboard_press',
    // Screenshot
    'screenshot',
    'screenshot_diff',
    'clear_screenshot_cache',
    'screen_info',
    // Batch execution
    'sequence_execute',
  ];
}

/**
 * Validate generated workflow structure
 */
function validateWorkflow(workflow: unknown): { valid: boolean; error?: string } {
  if (!workflow || typeof workflow !== 'object') {
    return { valid: false, error: 'Workflow must be an object' };
  }

  const wf = workflow as Record<string, unknown>;

  if (!wf.name || typeof wf.name !== 'string') {
    return { valid: false, error: 'Workflow must have a name (string)' };
  }

  if (!wf.nodes || !Array.isArray(wf.nodes)) {
    return { valid: false, error: 'Workflow must have a nodes array' };
  }

  if (!wf.edges || !Array.isArray(wf.edges)) {
    return { valid: false, error: 'Workflow must have an edges array' };
  }

  // Validate nodes
  if (wf.nodes.length === 0) {
    return { valid: false, error: 'Workflow must have at least one node' };
  }

  const validTypes = ['trigger', 'agent', 'tool', 'prompt', 'conditional', 'shell', 'parallel'];
  const nodeIds = new Set<string>();

  for (const node of wf.nodes) {
    if (!node || typeof node !== 'object') {
      return { valid: false, error: 'Each node must be an object' };
    }

    const n = node as Record<string, unknown>;

    if (!n.id || typeof n.id !== 'string') {
      return { valid: false, error: 'Each node must have an id (string)' };
    }

    if (nodeIds.has(n.id)) {
      return { valid: false, error: `Duplicate node id: ${n.id}` };
    }
    nodeIds.add(n.id);

    if (!n.type || typeof n.type !== 'string') {
      return { valid: false, error: `Node ${n.id} must have a type` };
    }

    if (!validTypes.includes(n.type)) {
      return { valid: false, error: `Node ${n.id} has invalid type: ${n.type}` };
    }

    if (!n.position || typeof n.position !== 'object') {
      return { valid: false, error: `Node ${n.id} must have a position object` };
    }

    const pos = n.position as Record<string, unknown>;
    if (typeof pos.x !== 'number' || typeof pos.y !== 'number') {
      return { valid: false, error: `Node ${n.id} position must have x and y numbers` };
    }

    if (!n.data || typeof n.data !== 'object') {
      return { valid: false, error: `Node ${n.id} must have a data object` };
    }
  }

  // Validate edges
  for (const edge of wf.edges) {
    if (!edge || typeof edge !== 'object') {
      return { valid: false, error: 'Each edge must be an object' };
    }

    const e = edge as Record<string, unknown>;

    if (!e.id || typeof e.id !== 'string') {
      return { valid: false, error: 'Each edge must have an id' };
    }

    if (!e.source || typeof e.source !== 'string') {
      return { valid: false, error: `Edge ${e.id} must have a source` };
    }

    if (!nodeIds.has(e.source)) {
      return {
        valid: false,
        error: `Edge ${e.id} references non-existent source node: ${e.source}`,
      };
    }

    if (!e.target || typeof e.target !== 'string') {
      return { valid: false, error: `Edge ${e.id} must have a target` };
    }

    if (!nodeIds.has(e.target)) {
      return {
        valid: false,
        error: `Edge ${e.id} references non-existent target node: ${e.target}`,
      };
    }

    // Validate sourceHandle if present
    if (e.sourceHandle !== undefined) {
      if (typeof e.sourceHandle !== 'string') {
        return { valid: false, error: `Edge ${e.id} sourceHandle must be a string` };
      }
      if (e.sourceHandle !== 'true' && e.sourceHandle !== 'false') {
        return { valid: false, error: `Edge ${e.id} sourceHandle must be "true" or "false"` };
      }
    }
  }

  // Check for exactly one trigger node
  const triggerNodes = wf.nodes.filter((n: unknown) => {
    const node = n as Record<string, unknown>;
    return node.type === 'trigger';
  });

  if (triggerNodes.length === 0) {
    return { valid: false, error: 'Workflow must have exactly one trigger node' };
  }

  if (triggerNodes.length > 1) {
    return { valid: false, error: 'Workflow must have exactly one trigger node (found multiple)' };
  }

  return { valid: true };
}

/**
 * Generate workflow from natural language description
 */
export async function generateWorkflow(
  db: Database.Database,
  description: string,
  modelId: string
): Promise<WorkflowGenerationResult> {
  try {
    workflowLogger.info(
      `[workflow-generator] Generating workflow from description: "${description.substring(0, 100)}..."`
    );

    // Get provider configuration
    const providerConfig = getProviderForModel(db, modelId);
    const client = createClient(providerConfig);

    // Get available tools
    const availableTools = getAvailableTools();

    // Generate prompt
    const prompt = getWorkflowGenerationPrompt(description, availableTools);

    // Call LLM
    const result = await generateText({
      model: client(providerConfig.modelId),
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      maxTokens: 4000,
    });

    // Parse response
    const content = result.text.trim();

    // Extract JSON from response (handle markdown code blocks)
    let jsonContent = content;
    const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\s*```?/);
    if (codeBlockMatch) {
      jsonContent = codeBlockMatch[1];
    }

    let workflow: unknown;
    try {
      workflow = JSON.parse(jsonContent);
    } catch (parseError) {
      workflowLogger.error(
        { error: parseError },
        '[workflow-generator] Failed to parse LLM output'
      );
      return {
        success: false,
        error: `Failed to parse generated workflow. The LLM did not return valid JSON. Raw output: ${content.substring(0, 500)}...`,
      };
    }

    // Validate workflow
    const validation = validateWorkflow(workflow);
    if (!validation.valid) {
      workflowLogger.error(
        { error: validation.error },
        '[workflow-generator] Generated workflow failed validation'
      );
      return {
        success: false,
        error: `Generated workflow is invalid: ${validation.error}`,
      };
    }

    workflowLogger.info(
      `[workflow-generator] Successfully generated workflow: "${(workflow as GeneratedWorkflow).name}" with ${(workflow as GeneratedWorkflow).nodes.length} nodes`
    );

    return {
      success: true,
      workflow: workflow as GeneratedWorkflow,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    workflowLogger.error({ error }, '[workflow-generator] Failed to generate workflow');
    return {
      success: false,
      error: `Failed to generate workflow: ${errorMessage}`,
    };
  }
}

/**
 * Refine an existing workflow based on user feedback
 */
export async function refineWorkflow(
  db: Database.Database,
  currentWorkflow: {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    name: string;
    description?: string;
  },
  feedback: string,
  modelId: string
): Promise<WorkflowGenerationResult> {
  try {
    workflowLogger.info(`[workflow-generator] Refining workflow: "${currentWorkflow.name}"`);

    // Get provider configuration
    const providerConfig = getProviderForModel(db, modelId);
    const client = createClient(providerConfig);

    // Generate prompt
    const prompt = getWorkflowRefinementPrompt(JSON.stringify(currentWorkflow, null, 2), feedback);

    // Call LLM
    const result = await generateText({
      model: client(providerConfig.modelId),
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      maxTokens: 4000,
    });

    // Parse response
    const content = result.text.trim();

    // Extract JSON from response
    let jsonContent = content;
    const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\s*```?/);
    if (codeBlockMatch) {
      jsonContent = codeBlockMatch[1];
    }

    let workflow: unknown;
    try {
      workflow = JSON.parse(jsonContent);
    } catch (parseError) {
      workflowLogger.error(
        { error: parseError },
        '[workflow-generator] Failed to parse refinement output'
      );
      return {
        success: false,
        error: `Failed to parse refined workflow. The LLM did not return valid JSON.`,
      };
    }

    // Validate workflow
    const validation = validateWorkflow(workflow);
    if (!validation.valid) {
      return {
        success: false,
        error: `Refined workflow is invalid: ${validation.error}`,
      };
    }

    workflowLogger.info(
      `[workflow-generator] Successfully refined workflow: "${(workflow as GeneratedWorkflow).name}"`
    );

    return {
      success: true,
      workflow: workflow as GeneratedWorkflow,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    workflowLogger.error({ error }, '[workflow-generator] Failed to refine workflow');
    return {
      success: false,
      error: `Failed to refine workflow: ${errorMessage}`,
    };
  }
}

/**
 * Explain a workflow in natural language
 */
export async function explainWorkflow(
  db: Database.Database,
  workflow: { nodes: WorkflowNode[]; edges: WorkflowEdge[]; name: string; description?: string },
  modelId: string
): Promise<{ success: boolean; explanation?: string; error?: string }> {
  try {
    workflowLogger.info(`[workflow-generator] Explaining workflow: "${workflow.name}"`);

    // Get provider configuration
    const providerConfig = getProviderForModel(db, modelId);
    const client = createClient(providerConfig);

    // Generate prompt
    const prompt = getWorkflowExplanationPrompt(JSON.stringify(workflow, null, 2));

    // Call LLM
    const result = await generateText({
      model: client(providerConfig.modelId),
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.5,
      maxTokens: 2000,
    });

    workflowLogger.info(
      `[workflow-generator] Generated explanation for workflow: "${workflow.name}"`
    );

    return {
      success: true,
      explanation: result.text,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    workflowLogger.error({ error }, '[workflow-generator] Failed to explain workflow');
    return {
      success: false,
      error: `Failed to explain workflow: ${errorMessage}`,
    };
  }
}

/**
 * Save generated workflow to database
 */
export async function saveGeneratedWorkflow(
  db: Database.Database,
  workflow: GeneratedWorkflow
): Promise<{ success: boolean; workflowId?: string; error?: string }> {
  try {
    const id = randomUUID();
    const now = Date.now();

    const definition = {
      nodes: workflow.nodes,
      edges: workflow.edges,
    };

    const stmt = db.prepare(`
      INSERT INTO workflows (id, name, description, definition_json, is_preset, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      workflow.name,
      workflow.description || null,
      JSON.stringify(definition),
      0,
      now,
      now
    );

    workflowLogger.info(
      `[workflow-generator] Saved generated workflow: "${workflow.name}" (ID: ${id})`
    );

    return {
      success: true,
      workflowId: id,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    workflowLogger.error({ error }, '[workflow-generator] Failed to save workflow');
    return {
      success: false,
      error: `Failed to save workflow: ${errorMessage}`,
    };
  }
}
