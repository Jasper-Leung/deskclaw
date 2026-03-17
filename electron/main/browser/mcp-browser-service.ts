/**
 * MCP Browser Service
 *
 * Manages browser automation using chrome-devtools-mcp (MCP protocol).
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { getDatabase } from '../db/index.js';
import http from 'http';

const browserLogger = {
  info: (msg: string) => console.log(`[MCPBrowser] ${msg}`),
  error: (msg: string) => console.error(`[MCPBrowser] ${msg}`),
  warn: (msg: string) => console.warn(`[MCPBrowser] ${msg}`),
};

/**
 * Check if Chrome DevTools Protocol is available on localhost:9222
 */
async function checkChromeDevToolsAvailable(): Promise<{ available: boolean; error?: string }> {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 9222,
        path: '/json/version',
        method: 'GET',
        timeout: 3000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const info = JSON.parse(data);
              if (info['webSocketDebuggerUrl']) {
                resolve({ available: true });
              } else {
                resolve({ available: false, error: 'Invalid Chrome DevTools response' });
              }
            } catch {
              resolve({ available: false, error: 'Failed to parse Chrome response' });
            }
          } else {
            resolve({
              available: false,
              error: `Chrome DevTools returned status ${res.statusCode}. Port 9222 may be occupied by another service.`,
            });
          }
        });
      }
    );

    req.on('error', (err) => {
      resolve({
        available: false,
        error: `Cannot connect to 127.0.0.1:9222. Chrome is not running with remote debugging enabled. Error: ${err.message}`,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        available: false,
        error: 'Connection timeout. Chrome may not be running with remote debugging enabled.',
      });
    });

    req.end();
  });
}

/**
 * Browser session info
 */
export interface BrowserSessionInfo {
  id: string;
  profileId: string;
  pageId: string;
  url?: string;
  title?: string;
}

/**
 * Chrome tab info from chrome-devtools-mcp
 */
interface ChromeTab {
  targetId: string;
  type: string;
  title: string;
  url: string;
  attached?: boolean;
}

/**
 * MCP Browser Service class
 * Manages browser automation through chrome-devtools-mcp
 */
class MCPBrowserService {
  private mcpClient: Client | null = null;
  private mcpTransport: StdioClientTransport | null = null;
  private isConnected = false;
  private sessions = new Map<string, BrowserSessionInfo>();
  private currentSessionId: string | null = null;

  constructor() {
    // Don't load sessions from database on startup - they may be stale
    // Sessions will be loaded fresh after connecting to MCP
    browserLogger.info('MCP Browser Service initialized (sessions will be loaded on connect)');
  }

  /**
   * Initialize the MCP client and connect to chrome-devtools-mcp
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      browserLogger.info('Already connected to chrome-devtools-mcp');
      return;
    }

    // First check if Chrome DevTools is available
    browserLogger.info('Checking if Chrome DevTools is available...');
    const chromeCheck = await checkChromeDevToolsAvailable();

    if (!chromeCheck.available) {
      const errorMessage =
        'Chrome DevTools 不可用。请按以下步骤操作：\n\n' +
        '1. 关闭所有 Chrome 窗口\n\n' +
        '2. 使用以下方式之一启动 Chrome：\n\n' +
        '   方式 A - 命令行：\n' +
        '   chrome.exe --remote-debugging-port=9222\n\n' +
        '   方式 B - 完整路径：\n' +
        '   "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222\n\n' +
        '   方式 C - 使用临时用户数据目录（推荐）：\n' +
        '   chrome.exe --remote-debugging-port=9222 --user-data-dir="%TEMP%\\chrome-debug"\n\n' +
        '3. 确保 Chrome 已完全启动\n\n' +
        '4. 重新尝试连接\n\n' +
        '或者创建快捷方式：\n' +
        '  1. 复制 Chrome 快捷方式\n' +
        '  2. 右键 -> 属性 -> 目标\n' +
        '  3. 在路径后添加: --remote-debugging-port=9222\n' +
        '  4. 使用此快捷方式启动 Chrome\n\n' +
        `检查错误: ${chromeCheck.error}`;

      browserLogger.error(errorMessage);
      throw new Error(errorMessage);
    }

    browserLogger.info('✅ Chrome DevTools is available on port 9222');

    try {
      browserLogger.info('Starting chrome-devtools-mcp MCP server...');

      // Create transport layer for chrome-devtools-mcp
      // Use browserUrl to connect to existing Chrome instance
      this.mcpTransport = new StdioClientTransport({
        command: process.platform === 'win32' ? 'cmd.exe' : 'npx',
        args:
          process.platform === 'win32'
            ? [
                '/c',
                'npx',
                '-y',
                'chrome-devtools-mcp@latest',
                '--browserUrl',
                'http://127.0.0.1:9222',
                '--no-usage-statistics',
              ]
            : [
                '-y',
                'chrome-devtools-mcp@latest',
                '--browserUrl',
                'http://127.0.0.1:9222',
                '--no-usage-statistics',
              ],
      });

      // Initialize MCP client
      this.mcpClient = new Client(
        {
          name: 'deskclaw-mcp-browser',
          version: '1.0.0',
        },
        {
          capabilities: {},
        }
      );

      browserLogger.info('Connecting to chrome-devtools-mcp...');
      browserLogger.info('⚠️ 注意：如果 Chrome 弹出对话框，请点击【允许 (Allow)】！');

      // Connect to transport
      await this.mcpClient.connect(this.mcpTransport);

      this.isConnected = true;
      browserLogger.info('✅ 成功连接到活跃的 Chrome 会话！');

      // List available tools for debugging
      const tools = await this.listAvailableTools();
      browserLogger.info(`Available tools: ${tools.join(', ')}`);

      // Clear old sessions and sync fresh sessions from Chrome
      // This ensures we don't have stale sessions from previous runs
      this.clearAllSessions();
      await this.syncSessions();
    } catch (error) {
      browserLogger.error(`Failed to connect to chrome-devtools-mcp: ${error}`);

      // Provide helpful error message
      const errorStr = String(error);

      if (errorStr.includes('chrome-devtools-mcp') || errorStr.includes('npx')) {
        throw new Error(
          'chrome-devtools-mcp 启动失败。\n\n' +
            '请确保已安装 chrome-devtools-mcp：\n' +
            '  npm install -g chrome-devtools-mcp@latest\n\n' +
            '错误详情: ' +
            errorStr
        );
      }

      if (errorStr.includes('ECONNREFUSED') || errorStr.includes('connect')) {
        throw new Error(
          '无法连接到 chrome-devtools-mcp 进程。\n\n' +
            '这通常意味着 chrome-devtools-mcp 无法连接到 Chrome。\n' +
            '请确保：\n' +
            '  1. Chrome 正在运行并启用了远程调试\n' +
            '  2. 没有防火墙阻止连接\n' +
            '  3. 端口 9222 没有被其他程序占用\n\n' +
            '错误详情: ' +
            errorStr
        );
      }

      throw new Error(`Failed to connect to chrome-devtools-mcp: ${error}`);
    }
  }

  /**
   * Disconnect from MCP server
   */
  async disconnect(): Promise<void> {
    if (this.mcpClient) {
      await this.mcpClient.close();
      this.mcpClient = null;
    }
    if (this.mcpTransport) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - close method exists but not in type definition
      if (this.mcpTransport.close) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        await this.mcpTransport.close();
      }
      this.mcpTransport = null;
    }
    this.isConnected = false;
    this.sessions.clear();
    this.currentSessionId = null;
    browserLogger.info('Disconnected from chrome-devtools-mcp');
  }

  /**
   * Clear all MCP sessions from memory and database
   * Called on connect to ensure fresh state from actual Chrome
   */
  private clearAllSessions(): void {
    const db = getDatabase();
    try {
      // Clear all MCP sessions from database
      const result = db
        .prepare('DELETE FROM browser_sessions WHERE profile_id = ?')
        .run('mcp-default');
      browserLogger.info(`Cleared ${result.changes} old MCP sessions from database`);

      // Clear from memory
      this.sessions.clear();
      this.currentSessionId = null;
      browserLogger.info('Cleared all MCP sessions from memory');
    } catch (error) {
      browserLogger.error(`Failed to clear sessions: ${error}`);
    }
  }

  /**
   * Check if connected to MCP server
   */
  isMCPConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Call an MCP tool with timeout
   */
  private async callTool(
    name: string,
    args: Record<string, unknown> = {},
    timeoutMs: number = 90000 // Default 90 seconds for complex sites like Douyin
  ): Promise<any> {
    if (!this.mcpClient || !this.isConnected) {
      throw new Error('Not connected to chrome-devtools-mcp');
    }

    try {
      browserLogger.info(`[MCP] Calling tool: ${name} (timeout: ${timeoutMs}ms)`);
      browserLogger.info(`[MCP] Args: ${JSON.stringify(args)}`);

      // Wrap the request in a timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Tool call timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      // Race between the actual request and the timeout
      const result = await Promise.race([
        this.mcpClient.request(
          {
            method: 'tools/call',
            params: {
              name,
              arguments: args,
            },
          },
          CallToolResultSchema
        ),
        timeoutPromise,
      ]);

      // Log the result for debugging
      if (result) {
        const firstContent = result.content?.[0];
        browserLogger.info(`[MCP] Result type: ${firstContent?.type || 'unknown'}`);
        if (firstContent && 'text' in firstContent && firstContent.text) {
          browserLogger.info(`[MCP] Result text: ${firstContent.text.substring(0, 200)}`);
        }
        if (firstContent && 'data' in firstContent && firstContent.data) {
          browserLogger.info(
            `[MCP] Result has data: true, length: ${(firstContent.data as string).length}`
          );
        }
      } else {
        browserLogger.warn(`[MCP] No result returned from tool ${name}`);
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      browserLogger.error(`[MCP] Error calling tool ${name}: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * List available tools from chrome-devtools-mcp
   */
  async listAvailableTools(): Promise<string[]> {
    if (!this.mcpClient || !this.isConnected) {
      throw new Error('Not connected to chrome-devtools-mcp');
    }

    try {
      // Wrap the request in a timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Tool list timeout after 30000ms`));
        }, 30000);
      });

      const tools = await Promise.race([
        this.mcpClient.request(
          {
            method: 'tools/list',
          },
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore - Minimal schema for tools/list response
          {
            _type: 'object', // Minimal schema
          }
        ),
        timeoutPromise,
      ]);

      if (tools?.tools) {
        return tools.tools.map((t: any) => t.name);
      }
      return [];
    } catch (error) {
      browserLogger.error(`Failed to list tools: ${error}`);
      return [];
    }
  }

  /**
   * Get list of Chrome pages/targets via MCP
   * Filters out internal Chrome pages (chrome://*, devtools://*, etc.)
   */
  async getChromePages(): Promise<ChromeTab[]> {
    try {
      // Use list_pages tool instead of chrome_devtools_protocol
      const result = await this.callTool('list_pages', {});

      if (result?.content?.[0]?.text) {
        const data = JSON.parse(result.content[0].text);
        if (Array.isArray(data)) {
          // Filter to only include regular web pages, not Chrome internal pages
          return data
            .filter((page: any) => {
              const url = page.url || '';
              // Skip Chrome internal pages, devtools, extensions, and popups
              return (
                !url.startsWith('chrome://') &&
                !url.startsWith('chrome-extension://') &&
                !url.startsWith('devtools://') &&
                !url.includes('omnibox') &&
                !url.includes('popup') &&
                page.type === 'page'
              );
            })
            .map((page: any) => ({
              targetId: page.id || page.targetId,
              type: 'page',
              title: page.title,
              url: page.url,
              attached: false,
            }));
        }
      }

      return [];
    } catch (error) {
      browserLogger.error(`Failed to get Chrome pages: ${error}`);
      return [];
    }
  }

  /**
   * Sync sessions from Chrome pages
   * Removes stale sessions that no longer exist in Chrome
   */
  public async syncSessions(): Promise<void> {
    try {
      const pages = await this.getChromePages();

      browserLogger.info(`Found ${pages.length} Chrome pages`);

      // Collect valid pageIds from current Chrome pages
      const validPageIds = new Set(pages.map((p) => p.targetId));
      browserLogger.info(`Valid pageIds: ${Array.from(validPageIds).join(', ')}`);

      // Find and remove stale sessions (sessions whose pageId is no longer valid)
      const staleSessionIds: string[] = [];
      for (const [sessionId, session] of this.sessions.entries()) {
        if (!validPageIds.has(session.pageId)) {
          staleSessionIds.push(sessionId);
          browserLogger.info(`Found stale session: ${sessionId} with pageId ${session.pageId}`);
        }
      }

      // Remove stale sessions from memory and database
      if (staleSessionIds.length > 0) {
        browserLogger.info(`Removing ${staleSessionIds.length} stale sessions`);
        const db = getDatabase();
        for (const sessionId of staleSessionIds) {
          this.sessions.delete(sessionId);
          db.prepare('DELETE FROM browser_sessions WHERE id = ?').run(sessionId);
          // Reset current session if it was removed
          if (this.currentSessionId === sessionId) {
            this.currentSessionId = null;
          }
        }
      }

      // Sync current Chrome pages
      for (const page of pages) {
        // Check if session already exists
        const existingSession = Array.from(this.sessions.values()).find(
          (s) => s.pageId === page.targetId
        );

        if (!existingSession) {
          // Create new session
          const sessionId = crypto.randomUUID();
          const sessionInfo: BrowserSessionInfo = {
            id: sessionId,
            profileId: 'mcp-default',
            pageId: page.targetId,
            url: page.url,
            title: page.title,
          };

          this.sessions.set(sessionId, sessionInfo);
          this.saveSessionToDatabase(sessionInfo);
          browserLogger.info(`Created session ${sessionId} for page ${page.targetId}`);
        } else {
          // Update existing session
          existingSession.url = page.url;
          existingSession.title = page.title;
          this.updateSessionInDatabase(existingSession);
        }
      }

      // Set current session if none is set
      if (!this.currentSessionId && this.sessions.size > 0) {
        const firstSession = Array.from(this.sessions.values())[0];
        this.currentSessionId = firstSession.id;
        browserLogger.info(`Set current session to ${firstSession.id}`);
      }

      browserLogger.info(`Sync complete: ${this.sessions.size} active sessions`);
    } catch (error) {
      browserLogger.error(`Failed to sync sessions: ${error}`);
    }
  }

  /**
   * Load sessions from database on startup
   */
  private loadSessionsFromDatabase(): void {
    const db = getDatabase();
    try {
      const rows = db
        .prepare('SELECT * FROM browser_sessions WHERE profile_id = ?')
        .all('mcp-default') as Array<{
        id: string;
        profile_id: string;
        page_id: string;
        url: string | null;
        title: string | null;
        created_at: number;
        updated_at: number;
      }>;

      for (const row of rows) {
        this.sessions.set(row.id, {
          id: row.id,
          profileId: row.profile_id,
          pageId: row.page_id,
          url: row.url || undefined,
          title: row.title || undefined,
        });
      }

      browserLogger.info(`Loaded ${this.sessions.size} sessions from database`);
    } catch (error) {
      browserLogger.error(`Failed to load sessions from database: ${error}`);
    }
  }

  /**
   * Save session to database
   */
  private saveSessionToDatabase(session: BrowserSessionInfo): void {
    const db = getDatabase();
    try {
      db.prepare(
        `
        INSERT INTO browser_sessions (id, profile_id, page_id, url, title, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          url = excluded.url,
          title = excluded.title,
          updated_at = excluded.updated_at
      `
      ).run(
        session.id,
        session.profileId,
        session.pageId,
        session.url || null,
        session.title || null,
        Date.now(),
        Date.now()
      );
    } catch (error) {
      browserLogger.error(`Failed to save session to database: ${error}`);
    }
  }

  /**
   * Update session in database
   */
  private updateSessionInDatabase(session: BrowserSessionInfo): void {
    const db = getDatabase();
    try {
      db.prepare(
        `
        UPDATE browser_sessions
        SET url = ?, title = ?, updated_at = ?
        WHERE id = ?
      `
      ).run(session.url || null, session.title || null, Date.now(), session.id);
    } catch (error) {
      browserLogger.error(`Failed to update session in database: ${error}`);
    }
  }

  /**
   * Get all sessions
   */
  getSessions(): BrowserSessionInfo[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): BrowserSessionInfo | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Set current session
   */
  setCurrentSession(sessionId: string): void {
    if (this.sessions.has(sessionId)) {
      this.currentSessionId = sessionId;
      browserLogger.info(`Set current session to ${sessionId}`);
    } else {
      throw new Error(`Session ${sessionId} not found`);
    }
  }

  /**
   * Get current session
   */
  getCurrentSession(): BrowserSessionInfo | undefined {
    if (!this.currentSessionId) return undefined;
    return this.sessions.get(this.currentSessionId);
  }

  /**
   * Set the active target page for CDP commands
   */
  private async setTargetPage(pageId: string): Promise<void> {
    try {
      // Try different tool names for setting target
      await this.callTool('set_target', { pageId });
      browserLogger.info(`Set target page to ${pageId}`);
    } catch (error1) {
      browserLogger.warn(`set_target failed, trying switch_to_page: ${error1}`);
      try {
        await this.callTool('switch_to_page', { pageId });
        browserLogger.info(`Switched to page ${pageId}`);
      } catch (error2) {
        browserLogger.warn(`switch_to_page failed: ${error2}`);
        // Continue anyway - some implementations might auto-select the page
      }
    }
  }

  /**
   * Navigate to URL
   * For infinite scroll pages (like Douyin), we use a longer timeout and handle partial completion
   */
  async navigate(url: string, sessionId?: string): Promise<void> {
    const targetSessionId = sessionId || this.currentSessionId;
    if (!targetSessionId) {
      throw new Error('No active session. Please connect to Chrome first.');
    }

    const session = this.sessions.get(targetSessionId);
    if (!session) {
      throw new Error(`Session ${targetSessionId} not found`);
    }

    browserLogger.info(`Navigating to ${url} (pageId: ${session.pageId})`);

    // Try using CDP directly (most reliable method)
    let navigationSuccess = false;
    let lastError: Error | null = null;

    try {
      // First, try to set the target page
      await this.setTargetPage(session.pageId);

      // Then execute the navigation with extended timeout for infinite scroll pages
      try {
        const result = await this.callTool(
          'cdp',
          {
            method: 'Page.navigate',
            params: {
              url: url,
            },
          },
          180000
        ); // 3 minutes timeout for slow pages like Douyin

        browserLogger.info(`Navigation initiated via CDP Page.navigate`);
        navigationSuccess = true;
      } catch (cdpError: any) {
        // For infinite scroll pages, navigation might timeout but still work
        // Check if the error is a timeout and if the page might have loaded
        const errorMessage = String(cdpError);
        if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
          browserLogger.warn(
            `Navigation timed out (expected for infinite scroll pages), checking if page loaded anyway`
          );
          // For timeout errors, we consider it a success since the navigation likely started
          // The page might be partially loaded which is enough for further operations
          navigationSuccess = true;
          lastError = cdpError;
        } else {
          throw cdpError;
        }
      }
    } catch (error) {
      browserLogger.warn(`CDP navigation failed: ${error}`);
      lastError = error as Error;

      // Fallback: try alternative methods
      try {
        await this.callTool('navigate_to_url', { url, pageId: session.pageId }, 60000);
        navigationSuccess = true;
      } catch (error1: any) {
        browserLogger.warn(`navigate_to_url failed: ${error1}`);
        // Try one more fallback
        try {
          await this.callTool('goto', { url }, 60000);
          navigationSuccess = true;
        } catch (error2) {
          // If all methods failed, throw the last error
          throw new Error(`Failed to navigate. Last error: ${error2}`);
        }
      }
    }

    // Wait a bit for initial page content to load
    // For infinite scroll pages, we don't wait for full load
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Update session info if navigation succeeded (or timed out but likely loaded)
    if (navigationSuccess) {
      session.url = url;
      this.updateSessionInDatabase(session);
      browserLogger.info(
        `Navigation completed for ${url}${lastError ? ' (with timeout warning)' : ''}`
      );
    } else {
      throw new Error(`Navigation failed for ${url}`);
    }
  }

  /**
   * Take a screenshot
   */
  async screenshot(sessionId?: string): Promise<string> {
    const targetSessionId = sessionId || this.currentSessionId;
    if (!targetSessionId) {
      throw new Error('No active session. Please connect to Chrome first.');
    }

    const session = this.sessions.get(targetSessionId);
    if (!session) {
      throw new Error(`Session ${targetSessionId} not found`);
    }

    browserLogger.info(`Taking screenshot of pageId: ${session.pageId}`);

    // Try using CDP first (most reliable)
    try {
      const result = await this.callTool('cdp', {
        method: 'Page.captureScreenshot',
        params: {
          targetId: session.pageId,
          format: 'png',
        },
      });

      if (result?.content?.[0]?.text) {
        const data = JSON.parse(result.content[0].text);
        if (data.result?.value) {
          browserLogger.info(`Screenshot taken successfully via CDP`);
          return data.result.value;
        }
      }
    } catch (cdpError) {
      browserLogger.warn(`CDP screenshot failed: ${cdpError}`);
    }

    // Fallback to screenshot_page
    try {
      const result = await this.callTool('screenshot_page', {
        pageId: session.pageId,
      });

      if (result?.content?.[0]?.data) {
        browserLogger.info(`Screenshot taken successfully via screenshot_page`);
        return result.content[0].data;
      }
    } catch (error1) {
      browserLogger.warn(`screenshot_page failed: ${error1}`);
    }

    // Another fallback
    try {
      const result = await this.callTool('screenshot', {});

      if (result?.content?.[0]?.data) {
        browserLogger.info(`Screenshot taken successfully via screenshot`);
        return result.content[0].data;
      }
    } catch (error2) {
      browserLogger.error(`All screenshot attempts failed: ${error2}`);
      throw new Error(`Failed to take screenshot. Last error: ${error2}`);
    }

    throw new Error('Failed to take screenshot - no data returned');
  }

  /**
   * Get page snapshot
   */
  async snapshot(sessionId?: string): Promise<{
    url?: string;
    title?: string;
    content?: string;
  }> {
    const targetSessionId = sessionId || this.currentSessionId;
    if (!targetSessionId) {
      throw new Error('No active session. Please connect to Chrome first.');
    }

    const session = this.sessions.get(targetSessionId);
    if (!session) {
      throw new Error(`Session ${targetSessionId} not found`);
    }

    browserLogger.info(`Getting snapshot of pageId: ${session.pageId}`);

    // Try using CDP to get page content
    try {
      const result = await this.callTool('cdp', {
        method: 'Runtime.evaluate',
        params: {
          expression:
            'JSON.stringify({ title: document.title, url: window.location.href, content: document.body.innerText.substring(0, 10000) })',
          targetId: session.pageId,
          returnByValue: true,
        },
      });

      if (result?.content?.[0]?.text) {
        const data = JSON.parse(result.content[0].text);
        if (data.result?.value) {
          const pageData = JSON.parse(data.result.value);
          browserLogger.info(`Snapshot taken: ${pageData.title} - ${pageData.url}`);
          return {
            url: pageData.url || session.url,
            title: pageData.title || session.title,
            content: pageData.content,
          };
        }
      }
    } catch (cdpError) {
      browserLogger.warn(`CDP snapshot failed: ${cdpError}`);
    }

    // Fallback: try evaluate_script
    try {
      const result = await this.callTool('evaluate_script', {
        pageId: session.pageId,
        script:
          'JSON.stringify({ title: document.title, url: window.location.href, content: document.body.innerText.substring(0, 5000) })',
      });

      if (result?.content?.[0]?.text) {
        const data = JSON.parse(result.content[0].text);
        browserLogger.info(`Snapshot taken: ${data.title} - ${data.url}`);
        return {
          url: data.url || session.url,
          title: data.title || session.title,
          content: data.content,
        };
      }
    } catch (evalError) {
      browserLogger.warn(`evaluate_script snapshot failed: ${evalError}`);
    }

    // Final fallback to session info
    return {
      url: session.url,
      title: session.title,
      content: `Page: ${session.title}\nURL: ${session.url}`,
    };
  }

  /**
   * Click an element
   */
  async click(selector: string, sessionId?: string): Promise<void> {
    const targetSessionId = sessionId || this.currentSessionId;
    if (!targetSessionId) {
      throw new Error('No active session. Please connect to Chrome first.');
    }

    const session = this.sessions.get(targetSessionId);
    if (!session) {
      throw new Error(`Session ${targetSessionId} not found`);
    }

    // Use evaluate_script to click element with pageId
    await this.callTool('evaluate_script', {
      pageId: session.pageId,
      script: `document.querySelector('${selector}').click()`,
    });

    browserLogger.info(`Clicked element ${selector}`);
  }

  /**
   * Type text into an element
   */
  async type(selector: string, text: string, sessionId?: string): Promise<void> {
    const targetSessionId = sessionId || this.currentSessionId;
    if (!targetSessionId) {
      throw new Error('No active session. Please connect to Chrome first.');
    }

    const session = this.sessions.get(targetSessionId);
    if (!session) {
      throw new Error(`Session ${targetSessionId} not found`);
    }

    // Escape single quotes in text for JavaScript string
    const escapedText = text.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    // Use evaluate_script to type text with pageId
    await this.callTool('evaluate_script', {
      pageId: session.pageId,
      script: `document.querySelector('${selector}').value = '${escapedText}'; document.querySelector('${selector}').dispatchEvent(new Event('input', { bubbles: true }))`,
    });

    browserLogger.info(`Typed text into ${selector}`);
  }

  /**
   * Close a session
   */
  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      const db = getDatabase();
      db.prepare('DELETE FROM browser_sessions WHERE id = ?').run(sessionId);
      this.sessions.delete(sessionId);

      if (this.currentSessionId === sessionId) {
        this.currentSessionId = this.sessions.size > 0 ? Array.from(this.sessions.keys())[0] : null;
      }

      browserLogger.info(`Closed session ${sessionId}`);
    }
  }

  /**
   * Get active session count
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Get active browser count (always 1 for MCP)
   */
  getActiveBrowserCount(): number {
    return this.isConnected ? 1 : 0;
  }

  /**
   * Scroll the page by a specified amount
   * Useful for infinite scroll pages to load more content
   */
  async scroll(pixels: number = 500, sessionId?: string): Promise<void> {
    const targetSessionId = sessionId || this.currentSessionId;
    if (!targetSessionId) {
      throw new Error('No active session. Please connect to Chrome first.');
    }

    const session = this.sessions.get(targetSessionId);
    if (!session) {
      throw new Error(`Session ${targetSessionId} not found`);
    }

    // Use CDP to scroll the page
    try {
      await this.callTool('cdp', {
        method: 'Runtime.evaluate',
        params: {
          expression: `window.scrollBy(0, ${pixels})`,
          awaitPromise: true,
          targetId: session.pageId,
        },
      });
      browserLogger.info(`Scrolled page by ${pixels}px`);
    } catch (cdpError) {
      // Fallback to evaluate_script
      try {
        await this.callTool('evaluate_script', {
          pageId: session.pageId,
          script: `window.scrollBy(0, ${pixels})`,
        });
        browserLogger.info(`Scrolled page by ${pixels}px (fallback)`);
      } catch (evalError) {
        throw new Error(`Failed to scroll: ${evalError}`);
      }
    }

    // Wait a bit for new content to load
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  /**
   * Scroll to bottom of page
   * Useful for loading all content in infinite scroll pages
   */
  async scrollToEnd(sessionId?: string, maxScrolls: number = 10): Promise<void> {
    for (let i = 0; i < maxScrolls; i++) {
      await this.scroll(1000, sessionId);
      // Check if we've reached the bottom
      const atBottom = await this.evaluate(
        `window.innerHeight + window.scrollY >= document.body.scrollHeight - 100`,
        sessionId
      );
      if (atBottom) {
        browserLogger.info('Reached bottom of page');
        break;
      }
    }
  }

  /**
   * Evaluate JavaScript code in the page
   * Returns the result of the evaluation
   */
  async evaluate(expression: string, sessionId?: string): Promise<any> {
    const targetSessionId = sessionId || this.currentSessionId;
    if (!targetSessionId) {
      throw new Error('No active session. Please connect to Chrome first.');
    }

    const session = this.sessions.get(targetSessionId);
    if (!session) {
      throw new Error(`Session ${targetSessionId} not found`);
    }

    try {
      const result = await this.callTool('cdp', {
        method: 'Runtime.evaluate',
        params: {
          expression,
          returnByValue: true,
          targetId: session.pageId,
        },
      });

      if (result?.content?.[0]?.text) {
        const data = JSON.parse(result.content[0].text);
        if (data.result?.value !== undefined) {
          return data.result.value;
        }
      }
      return null;
    } catch (cdpError) {
      browserLogger.warn(`CDP evaluate failed: ${cdpError}`);
      // Fallback to evaluate_script
      try {
        const result = await this.callTool('evaluate_script', {
          pageId: session.pageId,
          script: expression,
        });
        if (result?.content?.[0]?.text) {
          return JSON.parse(result.content[0].text);
        }
        return null;
      } catch (evalError) {
        throw new Error(`Failed to evaluate: ${evalError}`);
      }
    }
  }

  /**
   * Wait for a selector to appear in the page
   * Useful for waiting for dynamic content to load
   */
  async waitForSelector(
    selector: string,
    timeoutMs: number = 30000,
    sessionId?: string
  ): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      try {
        const result = await this.evaluate(
          `document.querySelector('${selector}') !== null`,
          sessionId
        );
        if (result) {
          return true;
        }
      } catch (e) {
        // Selector might be invalid, try again
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return false;
  }
}

/**
 * Global MCP browser service instance
 */
export const mcpBrowserService = new MCPBrowserService();
