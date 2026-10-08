/**
 * Tools System Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Mock the database module
vi.mock('../db/index.js', () => ({
  getDatabase: vi.fn(() => ({
    prepare: vi.fn((query) => {
      if (query.includes('workDirectory')) {
        return {
          get: vi.fn(() => ({ value: path.join(os.tmpdir(), 'deskclaw-test') })),
        };
      }
      if (query.includes('channels')) {
        return {
          get: vi.fn(() => ({ id: 'test-channel', channel_type: 'telegram', enabled: 1 })),
        };
      }
      if (query.includes('channel_messages')) {
        return {
          run: vi.fn(),
        };
      }
      return { get: vi.fn(), run: vi.fn(), all: vi.fn(() => []) };
    }),
  })),
}));

// Mock channel registry
vi.mock('../channels/channel-registry.js', () => ({
  channelRegistry: {
    getPlugin: vi.fn(() => ({
      sendMessage: vi.fn(async () => 'msg123'),
    })),
  },
}));

// Mock Electron app
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/test-userdata'),
  },
}));

// Mock browser service
vi.mock('../browser/browser-service.js', () => ({
  browserService: {
    getActiveSessionCount: vi.fn(() => 1),
    navigate: vi.fn(),
    click: vi.fn(),
    type: vi.fn(),
    screenshot: vi.fn(async () => Buffer.from('fake-image')),
    snapshot: vi.fn(async () => ({ title: 'Test Page' })),
  },
}));

// Mock extension bridge
vi.mock('../browser/extension-bridge.js', () => ({
  extensionBridgeService: {
    isRunning: vi.fn(() => false),
    getExtensionCount: vi.fn(() => 0),
    broadcast: vi.fn(),
    getLastScreenshot: vi.fn(() => null),
  },
}));

// Mock skills executor
vi.mock('../skills/skill-executor.js', () => ({
  getSkillExecutor: vi.fn(() => ({
    verifyDependency: vi.fn(async () => true),
    executeSkill: vi.fn(async () => ({ success: true, output: 'test output' })),
  })),
}));

// Mock executeShell
vi.mock('../ipc/shell.js', () => ({
  executeShell: vi.fn(async () => ({ stdout: 'test output', stderr: '', exitCode: 0 })),
}));

// Mock executeSkill and getEnabledSkills
vi.mock('../ipc/skills.js', () => ({
  executeSkill: vi.fn(async () => ({ success: true, output: 'test output' })),
  getEnabledSkills: vi.fn(() => []),
}));

type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;

// Network tools call public APIs (DuckDuckGo, Yahoo Finance). Stubbing fetch
// keeps the suite deterministic and stops a slow or unreachable endpoint from
// stalling the pre-push hook.
function stubFetch(handler: FetchHandler) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown, init?: RequestInit) => handler(String(input), init))
  );
}

const jsonResponse = (data: unknown) =>
  new Response(JSON.stringify(data), {
    status: 200,
    statusText: 'OK',
    headers: { 'Content-Type': 'application/json' },
  });

describe('Tools System', () => {
  const testDir = path.join(os.tmpdir(), 'deskclaw-test');

  beforeEach(async () => {
    // Create test directory
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  describe('getTool', () => {
    it('should return a tool by name', async () => {
      const { getTool } = await import('./index.js');
      const tool = getTool('file_read');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('file_read');
    });

    it('should return undefined for non-existent tool', async () => {
      const { getTool } = await import('./index.js');
      const tool = getTool('non_existent_tool');
      expect(tool).toBeUndefined();
    });

    it('should return all file operation tools', async () => {
      const { getTool } = await import('./index.js');
      expect(getTool('file_read')).toBeDefined();
      expect(getTool('file_write')).toBeDefined();
      expect(getTool('file_list')).toBeDefined();
      expect(getTool('set_work_directory')).toBeDefined();
      expect(getTool('get_work_directory')).toBeDefined();
    });

    it('should return all network tools', async () => {
      const { getTool } = await import('./index.js');
      expect(getTool('web_search')).toBeDefined();
      expect(getTool('http_request')).toBeDefined();
      expect(getTool('web_scrape')).toBeDefined();
    });

    it('should return all system tools', async () => {
      const { getTool } = await import('./index.js');
      expect(getTool('get_time')).toBeDefined();
      expect(getTool('execute_command')).toBeDefined();
    });

    it('should return control tools', async () => {
      const { getTool } = await import('./index.js');
      expect(getTool('screenshot')).toBeDefined();
      expect(getTool('mouse_move')).toBeDefined();
      expect(getTool('mouse_click')).toBeDefined();
      expect(getTool('keyboard_type')).toBeDefined();
    });
  });

  describe('getAvailableTools', () => {
    it('should return all available tools', async () => {
      const { getAvailableTools } = await import('./index.js');
      const tools = getAvailableTools();
      expect(tools).toBeDefined();
      expect(typeof tools).toBe('object');
      expect(Object.keys(tools).length).toBeGreaterThan(0);
    });

    it('should include both regular and control tools', async () => {
      const { getAvailableTools } = await import('./index.js');
      const tools = getAvailableTools();
      expect(tools.file_read).toBeDefined();
      expect(tools.screenshot).toBeDefined();
    });
  });

  describe('getToolsSchema', () => {
    it('should return tools schema for LLM function calling', async () => {
      const { getToolsSchema } = await import('./index.js');
      const schema = getToolsSchema();
      expect(schema).toBeDefined();
      expect(typeof schema).toBe('object');
    });

    it('should include tool name and description in schema', async () => {
      const { getToolsSchema } = await import('./index.js');
      const schema = getToolsSchema();
      const fileReadSchema = schema.file_read;
      expect(fileReadSchema).toBeDefined();
      expect(fileReadSchema.type).toBe('function');
      expect(fileReadSchema.function.name).toBe('file_read');
      expect(fileReadSchema.function.description).toBeDefined();
    });

    it('should include parameters in schema', async () => {
      const { getToolsSchema } = await import('./index.js');
      const schema = getToolsSchema();
      const fileReadSchema = schema.file_read;
      expect(fileReadSchema.function.parameters).toBeDefined();
      expect(fileReadSchema.function.parameters.type).toBe('object');
    });
  });

  describe('file_read tool', () => {
    it('should read file content', async () => {
      const { executeTool } = await import('./index.js');
      const testFile = path.join(testDir, 'test-read.txt');
      await fs.writeFile(testFile, 'Hello, World!');
      const result = await executeTool('file_read', { filepath: testFile });
      expect(result.error).toBeUndefined();
      expect(result.result).toBeDefined();
      expect((result.result as { content: string }).content).toContain('Hello, World!');
    });

    it('should return error for non-existent file', async () => {
      const { executeTool } = await import('./index.js');
      const result = await executeTool('file_read', { filepath: 'non-existent.txt' });
      expect(result.error).toBeDefined();
      expect(result.result).toBeNull();
    });

    it('should limit file size for display', async () => {
      const { executeTool } = await import('./index.js');
      const testFile = path.join(testDir, 'test-large.txt');
      const largeContent = 'x'.repeat(20000);
      await fs.writeFile(testFile, largeContent);
      const result = await executeTool('file_read', { filepath: testFile });
      expect(result.error).toBeUndefined();
      expect((result.result as { content: string }).content.length).toBeLessThan(
        largeContent.length
      );
    });
  });

  describe('file_write tool', () => {
    it('should write file content', async () => {
      const { executeTool } = await import('./index.js');
      const testFile = path.join(testDir, 'test-write.txt');
      const result = await executeTool('file_write', {
        filepath: testFile,
        content: 'Test content',
      });
      expect(result.error).toBeUndefined();
      expect((result.result as { success: boolean }).success).toBe(true);

      // Verify file was written
      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe('Test content');
    });

    it('should create parent directories if they do not exist', async () => {
      const { executeTool } = await import('./index.js');
      const testFile = path.join(testDir, 'subdir', 'test-write.txt');
      const result = await executeTool('file_write', {
        filepath: testFile,
        content: 'Test content',
      });
      expect(result.error).toBeUndefined();

      // Verify file was written
      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe('Test content');
    });
  });

  describe('file_list tool', () => {
    it('should list files in directory', async () => {
      const { executeTool } = await import('./index.js');
      await fs.writeFile(path.join(testDir, 'file1.txt'), 'content1');
      await fs.writeFile(path.join(testDir, 'file2.txt'), 'content2');
      await fs.mkdir(path.join(testDir, 'subdir'));

      const result = await executeTool('file_list', { path: testDir });
      expect(result.error).toBeUndefined();
      expect((result.result as { exists: boolean }).exists).toBe(true);
      expect((result.result as { total: number }).total).toBeGreaterThan(0);
    });

    it('should filter files by pattern', async () => {
      const { executeTool } = await import('./index.js');
      await fs.writeFile(path.join(testDir, 'file1.txt'), 'content1');
      await fs.writeFile(path.join(testDir, 'file2.js'), 'content2');
      await fs.writeFile(path.join(testDir, 'file3.txt'), 'content3');

      const result = await executeTool('file_list', { path: testDir, pattern: '*.txt' });
      expect(result.error).toBeUndefined();
      const entries = (result.result as { entries: Array<{ name: string }> }).entries;
      const txtFiles = entries.filter((e) => e.name.endsWith('.txt'));
      expect(txtFiles.length).toBe(2);
    });

    it('should handle non-existent directory gracefully', async () => {
      const { executeTool } = await import('./index.js');
      const result = await executeTool('file_list', { path: '/non/existent/path' });
      expect((result.result as { exists: boolean }).exists).toBe(false);
    });
  });

  describe('get_time tool', () => {
    it('should return current time', async () => {
      const { executeTool } = await import('./index.js');
      const result = await executeTool('get_time', {});
      expect(result.error).toBeUndefined();
      expect((result.result as { current_time: string }).current_time).toBeDefined();
      expect((result.result as { iso: string }).iso).toBeDefined();
      expect((result.result as { unix: number }).unix).toBeDefined();
    });

    it('should return time in specified timezone', async () => {
      const { executeTool } = await import('./index.js');
      const result = await executeTool('get_time', { timezone: 'UTC' });
      expect(result.error).toBeUndefined();
      expect((result.result as { timezone: string }).timezone).toBe('UTC');
    });
  });

  describe('web_search tool', () => {
    it('should search the web', async () => {
      const { executeTool } = await import('./index.js');
      stubFetch((url) => {
        if (url.includes('api.duckduckgo.com')) {
          return jsonResponse({
            Answer: 'Vitest',
            AbstractText: 'Vitest is a fast unit test framework.',
            RelatedTopics: [{ Text: 'Related one' }, { Text: 'Related two' }],
          });
        }
        return jsonResponse({});
      });

      const result = await executeTool('web_search', { query: 'vitest' });
      expect(result.error).toBeUndefined();
      const payload = result.result as { query: string; answer: string; source: string };
      expect(payload.query).toBe('vitest');
      expect(payload.answer).toContain('Vitest');
      expect(payload.source).toBe('DuckDuckGo Instant Answer');
    });

    it('should fall back to Wikipedia when DuckDuckGo returns no matches', async () => {
      const { executeTool } = await import('./index.js');
      stubFetch((url) => {
        if (url.includes('api.duckduckgo.com')) {
          return jsonResponse({});
        }
        // Wikipedia is queried twice: first for the title list, then the extract.
        if (url.includes('wikipedia.org') && url.includes('prop=extracts')) {
          return jsonResponse({
            query: { pages: { 1234: { extract: 'Vitest is a fast unit test framework.' } } },
          });
        }
        if (url.includes('wikipedia.org')) {
          return jsonResponse({ query: { search: [{ title: 'Vitest' }] } });
        }
        return jsonResponse({});
      });

      const result = await executeTool('web_search', { query: 'vitest' });
      expect(result.error).toBeUndefined();
      const payload = result.result as { answer: string; source: string };
      expect(payload.source).toBe('Wikipedia');
      expect(payload.answer).toContain('Vitest is a fast unit test framework.');
    });

    it('should surface an error when every engine fails', async () => {
      const { executeTool } = await import('./index.js');
      stubFetch(() => new Response('', { status: 503, statusText: 'Service Unavailable' }));

      const result = await executeTool('web_search', { query: 'vitest' });
      expect(result.result).toBeNull();
      expect(result.error).toBeDefined();
    });
  });

  describe('http_request tool', () => {
    it('should make HTTP GET request', async () => {
      const { executeTool } = await import('./index.js');
      stubFetch((url) => jsonResponse({ url }));

      const result = await executeTool('http_request', {
        url: 'https://httpbin.org/get',
        method: 'GET',
      });
      expect(result.error).toBeUndefined();
      const payload = result.result as {
        status: number;
        method: string;
        body: Record<string, string>;
      };
      expect(payload.status).toBe(200);
      expect(payload.method).toBe('GET');
      expect(payload.body.url).toBe('https://httpbin.org/get');
    });

    it('should make HTTP POST request', async () => {
      const { executeTool } = await import('./index.js');
      let sentBody: string | undefined;
      stubFetch((_url, init) => {
        sentBody = typeof init?.body === 'string' ? init.body : undefined;
        return jsonResponse({ ok: true });
      });

      const result = await executeTool('http_request', {
        url: 'https://httpbin.org/post',
        method: 'POST',
        body: { test: 'data' },
      });
      expect(result.error).toBeUndefined();
      expect(JSON.parse(sentBody ?? '{}')).toEqual({ test: 'data' });
    });

    it('should return the error status from the remote endpoint', async () => {
      const { executeTool } = await import('./index.js');
      stubFetch(() => new Response('nope', { status: 404, statusText: 'Not Found' }));

      const result = await executeTool('http_request', {
        url: 'https://httpbin.org/status/404',
        method: 'GET',
      });
      const payload = result.result as { status: number; body: string };
      expect(payload.status).toBe(404);
      expect(payload.body).toBe('nope');
    });
  });

  describe('scheduled_* tools', () => {
    it('should list scheduled tasks', async () => {
      const { executeTool } = await import('./index.js');
      const result = await executeTool('scheduled_list', {});
      expect(result.error).toBeUndefined();
      expect((result.result as { tasks: unknown }).tasks).toBeDefined();
      expect(Array.isArray((result.result as { tasks: unknown }).tasks)).toBe(true);
    });

    it('should create scheduled task', async () => {
      const { executeTool } = await import('./index.js');
      const result = await executeTool('scheduled_create', {
        name: 'Test Task',
        type: 'reminder',
        cron: '*/5 * * * *',
        task: { message: 'Test reminder' },
        enabled: false,
      });
      expect(result.error).toBeUndefined();
      expect((result.result as { id: string }).id).toBeDefined();
    });

    it('should validate task type', async () => {
      const { executeTool } = await import('./index.js');
      const result = await executeTool('scheduled_create', {
        name: 'Test Task',
        type: 'invalid_type',
        cron: '*/5 * * * *',
      });
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Invalid type');
    });
  });

  describe('workflow_list tool', () => {
    it('should list workflows', async () => {
      const { executeTool } = await import('./index.js');
      const result = await executeTool('workflow_list', {});
      expect(result.error).toBeUndefined();
      expect((result.result as { workflows: unknown }).workflows).toBeDefined();
      expect(Array.isArray((result.result as { workflows: unknown }).workflows)).toBe(true);
    });
  });

  describe('send_message tool', () => {
    it('should send message to channel', async () => {
      const { executeTool } = await import('./index.js');
      const result = await executeTool('send_message', {
        channel_id: 'test-channel',
        peer_id: '12345',
        message: 'Test message',
      });
      expect(result.error).toBeUndefined();
      expect((result.result as { messageId: string }).messageId).toBeDefined();
    });
  });

  describe('browser_* tools', () => {
    it('should list browser sessions', async () => {
      const { executeTool } = await import('./index.js');
      const result = await executeTool('browser_list', {});
      expect(result.error).toBeUndefined();
      expect(result.result).toBeDefined();
    });
  });

  describe('stock_quote tool', () => {
    const symbolFromUrl = (url: string) =>
      decodeURIComponent(url.split('/chart/')[1].split('?')[0]);

    const yahooResponse = (symbol: string, price: number) =>
      jsonResponse({
        chart: {
          result: [
            {
              meta: {
                shortName: `${symbol} Inc.`,
                longName: `${symbol} Incorporated`,
                regularMarketPrice: price,
                regularMarketChange: 1.5,
                currency: 'USD',
                exchangeName: 'NMS',
              },
            },
          ],
        },
      });

    it('should get stock quote', async () => {
      const { executeTool } = await import('./index.js');
      stubFetch((url) => yahooResponse(symbolFromUrl(url), 190.5));

      const result = await executeTool('stock_quote', { symbols: 'AAPL', fields: 'price' });
      expect(result.error).toBeUndefined();
      const payload = result.result as {
        count: number;
        data: Record<string, { shortName: string; price: { current: number } }>;
      };
      expect(payload.count).toBe(1);
      expect(payload.data.AAPL.price.current).toBe(190.5);
      expect(payload.data.AAPL.shortName).toBe('AAPL Inc.');
    });

    it('should handle multiple symbols', async () => {
      const { executeTool } = await import('./index.js');
      stubFetch((url) => yahooResponse(symbolFromUrl(url), 100));

      const result = await executeTool('stock_quote', {
        symbols: 'AAPL,GOOGL,MSFT',
        fields: 'price',
      });
      expect(result.error).toBeUndefined();
      const payload = result.result as { count: number; data: Record<string, unknown> };
      expect(payload.count).toBe(3);
      expect(Object.keys(payload.data)).toEqual(['AAPL', 'GOOGL', 'MSFT']);
    });

    it('should report an error for a symbol with no data', async () => {
      const { executeTool } = await import('./index.js');
      stubFetch(() => jsonResponse({ chart: { result: [] } }));

      const result = await executeTool('stock_quote', { symbols: 'NOPE', fields: 'price' });
      const payload = result.result as { data: Record<string, { error?: string }> };
      expect(payload.data.NOPE.error).toBe('No data found for NOPE');
    });

    it('should reject a call with no symbols', async () => {
      const { executeTool } = await import('./index.js');
      const result = await executeTool('stock_quote', { fields: 'price' });
      expect(result.result).toBeNull();
      expect(result.error).toContain('Missing required parameter');
    });
  });

  describe('list_skills tool', () => {
    it('should list available skills', async () => {
      const { executeTool } = await import('./index.js');
      const result = await executeTool('list_skills', {});
      expect(result.error).toBeUndefined();
      expect((result.result as { skills: unknown }).skills).toBeDefined();
      expect(Array.isArray((result.result as { skills: unknown }).skills)).toBe(true);
    });

    it('should filter skills by domain', async () => {
      const { executeTool } = await import('./index.js');
      const result = await executeTool('list_skills', { domain: 'document' });
      expect(result.error).toBeUndefined();
      expect((result.result as { domain: string }).domain).toBe('document');
    });
  });
});
