import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { spawn, exec as execCallback } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { promisify } from 'util';

const exec = promisify(execCallback);
import { loadSkillFromDir, loadSkillsFromDir, findMatchingSkills } from '../skills/skill-loader.js';
import { getSkillExecutor } from '../skills/skill-executor.js';

export interface ScriptInfo {
  path: string;
  relativePath: string;
  type: 'python' | 'javascript' | 'shell' | 'binary';
  name: string;
}

export interface DependencyInfo {
  type: 'python' | 'node' | 'system' | 'external';
  name: string;
  version?: string;
}

export interface SkillMetadata {
  author?: string;
  version?: string;
  domain?: string;
  triggers?: string[];
  role?: string;
  scope?: string;
  outputFormat?: string;
  relatedSkills?: string[];
}

export interface CreateSkillData {
  name: string;
  description?: string;
  schemaJson?: object;
  code?: string;
  metadata?: SkillMetadata;
  license?: string;
  allowedTools?: string[];
  content?: string;
  isBuiltin?: boolean;
  enabled?: boolean;
  scripts?: ScriptInfo[];
  dependencies?: DependencyInfo[];
  skillDir?: string;
}

export interface UpdateSkillData {
  name?: string;
  description?: string;
  schemaJson?: object;
  code?: string;
  metadata?: SkillMetadata;
  license?: string;
  allowedTools?: string[];
  content?: string;
  isBuiltin?: boolean;
  enabled?: boolean;
  scripts?: ScriptInfo[];
  dependencies?: DependencyInfo[];
  skillDir?: string;
}

export const listSkills = (db: Database.Database) => {
  const stmt = db.prepare(`
    SELECT id, name, description, schema_json, code, metadata_json, license,
           allowed_tools, content, is_builtin, enabled, scripts_json, dependencies_json,
           skill_dir, created_at, updated_at
    FROM skills
    ORDER BY updated_at DESC
  `);

  const skills = stmt.all() as any[];
  return skills.map((skill) => ({
    ...skill,
    schema_json: skill.schema_json ? JSON.parse(skill.schema_json) : null,
    metadata_json: skill.metadata_json ? JSON.parse(skill.metadata_json) : null,
    allowed_tools: skill.allowed_tools
      ? skill.allowed_tools.split(',').map((t: string) => t.trim())
      : [],
    scripts: skill.scripts_json ? JSON.parse(skill.scripts_json) : [],
    dependencies: skill.dependencies_json ? JSON.parse(skill.dependencies_json) : [],
    skill_dir: skill.skill_dir || undefined,
    is_builtin: !!skill.is_builtin,
    enabled: !!skill.enabled,
  }));
};

export const getSkill = (db: Database.Database, id: string) => {
  const stmt = db.prepare('SELECT * FROM skills WHERE id = ?');
  const skill = stmt.get(id) as any;

  if (!skill) {
    throw new Error('Skill not found');
  }

  return {
    ...skill,
    schema_json: skill.schema_json ? JSON.parse(skill.schema_json) : null,
    metadata_json: skill.metadata_json ? JSON.parse(skill.metadata_json) : null,
    allowed_tools: skill.allowed_tools
      ? skill.allowed_tools.split(',').map((t: string) => t.trim())
      : [],
    scripts: skill.scripts_json ? JSON.parse(skill.scripts_json) : [],
    dependencies: skill.dependencies_json ? JSON.parse(skill.dependencies_json) : [],
    skill_dir: skill.skill_dir || undefined,
    is_builtin: !!skill.is_builtin,
    enabled: !!skill.enabled,
  };
};

export const createSkill = (db: Database.Database, data: CreateSkillData) => {
  const id = randomUUID();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO skills (
      id, name, description, schema_json, code, metadata_json, license,
      allowed_tools, content, is_builtin, enabled, scripts_json, dependencies_json,
      skill_dir, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    data.name,
    data.description || null,
    data.schemaJson ? JSON.stringify(data.schemaJson) : null,
    data.code || null,
    data.metadata ? JSON.stringify(data.metadata) : null,
    data.license || null,
    data.allowedTools ? data.allowedTools.join(', ') : null,
    data.content || null,
    data.isBuiltin ? 1 : 0,
    data.enabled !== false ? 1 : 0,
    data.scripts ? JSON.stringify(data.scripts) : null,
    data.dependencies ? JSON.stringify(data.dependencies) : null,
    data.skillDir || null,
    now,
    now
  );

  return { id, ...data, createdAt: now, updatedAt: now };
};

export const updateSkill = (db: Database.Database, id: string, data: UpdateSkillData) => {
  const updates: string[] = [];
  const values: unknown[] = [];

  if (data.name !== undefined) {
    updates.push('name = ?');
    values.push(data.name);
  }
  if (data.description !== undefined) {
    updates.push('description = ?');
    values.push(data.description);
  }
  if (data.schemaJson !== undefined) {
    updates.push('schema_json = ?');
    values.push(JSON.stringify(data.schemaJson));
  }
  if (data.code !== undefined) {
    updates.push('code = ?');
    values.push(data.code);
  }
  if (data.metadata !== undefined) {
    updates.push('metadata_json = ?');
    values.push(JSON.stringify(data.metadata));
  }
  if (data.license !== undefined) {
    updates.push('license = ?');
    values.push(data.license);
  }
  if (data.allowedTools !== undefined) {
    updates.push('allowed_tools = ?');
    values.push(data.allowedTools.join(', '));
  }
  if (data.content !== undefined) {
    updates.push('content = ?');
    values.push(data.content);
  }
  if (data.isBuiltin !== undefined) {
    updates.push('is_builtin = ?');
    values.push(data.isBuiltin ? 1 : 0);
  }
  if (data.enabled !== undefined) {
    updates.push('enabled = ?');
    values.push(data.enabled ? 1 : 0);
  }
  if (data.scripts !== undefined) {
    updates.push('scripts_json = ?');
    values.push(JSON.stringify(data.scripts));
  }
  if (data.dependencies !== undefined) {
    updates.push('dependencies_json = ?');
    values.push(JSON.stringify(data.dependencies));
  }
  if (data.skillDir !== undefined) {
    updates.push('skill_dir = ?');
    values.push(data.skillDir);
  }

  if (updates.length === 0) {
    return getSkill(db, id);
  }

  updates.push('updated_at = ?');
  values.push(Date.now());
  values.push(id);

  const stmt = db.prepare(`
    UPDATE skills
    SET ${updates.join(', ')}
    WHERE id = ?
  `);

  const result = stmt.run(...values);

  if (result.changes === 0) {
    throw new Error('Skill not found');
  }

  return getSkill(db, id);
};

export const deleteSkill = (db: Database.Database, id: string) => {
  const stmt = db.prepare('DELETE FROM skills WHERE id = ?');
  const result = stmt.run(id);

  if (result.changes === 0) {
    throw new Error('Skill not found');
  }

  return { success: true };
};

export interface SkillExecutionOptions {
  input?: Record<string, unknown>;
  timeout?: number;
  onProgress?: (progress: { type: string; message: string; data?: unknown }) => void;
}

export interface SkillExecutionResult {
  success: boolean;
  output?: unknown;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  error?: string;
  executionTime: number;
  logs?: string;
}

/**
 * Execute a skill's Python code in a sandboxed environment
 */
export const executeSkill = async (
  db: Database.Database,
  id: string,
  options: SkillExecutionOptions = {}
): Promise<SkillExecutionResult> => {
  const startTime = Date.now();
  const skill = getSkill(db, id);

  // Report start
  options.onProgress?.({
    type: 'start',
    message: `Starting skill: ${skill.name}`,
  });

  // Check if skill has scripts to execute
  if (skill.skill_dir && skill.scripts && skill.scripts.length > 0) {
    // Use the skill executor for skills with scripts
    options.onProgress?.({
      type: 'info',
      message: `Found ${skill.scripts.length} script(s) in skill directory`,
    });

    const executor = getSkillExecutor();

    // Check dependencies
    if (skill.dependencies && skill.dependencies.length > 0) {
      options.onProgress?.({
        type: 'info',
        message: `Checking ${skill.dependencies.length} dependencies...`,
      });

      for (const dep of skill.dependencies) {
        const installed = await executor.verifyDependency(dep);
        if (!installed) {
          options.onProgress?.({
            type: 'warning',
            message: `Dependency not installed: ${dep.name}`,
          });
        }
      }
    }

    const result = await executor.executeSkill({
      skillName: skill.name,
      skillDir: skill.skill_dir,
      input: options.input || {},
      timeout: options.timeout,
    });

    options.onProgress?.({
      type: result.success ? 'complete' : 'error',
      message: result.success ? 'Skill executed successfully' : result.error || 'Execution failed',
      data: result,
    });

    return result;
  }

  // Fall back to inline code execution
  if (!skill.code) {
    const error = 'Skill has no code to execute';
    options.onProgress?.({
      type: 'error',
      message: error,
    });
    return { success: false, error, executionTime: Date.now() - startTime };
  }

  options.onProgress?.({
    type: 'info',
    message: 'Executing inline Python code...',
  });

  const tempDir = tmpdir();
  const scriptPath = join(tempDir, `skill_${id}_${Date.now()}.py`);

  try {
    // Write the Python code to a temporary file
    await writeFile(scriptPath, skill.code, 'utf-8');

    // Prepare the input as JSON
    const inputJson = JSON.stringify(options.input || {});

    // Execute the Python script
    const result = await new Promise<SkillExecutionResult>((resolve) => {
      const pythonProcess = spawn('python', [scriptPath, inputJson], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: options.timeout || 30000, // 30 seconds default
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        // Report progress for each line
        const lines = chunk.split('\n').filter((l: string) => l.trim());
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.progress) {
              options.onProgress?.({
                type: 'progress',
                message: parsed.message || line,
                data: parsed,
              });
            }
          } catch {
            // Not JSON, just log it
            if (line.trim()) {
              options.onProgress?.({
                type: 'output',
                message: line,
              });
            }
          }
        }
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        options.onProgress?.({
          type: 'warning',
          message: data.toString(),
        });
      });

      pythonProcess.on('close', (code) => {
        // Clean up the temp file
        unlink(scriptPath).catch(() => {});

        const executionTime = Date.now() - startTime;

        if (code === 0) {
          try {
            const output = stdout.trim() ? JSON.parse(stdout) : null;
            options.onProgress?.({
              type: 'complete',
              message: 'Execution completed successfully',
              data: output,
            });
            resolve({
              success: true,
              output,
              logs: stderr || undefined,
              executionTime,
            });
          } catch {
            // If output is not valid JSON, return as string
            options.onProgress?.({
              type: 'complete',
              message: 'Execution completed (non-JSON output)',
            });
            resolve({
              success: true,
              output: stdout,
              logs: stderr || undefined,
              executionTime,
            });
          }
        } else {
          options.onProgress?.({
            type: 'error',
            message: stderr || `Process exited with code ${code}`,
          });
          resolve({
            success: false,
            error: stderr || `Process exited with code ${code}`,
            executionTime,
          });
        }
      });

      pythonProcess.on('error', (error) => {
        unlink(scriptPath).catch(() => {});
        options.onProgress?.({
          type: 'error',
          message: error.message,
        });
        resolve({
          success: false,
          error: error.message,
          executionTime: Date.now() - startTime,
        });
      });
    });

    return result;
  } catch (error) {
    // Clean up the temp file on error
    try {
      await unlink(scriptPath);
    } catch {
      // Ignore cleanup errors
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    options.onProgress?.({
      type: 'error',
      message: errorMessage,
    });

    return {
      success: false,
      error: errorMessage,
      executionTime: Date.now() - startTime,
    };
  }
};

/**
 * Import a single skill from a directory
 */
export const importSkill = async (db: Database.Database, skillDir: string) => {
  const skillData = await loadSkillFromDir(skillDir);

  // Check if skill already exists
  const existingStmt = db.prepare('SELECT id FROM skills WHERE name = ?');
  const existing = existingStmt.get(skillData.name) as any;

  if (existing) {
    // Update existing skill
    return updateSkill(db, existing.id, {
      ...skillData,
      isBuiltin: true,
    });
  }

  // Create new skill
  return createSkill(db, skillData);
};

/**
 * Import all skills from a directory
 */
export const importSkillsFromDir = async (db: Database.Database, skillsDir: string) => {
  const skills = await loadSkillsFromDir(skillsDir);

  const results = {
    imported: 0,
    updated: 0,
    failed: 0,
    errors: [] as Array<{ skill: string; error: string }>,
  };

  for (const skillData of skills) {
    try {
      // Check if skill already exists
      const existingStmt = db.prepare('SELECT id FROM skills WHERE name = ?');
      const existing = existingStmt.get(skillData.name) as any;

      if (existing) {
        // Update existing skill
        await updateSkill(db, existing.id, {
          ...skillData,
          isBuiltin: true,
        });
        results.updated++;
      } else {
        // Create new skill
        await createSkill(db, skillData);
        results.imported++;
      }
    } catch (error) {
      results.failed++;
      results.errors.push({
        skill: skillData.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
};

/**
 * Get skill content including references
 */
export const getSkillContent = (db: Database.Database, id: string) => {
  const skill = getSkill(db, id);
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    content: skill.content,
    metadata: skill.metadata_json,
  };
};

/**
 * Search skills by query
 */
export const searchSkills = (db: Database.Database, query: string) => {
  const allSkills = listSkills(db);
  const loadedSkills = allSkills.map((skill) => ({
    name: skill.name,
    description: skill.description,
    metadata: skill.metadata_json,
    content: skill.content || '',
    allowedTools: skill.allowed_tools,
    references: {},
    isBuiltin: skill.is_builtin,
    enabled: skill.enabled,
    scripts: [],
    dependencies: [],
    skillDir: '',
  }));

  return findMatchingSkills(loadedSkills as any, query);
};

/**
 * Get skills by domain
 */
export const getSkillsByDomain = (db: Database.Database, domain: string) => {
  const stmt = db.prepare(`
    SELECT * FROM skills
    WHERE metadata_json LIKE ?
    ORDER BY name ASC
  `);

  const skills = stmt.all(`%domain": "${domain}"%`) as any[];
  return skills.map((skill) => ({
    ...skill,
    schema_json: skill.schema_json ? JSON.parse(skill.schema_json) : null,
    metadata_json: skill.metadata_json ? JSON.parse(skill.metadata_json) : null,
    allowed_tools: skill.allowed_tools
      ? skill.allowed_tools.split(',').map((t: string) => t.trim())
      : [],
    is_builtin: !!skill.is_builtin,
    enabled: !!skill.enabled,
  }));
};

/**
 * Get enabled skills only
 */
export const getEnabledSkills = (db: Database.Database) => {
  const stmt = db.prepare(`
    SELECT id, name, description, schema_json, code, metadata_json, license,
           allowed_tools, content, is_builtin, enabled, scripts_json, dependencies_json,
           skill_dir, created_at, updated_at
    FROM skills
    WHERE enabled = 1
    ORDER BY name ASC
  `);

  const skills = stmt.all() as any[];
  return skills.map((skill) => ({
    ...skill,
    schema_json: skill.schema_json ? JSON.parse(skill.schema_json) : null,
    metadata_json: skill.metadata_json ? JSON.parse(skill.metadata_json) : null,
    allowed_tools: skill.allowed_tools
      ? skill.allowed_tools.split(',').map((t: string) => t.trim())
      : [],
    scripts: skill.scripts_json ? JSON.parse(skill.scripts_json) : [],
    dependencies: skill.dependencies_json ? JSON.parse(skill.dependencies_json) : [],
    skill_dir: skill.skill_dir || undefined,
    is_builtin: !!skill.is_builtin,
    enabled: !!skill.enabled,
  }));
};

/**
 * Check and install skill dependencies
 */
export const checkDependencies = async (db: Database.Database, id: string) => {
  const skill = getSkill(db, id);
  const executor = getSkillExecutor();

  if (!skill.dependencies || skill.dependencies.length === 0) {
    return { allInstalled: true, dependencies: [] };
  }

  const results = [];

  for (const dep of skill.dependencies) {
    const installed = await executor.verifyDependency(dep);
    results.push({
      ...dep,
      installed,
    });
  }

  const allInstalled = results.every((r) => r.installed);

  return {
    allInstalled,
    dependencies: results,
  };
};

/**
 * Install skill dependencies
 */
export const installDependencies = async (
  db: Database.Database,
  id: string
): Promise<{
  success: boolean;
  results: Array<{ dependency: string; success: boolean; output?: string; error?: string }>;
}> => {
  const skill = getSkill(db, id);
  const results = [];

  if (!skill.dependencies || skill.dependencies.length === 0) {
    return { success: true, results: [] };
  }

  for (const dep of skill.dependencies) {
    try {
      let output = '';

      if (dep.type === 'python') {
        const result = await exec(
          `pip install "${dep.name}"${dep.version ? `==${dep.version}` : ''}`
        );
        output = result.stdout || result.stderr;
      } else if (dep.type === 'node') {
        const result = await exec(
          `npm install "${dep.name}"${dep.version ? `@${dep.version}` : ''}`
        );
        output = result.stdout || result.stderr;
      } else {
        continue;
      }

      results.push({
        dependency: dep.name,
        success: true,
        output,
      });
    } catch (error) {
      results.push({
        dependency: dep.name,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const success = results.every((r) => r.success);

  return { success, results };
};
