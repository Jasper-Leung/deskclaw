/**
 * Browser Extension Bridge
 *
 * Provides communication with browser extensions via WebSocket server
 * This allows controlling the user's actual browser without remote debugging
 */

import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';

export interface ExtensionMessage {
  type: 'ping' | 'navigate' | 'click' | 'type' | 'snapshot' | 'evaluate' | 'screenshot';
  sessionId?: string;
  url?: string;
  selector?: string;
  text?: string;
  script?: string;
  data?: Record<string, unknown>;
}

export interface ExtensionResponse {
  type: 'pong' | 'success' | 'error' | 'result';
  data?: unknown;
  error?: string;
}

interface ScreenshotData {
  data: string; // base64 data URL
  timestamp: number;
  size: number;
  compressed?: string; // compressed version
}

/**
 * Estimate token count for base64 image data
 * Base64 is approximately 4 chars per token for images
 */
function estimateScreenshotTokens(base64Data: string): number {
  return Math.ceil(base64Data.length / 4);
}

/**
 * Extension Bridge Service
 * Manages WebSocket connection to browser extension
 */
class ExtensionBridgeService {
  private wsServer: WebSocketServer | null = null;
  private extensions = new Map<string, WebSocket>();
  private screenshots = new Map<string, ScreenshotData>();
  private lastScreenshot: ScreenshotData | null = null;
  private port = 9527;

  /**
   * Start the WebSocket server for extension connections
   */
  async startServer(port = 9527): Promise<void> {
    if (this.wsServer) {
      throw new Error('WebSocket server already running');
    }

    this.port = port;
    this.wsServer = new WebSocketServer({ port });

    this.wsServer.on('connection', (ws, _req) => {
      const clientId = crypto.randomUUID();
      this.extensions.set(clientId, ws);

      console.log(`Extension connected: ${clientId}`);

      ws.on('message', (data: Buffer) => {
        try {
          const message: ExtensionMessage = JSON.parse(data.toString());
          this.handleMessage(clientId, message, ws);
        } catch (error) {
          console.error('Failed to parse extension message:', error);
          ws.send(
            JSON.stringify({
              type: 'error',
              error: 'Invalid message format',
            } as ExtensionResponse)
          );
        }
      });

      ws.on('close', () => {
        console.log(`Extension disconnected: ${clientId}`);
        this.extensions.delete(clientId);
      });

      // Send welcome message
      ws.send(
        JSON.stringify({
          type: 'success',
          data: { message: 'Connected to DeskClaw Extension Bridge' },
        } as ExtensionResponse)
      );
    });

    console.log(`Extension Bridge WebSocket server started on port ${port}`);
  }

  /**
   * Stop the WebSocket server
   */
  async stopServer(): Promise<void> {
    if (this.wsServer) {
      this.wsServer.close();
      this.wsServer = null;
      this.extensions.clear();
      console.log('Extension Bridge WebSocket server stopped');
    }
  }

  /**
   * Handle incoming message from extension
   */
  private async handleMessage(
    clientId: string,
    message: ExtensionMessage,
    ws: WebSocket
  ): Promise<void> {
    switch (message.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' } as ExtensionResponse));
        break;

      case 'screenshot':
        // Handle screenshot - store the data
        if (message.data && message.data.screenshot) {
          const screenshotId = randomUUID();
          const base64Data = message.data.screenshot as string;

          // Calculate size (base64 length * 0.75 for original bytes)
          const originalSize = Math.floor(base64Data.length * 0.75);

          // Estimate tokens
          const estimatedTokens = estimateScreenshotTokens(base64Data);

          console.log(
            `[ExtensionBridge] Received screenshot: ${originalSize} bytes, ~${estimatedTokens} tokens`
          );

          const screenshotData: ScreenshotData = {
            data: base64Data,
            timestamp: Date.now(),
            size: originalSize,
          };

          // Store by ID
          this.screenshots.set(screenshotId, screenshotData);

          // Update last screenshot
          this.lastScreenshot = screenshotData;

          // Send acknowledgment with screenshot ID and metadata
          ws.send(
            JSON.stringify({
              type: 'success',
              data: {
                message: 'Screenshot received',
                screenshotId,
                size: originalSize,
                estimatedTokens,
                compressed: false,
              },
            } as ExtensionResponse)
          );

          console.log(`[ExtensionBridge] Screenshot stored with ID: ${screenshotId}`);
        } else {
          // Screenshot request without data - ask extension to capture
          ws.send(
            JSON.stringify({
              type: 'success',
              data: { message: 'Screenshot requested' },
            } as ExtensionResponse)
          );
        }
        break;

      default:
        console.log(`Extension message from ${clientId}:`, message);
    }
  }

  /**
   * Broadcast message to all connected extensions
   */
  broadcast(message: ExtensionMessage): void {
    const data = JSON.stringify(message);
    this.extensions.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  }

  /**
   * Send message to a specific extension
   */
  sendToExtension(clientId: string, message: ExtensionMessage): boolean {
    const ws = this.extensions.get(clientId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  /**
   * Get connected extension count
   */
  getExtensionCount(): number {
    return this.extensions.size;
  }

  /**
   * Get server port
   */
  getPort(): number {
    return this.port;
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.wsServer !== null;
  }

  /**
   * Get the most recent screenshot
   */
  getLastScreenshot(): ScreenshotData | null {
    return this.lastScreenshot;
  }

  /**
   * Get a screenshot by ID
   */
  getScreenshot(id: string): ScreenshotData | null {
    return this.screenshots.get(id) || null;
  }

  /**
   * Clear old screenshots (older than specified milliseconds)
   */
  clearOldScreenshots(olderThan: number = 300000): void {
    const now = Date.now();
    const idsToDelete: string[] = [];

    this.screenshots.forEach((screenshot, id) => {
      if (now - screenshot.timestamp > olderThan) {
        idsToDelete.push(id);
      }
    });

    idsToDelete.forEach((id) => this.screenshots.delete(id));

    if (idsToDelete.length > 0) {
      console.log(`[ExtensionBridge] Cleared ${idsToDelete.length} old screenshot(s)`);
    }
  }

  /**
   * Clear all screenshots
   */
  clearAllScreenshots(): void {
    this.screenshots.clear();
    this.lastScreenshot = null;
    console.log('[ExtensionBridge] All screenshots cleared');
  }

  /**
   * Get screenshot statistics
   */
  getScreenshotStats(): { count: number; totalSize: number; lastTimestamp: number | null } {
    let totalSize = 0;
    let lastTimestamp = 0;

    this.screenshots.forEach((screenshot) => {
      totalSize += screenshot.size;
      if (screenshot.timestamp > lastTimestamp) {
        lastTimestamp = screenshot.timestamp;
      }
    });

    return {
      count: this.screenshots.size,
      totalSize,
      lastTimestamp: lastTimestamp || null,
    };
  }
}

/**
 * Global extension bridge service instance
 */
export const extensionBridgeService = new ExtensionBridgeService();
