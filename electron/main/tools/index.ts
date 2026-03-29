import { readFile, writeFile, access, constants, readdir, mkdir } from 'fs/promises';
import { statSync } from 'fs';
import { join, dirname, isAbsolute, normalize, resolve } from 'path';
import { homedir, tmpdir } from 'os';
import process from 'process';
import type Database from 'better-sqlite3';
import { getDatabase } from '../db/index.js';
import { toolLogger } from '../lib/logger.js';
import * as monitor from './monitor.js';

// Import control tools (keyboard and mouse)
import { getTool as getControlTool, getAvailableTools as getControlTools } from './control.js';
import type { TaskType } from '../ipc/scheduled.js';

// Import skills system for skill execution tool
import { getSkillExecutor } from '../skills/skill-executor.js';
import { executeSkill as executeSkillDB, getEnabledSkills } from '../ipc/skills.js';

/**
 * Security: Path validation utilities
 * Prevents path traversal attacks and restricts file access
 */

// Get temp directory for allowed paths
const TEMP_DIR = tmpdir();

// Blocked paths that should never be accessed (only exact matches, not subdirectories)
const BLOCKED_PATHS = [
  '/etc/passwd',
  '/etc/shadow',
  '/root/.ssh',
  '/root/.gnupg',
  'C:\\Windows\\System32\\config',
];

// Blocked file patterns
const BLOCKED_PATTERNS = [
  /\.env$/i,
  /\.env\.local$/i,
  /\.env\.production$/i,
  /\.key$/i,
  /\.pem$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /\/\.ssh\//i,
  /\/\.gnupg\//i,
  /\.config\/[^\/]*\/[^\/]*\.key/i,
];

/**
 * Check if a path contains path traversal attempts
 */
function hasPathTraversal(filepath: string): boolean {
  const normalized = normalize(filepath);
  // Only block if .. is at the start or middle, not at end
  const parts = normalized.split(/[/\\]/);
  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i] === '..') {
      return true;
    }
  }
  return false;
}

/**
 * Check if a path matches blocked patterns
 */
function isBlockedPath(filepath: string): boolean {
  const normalized = normalize(filepath).toLowerCase();

  // Check blocked patterns
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(normalized)) {
      return true;
    }
  }

  // Check blocked exact paths
  for (const blocked of BLOCKED_PATHS) {
    if (blocked && normalized === normalize(blocked).toLowerCase()) {
      return true;
    }
  }

  return false;
}

/**
 * Check if path is in an allowed directory (temp or work directory)
 */
function isAllowedDirectory(filepath: string): boolean {
  const normalized = normalize(filepath).toLowerCase();

  // Always allow temp directory
  if (normalized.startsWith(normalize(TEMP_DIR).toLowerCase())) {
    return true;
  }

  // Allow DeskClaw projects directory
  if (normalized.includes('deskclawprojects')) {
    return true;
  }

  return false;
}

/**
 * Validate and sanitize a file path
 * Returns null if path is invalid, otherwise returns the validated path
 */
function validatePath(filepath: string, allowAbsolute: boolean = true): string | null {
  if (!filepath || typeof filepath !== 'string') {
    toolLogger.warn('[Path Validation] Empty or invalid path');
    return null;
  }

  // Check for path traversal
  if (hasPathTraversal(filepath)) {
    toolLogger.warn(`[Path Validation] Path traversal detected: ${filepath}`);
    return null;
  }

  // Check for blocked paths (but allow temp directory)
  if (!isAllowedDirectory(filepath) && isBlockedPath(filepath)) {
    toolLogger.warn(`[Path Validation] Blocked path access: ${filepath}`);
    return null;
  }

  // For absolute paths, additional checks
  if (isAbsolute(filepath)) {
    if (!allowAbsolute) {
      toolLogger.warn(`[Path Validation] Absolute path not allowed: ${filepath}`);
      return null;
    }

    // Normalize the path
    const normalized = normalize(filepath);

    // Additional check: ensure path doesn't escape to sensitive directories
    for (const blocked of BLOCKED_PATHS) {
      if (blocked && normalized.startsWith(normalize(blocked))) {
        toolLogger.warn(`[Path Validation] Path in blocked directory: ${filepath}`);
        return null;
      }
    }

    return normalized;
  }

  // Relative paths are allowed (will be resolved against work directory)
  return normalize(filepath);
}

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

    // Security: Validate path before accessing
    const validatedPath = validatePath(filepath, true);
    if (!validatedPath) {
      toolLogger.error(`[file_read] Path validation failed: ${filepath}`);
      return {
        result: null,
        error: `Access denied: Invalid or blocked path "${filepath}"`,
      };
    }

    try {
      let fullPath = validatedPath;
      let displayPath = validatedPath;
      const workDir = getWorkDirectory();

      // Handle relative paths using path.isAbsolute()
      if (!isAbsolute(validatedPath)) {
        // Try work directory first
        fullPath = join(workDir, validatedPath);
        displayPath = fullPath;
      }

      toolLogger.info(
        `[file_read] filepath="${filepath}", isAbsolute=${isAbsolute(validatedPath)}, fullPath="${fullPath}"`
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

    // Security: Validate path before accessing
    const validatedPath = validatePath(filepath, true);
    if (!validatedPath) {
      toolLogger.error(`[file_write] Path validation failed: ${filepath}`);
      return {
        result: null,
        error: `Access denied: Invalid or blocked path "${filepath}"`,
      };
    }

    try {
      let fullPath = validatedPath;
      let displayPath = validatedPath;
      const workDir = getWorkDirectory();

      // Handle relative paths using path.isAbsolute()
      if (!isAbsolute(validatedPath)) {
        // Use work directory for relative paths
        fullPath = join(workDir, validatedPath);
        displayPath = fullPath; // Show full path to user
      }

      toolLogger.info(
        `[file_write] filepath="${filepath}", isAbsolute=${isAbsolute(validatedPath)}, fullPath="${fullPath}"`
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

    // Security: Validate path before accessing
    const validatedPath = validatePath(dirpath, true);
    if (!validatedPath) {
      toolLogger.error(`[file_list] Path validation failed: ${dirpath}`);
      return {
        result: {
          path: dirpath,
          fullPath: dirpath,
          workDir,
          entries: [],
          total: 0,
          exists: false,
          message: `Access denied: Invalid or blocked path "${dirpath}"`,
        },
      };
    }

    try {
      let fullPath = validatedPath;
      let displayPath = validatedPath;

      // Handle relative paths using path.isAbsolute()
      if (!isAbsolute(validatedPath)) {
        // Use work directory for relative paths
        fullPath = join(workDir, validatedPath);
        displayPath = fullPath;
      }

      toolLogger.info(
        `[file_list] dirpath="${dirpath}", isAbsolute=${isAbsolute(validatedPath)}, fullPath="${fullPath}"`
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
        // Normalize path separators for glob (use forward slashes)
        const normalizedPath = fullPath.replace(/\\/g, '/');
        const globPath = `${normalizedPath}/${pattern}`;
        const matched = await glob(globPath);
        const matchedNames = new Set(
          matched.map((f) => {
            // Extract filename from full path (handle both separators)
            const parts = f.split(/[/\\]/);
            return parts[parts.length - 1];
          })
        );
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

      // Security: Sanitize content to prevent execution of malicious instructions
      // Detect and warn about potentially dangerous patterns in scraped content
      const dangerousPatterns = [
        /execute\s+this\s+command/i,
        /run\s+this\s+command/i,
        /execute\s+the\s+following/i,
        /cat\s+.*\.encryption-key/i,
        /cat\s+.*\.keychain/i,
        /curl.*\|.*base64/i,
        /send.*to.*server/i,
        /exfiltrate/i,
        /\{\{.*API.*KEY.*\}\}/i,
        /\{\{.*TOKEN.*\}\}/i,
      ];

      const detectedDangers: string[] = [];
      for (const pattern of dangerousPatterns) {
        if (pattern.test(text)) {
          detectedDangers.push(pattern.source);
        }
      }

      if (detectedDangers.length > 0) {
        toolLogger.warn(
          `[web_scrape] Detected potentially dangerous patterns in ${targetUrl}: ${detectedDangers.join(', ')}`
        );
        // Add warning to the content
        text = `[SECURITY WARNING: This page contains potentially dangerous patterns. Exercise caution before executing any commands from this source.]\n\n${text}`;
      }

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
 * Execute Skill Tool - Execute a skill by name or ID
 * Bridges Quick Chat's tool system to the skills execution system
 */
tools.execute_skill = {
  name: 'execute_skill',
  description:
    'Execute a skill by name. Skills are specialized capabilities that can perform specific tasks like document processing, media conversion, or custom workflows. Use this to leverage built-in skills for tasks beyond standard tools.',
  parameters: {
    skill_name: {
      type: 'string',
      description:
        'Name of the skill to execute. Examples: "pdf-convert", "image-resize", "document-summarizer". Use list_skills to see available skills.',
      required: false,
    },
    skill_id: {
      type: 'string',
      description: 'Alternative to skill_name - ID of the skill to execute.',
      required: false,
    },
    input: {
      type: 'object',
      description:
        'Input parameters for the skill as an object. Example: {"file": "document.pdf", "format": "jpg"} or {"query": "search terms"}.',
      required: false,
    },
    timeout: {
      type: 'number',
      description: 'Execution timeout in milliseconds. Default: 30000 (30 seconds).',
      required: false,
    },
  },
  handler: async (params) => {
    try {
      const db = getDatabase();

      // Get skill identifier
      const skillName = params.skill_name as string | undefined;
      const skillId = params.skill_id as string | undefined;
      const input = (params.input as Record<string, unknown>) || {};
      const timeout = (params.timeout as number) || 30000;

      if (!skillName && !skillId) {
        return {
          result: null,
          error: 'Missing required parameter: skill_name or skill_id is required.',
        };
      }

      // Find skill by name or ID
      let targetSkill;
      if (skillId) {
        // Get by ID directly from skills in database
        const skills = getEnabledSkills(db);
        targetSkill = skills.find((s: any) => s.id === skillId);
      } else if (skillName) {
        // Search by name (case-insensitive partial match)
        const skills = getEnabledSkills(db);
        targetSkill = skills.find((s: any) =>
          s.name.toLowerCase().includes(skillName.toLowerCase())
        );

        // If not found, try exact match
        if (!targetSkill) {
          targetSkill = skills.find((s: any) => s.name.toLowerCase() === skillName.toLowerCase());
        }
      }

      if (!targetSkill) {
        const identifier = skillName || skillId;
        return {
          result: null,
          error: `Skill not found: "${identifier}". Available skills can be listed with the list_skills tool.`,
        };
      }

      toolLogger.info(`[execute_skill] Executing skill: ${targetSkill.name}`);

      // Check if skill has scripts to execute (multi-file skill with folder)
      if (targetSkill.skill_dir && targetSkill.scripts && targetSkill.scripts.length > 0) {
        // Use skill executor for multi-file skills
        const executor = getSkillExecutor();

        // Verify dependencies if any
        if (targetSkill.dependencies && targetSkill.dependencies.length > 0) {
          toolLogger.info(
            `[execute_skill] Checking ${targetSkill.dependencies.length} dependencies for ${targetSkill.name}`
          );
          const missingDeps = [];
          for (const dep of targetSkill.dependencies) {
            const installed = await executor.verifyDependency(dep);
            if (!installed) {
              missingDeps.push(`${dep.type}:${dep.name}`);
            }
          }

          if (missingDeps.length > 0) {
            toolLogger.warn(`[execute_skill] Missing dependencies: ${missingDeps.join(', ')}`);
            return {
              result: null,
              error: `Skill "${targetSkill.name}" requires dependencies that are not installed: ${missingDeps.join(', ')}. Please install them first.`,
              missingDependencies: missingDeps,
            };
          }
        }

        // Execute the skill
        const result = await executor.executeSkill({
          skillName: targetSkill.name,
          skillDir: targetSkill.skill_dir,
          input,
          timeout,
        });

        if (result.success) {
          toolLogger.info(`[execute_skill] Skill executed successfully: ${targetSkill.name}`);
          return {
            result: {
              skill: targetSkill.name,
              output: result.output,
              stdout: result.stdout,
              executionTime: result.executionTime,
              success: true,
              message: `Skill "${targetSkill.name}" executed successfully`,
            },
          };
        } else {
          toolLogger.error(`[execute_skill] Skill execution failed: ${result.error}`);
          return {
            result: null,
            error: `Skill execution failed: ${result.error}`,
            stderr: result.stderr,
            exitCode: result.exitCode,
            executionTime: result.executionTime,
          };
        }
      }

      // Fall back to inline code execution
      if (!targetSkill.code) {
        return {
          result: null,
          error: `Skill "${targetSkill.name}" has no executable code or scripts.`,
        };
      }

      // Use database executeSkill function for inline code
      const result = await executeSkillDB(db, targetSkill.id, {
        input,
        timeout,
      });

      if (result.success) {
        toolLogger.info(`[execute_skill] Inline skill executed successfully: ${targetSkill.name}`);
        return {
          result: {
            skill: targetSkill.name,
            output: result.output,
            logs: result.logs,
            executionTime: result.executionTime,
            success: true,
            message: `Skill "${targetSkill.name}" executed successfully`,
          },
        };
      } else {
        toolLogger.error(`[execute_skill] Inline skill execution failed: ${result.error}`);
        return {
          result: null,
          error: `Skill execution failed: ${result.error}`,
          executionTime: result.executionTime,
        };
      }
    } catch (error: any) {
      toolLogger.error('[execute_skill] Error:', error);
      return {
        result: null,
        error: `Failed to execute skill: ${error.message}`,
      };
    }
  },
};

/**
 * List Skills Tool - List all available enabled skills
 */
tools.list_skills = {
  name: 'list_skills',
  description:
    'List all available enabled skills. Returns skill names, descriptions, capabilities, and whether they have executable scripts. Use this to discover what skills are available before executing them.',
  parameters: {
    domain: {
      type: 'string',
      description:
        'Optional domain filter to show only skills in a specific domain. Examples: "document", "media", "automation", "analysis".',
      required: false,
    },
  },
  handler: async (params) => {
    try {
      const db = getDatabase();
      const domain = params.domain as string | undefined;

      let skills = getEnabledSkills(db);

      // Filter by domain if specified
      if (domain) {
        skills = skills.filter(
          (s: any) => s.metadata?.domain?.toLowerCase() === domain.toLowerCase()
        );
      }

      const skillList = skills.map((s: any) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        domain: s.metadata?.domain,
        hasScripts: !!(s.scripts && s.scripts.length > 0),
        scriptCount: s.scripts?.length || 0,
        hasDependencies: !!(s.dependencies && s.dependencies.length > 0),
        dependencyCount: s.dependencies?.length || 0,
        isBuiltin: s.is_builtin,
      }));

      return {
        result: {
          skills: skillList,
          total: skillList.length,
          domain: domain || 'all',
          message: `Found ${skillList.length} available skill${skillList.length !== 1 ? 's' : ''}`,
        },
      };
    } catch (error: any) {
      toolLogger.error('[list_skills] Error:', error);
      return {
        result: null,
        error: `Failed to list skills: ${error.message}`,
      };
    }
  },
};

/**
 * Database Query Tool - Execute SQLite SELECT queries
 */
tools.db_query = {
  name: 'db_query',
  description:
    'Execute a SQLite SELECT query on the application database or a custom database file. Returns query results as an array of objects.',
  parameters: {
    sql: {
      type: 'string',
      description: 'SQL SELECT query to execute. Example: "SELECT * FROM users WHERE active = 1"',
      required: true,
    },
    db_file: {
      type: 'string',
      description:
        'Optional path to external SQLite database file. If not provided, uses the application database.',
      required: false,
    },
    params: {
      type: 'string',
      description:
        'Optional JSON array of parameters for parameterized queries. Example: \'["param1", 123]\'',
      required: false,
    },
  },
  handler: async (params) => {
    const sql = params.sql as string;
    const dbFile = params.db_file as string | undefined;
    const queryParams = params.params ? JSON.parse(params.params as string) : undefined;

    try {
      let db: Database.Database;

      if (dbFile) {
        // Open external database
        const Database = await import('better-sqlite3').then((m) => m.default);
        db = new Database(dbFile, { readonly: true });
      } else {
        // Use application database
        db = getDatabase();
      }

      // Validate it's a SELECT query for safety
      const trimmedSql = sql.trim().toUpperCase();
      if (!trimmedSql.startsWith('SELECT') && !trimmedSql.startsWith('WITH')) {
        if (dbFile) db.close();
        return {
          result: null,
          error: 'Only SELECT and WITH queries are allowed for security.',
        };
      }

      const stmt = db.prepare(sql);
      let results: any[];

      if (queryParams && Array.isArray(queryParams)) {
        results = stmt.all(...queryParams);
      } else {
        results = stmt.all();
      }

      // Close external database if opened
      if (dbFile) db.close();

      toolLogger.info(`[db_query] Executed query, returned ${results.length} rows`);

      return {
        result: {
          sql,
          rows: results,
          count: results.length,
        },
      };
    } catch (error: any) {
      toolLogger.error(`[db_query] Query failed:`, error);
      return {
        result: null,
        error: `Database query failed: ${error.message}`,
      };
    }
  },
};

/**
 * Database Execute Tool - Execute SQLite INSERT/UPDATE/DELETE queries
 */
tools.db_execute = {
  name: 'db_execute',
  description:
    'Execute a SQLite INSERT, UPDATE, or DELETE query. DANGEROUS - requires user approval. Use with caution.',
  parameters: {
    sql: {
      type: 'string',
      description: 'SQL query to execute (INSERT, UPDATE, DELETE, CREATE, etc.).',
      required: true,
    },
    db_file: {
      type: 'string',
      description: 'Optional path to external SQLite database file.',
      required: false,
    },
    params: {
      type: 'string',
      description: 'Optional JSON array of parameters for parameterized queries.',
      required: false,
    },
    require_approval: {
      type: 'boolean',
      description: 'Whether to require user approval. Defaults to true.',
      required: false,
    },
  },
  handler: async (params) => {
    const sql = params.sql as string;
    const dbFile = params.db_file as string | undefined;
    const queryParams = params.params ? JSON.parse(params.params as string) : undefined;
    const requireApproval = params.require_approval !== false;

    if (requireApproval) {
      return {
        result: null,
        error: `Database modification requires approval: ${sql}`,
      };
    }

    try {
      let db: Database.Database;

      if (dbFile) {
        const Database = await import('better-sqlite3').then((m) => m.default);
        db = new Database(dbFile);
      } else {
        db = getDatabase();
      }

      const stmt = db.prepare(sql);
      let result: any;

      if (queryParams && Array.isArray(queryParams)) {
        result = stmt.run(...queryParams);
      } else {
        result = stmt.run();
      }

      // Close external database if opened
      if (dbFile) db.close();

      toolLogger.info(`[db_execute] Executed query, affected ${result.changes} rows`);

      return {
        result: {
          sql,
          changes: result.changes,
          lastInsertRowid: result.lastInsertRowid,
        },
      };
    } catch (error: any) {
      toolLogger.error(`[db_execute] Query failed:`, error);
      return {
        result: null,
        error: `Database execution failed: ${error.message}`,
      };
    }
  },
};

/**
 * File Hash Tool - Calculate file hash (SHA256, MD5, etc.)
 */
tools.file_hash = {
  name: 'file_hash',
  description:
    'Calculate the hash of a file using various algorithms. Useful for file integrity verification and deduplication.',
  parameters: {
    filepath: {
      type: 'string',
      description: 'Path to file (relative to work directory or absolute).',
      required: true,
    },
    algorithm: {
      type: 'string',
      description: 'Hash algorithm: "sha256" (default), "sha512", "md5", "sha1".',
      required: false,
    },
  },
  handler: async (params) => {
    const filepath = params.filepath as string;
    const algorithm = (params.algorithm as string) || 'sha256';

    try {
      let fullPath = filepath;
      const workDir = getWorkDirectory();

      if (!isAbsolute(filepath)) {
        fullPath = join(workDir, filepath);
      }

      const { createHash } = await import('crypto');
      const { readFile } = await import('fs/promises');

      const fileContent = await readFile(fullPath);
      const hash = createHash(algorithm);
      hash.update(fileContent);
      const digest = hash.digest('hex');

      toolLogger.info(`[file_hash] Calculated ${algorithm} hash for ${fullPath}`);

      return {
        result: {
          filepath: fullPath,
          algorithm,
          hash: digest,
          size: fileContent.length,
        },
      };
    } catch (error: any) {
      toolLogger.error(`[file_hash] Failed to calculate hash:`, error);
      return {
        result: null,
        error: `Failed to calculate file hash: ${error.message}`,
      };
    }
  },
};

/**
 * CSV to JSON Tool - Convert CSV file to JSON
 */
tools.csv_to_json = {
  name: 'csv_to_json',
  description:
    'Convert a CSV file to JSON format. Useful for data processing and analysis workflows.',
  parameters: {
    filepath: {
      type: 'string',
      description: 'Path to CSV file (relative to work directory or absolute).',
      required: true,
    },
    output_path: {
      type: 'string',
      description:
        'Optional output file path for the JSON result. If not provided, returns the JSON in the result.',
      required: false,
    },
    delimiter: {
      type: 'string',
      description: 'CSV delimiter character. Defaults to comma (",").',
      required: false,
    },
    has_header: {
      type: 'boolean',
      description: 'Whether the CSV has a header row. Defaults to true.',
      required: false,
    },
  },
  handler: async (params) => {
    const filepath = params.filepath as string;
    const outputPath = params.output_path as string | undefined;
    const delimiter = (params.delimiter as string) || ',';
    const hasHeader = params.has_header !== false;

    try {
      let fullPath = filepath;
      const workDir = getWorkDirectory();

      if (!isAbsolute(filepath)) {
        fullPath = join(workDir, filepath);
      }

      const { readFile } = await import('fs/promises');
      const content = await readFile(fullPath, 'utf-8');

      // Parse CSV
      const lines = content
        .trim()
        .split('\n')
        .map((line) => line.trim());

      if (lines.length === 0) {
        return { result: null, error: 'CSV file is empty' };
      }

      const headers = hasHeader
        ? lines[0].split(delimiter).map((h) => h.trim())
        : lines[0].split(',').map((_, i) => `column${i}`);

      const data: Record<string, string>[] = [];

      for (let i = hasHeader ? 1 : 0; i < lines.length; i++) {
        const values = lines[i].split(delimiter).map((v) => v.trim());
        const row: Record<string, string> = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });
        data.push(row);
      }

      const jsonData = JSON.stringify(data, null, 2);

      // Write to output file if specified
      if (outputPath) {
        let outputFullPath = outputPath;
        if (!isAbsolute(outputPath)) {
          outputFullPath = join(workDir, outputPath);
        }
        // Create parent directory if needed
        const dir = dirname(outputFullPath);
        await mkdir(dir, { recursive: true });
        await writeFile(outputFullPath, jsonData, 'utf-8');
        toolLogger.info(`[csv_to_json] Converted CSV to JSON, saved to ${outputFullPath}`);
      } else {
        toolLogger.info(`[csv_to_json] Converted CSV to JSON, ${data.length} rows`);
      }

      return {
        result: {
          input: fullPath,
          output: outputPath || null,
          rows: data.length,
          data,
          json: jsonData,
        },
      };
    } catch (error: any) {
      toolLogger.error(`[csv_to_json] Failed to convert:`, error);
      return {
        result: null,
        error: `Failed to convert CSV to JSON: ${error.message}`,
      };
    }
  },
};

/**
 * JSON to CSV Tool - Convert JSON data to CSV format
 */
tools.json_to_csv = {
  name: 'json_to_csv',
  description: 'Convert JSON data to CSV format. Accepts JSON file path or direct JSON string.',
  parameters: {
    input: {
      type: 'string',
      description: 'JSON file path or JSON string (array of objects).',
      required: true,
    },
    output_path: {
      type: 'string',
      description: 'Output file path for the CSV result.',
      required: true,
    },
    delimiter: {
      type: 'string',
      description: 'CSV delimiter character. Defaults to comma (",").',
      required: false,
    },
  },
  handler: async (params) => {
    const input = params.input as string;
    const outputPath = params.output_path as string;
    const delimiter = (params.delimiter as string) || ',';

    try {
      let jsonData: Record<string, unknown>[];

      // Check if input is a file path or JSON string
      if (input.trim().startsWith('[') || input.trim().startsWith('{')) {
        jsonData = JSON.parse(input);
      } else {
        // Read from file
        let fullPath = input;
        const workDir = getWorkDirectory();
        if (!isAbsolute(input)) {
          fullPath = join(workDir, input);
        }
        const { readFile } = await import('fs/promises');
        const content = await readFile(fullPath, 'utf-8');
        jsonData = JSON.parse(content);
      }

      if (!Array.isArray(jsonData) || jsonData.length === 0) {
        return { result: null, error: 'JSON must be a non-empty array of objects' };
      }

      // Get headers from first object
      const headers = Object.keys(jsonData[0] as Record<string, unknown>);

      // Build CSV
      const csvLines: string[] = [];

      // Add header row
      csvLines.push(headers.join(delimiter));

      // Add data rows
      for (const row of jsonData as Record<string, unknown>[]) {
        const values = headers.map((header) => {
          const value = row[header];
          // Handle values that contain the delimiter
          const strValue = String(value ?? '');
          if (strValue.includes(delimiter) || strValue.includes('\n')) {
            return `"${strValue.replace(/"/g, '""')}"`;
          }
          return strValue;
        });
        csvLines.push(values.join(delimiter));
      }

      const csvContent = csvLines.join('\n');

      // Write to output file
      let outputFullPath = outputPath;
      const workDir = getWorkDirectory();
      if (!isAbsolute(outputPath)) {
        outputFullPath = join(workDir, outputPath);
      }
      await writeFile(outputFullPath, csvContent, 'utf-8');

      toolLogger.info(`[json_to_csv] Converted JSON to CSV, saved to ${outputFullPath}`);

      return {
        result: {
          input,
          output: outputFullPath,
          rows: jsonData.length,
          csv: csvContent,
        },
      };
    } catch (error: any) {
      toolLogger.error(`[json_to_csv] Failed to convert:`, error);
      return {
        result: null,
        error: `Failed to convert JSON to CSV: ${error.message}`,
      };
    }
  },
};

/**
 * SHA256 Hash Tool - Calculate SHA256 hash
 */
tools.hash_sha256 = {
  name: 'hash_sha256',
  description:
    'Calculate SHA256 hash of a string or file. Useful for data integrity verification and password hashing.',
  parameters: {
    text: {
      type: 'string',
      description: 'Text to hash (use either text or filepath, not both).',
      required: false,
    },
    filepath: {
      type: 'string',
      description: 'Path to file to hash (use either text or filepath, not both).',
      required: false,
    },
  },
  handler: async (params) => {
    const text = params.text as string | undefined;
    const filepath = params.filepath as string | undefined;

    if (!text && !filepath) {
      return {
        result: null,
        error: 'Either text or filepath parameter is required',
      };
    }

    try {
      const { createHash } = await import('crypto');
      const hash = createHash('sha256');

      if (filepath) {
        let fullPath = filepath;
        const workDir = getWorkDirectory();
        if (!isAbsolute(filepath)) {
          fullPath = join(workDir, filepath);
        }
        const { readFile } = await import('fs/promises');
        const fileContent = await readFile(fullPath);
        hash.update(fileContent);
      } else if (text) {
        hash.update(text, 'utf8');
      }

      const digest = hash.digest('hex');

      return {
        result: {
          algorithm: 'sha256',
          hash: digest,
          input: filepath || text,
        },
      };
    } catch (error: any) {
      toolLogger.error(`[hash_sha256] Failed to calculate hash:`, error);
      return {
        result: null,
        error: `Failed to calculate SHA256 hash: ${error.message}`,
      };
    }
  },
};

/**
 * Process List Tool - List running processes
 */
tools.process_list = {
  name: 'process_list',
  description: 'List running processes on the system. Useful for system monitoring and automation.',
  parameters: {
    filter: {
      type: 'string',
      description: 'Optional filter string to match against process names.',
      required: false,
    },
  },
  handler: async (params) => {
    const filter = params.filter as string | undefined;

    try {
      const command = process.platform === 'win32' ? 'tasklist /fo csv' : 'ps aux';

      const { executeShell } = await import('../ipc/shell.js');
      const result = await executeShell(command, { requireApproval: false });

      if (result.exitCode !== 0) {
        return {
          result: null,
          error: `Failed to list processes: ${result.stderr}`,
        };
      }

      let processes = result.stdout.trim().split('\n');

      // Apply filter if specified
      if (filter) {
        processes = processes.filter((line) => line.toLowerCase().includes(filter.toLowerCase()));
      }

      toolLogger.info(`[process_list] Listed ${processes.length} processes`);

      return {
        result: {
          processes,
          count: processes.length,
          platform: process.platform,
        },
      };
    } catch (error: any) {
      toolLogger.error(`[process_list] Failed:`, error);
      return {
        result: null,
        error: `Failed to list processes: ${error.message}`,
      };
    }
  },
};

/**
 * Notification Show Tool - Show desktop notification
 */
tools.notification_show = {
  name: 'notification_show',
  description:
    'Show a desktop notification. Uses system notification or logs to console. Note: Full desktop notifications may require additional setup on some platforms.',
  parameters: {
    title: {
      type: 'string',
      description: 'Notification title.',
      required: true,
    },
    body: {
      type: 'string',
      description: 'Notification body text.',
      required: true,
    },
    timeout: {
      type: 'number',
      description: 'Notification timeout in milliseconds. Default: 5000.',
      required: false,
    },
  },
  handler: async (params) => {
    const title = params.title as string;
    const body = params.body as string;
    const timeout = (params.timeout as number) || 5000;

    try {
      // Log the notification for now
      // Full desktop notifications in main process require additional setup
      toolLogger.info(`[notification_show] ${title}: ${body}`);

      // Try to use native-notify if available, or fallback to logging
      try {
        // Check if we're in a renderer context (for future extensions)
        if (typeof window !== 'undefined' && 'Notification' in window) {
          const notification = new (window as any).Notification(title, {
            body,
            requireInteraction: false,
          });
          notification.show();
          setTimeout(() => notification.close(), timeout);
        }
      } catch {
        // Fallback to console only
      }

      return {
        result: {
          title,
          body,
          timeout,
          shown: true,
          message: 'Notification logged to console',
        },
      };
    } catch (error: any) {
      toolLogger.error(`[notification_show] Failed:`, error);
      return {
        result: null,
        error: `Failed to show notification: ${error.message}`,
      };
    }
  },
};

/**
 * Ping Tool - Ping a host to check connectivity
 */
tools.ping = {
  name: 'ping',
  description: 'Ping a host to check network connectivity and measure latency.',
  parameters: {
    host: {
      type: 'string',
      description: 'Host to ping (IP address or domain name). Example: "google.com" or "8.8.8.8"',
      required: true,
    },
    count: {
      type: 'number',
      description: 'Number of ping packets to send. Default: 4.',
      required: false,
    },
  },
  handler: async (params) => {
    const host = params.host as string;
    const count = (params.count as number) || 4;

    try {
      let command: string;

      if (process.platform === 'win32') {
        command = `ping -n ${count} ${host}`;
      } else {
        command = `ping -c ${count} ${host}`;
      }

      const { executeShell } = await import('../ipc/shell.js');
      const result = await executeShell(command, { requireApproval: false });

      if (result.exitCode !== 0 && result.exitCode !== null) {
        // Some systems return non-zero even on successful ping
        // Check if output contains ping results
      }

      toolLogger.info(`[ping] Pinged ${host}`);

      return {
        result: {
          host,
          count,
          output: result.stdout,
          errorOutput: result.stderr,
          exitCode: result.exitCode,
        },
      };
    } catch (error: any) {
      toolLogger.error(`[ping] Failed:`, error);
      return {
        result: null,
        error: `Failed to ping ${host}: ${error.message}`,
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
 * Logs all tool executions (success and error) to the database
 */
export async function executeTool(name: string, params: Record<string, unknown>) {
  const startTime = Date.now();
  const db = getDatabase();

  const tool = getTool(name);
  if (!tool) {
    // Log the error for non-existent tool
    try {
      monitor.logToolExecution(db, {
        toolId: name,
        parametersJson: JSON.stringify(params),
        resultJson: undefined,
        errorText: `Tool "${name}" not found`,
        executionTimeMs: Date.now() - startTime,
        status: 'error',
      });
    } catch (logError) {
      toolLogger.error(`Failed to log tool execution: ${logError}`);
    }

    return {
      result: null,
      error: `Tool "${name}" not found`,
    };
  }

  try {
    const result = await tool.handler(params);
    const executionTime = Date.now() - startTime;

    // Log successful execution
    try {
      monitor.logToolExecution(db, {
        toolId: name,
        parametersJson: JSON.stringify(params),
        resultJson: result.result ? JSON.stringify(result.result) : undefined,
        errorText: result.error ?? undefined,
        executionTimeMs: executionTime,
        status: result.error ? 'error' : 'success',
      });
    } catch (logError) {
      toolLogger.error(`Failed to log tool execution: ${logError}`);
    }

    return result;
  } catch (error) {
    const executionTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Log error execution
    try {
      monitor.logToolExecution(db, {
        toolId: name,
        parametersJson: JSON.stringify(params),
        resultJson: undefined,
        errorText: errorMessage,
        executionTimeMs: executionTime,
        status: 'error',
      });
    } catch (logError) {
      toolLogger.error(`Failed to log tool execution: ${logError}`);
    }

    return {
      result: null,
      error: errorMessage,
    };
  }
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
