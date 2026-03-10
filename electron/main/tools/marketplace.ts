/**
 * Tool Marketplace
 * Manages tool discovery, installation, and lifecycle
 */

import type { Database } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { readFile, readdir } from 'fs/promises';
import { join } from 'path';

export type ToolCategory =
  | 'file'
  | 'web'
  | 'system'
  | 'communication'
  | 'data'
  | 'automation'
  | 'ai'
  | 'browser'
  | 'custom';

export type HandlerType = 'builtin' | 'custom' | 'skill';

export interface Tool {
  id: string;
  name: string;
  category: ToolCategory;
  description: string;
  schemaJson: string;
  code?: string;
  handlerType: HandlerType;
  permissionsJson?: string;
  enabled: boolean;
  isBuiltin: boolean;
  version?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ToolSearchParams {
  query?: string;
  category?: ToolCategory;
  enabled?: boolean;
  handlerType?: HandlerType;
  limit?: number;
  offset?: number;
}

/**
 * Get a tool by ID
 */
export function getTool(db: Database, toolId: string): Tool | undefined {
  const result = db.prepare('SELECT * FROM tools WHERE id = ?').get(toolId) as any;
  if (!result) return undefined;

  return mapRowToTool(result);
}

/**
 * Get a tool by name
 */
export function getToolByName(db: Database, name: string): Tool | undefined {
  const result = db.prepare('SELECT * FROM tools WHERE name = ?').get(name) as any;
  if (!result) return undefined;

  return mapRowToTool(result);
}

/**
 * List all tools with optional filtering
 */
export function listTools(db: Database, params?: ToolSearchParams): Tool[] {
  let query = 'SELECT * FROM tools WHERE 1=1';
  const queryParams: any[] = [];

  if (params?.category) {
    query += ' AND category = ?';
    queryParams.push(params.category);
  }

  if (params?.enabled !== undefined) {
    query += ' AND enabled = ?';
    queryParams.push(params.enabled ? 1 : 0);
  }

  if (params?.handlerType) {
    query += ' AND handler_type = ?';
    queryParams.push(params.handlerType);
  }

  if (params?.query) {
    query += ' AND (name LIKE ? OR description LIKE ?)';
    const searchTerm = `%${params.query}%`;
    queryParams.push(searchTerm, searchTerm);
  }

  query += ' ORDER BY is_builtin DESC, name ASC';

  if (params?.limit) {
    query += ' LIMIT ?';
    queryParams.push(params.limit);

    if (params?.offset) {
      query += ' OFFSET ?';
      queryParams.push(params.offset);
    }
  }

  const results = db.prepare(query).all(...queryParams) as any[];
  return results.map(mapRowToTool);
}

/**
 * Create or update a tool
 */
export function upsertTool(
  db: Database,
  tool: Omit<Tool, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Tool {
  const now = Date.now();
  const id = tool.id || randomUUID();

  const existing = db.prepare('SELECT id FROM tools WHERE id = ?').get(id) as
    | { id: string }
    | undefined;

  if (existing) {
    db.prepare(
      `UPDATE tools
       SET name = ?, category = ?, description = ?, schema_json = ?, code = ?,
           handler_type = ?, permissions_json = ?, enabled = ?, is_builtin = ?, version = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      tool.name,
      tool.category,
      tool.description,
      tool.schemaJson,
      tool.code || null,
      tool.handlerType,
      tool.permissionsJson || null,
      tool.enabled ? 1 : 0,
      tool.isBuiltin ? 1 : 0,
      tool.version || null,
      now,
      id
    );

    return {
      ...tool,
      id,
      createdAt: now,
      updatedAt: now,
    };
  }

  db.prepare(
    `INSERT INTO tools (id, name, category, description, schema_json, code, handler_type, permissions_json, enabled, is_builtin, version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    tool.name,
    tool.category,
    tool.description,
    tool.schemaJson,
    tool.code || null,
    tool.handlerType,
    tool.permissionsJson || null,
    tool.enabled ? 1 : 0,
    tool.isBuiltin ? 1 : 0,
    tool.version || null,
    now,
    now
  );

  return {
    ...tool,
    id,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Delete a tool
 */
export function deleteTool(db: Database, toolId: string): boolean {
  const result = db.prepare('DELETE FROM tools WHERE id = ?').run(toolId);
  return result.changes > 0;
}

/**
 * Enable or disable a tool
 */
export function setToolEnabled(db: Database, toolId: string, enabled: boolean): boolean {
  const result = db
    .prepare('UPDATE tools SET enabled = ?, updated_at = ? WHERE id = ?')
    .run(enabled ? 1 : 0, Date.now(), toolId);
  return result.changes > 0;
}

/**
 * Get tools by category
 */
export function getToolsByCategory(db: Database, category: ToolCategory): Tool[] {
  const results = db
    .prepare('SELECT * FROM tools WHERE category = ? ORDER BY name ASC')
    .all(category) as any[];
  return results.map(mapRowToTool);
}

/**
 * Get enabled tools
 */
export function getEnabledTools(db: Database): Tool[] {
  const results = db
    .prepare('SELECT * FROM tools WHERE enabled = 1 ORDER BY name ASC')
    .all() as any[];
  return results.map(mapRowToTool);
}

/**
 * Get builtin tools
 */
export function getBuiltinTools(db: Database): Tool[] {
  const results = db
    .prepare('SELECT * FROM tools WHERE is_builtin = 1 ORDER BY name ASC')
    .all() as any[];
  return results.map(mapRowToTool);
}

/**
 * Get custom tools
 */
export function getCustomTools(db: Database): Tool[] {
  const results = db
    .prepare('SELECT * FROM tools WHERE is_builtin = 0 ORDER BY name ASC')
    .all() as any[];
  return results.map(mapRowToTool);
}

/**
 * Import tools from a directory
 */
export async function importToolsFromDirectory(
  db: Database,
  directoryPath: string
): Promise<{ imported: number; errors: Array<{ tool: string; error: string }> }> {
  const errors: Array<{ tool: string; error: string }> = [];
  let imported = 0;

  try {
    const files = await readdir(directoryPath);

    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const toolDefinition = JSON.parse(await readFile(join(directoryPath, file), 'utf-8'));

          upsertTool(db, {
            ...toolDefinition,
            handlerType: 'custom',
            isBuiltin: false,
            enabled: true,
          });

          imported++;
        } catch (error: any) {
          errors.push({
            tool: file,
            error: error.message || 'Unknown error',
          });
        }
      }
    }
  } catch (error: any) {
    throw new Error(`Failed to read directory: ${error.message}`);
  }

  return { imported, errors };
}

/**
 * Search tools by query
 */
export function searchTools(db: Database, query: string, limit?: number): Tool[] {
  const searchTerm = `%${query}%`;

  let sql = `SELECT * FROM tools
             WHERE name LIKE ? OR description LIKE ? OR category LIKE ?
             ORDER BY
               CASE WHEN name LIKE ? THEN 1 ELSE 2 END,
               name ASC`;

  const params = [searchTerm, searchTerm, searchTerm, `${query}%`];

  if (limit) {
    sql += ' LIMIT ?';
    params.push(String(limit));
  }

  const results = db.prepare(sql).all(...params) as any[];
  return results.map(mapRowToTool);
}

/**
 * Get tool statistics
 */
export function getToolStats(db: Database): {
  total: number;
  enabled: number;
  builtin: number;
  custom: number;
  byCategory: Record<string, number>;
} {
  const total = db.prepare('SELECT COUNT(*) as count FROM tools').get() as { count: number };
  const enabled = db.prepare('SELECT COUNT(*) as count FROM tools WHERE enabled = 1').get() as {
    count: number;
  };
  const builtin = db.prepare('SELECT COUNT(*) as count FROM tools WHERE is_builtin = 1').get() as {
    count: number;
  };
  const custom = db.prepare('SELECT COUNT(*) as count FROM tools WHERE is_builtin = 0').get() as {
    count: number;
  };

  const byCategoryResults = db
    .prepare('SELECT category, COUNT(*) as count FROM tools GROUP BY category')
    .all() as Array<{ category: string; count: number }>;

  const byCategory: Record<string, number> = {};
  for (const row of byCategoryResults) {
    byCategory[row.category] = row.count;
  }

  return {
    total: total.count,
    enabled: enabled.count,
    builtin: builtin.count,
    custom: custom.count,
    byCategory,
  };
}

/**
 * Map database row to Tool interface
 */
function mapRowToTool(row: any): Tool {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    schemaJson: row.schema_json,
    code: row.code,
    handlerType: row.handler_type,
    permissionsJson: row.permissions_json,
    enabled: row.enabled === 1,
    isBuiltin: row.is_builtin === 1,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Validate tool schema
 */
export function validateToolSchema(schemaJson: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  try {
    const schema = JSON.parse(schemaJson);

    if (!schema.type || schema.type !== 'object') {
      errors.push('Schema must be an object type');
    }

    if (!schema.properties) {
      errors.push('Schema must have properties');
    }

    return { valid: errors.length === 0, errors };
  } catch {
    errors.push('Invalid JSON');
    return { valid: false, errors };
  }
}
