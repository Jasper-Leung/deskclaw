import type { Database } from 'better-sqlite3';
import type { BrowserWindow } from 'electron';
import type { Node, Edge } from '@xyflow/react';
import { matchIntent, buildWorkflowPrompt } from '../workflow-engine/intent-matcher.js';
import { executeWorkflow } from '../workflow-engine/index.js';
import { getWorkflow } from './workflows.js';
import type { WorkflowNodeData, AppError } from '../../../shared/types/common.js';

interface AutoWorkflowRequest {
  userMessage: string;
  modelId?: string;
}

interface AutoWorkflowResult {
  matched: boolean;
  workflowId?: string;
  workflowName?: string;
  confidence?: number;
  result?: Record<string, unknown>;
  error?: string;
}

/**
 * Automatically detect intent and execute appropriate workflow
 */
export async function autoExecuteWorkflow(
  db: Database,
  request: AutoWorkflowRequest,
  mainWindow: BrowserWindow | null
): Promise<AutoWorkflowResult> {
  try {
    // Get all available workflows
    const stmt = db.prepare(`
      SELECT id, name, description
      FROM workflows
      ORDER BY is_preset DESC, updated_at DESC
    `);
    const workflows = stmt.all() as Array<{ id: string; name: string; description: string | null }>;

    if (workflows.length === 0) {
      return {
        matched: false,
        error: 'No workflows available',
      };
    }

    // Match intent
    const intentMatch = matchIntent(request.userMessage, workflows);

    if (!intentMatch) {
      return {
        matched: false,
        error: 'No matching workflow found',
      };
    }

    // Notify that workflow was matched
    mainWindow?.webContents.send('workflow:auto:matched', {
      workflowId: intentMatch.workflowId,
      workflowName: intentMatch.workflowName,
      confidence: intentMatch.confidence,
    });

    // Get workflow details
    const workflow = getWorkflow(db, intentMatch.workflowId);
    const { nodes, edges } = workflow.definitionJson;

    // Build prompt from user message and extracted parameters
    const workflowPrompt = buildWorkflowPrompt(request.userMessage, intentMatch.extractedParams);

    // Inject the user's prompt into the workflow nodes
    // Look for agent or prompt nodes and inject the user's request
    let modifiedNodes: Node<WorkflowNodeData>[] = [...nodes];
    const promptNodeIndex = nodes.findIndex((n: Node<WorkflowNodeData>) => n.type === 'prompt');
    const agentNodeIndex = nodes.findIndex((n: Node<WorkflowNodeData>) => n.type === 'agent');

    if (promptNodeIndex >= 0) {
      // Update the prompt node with the user's message
      modifiedNodes = nodes.map((n: Node<WorkflowNodeData>, i: number) =>
        i === promptNodeIndex
          ? {
              ...n,
              data: {
                ...n.data,
                prompt: workflowPrompt,
                label:
                  request.userMessage.slice(0, 50) + (request.userMessage.length > 50 ? '...' : ''),
              },
            }
          : n
      );
    } else if (agentNodeIndex >= 0) {
      // Update the agent node with the user's message as the label
      modifiedNodes = nodes.map((n: Node<WorkflowNodeData>, i: number) =>
        i === agentNodeIndex
          ? {
              ...n,
              data: {
                ...n.data,
                label: workflowPrompt,
              },
            }
          : n
      );
    }

    // Override model if specified
    if (request.modelId) {
      modifiedNodes = modifiedNodes.map((n) => {
        if (n.type === 'agent') {
          return {
            ...n,
            data: {
              ...n.data,
              modelId: request.modelId,
            },
          };
        }
        return n;
      });
    }

    // Execute workflow with progress streaming
    const result = await executeWorkflow(
      db,
      intentMatch.workflowId,
      modifiedNodes,
      edges,
      (update) => {
        // Stream progress to renderer
        mainWindow?.webContents.send('workflow:auto:progress', {
          workflowId: intentMatch.workflowId,
          workflowName: intentMatch.workflowName,
          ...update,
        });

        // Also stream node results as they complete
        if (update.type === 'node_complete' && update.data) {
          const nodeResult = update.data as {
            type?: string;
            content?: string | { content?: string };
            output?: unknown;
          };
          if (nodeResult.type === 'llm' && nodeResult.content) {
            const content =
              typeof nodeResult.content === 'string'
                ? nodeResult.content
                : nodeResult.content.content;
            mainWindow?.webContents.send('workflow:auto:output', {
              workflowId: intentMatch.workflowId,
              nodeId: update.nodeId,
              nodeName: update.nodeName,
              content: content || '',
            });
          } else if (nodeResult.type === 'shell' && nodeResult.output) {
            mainWindow?.webContents.send('workflow:auto:output', {
              workflowId: intentMatch.workflowId,
              nodeId: update.nodeId,
              nodeName: update.nodeName,
              content: `Shell output:\n${JSON.stringify(nodeResult.output, null, 2)}`,
            });
          }
        }
      }
    );

    return {
      matched: true,
      workflowId: intentMatch.workflowId,
      workflowName: intentMatch.workflowName,
      confidence: intentMatch.confidence,
      result: result as unknown as Record<string, unknown>,
    };
  } catch (error: unknown) {
    const err = error as AppError;
    // Send error to renderer
    mainWindow?.webContents.send('workflow:auto:error', {
      message: err.message || 'Unknown error',
    });

    return {
      matched: false,
      error: err.message || 'Unknown error',
    };
  }
}

/**
 * Quick intent match without execution (for preview)
 */
export async function previewWorkflowMatch(
  db: Database,
  userMessage: string
): Promise<{ matched: boolean; workflow?: { id: string; name: string; confidence: number } }> {
  try {
    const stmt = db.prepare(`
      SELECT id, name, description
      FROM workflows
      ORDER BY is_preset DESC, updated_at DESC
    `);
    const workflows = stmt.all() as Array<{ id: string; name: string; description: string | null }>;

    const intentMatch = matchIntent(userMessage, workflows);

    if (!intentMatch) {
      return { matched: false };
    }

    return {
      matched: true,
      workflow: {
        id: intentMatch.workflowId,
        name: intentMatch.workflowName,
        confidence: intentMatch.confidence,
      },
    };
  } catch {
    return { matched: false };
  }
}
