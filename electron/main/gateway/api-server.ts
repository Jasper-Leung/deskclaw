/**
 * OpenAI-Compatible API Server
 *
 * Provides an OpenAI-compatible REST API for external tools to interact
 * with DeskClaw's LLM capabilities.
 */

import { createServer, IncomingMessage, ServerResponse, Server as HttpServer } from 'http';
import { getDatabase } from '../db/index.js';
import { createLogger } from '../lib/logger.js';
import { redactSecrets } from '../lib/redact.js';
import type { LLMRequest, Message } from '../../../shared/types/index.js';
import { chat as llmChat, streamChat as llmStreamChat } from '../ipc/llm.js';

const apiLogger = createLogger('api-server');

export interface ApiServerConfig {
  port: number;
  host: string;
  authToken?: string;
  enabled: boolean;
}

const DEFAULT_CONFIG: ApiServerConfig = {
  port: 18790,
  host: '127.0.0.1',
  enabled: false,
};

let server: HttpServer | null = null;
let currentConfig: ApiServerConfig = { ...DEFAULT_CONFIG };

/**
 * Parse JSON body from request
 */
function parseBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * Send JSON response
 */
function sendJson(res: ServerResponse, statusCode: number, data: unknown) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(body);
}

/**
 * Send SSE event
 */
function sendSSE(res: ServerResponse, data: unknown) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * Authenticate request
 */
function authenticate(req: IncomingMessage): boolean {
  if (!currentConfig.authToken) return true;
  const auth = req.headers['authorization'];
  if (!auth) return false;
  const token = auth.replace('Bearer ', '');
  return token === currentConfig.authToken;
}

/**
 * Handle CORS preflight
 */
function handleCORS(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return true;
  }
  return false;
}

/**
 * GET /v1/models - List available models
 */
function handleListModels(res: ServerResponse) {
  try {
    const db = getDatabase();
    const models = db
      .prepare(
        `SELECT m.id, m.model_id, m.display_name, p.name as provider_name, p.protocol
       FROM models m JOIN providers p ON m.provider_id = p.id`
      )
      .all() as any[];

    const response = {
      object: 'list',
      data: models.map((m) => ({
        id: m.model_id,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: m.provider_name || 'deskclaw',
      })),
    };
    sendJson(res, 200, response);
  } catch (error) {
    apiLogger.error({ error }, 'Failed to list models');
    sendJson(res, 500, { error: { message: 'Failed to list models', type: 'internal_error' } });
  }
}

/**
 * GET /v1/models/:id - Get model details
 */
function handleGetModel(res: ServerResponse, modelId: string) {
  try {
    const db = getDatabase();
    const model = db
      .prepare(
        `SELECT m.id, m.model_id, m.display_name, p.name as provider_name, p.protocol
       FROM models m JOIN providers p ON m.provider_id = p.id
       WHERE m.model_id = ?`
      )
      .get(modelId) as any;

    if (!model) {
      sendJson(res, 404, { error: { message: `Model '${modelId}' not found`, type: 'not_found' } });
      return;
    }

    sendJson(res, 200, {
      id: model.model_id,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: model.provider_name || 'deskclaw',
    });
  } catch (error) {
    apiLogger.error({ error }, 'Failed to get model');
    sendJson(res, 500, { error: { message: 'Failed to get model', type: 'internal_error' } });
  }
}

/**
 * POST /v1/chat/completions - Chat completion (SSE streaming or JSON)
 */
async function handleChatCompletions(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = await parseBody(req);
    const request = JSON.parse(body);

    // Validate required fields
    if (!request.model || !request.messages || !Array.isArray(request.messages)) {
      sendJson(res, 400, {
        error: { message: 'model and messages are required', type: 'invalid_request_error' },
      });
      return;
    }

    // Look up the internal model ID from model_id
    const db = getDatabase();
    const modelRow = db
      .prepare('SELECT id FROM models WHERE model_id = ?')
      .get(request.model) as any;

    if (!modelRow) {
      sendJson(res, 404, {
        error: { message: `Model '${request.model}' not found`, type: 'not_found' },
      });
      return;
    }

    // Transform OpenAI messages to internal format
    const messages: Message[] = request.messages.map((m: any) => ({
      role: m.role,
      content: m.content,
      timestamp: Date.now(),
    }));

    const llmRequest: LLMRequest = {
      model: modelRow.id,
      messages,
      temperature: request.temperature,
      maxTokens: request.max_tokens,
    };

    const isStream = request.stream === true;

    if (isStream) {
      // SSE streaming response
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      const completionId = `chatcmpl-${Date.now()}`;
      const created = Math.floor(Date.now() / 1000);

      try {
        for await (const chunk of llmStreamChat(db, llmRequest)) {
          if (chunk.done) break;
          sendSSE(res, {
            id: completionId,
            object: 'chat.completion.chunk',
            created,
            model: request.model,
            choices: [
              {
                index: 0,
                delta: { content: chunk.content },
                finish_reason: null,
              },
            ],
          });
        }

        // Send final chunk
        sendSSE(res, {
          id: completionId,
          object: 'chat.completion.chunk',
          created,
          model: request.model,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: 'stop',
            },
          ],
        });
        sendSSE(res, '[DONE]');
        res.end();
      } catch (error: any) {
        sendSSE(res, {
          error: { message: redactSecrets(error.message), type: 'server_error' },
        });
        res.end();
      }
    } else {
      // Non-streaming JSON response
      const result = await llmChat(db, llmRequest);
      const completionId = `chatcmpl-${Date.now()}`;

      sendJson(res, 200, {
        id: completionId,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: request.model,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: result.content },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
      });
    }
  } catch (error: any) {
    apiLogger.error({ error }, 'Chat completion failed');
    if (!res.headersSent) {
      sendJson(res, 500, {
        error: { message: redactSecrets(error.message), type: 'internal_error' },
      });
    }
  }
}

/**
 * GET /v1/health - Health check
 */
function handleHealth(res: ServerResponse) {
  sendJson(res, 200, {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}

/**
 * Route requests to handlers
 */
async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  // Handle CORS
  if (handleCORS(req, res)) return;

  // Authenticate
  if (!authenticate(req)) {
    sendJson(res, 401, { error: { message: 'Unauthorized', type: 'authentication_error' } });
    return;
  }

  const url = req.url || '/';
  const method = req.method || 'GET';

  // Route: Health check
  if (url === '/v1/health' && method === 'GET') {
    handleHealth(res);
    return;
  }

  // Route: List models
  if (url === '/v1/models' && method === 'GET') {
    handleListModels(res);
    return;
  }

  // Route: Get model by ID
  const modelMatch = url.match(/^\/v1\/models\/([^/]+)$/);
  if (modelMatch && method === 'GET') {
    handleGetModel(res, decodeURIComponent(modelMatch[1]));
    return;
  }

  // Route: Chat completions
  if (url === '/v1/chat/completions' && method === 'POST') {
    await handleChatCompletions(req, res);
    return;
  }

  // 404 for unknown routes
  sendJson(res, 404, { error: { message: 'Not found', type: 'not_found' } });
}

/**
 * Start the API server
 */
export function startApiServer(config?: Partial<ApiServerConfig>): void {
  if (server) {
    apiLogger.warn('API server already running');
    return;
  }

  currentConfig = { ...DEFAULT_CONFIG, ...config };

  if (!currentConfig.enabled) {
    apiLogger.info('API server disabled by config');
    return;
  }

  server = createServer(handleRequest);

  server.listen(currentConfig.port, currentConfig.host, () => {
    apiLogger.info(`API server listening on http://${currentConfig.host}:${currentConfig.port}`);
  });

  server.on('error', (error) => {
    apiLogger.error({ error }, 'API server error');
  });
}

/**
 * Stop the API server
 */
export function stopApiServer(): void {
  if (server) {
    server.close();
    server = null;
    apiLogger.info('API server stopped');
  }
}

/**
 * Get current API server status
 */
export function getApiServerStatus(): { running: boolean; config: ApiServerConfig } {
  return {
    running: server !== null,
    config: currentConfig,
  };
}

/**
 * Update API server config (restarts if running)
 */
export function updateApiServerConfig(config: Partial<ApiServerConfig>): void {
  const wasRunning = server !== null;
  if (wasRunning) {
    stopApiServer();
  }
  currentConfig = { ...currentConfig, ...config };
  if (wasRunning || currentConfig.enabled) {
    startApiServer(currentConfig);
  }
}
