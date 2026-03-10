import { readFile, writeFile, access, constants, readdir, mkdir } from 'fs/promises';
import { join, dirname, isAbsolute } from 'path';
import { homedir } from 'os';
import type Database from 'better-sqlite3';
import { getDatabase } from '../db/index.js';
import { toolLogger } from '../lib/logger.js';

// Import control tools (keyboard and mouse)
import { getTool as getControlTool, getAvailableTools as getControlTools } from './control.js';
import type { TaskType } from '../ipc/scheduled.js';

// Type definitions for database query results
interface SettingsRow {
  value: string;
}

interface SessionRow {
  id: string;
}

interface ChannelRow {
  id: string;
  channel_type: string;
  enabled: number;
}

interface WorkflowRow {
  id: string;
  name: string;
  is_preset: number;
  created_at: number;
  updated_at: number;
  description?: string;
}

interface ScheduledTaskRow {
  id: string;
  name: string;
  task_type: string;
  cron_expression: string;
  task_config: string;
  enabled: number;
  last_run: number | null;
  last_result: string | null;
  created_at: number;
}

interface WorkflowLookupRow {
  id: string;
  name: string;
}

interface BrowserListResult {
  playwrightSessions: number;
  extensionBridgeAvailable: boolean;
  extensionBridgeExtensions?: number;
  note?: string;
}

// DuckDuckGo API response types
interface DuckDuckGoRelatedTopic {
  Text?: string;
  FirstURL?: string;
}

interface DuckDuckGoResponse {
  AbstractText?: string;
  Answer?: string;
  Definition?: string;
  RelatedTopics?: DuckDuckGoRelatedTopic[];
}

// Get user's home directory for file operations
const USER_HOME = homedir();
// Default project directory for user projects
const DEFAULT_PROJECTS_DIR = join(USER_HOME, 'DeskClawProjects');

// Get current work directory from settings
function getWorkDirectory(): string {
  try {
    const db = getDatabase();
    const workDir = db.prepare('SELECT value FROM settings WHERE key = ?').get('workDirectory') as
      | SettingsRow
      | undefined;
    return workDir?.value || DEFAULT_PROJECTS_DIR;
  } catch {
    return DEFAULT_PROJECTS_DIR;
  }
}

// Set work directory
export function setWorkDirectory(path: string): void {
  try {
    const db = getDatabase();
    const now = Date.now();
    db.prepare(
      `
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?
    `
    ).run('workDirectory', path, now, path, now);
    toolLogger.info(`[Tools] Work directory set to: ${path}`);
  } catch (error) {
    toolLogger.error({ error }, '[Tools] Failed to set work directory');
  }
}

// Get work directory (for external access)
export function getWorkDirectorySync(): string {
  return getWorkDirectory();
}

// Get active session ID helper function
async function getActiveSessionId(): Promise<string | null> {
  try {
    const db = getDatabase();
    const sessions = db
      .prepare('SELECT id FROM browser_sessions ORDER BY updated_at DESC LIMIT 1')
      .get() as SessionRow | undefined;
    return sessions?.id || null;
  } catch {
    return null;
  }
}

// Check if Extension Bridge is available
async function isExtensionBridgeAvailable(): Promise<boolean> {
  try {
    const { extensionBridgeService } = await import('../browser/extension-bridge.js');
    return extensionBridgeService.isRunning() && extensionBridgeService.getExtensionCount() > 0;
  } catch {
    return false;
  }
}

interface Tool {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
  handler: (params: Record<string, unknown>) => Promise<{ result: unknown; error?: string }>;
}

// Available tools
const tools: Record<string, Tool> = {};

/**
 * File Read Tool
 * Reads a content of a text file
 */
tools.file_read = {
  name: 'file_read',
  description:
    'Reads content of a text file. Returns file content and metadata. Use this to read existing files.',
  parameters: {
    filepath: {
      type: 'string',
      description:
        'Path to file (relative to work directory or absolute). Example: "src/app.js" or "D:\\\\MyProjects\\\\file.txt"',
      required: true,
    },
    path: {
      type: 'string',
      description: 'Alias for filepath',
      required: false,
    },
  },
  handler: async (params) => {
    // Support both 'filepath' and 'path' parameters
    const filepath = (params.filepath || params.path) as string;
    try {
      let fullPath = filepath;
      let displayPath = filepath;
      const workDir = getWorkDirectory();

      // Handle relative paths using path.isAbsolute()
      if (!isAbsolute(filepath)) {
        // Try work directory first
        fullPath = join(workDir, filepath);
        displayPath = fullPath;
      }

      toolLogger.info(
        `[file_read] filepath="${filepath}", isAbsolute=${isAbsolute(filepath)}, fullPath="${fullPath}"`
      );

      // Check if file exists
      await access(fullPath, constants.F_OK);

      // Read file content
      const content = await readFile(fullPath, 'utf-8');

      // Limit file size for display
      const maxSize = 10000; // 10KB
      let displayContent = content;
      if (content.length > maxSize) {
        displayContent =
          content.slice(0, maxSize) + `\n\n... (${content.length - maxSize} more characters)`;
      }

      toolLogger.info(`[file_read] Successfully read ${content.length} bytes from ${fullPath}`);

      return {
        result: {
          file: filepath,
          fullPath: displayPath,
          workDir,
          content: displayContent,
          size: content.length,
        },
      };
    } catch (error: any) {
      toolLogger.error(`[file_read] Failed to read file:`, error);
      return {
        result: null,
        error: `Failed to read file "${filepath}": ${error.message}`,
      };
    }
  },
};

/**
 * File Write Tool
 * Writes content to a file
 */
tools.file_write = {
  name: 'file_write',
  description:
    "Write content to a file. Creates a file and parent directories if they don't exist. Use this to create new files or overwrite existing ones.",
  parameters: {
    filepath: {
      type: 'string',
      description:
        'Path to file (relative to work directory or absolute). Example: "src/app.js" or "D:\\\\MyProjects\\\\file.txt"',
      required: true,
    },
    path: {
      type: 'string',
      description: 'Alias for filepath',
      required: false,
    },
    filePath: {
      type: 'string',
      description: 'Alias for filepath (camelCase variant)',
      required: false,
    },
    content: {
      type: 'string',
      description: 'Content to write to file',
      required: true,
    },
  },
  handler: async (params) => {
    // Support 'filepath', 'path', and 'filePath' parameters
    const filepath = (params.filepath || params.path || params.filePath) as string;
    const content = params.content as string;

    try {
      let fullPath = filepath;
      let displayPath = filepath;
      const workDir = getWorkDirectory();

      // Handle relative paths using path.isAbsolute()
      if (!isAbsolute(filepath)) {
        // Use work directory for relative paths
        fullPath = join(workDir, filepath);
        displayPath = fullPath; // Show full path to user
      }

      toolLogger.info(
        `[file_write] filepath="${filepath}", isAbsolute=${isAbsolute(filepath)}, fullPath="${fullPath}"`
      );

      // Create directory if it doesn't exist
      const dir = dirname(fullPath);
      await mkdir(dir, { recursive: true });

      // Write file
      await writeFile(fullPath, content, 'utf-8');

      toolLogger.info(`[file_write] Successfully wrote ${content.length} bytes to ${fullPath}`);

      return {
        result: {
          file: filepath,
          fullPath: displayPath,
          workDir,
          bytes: content.length,
          success: true,
        },
      };
    } catch (error: any) {
      toolLogger.error(`[file_write] Failed to write file:`, error);
      return {
        result: null,
        error: `Failed to write file "${filepath}": ${error.message}`,
      };
    }
  },
};

/**
 * File List Tool
 * Lists files in a directory
 */
tools.file_list = {
  name: 'file_list',
  description:
    'List files and directories in a given path. Returns list of files with their types and sizes.',
  parameters: {
    path: {
      type: 'string',
      description:
        'Directory path (relative to work directory or absolute). Defaults to current directory.',
      required: false,
    },
    pattern: {
      type: 'string',
      description: 'Optional glob pattern to filter files (e.g., "*.txt" or "*.js")',
      required: false,
    },
  },
  handler: async (params) => {
    const dirpath = (params.path as string) || '.';
    const pattern = (params.pattern as string) || '*';
    const workDir = getWorkDirectory();

    try {
      let fullPath = dirpath;
      let displayPath = dirpath;

      // Handle relative paths using path.isAbsolute()
      if (!isAbsolute(dirpath)) {
        // Use work directory for relative paths
        fullPath = join(workDir, dirpath);
        displayPath = fullPath;
      }

      toolLogger.info(
        `[file_list] dirpath="${dirpath}", isAbsolute=${isAbsolute(dirpath)}, fullPath="${fullPath}"`
      );

      // Check if directory exists
      const { stat } = await import('fs/promises');
      try {
        const stats = await stat(fullPath);
        if (!stats.isDirectory()) {
          return {
            result: {
              path: dirpath,
              fullPath: displayPath,
              workDir,
              entries: [],
              total: 0,
              exists: false,
              message: `Path exists but is not a directory: ${fullPath}`,
            },
          };
        }
      } catch (statError: any) {
        // Directory doesn't exist - return gracefully
        toolLogger.info(`[file_list] Directory does not exist: ${fullPath}`);
        return {
          result: {
            path: dirpath,
            fullPath: displayPath,
            workDir,
            entries: [],
            total: 0,
            exists: false,
            message: `Directory does not exist: ${fullPath}`,
          },
        };
      }

      const entries = await readdir(fullPath, { withFileTypes: true });

      // Filter by pattern if provided
      let filteredEntries = entries;
      if (pattern && pattern !== '*') {
        const { glob } = await import('glob');
        const globPath = join(fullPath, pattern);
        const matched = await glob(globPath);
        const matchedNames = new Set(matched.map((f) => f.split('\\').pop()?.split('/').pop()));
        filteredEntries = entries.filter((e) => matchedNames.has(e.name));
      }

      const result = await Promise.all(
        filteredEntries.map(async (entry) => ({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          size: entry.isFile() ? (await stat(join(fullPath, entry.name))).size : undefined,
        }))
      );

      toolLogger.info(`[file_list] Found ${result.length} entries in ${fullPath}`);

      return {
        result: {
          path: dirpath,
          fullPath: displayPath,
          workDir,
          entries: result,
          total: result.length,
          exists: true,
        },
      };
    } catch (error: any) {
      toolLogger.error(`[file_list] Failed to list directory:`, error);
      return {
        result: {
          path: dirpath,
          fullPath: dirpath,
          workDir,
          entries: [],
          total: 0,
          exists: false,
          message: `Directory does not exist or cannot be accessed`,
        },
      };
    }
  },
};

/**
 * Web Search Tool (uses multiple search engines with fallback)
 */
tools.web_search = {
  name: 'web_search',
  description:
    'Search web for information using DuckDuckGo or Wikipedia. Returns search results with summaries.',
  parameters: {
    query: {
      type: 'string',
      description: 'Search query. Example: "React hooks tutorial" or "How to use useState"',
      required: true,
    },
  },
  handler: async (params) => {
    const query = params.query as string;
    const errors: string[] = [];

    // Search Engine 1: DuckDuckGo Instant Answer API
    try {
      toolLogger.info('[Web Search] Trying DuckDuckGo Instant Answer API...');
      const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`;

      const response = await fetch(ddgUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (!response.ok) {
        throw new Error(`DuckDuckGo API returned ${response.status}`);
      }

      const data = (await response.json()) as {
        AbstractText?: string;
        Answer?: string;
        RelatedTopics?: Array<{ Text?: string }>;
        Definition?: string;
      };

      const abstract = data.AbstractText || '';
      const answer = data.Answer || '';
      const relatedTopics = data.RelatedTopics || [];
      const definition = data.Definition || '';

      let result = '';
      if (answer) {
        result += `Answer: ${answer}\n\n`;
      }
      if (definition) {
        result += `Definition: ${definition}\n\n`;
      }
      if (abstract) {
        result += `Summary: ${abstract}\n\n`;
      }
      if (relatedTopics.length > 0 && relatedTopics[0]) {
        const relatedTexts = relatedTopics
          .slice(0, 3)
          .filter((t: DuckDuckGoRelatedTopic) => t.Text)
          .map((t: DuckDuckGoRelatedTopic) => t.Text);
        if (relatedTexts.length > 0) {
          result += `Related: ${relatedTexts.join(', ')}`;
        }
      }

      if (result) {
        return {
          result: {
            query,
            answer: result.trim(),
            source: 'DuckDuckGo Instant Answer',
          },
        };
      }
    } catch (error: any) {
      toolLogger.error('[Web Search] DuckDuckGo failed:', error.message);
      errors.push(`DuckDuckGo: ${error.message}`);
    }

    // Search Engine 2: Wikipedia API (free, no key needed)
    try {
      toolLogger.info('[Web Search] Trying Wikipedia API...');
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=3`;

      const response = await fetch(wikiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (!response.ok) {
        throw new Error(`Wikipedia API returned ${response.status}`);
      }

      const data = (await response.json()) as {
        query?: { search?: Array<{ title: string }> };
      };
      const searchResults = data.query?.search || [];

      if (searchResults.length > 0) {
        // Get first result's full content
        const pageTitle = searchResults[0].title;
        const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(pageTitle)}&format=json&origin=*`;

        const extractResponse = await fetch(extractUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });

        const extractData = (await extractResponse.json()) as {
          query?: { pages?: Record<string, { extract?: string }> };
        };
        const pages = extractData.query?.pages || {};
        const pageId = Object.keys(pages)[0];
        const extract = pages[pageId]?.extract || '';

        if (extract) {
          return {
            result: {
              query,
              answer: `Wikipedia: ${pageTitle}\n\n${extract.substring(0, 2000)}${extract.length > 2000 ? '...' : ''}`,
              source: 'Wikipedia',
            },
          };
        }
      }
    } catch (error: any) {
      toolLogger.error('[Web Search] Wikipedia failed:', error.message);
      errors.push(`Wikipedia: ${error.message}`);
    }

    // Search Engine 3: DuckDuckGo HTML (fallback scraping)
    try {
      toolLogger.info('[Web Search] Trying DuckDuckGo HTML scraping...');
      const ddgHtmlUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

      const response = await fetch(ddgHtmlUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (!response.ok) {
        throw new Error(`DuckDuckGo HTML returned ${response.status}`);
      }

      const html = await response.text();

      // Extract search results from HTML
      const resultRegex = /<a[^>]*class="result__a"[^>]*>(.*?)<\/a>/g;

      const links = [];
      let linkMatch;
      while ((linkMatch = resultRegex.exec(html)) !== null && links.length < 5) {
        const title = linkMatch[1].replace(/<[^>]*>/g, '').trim();
        if (title) {
          links.push(title);
        }
      }

      if (links.length > 0) {
        return {
          result: {
            query,
            answer: `Search results from DuckDuckGo:\n\n${links.map((l, i) => `${i + 1}. ${l}`).join('\n')}`,
            source: 'DuckDuckGo HTML',
          },
        };
      }
    } catch (error: any) {
      toolLogger.error('[Web Search] DuckDuckGo HTML failed:', error.message);
      errors.push(`DuckDuckGo HTML: ${error.message}`);
    }

    // All search engines failed
    return {
      result: null,
      error: `All search engines failed:\n${errors.join('\n')}\n\nPlease check your internet connection or try a different query.`,
    };
  },
};

/**
 * HTTP Request Tool
 */
tools.http_request = {
  name: 'http_request',
  description: 'Make an HTTP request to a URL. Supports GET, POST, PUT, DELETE, PATCH methods.',
  parameters: {
    url: {
      type: 'string',
      description: 'The URL to request. Example: "https://api.example.com/users"',
      required: true,
    },
    method: {
      type: 'string',
      description: 'HTTP method: GET, POST, PUT, DELETE, PATCH. Defaults: GET',
      required: false,
    },
    headers: {
      type: 'string',
      description:
        'JSON string of headers (optional). Example: \'{"Authorization": "Bearer token"}\'',
      required: false,
    },
    body: {
      type: 'string',
      description: 'Request body for POST/PUT requests (optional). Example: \'{"name": "John"}\'',
      required: false,
    },
  },
  handler: async (params) => {
    const url = params.url as string;
    const method = (params.method as string) || 'GET';
    const headers = params.headers ? JSON.parse(params.headers as string) : {};
    const body = params.body as string | undefined;

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const responseText = await response.text();
      let responseData: string | Record<string, unknown> = responseText;

      // Try to parse as JSON
      try {
        responseData = JSON.parse(responseText);
      } catch {
        // Keep as text
      }

      return {
        result: {
          url,
          method,
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers as unknown as Iterable<[string, string]>),
          body: responseData,
        },
      };
    } catch (error: any) {
      return {
        result: null,
        error: `HTTP request failed: ${error.message}`,
      };
    }
  },
};

/**
 * Web Scrape Tool
 * Fetches a webpage and extracts its text content for AI analysis
 */
tools.web_scrape = {
  name: 'web_scrape',
  description:
    'Fetch a webpage and extract its text content for AI analysis. Returns the main readable text from the page, stripped of HTML, scripts, and styles.',
  parameters: {
    url: {
      type: 'string',
      description: 'The URL to scrape. Example: "https://example.com/article" or "example.com"',
      required: true,
    },
    timeout: {
      type: 'number',
      description: 'Request timeout in milliseconds. Default: 10000',
      required: false,
    },
  },
  handler: async (params) => {
    const url = params.url as string;
    const timeout = (params.timeout as number) || 10000;

    try {
      // Add protocol if missing
      let targetUrl = url;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        targetUrl = `https://${url}`;
      }

      toolLogger.info(`[web_scrape] Fetching URL: ${targetUrl}, timeout: ${timeout}ms`);

      // Fetch the webpage with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();

      // Extract text content using regex-based approach
      // Remove script and style tags first
      let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
      text = text.replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, '');
      text = text.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '');
      text = text.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '');
      text = text.replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '');
      text = text.replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, '');

      // Remove all HTML tags
      text = text.replace(/<[^>]+>/g, ' ');

      // Decode HTML entities
      const textArea = { value: '' };
      text = text.replace(/&nbsp;/g, ' ');
      text = text.replace(/&amp;/g, '&');
      text = text.replace(/&lt;/g, '<');
      text = text.replace(/&gt;/g, '>');
      text = text.replace(/&quot;/g, '"');
      text = text.replace(/&#39;/g, "'");
      text = text.replace(/&apos;/g, "'");

      // Normalize whitespace
      text = text.replace(/\s+/g, ' ');
      text = text.replace(/\n\s*\n/g, '\n\n');

      // Trim and limit length
      text = text.trim();
      const maxLength = 50000; // 50k characters max
      let truncated = false;
      if (text.length > maxLength) {
        text = text.substring(0, maxLength);
        truncated = true;
      }

      // Extract title from HTML if available
      const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : '';

      // Extract meta description
      const descMatch = html.match(
        /<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i
      );
      const description = descMatch ? descMatch[1].trim() : '';

      toolLogger.info(
        `[web_scrape] Successfully scraped ${targetUrl}: ${text.length} characters, ${html.length} bytes HTML`
      );

      return {
        result: {
          url: targetUrl,
          title,
          description,
          content: text,
          length: text.length,
          truncated,
          htmlSize: html.length,
          message: truncated
            ? `Content truncated to ${maxLength} characters. Full content was ${text.length} characters.`
            : `Successfully extracted ${text.length} characters from webpage.`,
        },
      };
    } catch (error: any) {
      toolLogger.error(`[web_scrape] Failed to scrape ${url}:`, error);

      let errorMessage = `Failed to scrape webpage: ${error.message}`;
      if (error.name === 'AbortError') {
        errorMessage = `Request timeout after ${timeout}ms. The webpage took too long to respond.`;
      } else if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
        errorMessage = `Cannot connect to webpage. Please check the URL and your internet connection.`;
      }

      return {
        result: null,
        error: errorMessage,
      };
    }
  },
};

/**
 * Get Current Time Tool
 */
tools.get_time = {
  name: 'get_time',
  description: 'Get current date and time. Useful for timestamps and scheduling.',
  parameters: {
    timezone: {
      type: 'string',
      description:
        'Optional timezone. Examples: "UTC", "America/New_York", "Asia/Shanghai". Defaults to local time',
      required: false,
    },
  },
  handler: async (params) => {
    const now = new Date();
    const timezone = (params.timezone as string) || undefined;

    const timeString = now.toLocaleString(undefined, {
      timeZone: timezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    return {
      result: {
        current_time: timeString,
        timezone: timezone || 'local',
        iso: now.toISOString(),
        unix: Math.floor(now.getTime() / 1000),
      },
    };
  },
};

/**
 * Execute Command Tool (safe shell execution)
 */
tools.execute_command = {
  name: 'execute_command',
  description:
    'Execute a shell command. DANGEROUS - requires user approval. Use for: npm install, git commands, mkdir, etc.',
  parameters: {
    command: {
      type: 'string',
      description:
        'Shell command to execute. Examples: "npm install", "mkdir MyProject", "git clone https://..."',
      required: true,
    },
  },
  handler: async (params) => {
    const command = params.command as string;

    try {
      // Import executeShell from shell module
      const { executeShell } = await import('../ipc/shell.js');

      const result = await executeShell(command, {
        requireApproval: true,
      });

      return {
        result: {
          command,
          output: result.stdout,
          error: result.stderr,
          exitCode: result.exitCode,
        },
      };
    } catch (error: any) {
      return {
        result: null,
        error: `Command execution failed: ${error.message}`,
      };
    }
  },
};

/**
 * Set Work Directory Tool
 * Sets working directory for file operations
 */
tools.set_work_directory = {
  name: 'set_work_directory',
  description:
    'Set working directory for file operations. All relative file paths will be relative to this directory. Use this BEFORE creating files in a specific location.',
  parameters: {
    path: {
      type: 'string',
      description:
        'Absolute path to working directory. Examples: "D:\\\\MyProjects", "/home/user/projects", "C:\\\\Users\\\\UsernameUsername\\\\Documents"',
      required: true,
    },
  },
  handler: async (params) => {
    const path = params.path as string;

    try {
      const { stat } = await import('fs/promises');

      // Check if path exists
      let pathExists = false;
      try {
        const stats = await stat(path);
        pathExists = stats.isDirectory();
      } catch {
        pathExists = false;
      }

      if (!pathExists) {
        return {
          result: null,
          error: `Directory does not exist: "${path}". Please create it first or use an existing directory.`,
        };
      }

      // Set work directory
      setWorkDirectory(path);

      return {
        result: {
          path,
          success: true,
          message: `Working directory set to: ${path}`,
        },
      };
    } catch (error: any) {
      toolLogger.error(`[set_work_directory] Failed to set work directory:`, error);
      return {
        result: null,
        error: `Failed to set work directory: ${error.message}`,
      };
    }
  },
};

/**
 * Get Work Directory Tool
 * Gets current working directory for file operations
 */
tools.get_work_directory = {
  name: 'get_work_directory',
  description:
    'Get current working directory for file operations. Use this to know where files will be created.',
  parameters: {},
  handler: async () => {
    try {
      const workDir = getWorkDirectory();
      return {
        result: {
          workDir,
          message: `Current working directory: ${workDir}`,
        },
      };
    } catch (error: any) {
      return {
        result: null,
        error: `Failed to get work directory: ${error.message}`,
      };
    }
  },
};

/**
 * Workflow List Tool
 * Lists all available workflows
 */
tools.workflow_list = {
  name: 'workflow_list',
  description:
    'List all available workflows. Use this to see which workflows can be scheduled or executed.',
  parameters: {},
  handler: async () => {
    try {
      const db = getDatabase();
      const stmt = db.prepare(`
        SELECT id, name, description, is_preset, created_at, updated_at
        FROM workflows
        ORDER BY is_preset DESC, updated_at DESC
      `);
      const workflows = stmt.all() as WorkflowRow[];

      return {
        result: {
          workflows: workflows.map((w) => ({
            id: w.id,
            name: w.name,
            description: w.description,
            isPreset: w.is_preset === 1,
          })),
          total: workflows.length,
        },
      };
    } catch (error: any) {
      return {
        result: null,
        error: `Failed to list workflows: ${error.message}`,
      };
    }
  },
};

/**
 * Scheduled Task List Tool
 * Lists all scheduled tasks
 */
tools.scheduled_list = {
  name: 'scheduled_list',
  description:
    'List all scheduled tasks. Shows task name, type, cron expression, enabled status, and last run time.',
  parameters: {},
  handler: async () => {
    try {
      const db = getDatabase();
      const stmt = db.prepare(`
        SELECT id, name, task_type, cron_expression, task_config, enabled, last_run, last_result, created_at
        FROM scheduled_tasks
        ORDER BY created_at DESC
      `);
      const tasks = stmt.all() as ScheduledTaskRow[];

      return {
        result: {
          tasks: tasks.map((t) => ({
            id: t.id,
            name: t.name,
            taskType: t.task_type,
            cronExpression: t.cron_expression,
            taskConfig: JSON.parse(t.task_config),
            enabled: t.enabled === 1,
            lastRun: t.last_run,
            lastResult: t.last_result,
          })),
          total: tasks.length,
        },
      };
    } catch (error: any) {
      return {
        result: null,
        error: `Failed to list scheduled tasks: ${error.message}`,
      };
    }
  },
};

/**
 * Scheduled Task Create Tool
 * Creates a new scheduled task with various types
 */
tools.scheduled_create = {
  name: 'scheduled_create',
  description: `Create a scheduled task. Supports 5 types:
1. workflow - Execute a workflow by name
2. tool - Execute a tool (file_read, file_write, file_list, web_search, http_request, get_time, execute_command)
3. command - Execute a shell command (npm, git, etc.)
4. prompt - Execute an AI prompt/task (e.g., daily summary, develop a game)
5. reminder - Show a desktop notification reminder

Cron format (5 fields): "minute hour day month weekday"
- "0 9 * * *" = daily at 9am
- "*/30 * * * *" = every 30 minutes
- "0 9 * * * 1-5" = weekdays at 9am
For seconds (6 fields): "second minute hour day month weekday"
- "*/10 * * * *" = every 10 seconds
- "30 * * * * *" = at second 30 of every minute`,
  parameters: {
    name: {
      type: 'string',
      description: 'Name for this scheduled task',
      required: true,
    },
    type: {
      type: 'string',
      description: 'Task type: "workflow", "tool", "command", "prompt", or "reminder"',
      required: true,
    },
    cron: {
      type: 'string',
      description:
        'Cron expression. 5 fields: "minute hour day month weekday". 6 fields (with seconds): "second minute hour day month weekday"',
      required: true,
    },
    cron_expression: {
      type: 'string',
      description:
        'Alias for "cron" - Cron expression. 5 fields: "minute hour day month weekday". 6 fields (with seconds): "second minute hour day month weekday"',
      required: false,
    },
    workflow_name: {
      type: 'string',
      description: '[workflow] Name of workflow to execute',
      required: false,
    },
    tool_name: {
      type: 'string',
      description:
        '[tool] Name of tool: file_read, file_write, file_list, web_search, http_request, get_time, execute_command',
      required: false,
    },
    tool_params: {
      type: 'object',
      description: '[tool] Parameters for tool as an object',
      required: false,
    },
    command: {
      type: 'string',
      description: '[command] Shell command to execute',
      required: false,
    },
    prompt: {
      type: 'string',
      description: '[prompt] AI prompt/task to execute. Example: "Develop a minesweeper game"',
      required: false,
    },
    message: {
      type: 'string',
      description: '[reminder] Reminder message to display',
      required: false,
    },
    task: {
      type: 'object',
      description:
        'Alternative: task configuration as object. Can contain: prompt, command, message, tool_name, tool_params, workflow_name',
      required: false,
    },
    task_config: {
      type: 'object',
      description:
        'Alias for "task" - task configuration as object. Can contain: prompt, command, message, tool_name, tool_params, workflow_name',
      required: false,
    },
    enabled: {
      type: 'boolean',
      description: 'Enable task immediately. Defaults to true.',
      required: false,
    },
    one_time: {
      type: 'boolean',
      description:
        'If true, task will run only once and then be automatically disabled. Useful for "after X seconds" type requests.',
      required: false,
    },
  },
  handler: async (params) => {
    try {
      const db = getDatabase();
      const name = params.name as string;
      const taskType = (params.type || params.task_type) as string;
      const cronExpression = (params.cron || params.cron_expression) as string;
      const enabled = params.enabled !== false;

      const validTypes = ['workflow', 'tool', 'command', 'prompt', 'reminder'];
      if (!taskType) {
        return {
          result: null,
          error: `Missing required parameter: type. Must be one of: ${validTypes.join(', ')}`,
        };
      }
      if (!validTypes.includes(taskType)) {
        return {
          result: null,
          error: `Invalid type "${taskType}". Must be one of: ${validTypes.join(', ')}`,
        };
      }

      const taskConfig: Record<string, unknown> = {};

      // Support nested task object (e.g., task.prompt, task.command or task_config.prompt)
      // Handle both object and string formats
      let taskObj = (params.task || params.task_config) as Record<string, unknown> | undefined;
      if (taskObj && typeof taskObj === 'string') {
        try {
          taskObj = JSON.parse(taskObj);
        } catch {
          taskObj = undefined;
        }
      }

      // Debug logging
      toolLogger.info(`[scheduled_create] params: ${JSON.stringify(params)}`);
      toolLogger.info(`[scheduled_create] taskType: ${taskType}`);
      toolLogger.info(
        `[scheduled_create] taskObj: ${taskObj ? JSON.stringify(taskObj) : 'undefined'}`
      );
      toolLogger.info(`[scheduled_create] taskObj type: ${typeof taskObj}`);

      switch (taskType) {
        case 'workflow': {
          const workflowName = (params.workflow_name || taskObj?.workflow_name) as string;
          if (!workflowName) {
            return { result: null, error: 'workflow_name is required for workflow type' };
          }
          const stmt = db.prepare('SELECT id, name FROM workflows WHERE name = ?');
          const workflow = stmt.get(workflowName) as WorkflowLookupRow | undefined;
          if (!workflow) {
            return { result: null, error: `Workflow not found: "${workflowName}"` };
          }
          taskConfig.workflowId = workflow.id;
          taskConfig.workflowName = workflow.name;
          break;
        }
        case 'tool': {
          const toolName = (params.tool_name || taskObj?.tool_name) as string;
          if (!toolName) {
            return { result: null, error: 'tool_name is required for tool type' };
          }
          taskConfig.toolName = toolName;
          const toolParams = params.tool_params || taskObj?.tool_params;
          if (toolParams) {
            taskConfig.toolParams =
              typeof toolParams === 'string' ? JSON.parse(toolParams) : toolParams;
          }
          break;
        }
        case 'command': {
          const command = (params.command || taskObj?.command) as string;
          if (!command) {
            return { result: null, error: 'command is required for command type' };
          }
          taskConfig.command = command;
          break;
        }
        case 'prompt': {
          const directPrompt = params.prompt as string;
          const nestedPrompt = taskObj?.prompt as string;
          // Also check if task_config itself is a string prompt
          const taskConfigStr = params.task_config as string;
          const isDirectString =
            typeof taskConfigStr === 'string' &&
            taskConfigStr.trim().length > 0 &&
            !(taskConfigStr.startsWith('{') || taskConfigStr.startsWith('['));

          toolLogger.info(
            `[scheduled_create] prompt case - directPrompt: ${directPrompt}, nestedPrompt: ${nestedPrompt}, taskConfigStr: ${taskConfigStr}, isDirectString: ${isDirectString}`
          );

          const prompt =
            directPrompt || nestedPrompt || (isDirectString ? taskConfigStr : undefined);
          if (!prompt) {
            return { result: null, error: 'prompt is required for prompt type' };
          }
          taskConfig.prompt = prompt;
          break;
        }
        case 'reminder': {
          const message = (params.message || taskObj?.message) as string;
          if (!message) {
            return { result: null, error: 'message is required for reminder type' };
          }
          taskConfig.message = message;
          break;
        }
      }

      const { createScheduled } = await import('../ipc/scheduled.js');
      const task = createScheduled(db, {
        name,
        taskType: taskType as TaskType,
        cronExpression,
        taskConfig,
        enabled,
        oneTime: params.one_time as boolean,
      });

      return {
        result: {
          id: task.id,
          name,
          type: taskType,
          cron: cronExpression,
          config: taskConfig,
          enabled,
          message: `Scheduled task "${name}" created. Will run: ${cronExpression}`,
        },
      };
    } catch (error: any) {
      return {
        result: null,
        error: `Failed to create scheduled task: ${error.message}`,
      };
    }
  },
};

/**
 * Scheduled Task Update Tool
 */
tools.scheduled_update = {
  name: 'scheduled_update',
  description:
    'Update an existing scheduled task. Can change name, cron expression, task config, or enable/disable.',
  parameters: {
    task_id: {
      type: 'string',
      description: 'ID of task to update. Use scheduled_list to get task IDs.',
      required: true,
    },
    name: {
      type: 'string',
      description: 'New name for task',
      required: false,
    },
    cron_expression: {
      type: 'string',
      description: 'New cron expression',
      required: false,
    },
    enabled: {
      type: 'boolean',
      description: 'Enable or disable task',
      required: false,
    },
  },
  handler: async (params) => {
    try {
      const db = getDatabase();
      const taskId = params.task_id as string;
      const updates: Record<string, unknown> = {};

      if (params.name) updates.name = params.name;
      if (params.cron_expression) updates.cronExpression = params.cron_expression;
      if (params.enabled !== undefined) updates.enabled = params.enabled;

      if (Object.keys(updates).length === 0) {
        return { result: null, error: 'No fields to update' };
      }

      const { updateScheduled } = await import('../ipc/scheduled.js');
      const task = updateScheduled(db, taskId, updates);

      return {
        result: {
          id: task.id,
          name: task.name,
          cronExpression: task.cronExpression,
          enabled: task.enabled,
          message: 'Scheduled task updated successfully',
        },
      };
    } catch (error: any) {
      return {
        result: null,
        error: `Failed to update scheduled task: ${error.message}`,
      };
    }
  },
};

/**
 * Scheduled Task Delete Tool
 */
tools.scheduled_delete = {
  name: 'scheduled_delete',
  description: 'Delete a scheduled task permanently.',
  parameters: {
    task_id: {
      type: 'string',
      description: 'ID of task to delete. Use scheduled_list to get task IDs.',
      required: true,
    },
  },
  handler: async (params) => {
    try {
      const db = getDatabase();
      const taskId = params.task_id as string;

      const { deleteScheduled } = await import('../ipc/scheduled.js');
      deleteScheduled(db, taskId);

      return {
        result: {
          id: taskId,
          message: 'Scheduled task deleted successfully',
        },
      };
    } catch (error: any) {
      return {
        result: null,
        error: `Failed to delete scheduled task: ${error.message}`,
      };
    }
  },
};

/**
 * Scheduled Task Toggle Tool
 */
tools.scheduled_toggle = {
  name: 'scheduled_toggle',
  description: 'Toggle a scheduled task on/off.',
  parameters: {
    task_id: {
      type: 'string',
      description: 'ID of task to toggle. Use scheduled_list to get task IDs.',
      required: true,
    },
  },
  handler: async (params) => {
    try {
      const db = getDatabase();
      const taskId = params.task_id as string;

      const { toggleScheduled } = await import('../ipc/scheduled.js');
      const task = toggleScheduled(db, taskId);

      return {
        result: {
          id: task.id,
          name: task.name,
          enabled: task.enabled,
          message: `Scheduled task "${task.name}" ${task.enabled ? 'enabled' : 'disabled'} successfully`,
        },
      };
    } catch (error: any) {
      return {
        result: null,
        error: `Failed to toggle scheduled task: ${error.message}`,
      };
    }
  },
};

/**
 * Send Message Tool - Send a message to a messaging channel
 */
tools.send_message = {
  name: 'send_message',
  description:
    'Send a message to a configured messaging channel (Telegram, Discord, etc.). Use this to send notifications or responses.',
  parameters: {
    channel_id: {
      type: 'string',
      description: 'The ID of messaging channel. Use Channels page in app to get channel IDs.',
      required: true,
    },
    peer_id: {
      type: 'string',
      description:
        'The ID of recipient (chat ID, user ID, or group ID). For Telegram, this is chat ID.',
      required: true,
    },
    message: {
      type: 'string',
      description: 'The message content to send.',
      required: true,
    },
  },
  handler: async (params) => {
    try {
      const db = getDatabase();
      const channelId = params.channel_id as string;
      const peerId = params.peer_id as string;
      const message = params.message as string;

      // Verify channel exists and is enabled
      const channel = db
        .prepare('SELECT * FROM channels WHERE id = ? AND enabled = 1')
        .get(channelId) as ChannelRow | undefined;

      if (!channel) {
        return {
          result: null,
          error: `Channel "${channelId}" not found or not enabled. Please configure and start channel in Channels page.`,
        };
      }

      // Get channel plugin
      const { channelRegistry } = await import('../channels/channel-registry.js');
      const plugin = channelRegistry.getPlugin(channel.channel_type);

      // Send message
      const messageId = await plugin.sendMessage(peerId, message);

      // Save to database
      db.prepare(
        `
        INSERT INTO channel_messages (id, channel_id, message_id, peer_id, peer_type, direction, content, timestamp, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        `outbound_${messageId}`,
        channelId,
        messageId,
        peerId,
        'direct',
        'outbound',
        message,
        Date.now(),
        Date.now()
      );

      return {
        result: {
          channelId,
          peerId,
          messageId,
          message: 'Message sent successfully',
        },
      };
    } catch (error: any) {
      return {
        result: null,
        error: `Failed to send message: ${error.message}`,
      };
    }
  },
};

/**
 * Browser List Tool - List available browser sessions
 * Also shows Extension Bridge status
 */
tools.browser_list = {
  name: 'browser_list',
  description:
    'List all available browser sessions and check Extension Bridge status. Returns session IDs, URLs, and titles. Also shows if Extension Bridge is available as a fallback.',
  parameters: {},
  handler: async () => {
    try {
      const db = getDatabase();
      const { browserService } = await import('../browser/browser-service.js');
      const extensionBridgeAvailable = await isExtensionBridgeAvailable();

      const result: BrowserListResult = {
        playwrightSessions: browserService.getActiveSessionCount(),
        extensionBridgeAvailable,
      };

      if (extensionBridgeAvailable) {
        const { extensionBridgeService } = await import('../browser/extension-bridge.js');
        result.extensionBridgeExtensions = extensionBridgeService.getExtensionCount();
        result.note =
          'Extension Bridge is available. Browser tools will automatically use it when no Playwright session is available.';
      } else {
        result.note =
          'Extension Bridge is not available. Please start it from the Browser Control page or launch a Playwright browser profile.';
      }

      return {
        result,
      };
    } catch (error: any) {
      return {
        result: null,
        error: `Failed to list browser sessions: ${error.message}`,
      };
    }
  },
};

/**
 * Browser Navigate Tool - Navigate to a URL in browser
 * Uses most recent active session if session_id is not provided.
 * Falls back to Extension Bridge if no Playwright session is available.
 */
tools.browser_navigate = {
  name: 'browser_navigate',
  description:
    'Navigate to a URL in a browser session. Use this to load a web page before taking screenshots or interacting with elements. If session_id is not provided, uses most recent active session. Automatically uses Extension Bridge if no Playwright session is available.',
  parameters: {
    session_id: {
      type: 'string',
      description:
        'The browser session ID. If not provided, uses most recent active session or Extension Bridge.',
      required: false,
    },
    url: {
      type: 'string',
      description: 'The URL to navigate to. Example: "https://example.com" or "example.com"',
      required: true,
    },
  },
  handler: async (params) => {
    try {
      const url = params.url as string;
      const sessionId = (params.session_id as string) || (await getActiveSessionId());

      // If no Playwright session, try Extension Bridge
      if (!sessionId) {
        if (await isExtensionBridgeAvailable()) {
          const { extensionBridgeService } = await import('../browser/extension-bridge.js');
          extensionBridgeService.broadcast({
            type: 'navigate',
            data: { url },
          });
          toolLogger.info(`[browser_navigate] Using Extension Bridge to navigate to ${url}`);
          return {
            result: {
              url,
              message: `Navigated to ${url} via Extension Bridge`,
              bridge: 'extension',
            },
          };
        }
        return {
          result: null,
          error:
            'No browser session available. Please launch a browser profile or start the Extension Bridge.',
        };
      }

      const { browserService } = await import('../browser/browser-service.js');
      await browserService.navigate(sessionId, url);

      return {
        result: {
          sessionId,
          url,
          message: `Navigated to ${url}`,
        },
      };
    } catch (error: any) {
      return {
        result: null,
        error: `Failed to navigate: ${error.message}`,
      };
    }
  },
};

/**
 * Browser Snapshot Tool - Get a snapshot of current browser page
 * Uses most recent active session if session_id is not provided.
 * Falls back to Extension Bridge if no Playwright session is available.
 */
tools.browser_snapshot = {
  name: 'browser_snapshot',
  description:
    'Get a snapshot of current browser page for AI analysis. Returns page structure, content, and accessibility tree. Uses most recent active session if session_id is not provided. For Extension Bridge, returns a simplified snapshot with basic page info.',
  parameters: {
    session_id: {
      type: 'string',
      description:
        'The browser session ID. If not provided, uses most recent active session or Extension Bridge.',
      required: false,
    },
    format: {
      type: 'string',
      description:
        'Snapshot format: "ai" (accessibility tree), "aria" (ARIA tree), "html" (full HTML), or "text" (visible text). Defaults to "ai". Note: Extension Bridge only supports basic snapshot.',
      required: false,
    },
  },
  handler: async (params) => {
    try {
      const format = (params.format as string | undefined) || 'ai';
      const sessionId = (params.session_id as string | undefined) || (await getActiveSessionId());

      // If no Playwright session, try Extension Bridge
      if (!sessionId) {
        if (await isExtensionBridgeAvailable()) {
          const { extensionBridgeService } = await import('../browser/extension-bridge.js');
          // Note: Extension Bridge snapshot response comes via WebSocket
          // We'll initiate the request but can't wait for the result
          extensionBridgeService.broadcast({
            type: 'snapshot',
          });
          toolLogger.info(`[browser_snapshot] Using Extension Bridge to get snapshot`);
          return {
            result: {
              format,
              message:
                'Snapshot command sent via Extension Bridge. Check the browser control panel for results.',
              bridge: 'extension',
            },
          };
        }
        return {
          result: null,
          error:
            'No browser session available. Please launch a browser profile or start the Extension Bridge.',
        };
      }

      const { browserService } = await import('../browser/browser-service.js');
      const snapshot = await browserService.snapshot(sessionId, format as any);

      return {
        result: {
          sessionId,
          format,
          snapshot,
        },
      };
    } catch (error: any) {
      return {
        result: null,
        error: `Failed to get snapshot: ${error.message}`,
      };
    }
  },
};

/**
 * Browser Click Tool - Click an element on page
 * Uses most recent active session if session_id is not provided.
 * Falls back to Extension Bridge if no Playwright session is available.
 */
tools.browser_click = {
  name: 'browser_click',
  description:
    'Click an element on browser page using CSS selector. Uses most recent active session if session_id is not provided. Automatically uses Extension Bridge if no Playwright session is available.',
  parameters: {
    session_id: {
      type: 'string',
      description:
        'The browser session ID. If not provided, uses most recent active session or Extension Bridge.',
      required: false,
    },
    selector: {
      type: 'string',
      description:
        'CSS selector for element to click. Examples: "button.submit", "#submit-btn", "a[href=\'/next\']"',
      required: true,
    },
  },
  handler: async (params) => {
    try {
      const selector = params.selector as string;
      const sessionId = (params.session_id as string) || (await getActiveSessionId());

      // If no Playwright session, try Extension Bridge
      if (!sessionId) {
        if (await isExtensionBridgeAvailable()) {
          const { extensionBridgeService } = await import('../browser/extension-bridge.js');
          extensionBridgeService.broadcast({
            type: 'click',
            data: { selector },
          });
          toolLogger.info(`[browser_click] Using Extension Bridge to click ${selector}`);
          return {
            result: {
              selector,
              message: `Clicked element: ${selector} via Extension Bridge`,
              bridge: 'extension',
            },
          };
        }
        return {
          result: null,
          error:
            'No browser session available. Please launch a browser profile or start the Extension Bridge.',
        };
      }

      const { browserService } = await import('../browser/browser-service.js');
      await browserService.click(sessionId, selector);

      return {
        result: {
          sessionId,
          selector,
          message: `Clicked element: ${selector}`,
        },
      };
    } catch (error: any) {
      return {
        result: null,
        error: `Failed to click: ${error.message}`,
      };
    }
  },
};

/**
 * Browser Type Tool - Type text into an element on page
 * Uses most recent active session if session_id is not provided.
 * Falls back to Extension Bridge if no Playwright session is available.
 */
tools.browser_type = {
  name: 'browser_type',
  description:
    'Type text into an input field or textarea on browser page. Uses most recent active session if session_id is not provided. Automatically uses Extension Bridge if no Playwright session is available.',
  parameters: {
    session_id: {
      type: 'string',
      description:
        'The browser session ID. If not provided, uses most recent active session or Extension Bridge.',
      required: false,
    },
    selector: {
      type: 'string',
      description:
        'CSS selector for input element. Examples: "input[name=\'username\']", "#search-box", "textarea.comment"',
      required: true,
    },
    text: {
      type: 'string',
      description: 'The text to type into element.',
      required: true,
    },
  },
  handler: async (params) => {
    try {
      const selector = params.selector as string;
      const text = params.text as string;
      const sessionId = (params.session_id as string) || (await getActiveSessionId());

      // If no Playwright session, try Extension Bridge
      if (!sessionId) {
        if (await isExtensionBridgeAvailable()) {
          const { extensionBridgeService } = await import('../browser/extension-bridge.js');
          extensionBridgeService.broadcast({
            type: 'type',
            data: { selector, text },
          });
          toolLogger.info(`[browser_type] Using Extension Bridge to type into ${selector}`);
          return {
            result: {
              selector,
              text,
              message: `Typed text into element: ${selector} via Extension Bridge`,
              bridge: 'extension',
            },
          };
        }
        return {
          result: null,
          error:
            'No browser session available. Please launch a browser profile or start the Extension Bridge.',
        };
      }

      const { browserService } = await import('../browser/browser-service.js');
      await browserService.type(sessionId, selector, text);

      return {
        result: {
          sessionId,
          selector,
          text,
          message: `Typed text into element: ${selector}`,
        },
      };
    } catch (error: any) {
      return {
        result: null,
        error: `Failed to type: ${error.message}`,
      };
    }
  },
};

/**
 * Browser Screenshot Tool - Take a screenshot of current page
 * Uses most recent active session if session_id is not provided.
 * Falls back to Extension Bridge if no Playwright session is available.
 */
tools.browser_screenshot = {
  name: 'browser_screenshot',
  description:
    'Take a screenshot of current browser page with smart compression. Supports multiple modes: full (no compression), compressed (1280px max), thumbnail (320px max), smart (auto-select). Returns coordinateTransform for scaling.',
  parameters: {
    session_id: {
      type: 'string',
      description:
        'The browser session ID. If not provided, uses most recent active session or Extension Bridge.',
      required: false,
    },
    full_page: {
      type: 'boolean',
      description:
        'Whether to capture full page (true) or just viewport (false). Defaults to false. Note: Extension Bridge only supports viewport screenshots.',
      required: false,
    },
    mode: {
      type: 'string',
      description:
        'Compression mode: "full" (no compression), "compressed" (1280px max), "thumbnail" (320px max), "smart" (auto-select based on size). Default: "smart"',
      required: false,
    },
    max_dimension: {
      type: 'number',
      description:
        'Maximum dimension for compressed mode. Default: 1280. Use 640 for aggressive compression.',
      required: false,
    },
  },
  handler: async (params) => {
    try {
      const fullPage = params.full_page as boolean | undefined;
      const sessionId = (params.session_id as string) || (await getActiveSessionId());
      const mode = (params.mode as string) || 'smart';
      const maxDimension = (params.max_dimension as number) || 1280;

      // If no Playwright session, try Extension Bridge
      if (!sessionId) {
        if (await isExtensionBridgeAvailable()) {
          const { extensionBridgeService } = await import('../browser/extension-bridge.js');

          // Check if there's a recent screenshot available
          const lastScreenshot = extensionBridgeService.getLastScreenshot();

          if (lastScreenshot && Date.now() - lastScreenshot.timestamp < 5000) {
            // Use recent screenshot
            toolLogger.info(
              `[browser_screenshot] Using recent Extension Bridge screenshot (${lastScreenshot.size} bytes)`
            );

            // Estimate tokens
            const estimatedTokens = Math.ceil(lastScreenshot.data.length / 4);

            return {
              result: {
                sessionId: 'extension-bridge',
                full_page: false,
                size: lastScreenshot.size,
                mode: 'cached',
                estimatedTokens,
                message: `Using cached screenshot from Extension Bridge (${lastScreenshot.size} bytes, ~${estimatedTokens} tokens)`,
                data: lastScreenshot.data,
                mimeType: 'image/png',
                timestamp: lastScreenshot.timestamp,
              },
            };
          }

          // Request new screenshot via Extension Bridge
          extensionBridgeService.broadcast({
            type: 'screenshot',
          });

          toolLogger.info(`[browser_screenshot] Screenshot command sent via Extension Bridge`);

          // Wait a moment for the screenshot to be captured
          await new Promise((resolve) => setTimeout(resolve, 500));

          // Try to get the screenshot again
          const newScreenshot = extensionBridgeService.getLastScreenshot();

          if (newScreenshot) {
            const estimatedTokens = Math.ceil(newScreenshot.data.length / 4);

            // Apply compression if needed
            if (mode !== 'full' && estimatedTokens > 10000) {
              toolLogger.info(
                `[browser_screenshot] Screenshot is large (${estimatedTokens} tokens), returning metadata only`
              );
              return {
                result: {
                  sessionId: 'extension-bridge',
                  full_page: false,
                  size: newScreenshot.size,
                  mode: 'compressed',
                  estimatedTokens,
                  message: `Screenshot captured but too large for context (${estimatedTokens} tokens). View in browser control panel.`,
                  data: '[SCREENSHOT DATA - Too large for context. View in browser control panel.]',
                  dataTruncated: true,
                  originalSize: newScreenshot.size,
                  mimeType: 'image/png',
                  timestamp: newScreenshot.timestamp,
                },
              };
            }

            return {
              result: {
                sessionId: 'extension-bridge',
                full_page: false,
                size: newScreenshot.size,
                mode,
                estimatedTokens,
                message: `Screenshot taken via Extension Bridge (${newScreenshot.size} bytes, ~${estimatedTokens} tokens)`,
                data: newScreenshot.data,
                mimeType: 'image/png',
                timestamp: newScreenshot.timestamp,
              },
            };
          }

          return {
            result: {
              full_page: false,
              message:
                'Screenshot command sent via Extension Bridge. The screenshot will be available in the browser control panel.',
              bridge: 'extension',
            },
          };
        }
        return {
          result: null,
          error:
            'No browser session available. Please launch a browser profile or start the Extension Bridge.',
        };
      }

      const { browserService } = await import('../browser/browser-service.js');
      const buffer = await browserService.screenshot(sessionId, fullPage);

      // Calculate size and tokens
      const base64Data = buffer.toString('base64');
      const estimatedTokens = Math.ceil(base64Data.length / 4);

      toolLogger.info(
        `[browser_screenshot] Screenshot: ${buffer.length} bytes, ~${estimatedTokens} tokens`
      );

      // Determine if compression is needed
      let finalMode = mode;
      if (mode === 'smart') {
        // Auto-select based on token count
        if (estimatedTokens > 50000) {
          finalMode = 'thumbnail';
        } else if (estimatedTokens > 20000) {
          finalMode = 'compressed';
        } else {
          finalMode = 'full';
        }
        toolLogger.info(
          `[browser_screenshot] Smart mode selected: ${finalMode} (${estimatedTokens} tokens)`
        );
      }

      // For compressed/thumbnail modes, just return metadata
      if (finalMode !== 'full') {
        toolLogger.info(`[browser_screenshot] Returning compressed screenshot (${finalMode} mode)`);

        return {
          result: {
            sessionId,
            full_page: fullPage || false,
            size: buffer.length,
            mode: finalMode,
            estimatedTokens,
            message: `Screenshot taken (${buffer.length} bytes, ~${estimatedTokens} tokens, ${finalMode} mode)`,
            data: `[SCREENSHOT DATA - ${finalMode.toUpperCase()} MODE. Original: ${buffer.length} bytes, ~${estimatedTokens} tokens. View in browser control panel.]`,
            dataTruncated: true,
            originalSize: buffer.length,
            mimeType: 'image/png',
            compressionNote: 'Full screenshot available in browser control panel',
          },
        };
      }

      return {
        result: {
          sessionId,
          full_page: fullPage || false,
          size: buffer.length,
          mode: finalMode,
          estimatedTokens,
          message: `Screenshot taken (${buffer.length} bytes, ~${estimatedTokens} tokens)`,
          data: base64Data,
          mimeType: 'image/png',
          dataTruncated: false,
        },
      };
    } catch (error: any) {
      return {
        result: null,
        error: `Failed to take screenshot: ${error.message}`,
      };
    }
  },
};

/**
 * Stock Quote Tool - Get real-time stock market data from Yahoo Finance
 */
tools.stock_quote = {
  name: 'stock_quote',
  description:
    'Get real-time stock market data from Yahoo Finance. Supports stocks, indices, ETFs, and crypto. Use this for checking stock prices, market indices like S&P 500, Dow Jones, NASDAQ, etc.',
  parameters: {
    symbol: {
      type: 'string',
      description:
        'Single stock symbol to query. Example: "AAPL". Alternative to "symbols" parameter.',
      required: false,
    },
    symbols: {
      type: 'string',
      description:
        'Stock symbol(s) to query (comma-separated for multiple). Examples: "AAPL", "^GSPC,^DJI,^IXIC", "TSLA,GOOGL,MSFT". Common indices: ^GSPC (S&P 500), ^DJI (Dow Jones), ^IXIC (NASDAQ), ^RUT (Russell 2000), 000001.S (Shanghai), 399001.SZ (Shenzhen).',
      required: false,
    },
    fields: {
      type: 'string',
      description:
        'Data fields to include: "price" (default), "quote", "summary", "all". price=current price and change, quote=detailed quote data, summary=company summary, all=all available data',
      required: false,
    },
  },
  handler: async (params) => {
    // Support both 'symbol' and 'symbols' parameter names
    const symbolsParam = (params.symbols as string) || (params.symbol as string);
    if (!symbolsParam) {
      return {
        result: null,
        error:
          'Missing required parameter: symbols (or symbol). Please provide stock symbol(s) to query.',
      };
    }
    const symbols = symbolsParam
      .toUpperCase()
      .split(',')
      .map((s) => s.trim());
    const fields = (params.fields as string) || 'price';

    try {
      const results: Record<string, any> = {};

      for (const symbol of symbols) {
        // Yahoo Finance API endpoint for chart data
        const apiUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;

        const response = await fetch(apiUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });

        if (!response.ok) {
          results[symbol] = { error: `Failed to fetch data for ${symbol}` };
          continue;
        }

        const data = (await response.json()) as {
          chart?: {
            result?: Array<{
              meta?: {
                regularMarketPrice?: number;
                previousClose?: number;
                regularMarketChange?: number;
                regularMarketChangePercent?: number;
                regularMarketVolume?: number;
                regularMarketOpen?: number;
                regularMarketDayHigh?: number;
                regularMarketDayLow?: number;
                fiftyTwoWeekHigh?: number;
                fiftyTwoWeekLow?: number;
                marketCap?: number;
                currency?: string;
                shortName?: string;
                longName?: string;
                exchangeName?: string;
              };
              indicators?: {
                quote?: Array<{
                  close?: number[];
                  volume?: number[];
                  open?: number[];
                  high?: number[];
                  low?: number[];
                }>;
              };
            }>;
          };
        };

        const result = data.chart?.result?.[0];
        const meta = result?.meta;

        if (!meta) {
          results[symbol] = { error: `No data found for ${symbol}` };
          continue;
        }

        // Build response based on requested fields
        const stockData: Record<string, unknown> = {
          symbol,
          shortName: meta.shortName || symbol,
        };

        if (fields === 'price' || fields === 'all' || fields === 'quote') {
          stockData.price = {
            current: meta.regularMarketPrice,
            change: meta.regularMarketChange,
            changePercent: meta.regularMarketChangePercent,
            previousClose: meta.previousClose,
            open: meta.regularMarketOpen,
            high: meta.regularMarketDayHigh,
            low: meta.regularMarketDayLow,
            volume: meta.regularMarketVolume,
          };
        }

        if (fields === 'quote' || fields === 'all') {
          stockData.quote = {
            fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
            fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
            marketCap: meta.marketCap,
            currency: meta.currency,
            exchange: meta.exchangeName,
          };
        }

        if (fields === 'summary' || fields === 'all') {
          stockData.summary = {
            shortName: meta.shortName,
            longName: meta.longName,
            exchange: meta.exchangeName,
            currency: meta.currency,
          };
        }

        results[symbol] = stockData;
      }

      return {
        result: {
          symbols,
          data: results,
          count: symbols.length,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error: any) {
      toolLogger.error('[stock_quote] Failed to fetch stock data:', error);
      return {
        result: null,
        error: `Failed to fetch stock data: ${error.message}`,
      };
    }
  },
};

/**
 * Get tool by name
 */
export function getTool(name: string): Tool | undefined {
  // Check control tools first (keyboard/mouse)
  const controlTool = getControlTool(name);
  if (controlTool) {
    return controlTool;
  }
  // Fall back to other tools
  return tools[name];
}

/**
 * Get all available tools
 */
export function getAvailableTools(): Record<string, Tool> {
  // Merge control tools with existing tools
  const controlTools = getControlTools();
  return { ...tools, ...controlTools };
}

/**
 * Execute a tool by name
 */
export async function executeTool(name: string, params: Record<string, unknown>) {
  const tool = getTool(name);
  if (!tool) {
    return {
      result: null,
      error: `Tool "${name}" not found`,
    };
  }

  return await tool.handler(params);
}

/**
 * Get tools schema for LLM function calling
 */
export function getToolsSchema(): Record<string, any> {
  const schema: Record<string, any> = {};

  for (const [name, tool] of Object.entries(tools)) {
    schema[name] = {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: tool.parameters,
          required: Object.entries(tool.parameters)
            .filter(([_, p]) => p.required)
            .map(([paramName, _]) => paramName),
        },
      },
    };
  }

  return schema;
}
