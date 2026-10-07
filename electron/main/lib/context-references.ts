/**
 * Context Reference Expansion
 *
 * Parses and expands @file:, @folder:, and @url: references in messages.
 * Provides inline content from files, directory listings, and web pages.
 */

import { readFile, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join, normalize, isAbsolute, extname } from 'path';
import { createLogger } from './logger.js';
import https from 'https';
import http from 'http';

const ctxLogger = createLogger('context-refs');

// Security: blocked path patterns
const BLOCKED_PATH_PATTERNS = [
  /\.ssh/i,
  /\.aws/i,
  /\.env/i,
  /\.gnupg/i,
  /\.config\/[^/]*\/[^/]*\.key/i,
];

// Binary file extensions
const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.ico',
  '.webp',
  '.svg',
  '.mp3',
  '.mp4',
  '.avi',
  '.mov',
  '.wav',
  '.flac',
  '.zip',
  '.tar',
  '.gz',
  '.rar',
  '.7z',
  '.bz2',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.sqlite',
  '.db',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.class',
  '.jar',
  '.war',
  '.pyc',
  '.o',
  '.obj',
]);

const MAX_FILE_SIZE = 1024 * 1024; // 1MB
const MAX_URL_CONTENT = 50 * 1024; // 50KB
const MAX_FOLDER_FILES = 100;

export interface ExpandedReference {
  type: 'file' | 'folder' | 'url';
  reference: string;
  content: string;
  error?: string;
  tokenCount?: number;
}

/**
 * Check if a path is safe to access
 */
function isPathSafe(filepath: string): boolean {
  const normalized = normalize(filepath);
  // Check for path traversal
  if (normalized.includes('..')) return false;
  // Check blocked patterns
  for (const pattern of BLOCKED_PATH_PATTERNS) {
    if (pattern.test(normalized)) return false;
  }
  return true;
}

/**
 * Check if a file is binary based on extension
 */
function isBinaryFile(filepath: string): boolean {
  return BINARY_EXTENSIONS.has(extname(filepath).toLowerCase());
}

/**
 * Parse references from a message
 */
export function parseReferences(text: string): string[] {
  const refs: string[] = [];
  // Match @file:path, @folder:path, @url:url
  const pattern = /@(file|folder|url):(\S+)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    refs.push(match[0]);
  }
  return refs;
}

/**
 * Expand a file reference
 */
async function expandFileReference(ref: string): Promise<ExpandedReference> {
  // Parse @file:path[:lines]
  const fileMatch = ref.match(/^@file:(.+?)(?::(\d+)(?:-(\d+))?)?$/);
  if (!fileMatch) {
    return { type: 'file', reference: ref, content: '', error: 'Invalid file reference format' };
  }

  const filepath = fileMatch[1];
  const startLine = fileMatch[2] ? parseInt(fileMatch[2]) : undefined;
  const endLine = fileMatch[3] ? parseInt(fileMatch[3]) : undefined;

  if (!isPathSafe(filepath)) {
    return {
      type: 'file',
      reference: ref,
      content: '',
      error: 'Path not allowed for security reasons',
    };
  }

  if (!isAbsolute(filepath)) {
    return {
      type: 'file',
      reference: ref,
      content: '',
      error: 'Please provide an absolute file path',
    };
  }

  if (!existsSync(filepath)) {
    return { type: 'file', reference: ref, content: '', error: `File not found: ${filepath}` };
  }

  try {
    const fileStat = await stat(filepath);
    if (fileStat.size > MAX_FILE_SIZE) {
      return {
        type: 'file',
        reference: ref,
        content: '',
        error: `File too large (${Math.round(fileStat.size / 1024)}KB, max 1MB)`,
      };
    }

    if (isBinaryFile(filepath)) {
      return {
        type: 'file',
        reference: ref,
        content: '',
        error: 'Binary file, cannot include as text',
      };
    }

    let content = await readFile(filepath, 'utf-8');

    // Apply line range filter if specified
    if (startLine !== undefined) {
      const lines = content.split('\n');
      const start = Math.max(1, startLine) - 1;
      const end = endLine !== undefined ? Math.min(lines.length, endLine) : lines.length;
      content = lines.slice(start, end).join('\n');
    }

    return {
      type: 'file',
      reference: ref,
      content: `File: ${filepath}\n\`\`\`${extname(filepath).slice(1)}\n${content}\n\`\`\``,
    };
  } catch (error: any) {
    return { type: 'file', reference: ref, content: '', error: error.message };
  }
}

/**
 * Expand a folder reference
 */
async function expandFolderReference(ref: string): Promise<ExpandedReference> {
  const folderMatch = ref.match(/^@folder:(.+)$/);
  if (!folderMatch) {
    return {
      type: 'folder',
      reference: ref,
      content: '',
      error: 'Invalid folder reference format',
    };
  }

  const folderPath = folderMatch[1];

  if (!isPathSafe(folderPath)) {
    return {
      type: 'folder',
      reference: ref,
      content: '',
      error: 'Path not allowed for security reasons',
    };
  }

  if (!isAbsolute(folderPath)) {
    return {
      type: 'folder',
      reference: ref,
      content: '',
      error: 'Please provide an absolute path',
    };
  }

  if (!existsSync(folderPath)) {
    return {
      type: 'folder',
      reference: ref,
      content: '',
      error: `Directory not found: ${folderPath}`,
    };
  }

  try {
    const entries = await readdir(folderPath, { withFileTypes: true });
    const files: string[] = [];
    const dirs: string[] = [];

    for (const entry of entries.slice(0, MAX_FOLDER_FILES)) {
      if (entry.isDirectory()) {
        dirs.push(`${entry.name}/`);
      } else if (entry.isFile()) {
        files.push(entry.name);
      }
    }

    const listing = [
      `Directory: ${folderPath}`,
      `(${entries.length} entries${entries.length > MAX_FOLDER_FILES ? `, showing first ${MAX_FOLDER_FILES}` : ''})`,
      '',
      ...dirs.sort(),
      ...files.sort(),
    ].join('\n');

    return { type: 'folder', reference: ref, content: listing };
  } catch (error: any) {
    return { type: 'folder', reference: ref, content: '', error: error.message };
  }
}

/**
 * Fetch URL content
 */
function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout: 10000 }, (res) => {
      const chunks: Buffer[] = [];
      let totalSize = 0;

      res.on('data', (chunk) => {
        totalSize += chunk.length;
        if (totalSize > MAX_URL_CONTENT) {
          req.destroy();
          resolve(chunks.join('').toString('utf8') + '\n\n[Content truncated at 50KB]');
          return;
        }
        chunks.push(chunk);
      });

      res.on('end', () => {
        const html = Buffer.concat(chunks).toString('utf8');
        // Strip HTML tags for plain text
        const text = html
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        resolve(text);
      });

      res.on('error', reject);
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Expand a URL reference
 */
async function expandUrlReference(ref: string): Promise<ExpandedReference> {
  const urlMatch = ref.match(/^@url:(.+)$/);
  if (!urlMatch) {
    return { type: 'url', reference: ref, content: '', error: 'Invalid URL reference format' };
  }

  const url = urlMatch[1];

  try {
    const content = await fetchUrl(url);
    return {
      type: 'url',
      reference: ref,
      content: `URL: ${url}\n\n${content}`,
    };
  } catch (error: any) {
    return {
      type: 'url',
      reference: ref,
      content: '',
      error: `Failed to fetch URL: ${error.message}`,
    };
  }
}

/**
 * Expand all references in a message
 */
export async function expandReferences(text: string): Promise<{
  expandedText: string;
  references: ExpandedReference[];
}> {
  const refs = parseReferences(text);
  if (refs.length === 0) {
    return { expandedText: text, references: [] };
  }

  const expanded: ExpandedReference[] = [];

  for (const ref of refs) {
    let result: ExpandedReference;
    if (ref.startsWith('@file:')) {
      result = await expandFileReference(ref);
    } else if (ref.startsWith('@folder:')) {
      result = await expandFolderReference(ref);
    } else if (ref.startsWith('@url:')) {
      result = await expandUrlReference(ref);
    } else {
      continue;
    }
    expanded.push(result);
    ctxLogger.info(`Expanded reference: ${ref} (${result.error ? 'error' : 'success'})`);
  }

  // Build expanded text
  const contextBlock = expanded
    .filter((r) => r.content)
    .map((r) => r.content)
    .join('\n\n');

  if (contextBlock) {
    return {
      expandedText: `${text}\n\n--- Attached Context ---\n${contextBlock}\n--- End Attached Context ---`,
      references: expanded,
    };
  }

  // Include errors if any
  const errors = expanded.filter((r) => r.error);
  if (errors.length > 0) {
    const errorBlock = errors.map((r) => `${r.reference}: ${r.error}`).join('\n');
    return {
      expandedText: `${text}\n\n--- Context Errors ---\n${errorBlock}`,
      references: expanded,
    };
  }

  return { expandedText: text, references: expanded };
}

/**
 * Preview a reference without full expansion
 */
export async function previewReference(ref: string): Promise<ExpandedReference> {
  if (ref.startsWith('@file:')) {
    return expandFileReference(ref);
  } else if (ref.startsWith('@folder:')) {
    return expandFolderReference(ref);
  } else if (ref.startsWith('@url:')) {
    return expandUrlReference(ref);
  }
  return { type: 'file', reference: ref, content: '', error: 'Unknown reference type' };
}
