/**
 * Gateway WebSocket Server
 *
 * Core WebSocket server that handles all client connections and message routing.
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'http';
import type {
  GatewayRequest,
  GatewayResponse,
  GatewayEvent,
  GatewayClient,
  GatewayConfig,
} from '../../../shared/types/gateway.js';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { createLogger } from '../lib/logger.js';

const gatewayLogger = createLogger('gateway');

export class GatewayServer extends EventEmitter {
  private wss?: WebSocketServer;
  private clients = new Map<WebSocket, GatewayClient>();
  private config: GatewayConfig;
  private requestHandlers = new Map<
    string,
    (params: Record<string, unknown>) => Promise<unknown>
  >();
  private running = false;

  constructor(config: GatewayConfig) {
    super();
    this.config = config;
  }

  attach(httpServer: HttpServer): void {
    this.wss = new WebSocketServer({ server: httpServer });

    this.wss.on('connection', (ws: WebSocket) => {
      this.handleConnection(ws);
    });

    this.wss.on('error', (error: unknown) => {
      gatewayLogger.error(error as Error, '[Gateway] WebSocket server error');
      this.emit('error', error);
    });

    this.running = true;
    gatewayLogger.info(
      `[Gateway] WebSocket server attached, listening on port ${this.config.port}`
    );
  }

  async start(): Promise<void> {
    if (this.running) return;

    const http = await import('http');
    const httpServer = http.createServer();

    this.attach(httpServer);

    return new Promise((resolve, reject) => {
      httpServer.listen(this.config.port, this.config.host, () => {
        gatewayLogger.info(`[Gateway] Server started on ${this.config.host}:${this.config.port}`);
        resolve();
      });
      httpServer.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    if (!this.wss) return;

    for (const [ws] of this.clients) {
      ws.close(1001, 'Server shutting down');
    }
    this.clients.clear();

    return new Promise((resolve) => {
      this.wss!.close(() => {
        this.running = false;
        gatewayLogger.info('[Gateway] Server stopped');
        resolve();
      });
    });
  }

  registerHandler(
    method: string,
    handler: (params: Record<string, unknown>) => Promise<unknown>
  ): void {
    this.requestHandlers.set(method, handler);
  }

  unregisterHandler(method: string): void {
    this.requestHandlers.delete(method);
  }

  broadcast(event: string, data: unknown): void {
    const message: GatewayEvent = { event, data };
    const payload = JSON.stringify(message);

    for (const [ws] of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  sendToClient(clientId: string, event: string, data: unknown): void {
    for (const [ws, client] of this.clients) {
      if (client.id === clientId && ws.readyState === WebSocket.OPEN) {
        const message: GatewayEvent = { event, data };
        ws.send(JSON.stringify(message));
      }
    }
  }

  getConnectedClients(): GatewayClient[] {
    return Array.from(this.clients.values());
  }

  isRunning(): boolean {
    return this.running;
  }

  private handleConnection(ws: WebSocket): void {
    const clientId = randomUUID();
    const client: GatewayClient = {
      id: clientId,
      type: 'ui',
      connectedAt: Date.now(),
      lastActivity: Date.now(),
    };

    this.clients.set(ws, client);
    gatewayLogger.info(`[Gateway] Client connected: ${clientId}`);

    ws.on('message', (data: Buffer) => {
      this.handleMessage(ws, client, data);
    });

    ws.on('close', () => {
      this.clients.delete(ws);
      gatewayLogger.info(`[Gateway] Client disconnected: ${clientId}`);
      this.emit('client:disconnect', client);
    });

    ws.on('error', (error: Error) => {
      gatewayLogger.error(error, `[Gateway] Client error (${clientId})`);
    });

    this.emit('client:connect', client);
  }

  private async handleMessage(ws: WebSocket, client: GatewayClient, data: Buffer): Promise<void> {
    client.lastActivity = Date.now();

    let message: GatewayRequest;
    try {
      message = JSON.parse(data.toString());
    } catch {
      this.sendError(ws, 'unknown', -32700, 'Parse error');
      return;
    }

    if ('method' in message) {
      await this.handleRequest(ws, client, message);
    }
  }

  private async handleRequest(
    ws: WebSocket,
    client: GatewayClient,
    request: GatewayRequest
  ): Promise<void> {
    const { id, method, params } = request;

    const handler = this.requestHandlers.get(method);
    if (!handler) {
      this.sendError(ws, id, -32601, `Method not found: ${method}`);
      return;
    }

    try {
      const result = await handler({ ...params, clientId: client.id });
      const response: GatewayResponse = { id, result };
      ws.send(JSON.stringify(response));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.sendError(ws, id, -32603, message);
    }
  }

  private sendError(ws: WebSocket, id: string, code: number, message: string): void {
    const response: GatewayResponse = {
      id,
      error: { code, message },
    };
    ws.send(JSON.stringify(response));
  }
}

export const createGatewayServer = (config: GatewayConfig): GatewayServer => {
  return new GatewayServer(config);
};
