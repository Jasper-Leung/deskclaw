import type { Database } from 'better-sqlite3';
import type { Node, Edge } from '@xyflow/react';
import { randomUUID } from 'crypto';
import { chat as llmChat } from '../ipc/llm.js';
import { executeShell } from '../ipc/shell.js';
import { executeTool } from '../tools/index.js';
import type { Message } from '../../../shared/types/index.js';
import { workflowLogger } from '../lib/logger.js';

interface WorkflowNode extends Node {
  data: Record<string, unknown>;
}

interface WorkflowEdge extends Edge {
  sourceHandle?: string;
}

interface ExecutionContext {
  nodes: Map<string, WorkflowNode>;
  edges: WorkflowEdge[];
  results: Map<string, unknown>;
  db: Database;
  messageHistory: Message[];
}

interface ExecutionResult {
  success: boolean;
  workflowId: string;
  executionId: string;
  status: 'completed' | 'failed' | 'running';
  results: Record<string, unknown>;
  error?: string;
}

interface ProgressCallback {
  (update: {
    type: 'node_start' | 'node_complete' | 'node_error' | 'stream' | 'complete';
    nodeId?: string;
    nodeName?: string;
    data?: unknown;
    error?: string;
  }): void;
}

/**
 * Topological sort to get nodes in execution order
 */
function topologicalSort(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
  const inDegree = new Map<string, number>();
  const adjacencyList = new Map<string, string[]>();
  const nodeMap = new Map<string, WorkflowNode>();

  // Initialize
  nodes.forEach((node) => {
    inDegree.set(node.id, 0);
    adjacencyList.set(node.id, []);
    nodeMap.set(node.id, node);
  });

  // Build adjacency list and in-degree count
  edges.forEach((edge) => {
    if (edge.source && edge.target) {
      const targets = adjacencyList.get(edge.source) || [];
      targets.push(edge.target);
      adjacencyList.set(edge.source, targets);
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    }
  });

  // Kahn's algorithm
  const queue: string[] = [];
  const sorted: WorkflowNode[] = [];

  inDegree.forEach((degree, nodeId) => {
    if (degree === 0) {
      queue.push(nodeId);
    }
  });

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    const node = nodeMap.get(nodeId);
    if (node) {
      sorted.push(node);
    }

    const neighbors = adjacencyList.get(nodeId) || [];
    for (const neighbor of neighbors) {
      inDegree.set(neighbor, (inDegree.get(neighbor) || 0) - 1);
      if (inDegree.get(neighbor) === 0) {
        queue.push(neighbor);
      }
    }
  }

  return sorted;
}

/**
 * Execute a single node based on its type
 */
async function executeNode(
  node: WorkflowNode,
  context: ExecutionContext
): Promise<{ success: boolean; result: unknown; error?: string }> {
  const { data } = node;
  const nodeType = node.type;

  try {
    switch (nodeType) {
      case 'trigger':
        return { success: true, result: { triggered: true, timestamp: Date.now() } };

      case 'prompt':
        return {
          success: true,
          result: {
            type: 'prompt',
            content: data.prompt || data.label || '',
          },
        };

      case 'agent': {
        const modelId = data.modelId as string | undefined;
        const systemPrompt = data.systemPrompt as string | undefined;
        const enabledTools = (data.enabledTools as string[]) || [];
        const maxIterations = (data.maxIterations as number) || 5;

        if (!modelId) {
          return { success: false, result: null, error: 'Agent node missing modelId' };
        }

        // Collect previous results as context
        const contextMessages = Array.from(context.results.entries())
          .filter(([_, value]) => typeof value === 'object' && value !== null)
          .map(([key, value]) => {
            const result = value as { success?: boolean; result?: unknown; error?: string };
            if (result.success === false && result.error) {
              return {
                role: 'system' as const,
                content: `[${key}] Error: ${result.error}`,
              };
            }
            return {
              role: 'system' as const,
              content: `[${key}]: ${JSON.stringify(result.result || value)}`,
            };
          });

        // Build initial messages
        let messages: Message[] = [
          ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
          ...contextMessages,
          { role: 'user' as const, content: (data.label as string) || 'Execute task' },
        ];

        // Add tools info if tools are enabled
        if (enabledTools.length > 0) {
          const toolsInfo = enabledTools
            .map((toolName) => {
              const tool =
                {
                  file_read: 'Read a file from the filesystem. Parameters: filepath (string)',
                  file_write:
                    'Write content to a file. Parameters: filepath (string), content (string)',
                  file_list:
                    'List files in a directory. Parameters: path (string, optional), pattern (string, optional)',
                  web_search: 'Search the web for information. Parameters: query (string)',
                  http_request:
                    'Make an HTTP request. Parameters: url (string), method (string, optional), headers (string, optional), body (string, optional)',
                  execute_command: 'Execute a shell command. Parameters: command (string)',
                  get_time: 'Get current time. Parameters: timezone (string, optional)',
                  stock_quote:
                    'Get real-time stock market data from Yahoo Finance. Parameters: symbols (string, e.g., "AAPL" or "^GSPC,^DJI,^IXIC"), fields (string, optional: "price", "quote", "summary", "all")',
                  mouse_move:
                    'Move mouse cursor naturally using Bezier curves. Parameters: x (number), y (number), duration (ms, optional), curvature (0-1, optional), microMovements (boolean, optional)',
                  mouse_click:
                    'Click with human-like movement. Parameters: button ("left" or "right", optional), x (number, optional), y (number, optional), double (boolean, optional), moveDuration (ms, optional)',
                  mouse_drag:
                    'Drag with human-like curved movement. Parameters: from_x, from_y, to_x, to_y, button (optional), duration (ms, optional), curvature (0-1, optional)',
                  mouse_scroll:
                    'Scroll mouse wheel with natural variation. Parameters: amount (number, positive=down/right, negative=up/left), direction ("vertical" or "horizontal", optional), steps (number, optional), humanize (boolean, optional)',
                  keyboard_type: 'Type text. Parameters: text (string), delay (ms, optional)',
                  keyboard_press:
                    'Press key or combo. Parameters: key (string), modifiers (string, optional)',
                  screenshot:
                    'Screenshot with smart compression. Parameters: mode ("smart"/"compressed"/"thumbnail"/"full", default: "smart"), maxDimension (number, default 1280). Returns coordinateTransform for scaling coordinates.',
                  screenshot_diff:
                    'Screenshot ONLY if screen changed. Saves tokens by skipping duplicate screenshots. Parameters: threshold (0-1, default 0.05), mode (string, default "smart"), force (boolean, optional)',
                  clear_screenshot_cache:
                    'Clear screenshot cache to reset diff comparison. Use when starting new task.',
                  screen_info: 'Get screen dimensions. Parameters: none',
                  sequence_execute:
                    'Execute multiple operations in sequence with delays to reduce API calls. Parameters: steps (array of {tool, parameters, delay, delayVariation, description}), onError ("stop"/"continue"/"retry"), defaultDelay (ms), defaultVariation (ms)',
                }[toolName] || toolName;
              return `- ${toolName}: ${tool}`;
            })
            .join('\n');

          messages.push({
            role: 'system',
            content: `You have access to the following tools:\n${toolsInfo}\n\nWhen you need to use a tool, respond with a JSON object in this format:\n{"tool": "tool_name", "parameters": {"param": "value"}}\n\nAfter using a tool, continue with your task based on the tool's result.`,
          });
        }

        // Execute with tool calling loop
        let iterations = 0;
        let finalResponse = '';
        const toolCalls: { tool: string; parameters: Record<string, unknown>; result: unknown }[] =
          [];

        while (iterations < maxIterations) {
          iterations++;

          // Compress message history before calling LLM to avoid context overflow
          messages = compressMessageHistory(messages);

          const llmResult = await llmChat(context.db, { model: modelId, messages });

          // Check if response contains a tool call

          const toolCallMatch =
            llmResult.content.match(/```(?:json)?\s*\n?(\{[\s\S]*?"tool"[\s\S]*?\})\s*```?/) ||
            llmResult.content.match(/(\{[\s\S]*?"tool"[\s\S]*?\})/);

          if (toolCallMatch && enabledTools.length > 0) {
            try {
              const jsonStr = toolCallMatch[1] || toolCallMatch[0];
              const toolCall = JSON.parse(jsonStr);

              if (toolCall.tool && toolCall.parameters) {
                workflowLogger.info(`[Agent] Executing tool: ${toolCall.tool}`);

                const toolResult = await executeTool(toolCall.tool, toolCall.parameters);

                toolCalls.push({
                  tool: toolCall.tool,
                  parameters: toolCall.parameters,
                  result: toolResult.result,
                });

                // Add tool result to messages
                messages.push({ role: 'assistant', content: llmResult.content });
                messages.push({
                  role: 'tool_result',
                  content: JSON.stringify(toolResult.result || toolResult.error),
                  timestamp: Date.now(),
                });

                // Continue loop
                continue;
              }
            } catch (e) {
              workflowLogger.info({ error: e }, '[Agent] Failed to parse tool call');
            }
          }

          // No tool call or parsing failed, use this as final response
          finalResponse = llmResult.content;
          break;
        }

        return {
          success: true,
          result: {
            type: 'llm_with_tools',
            content: finalResponse,
            toolCalls,
            iterations,
          },
        };
      }

      case 'tool': {
        const toolName = data.toolName as string | undefined;
        const toolParams = data.parameters as Record<string, unknown> | undefined;

        if (!toolName) {
          return { success: false, result: null, error: 'Tool node missing toolName' };
        }

        // Execute the tool with parameters
        const params = toolParams || {};

        try {
          const toolResult = await executeTool(toolName, params);
          if (toolResult.error) {
            return {
              success: false,
              result: null,
              error: `Tool execution failed: ${toolResult.error}`,
            };
          }
          return {
            success: true,
            result: {
              type: 'tool',
              tool: toolName,
              parameters: params,
              output: toolResult.result,
            },
          };
        } catch (error) {
          return {
            success: false,
            result: null,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }

      case 'shell': {
        const command = data.command as string | undefined;
        const requireApproval = data.requireApproval as boolean | undefined;

        if (!command) {
          return { success: false, result: null, error: 'Shell node missing command' };
        }

        if (requireApproval) {
          return {
            success: false,
            result: null,
            error: `Shell command requires approval: ${command}`,
          };
        }

        const shellResult = await executeShell(command, { requireApproval: false });
        return {
          success: true,
          result: {
            type: 'shell',
            command,
            output: shellResult,
          },
        };
      }

      case 'conditional': {
        const condition = data.condition as string | undefined;
        if (!condition) {
          return { success: false, result: null, error: 'Conditional node missing condition' };
        }
        // Simple condition evaluation - in production, use a proper expression evaluator
        const result = evaluateCondition(condition, context.results);
        return { success: true, result: { type: 'conditional', value: result } };
      }

      default:
        return { success: false, result: null, error: `Unknown node type: ${nodeType}` };
    }
  } catch (error) {
    return {
      success: false,
      result: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Simple condition evaluator
 * In production, replace with a proper expression evaluator
 */
function evaluateCondition(condition: string, context: Map<string, unknown>): boolean {
  // Very basic evaluation - check if condition contains certain keywords
  // This is a placeholder; real implementation should use a proper expression parser
  const lowerCondition = condition.toLowerCase();

  // Check for true/false keywords
  if (lowerCondition === 'true') return true;
  if (lowerCondition === 'false') return false;

  // Check if context has a matching key with truthy value
  for (const [key, value] of context.entries()) {
    if (lowerCondition.includes(key.toLowerCase()) && value) {
      return true;
    }
  }

  // Default to true for simplicity in this prototype
  return true;
}

/**
 * Estimate token count for a message (rough approximation)
 */
function estimateTokens(message: Message): number {
  // Rough estimate: ~4 characters per token
  return Math.ceil(message.content.length / 4);
}

/**
 * Compress message history when approaching context limit
 * Smart compression that preserves important context while reducing token usage
 */
function compressMessageHistory(messages: Message[], maxTokens: number = 50000): Message[] {
  // Calculate total tokens
  let totalTokens = messages.reduce((sum, msg) => sum + estimateTokens(msg), 0);

  if (totalTokens <= maxTokens) {
    return messages;
  }

  workflowLogger.info(
    `[Context] Compressing messages: ${totalTokens} tokens -> target: ${maxTokens}`
  );

  // Keep important messages at the beginning and end
  const compressed: Message[] = [];

  // Always keep system prompts
  const systemMessages = messages.filter((m) => m.role === 'system');
  compressed.push(...systemMessages);

  // Keep first user message (task description) - most important
  const firstUserMsg = messages.find((m) => m.role === 'user');
  if (firstUserMsg) {
    compressed.push(firstUserMsg);
  }

  // Process tool messages with smart compression
  const toolMessages = messages.filter((m) => m.role === 'tool_result' || m.role === 'tool');
  let screenshotCount = 0;

  for (const msg of toolMessages) {
    const content = msg.content;

    // Detect screenshot tool results and compress them aggressively
    if (
      content.includes('"data":') &&
      content.includes('"format": "image/') &&
      content.length > 5000
    ) {
      screenshotCount++;

      // Extract just the metadata for screenshots, not the full base64 data
      try {
        const parsed = JSON.parse(content);
        if (parsed.result && parsed.result.data) {
          // Remove the actual image data, keep metadata
          const compressedResult = {
            ...parsed.result,
            data: '[IMAGE DATA COMPRESSED - ' + parsed.result.data.length + ' bytes]',
            dataTruncated: true,
            originalSize: parsed.result.size,
          };

          compressed.push({
            ...msg,
            content: JSON.stringify({ result: compressedResult }),
          });

          workflowLogger.info(
            `[Context] Compressed screenshot ${screenshotCount} (saved ${parsed.result.data.length} chars)`
          );
          continue;
        }
      } catch {
        // If parsing fails, use regular truncation
      }
    }

    // For other large content, use smart truncation
    if (content.length > 3000) {
      // Try to truncate at a reasonable point
      const truncateAt = 2500;
      compressed.push({
        ...msg,
        content: `${content.substring(0, truncateAt)}\n\n... [Content truncated: ${content.length - truncateAt} more chars, use screenshot_diff for visual updates]`,
      });
    } else {
      compressed.push(msg);
    }
  }

  // Keep last few assistant messages (most recent context)
  const assistantMessages = messages.filter((m) => m.role === 'assistant').slice(-2);
  compressed.push(...assistantMessages);

  // Recalculate tokens
  totalTokens = compressed.reduce((sum, msg) => sum + estimateTokens(msg), 0);
  workflowLogger.info(
    `[Context] After compression: ${totalTokens} tokens, ${compressed.length} messages, ${screenshotCount} screenshots compressed`
  );

  return compressed;
}

/**
 * Execute a workflow
 */
export async function executeWorkflow(
  db: Database,
  workflowId: string,
  nodes: Node[],
  edges: Edge[],
  onProgress?: ProgressCallback
): Promise<ExecutionResult> {
  const executionId = randomUUID();
  const workflowNodes: WorkflowNode[] = nodes as WorkflowNode[];
  const workflowEdges: WorkflowEdge[] = edges as WorkflowEdge[];

  // Sort nodes in execution order
  const sortedNodes = topologicalSort(workflowNodes, workflowEdges);

  // Build context
  const nodeMap = new Map(sortedNodes.map((node) => [node.id, node]));
  const context: ExecutionContext = {
    nodes: nodeMap,
    edges: workflowEdges,
    results: new Map(),
    db,
    messageHistory: [],
  };

  // Execute nodes sequentially
  for (const node of sortedNodes) {
    const nodeName = String(node.data?.label || node.id);
    onProgress?.({ type: 'node_start', nodeId: node.id, nodeName });

    const { success, result, error } = await executeNode(node, context);
    context.results.set(node.id, { success, result, error });

    if (success) {
      onProgress?.({ type: 'node_complete', nodeId: node.id, nodeName, data: result });
    } else {
      onProgress?.({ type: 'node_error', nodeId: node.id, nodeName, error });
    }

    // Handle conditional branching
    if (node.type === 'conditional') {
      const conditionalResult = result as { type: string; value: boolean };
      const shouldContinue = conditionalResult.value;

      // Find outgoing edges and filter by sourceHandle
      const outgoingEdges = workflowEdges.filter((e) => e.source === node.id);
      const nextHandle = shouldContinue ? 'true' : 'false';

      // Remove nodes that shouldn't be executed based on condition
      for (const edge of outgoingEdges) {
        if (edge.sourceHandle && edge.sourceHandle !== nextHandle) {
          // Mark the target node as skipped (won't be executed)
          const targetNode = context.nodes.get(edge.target!);
          if (targetNode) {
            context.results.set(edge.target!, { success: true, result: null, skipped: true });
          }
        }
      }
    }

    // Stop execution on critical failure
    if (!success && node.type !== 'conditional') {
      const finalResult = {
        success: false,
        workflowId,
        executionId,
        status: 'failed' as const,
        results: Object.fromEntries(context.results),
        error: `Node ${node.id} failed: ${error}`,
      };
      onProgress?.({ type: 'complete', data: finalResult });
      return finalResult;
    }
  }

  const finalResult = {
    success: true,
    workflowId,
    executionId,
    status: 'completed' as const,
    results: Object.fromEntries(context.results),
  };
  onProgress?.({ type: 'complete', data: finalResult });
  return finalResult;
}
