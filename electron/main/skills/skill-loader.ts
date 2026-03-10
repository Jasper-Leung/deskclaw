import fs from 'fs/promises';
import path from 'path';
import { matter } from 'vfile-matter';
import { CreateSkillData, SkillMetadata } from '../ipc/skills';
import { getSkillExecutor } from './skill-executor.js';

export interface SkillMarkdownFile {
  frontmatter: {
    name: string;
    description: string;
    license?: string;
    allowedTools?: string[];
    metadata?: SkillMetadata;
  };
  content: string;
}

export interface ScriptInfo {
  path: string;
  relativePath: string;
  type: 'python' | 'javascript' | 'shell' | 'binary';
  name: string;
}

export interface LoadedSkill extends CreateSkillData {
  name: string;
  description: string;
  license?: string;
  allowedTools?: string[];
  metadata?: SkillMetadata;
  content: string;
  references: Record<string, string>;
  scripts: ScriptInfo[];
  dependencies: Array<{
    type: 'python' | 'node' | 'system' | 'external';
    name: string;
    version?: string;
  }>;
  skillDir: string;
}

/**
 * Parse YAML frontmatter from a markdown file
 */
async function parseMarkdownFrontmatter(filePath: string): Promise<SkillMarkdownFile> {
  const content = await fs.readFile(filePath, 'utf-8');

  // Extract YAML frontmatter manually
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    throw new Error(`Invalid skill file format: ${filePath}`);
  }

  const yamlContent = match[1];
  const markdownContent = match[2];

  // Parse YAML manually
  const frontmatter: Record<string, unknown> = {};
  const lines = yamlContent.split('\n');

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();

      if (key === 'metadata') {
        // Metadata is a nested object
        frontmatter[key] = {};
      } else if (value.startsWith('"') || value.startsWith("'")) {
        frontmatter[key] = value.slice(1, -1);
      } else if (value === 'true') {
        frontmatter[key] = true;
      } else if (value === 'false') {
        frontmatter[key] = false;
      } else if (!isNaN(Number(value))) {
        frontmatter[key] = Number(value);
      } else {
        frontmatter[key] = value;
      }
    } else if (line.trim().startsWith('metadata:')) {
      frontmatter['metadata'] = {};
    } else if (line.trim().startsWith('  ') && frontmatter['metadata']) {
      // Parse metadata nested fields
      const metadataLine = line.trim();
      const colonIndex = metadataLine.indexOf(':');
      if (colonIndex > 0) {
        const key = metadataLine.substring(0, colonIndex).trim();
        const value = metadataLine.substring(colonIndex + 1).trim();

        if (value.startsWith('"') || value.startsWith("'")) {
          (frontmatter['metadata'] as Record<string, unknown>)[key] = value.slice(1, -1);
        } else if (value.startsWith('[')) {
          // Parse array
          (frontmatter['metadata'] as Record<string, unknown>)[key] = value
            .slice(1, -1)
            .split(',')
            .map((v: string) => v.trim().replace(/['"]/g, ''));
        } else {
          (frontmatter['metadata'] as Record<string, unknown>)[key] = value;
        }
      }
    }
  }

  return {
    frontmatter: {
      name: String(frontmatter['name'] || ''),
      description: String(frontmatter['description'] || ''),
      license: frontmatter['license'] ? String(frontmatter['license']) : undefined,
      allowedTools: frontmatter['allowed-tools']
        ? String(frontmatter['allowed-tools'])
            .split(',')
            .map((t: string) => t.trim())
        : undefined,
      metadata: frontmatter['metadata'] as SkillMetadata | undefined,
    },
    content: markdownContent,
  };
}

/**
 * Convert kebab-case or snake_case to camelCase
 */
function toCamelCase(str: string): string {
  return str.replace(/[-_]([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Load references from the references directory
 */
async function loadReferences(referencesDir: string): Promise<Record<string, string>> {
  const references: Record<string, string> = {};

  try {
    const files = await fs.readdir(referencesDir);

    for (const file of files) {
      if (file.endsWith('.md')) {
        const filePath = path.join(referencesDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const key = file.replace('.md', '');
        references[key] = content;
      }
    }
  } catch {
    // References directory may not exist
  }

  return references;
}

/**
 * Scan for executable scripts in a skill directory
 */
async function scanScripts(skillDir: string): Promise<ScriptInfo[]> {
  const scripts: ScriptInfo[] = [];
  const scriptDirs = ['scripts', 'core', ''];

  for (const scriptDir of scriptDirs) {
    const dirPath = scriptDir ? path.join(skillDir, scriptDir) : skillDir;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile()) {
          const filePath = path.join(dirPath, entry.name);
          const ext = path.extname(entry.name).toLowerCase();
          const relativePath = scriptDir ? path.join(scriptDir, entry.name) : entry.name;

          // Determine script type
          let type: ScriptInfo['type'] = 'binary';
          if (ext === '.py') type = 'python';
          else if (ext === '.js' || ext === '.mjs') type = 'javascript';
          else if (ext === '.sh') type = 'shell';

          // Skip non-executable files
          if (type !== 'binary' || ext === '.exe' || ext === '.bat') {
            scripts.push({
              path: filePath,
              relativePath,
              type,
              name: entry.name,
            });
          }
        }
      }
    } catch {
      // Directory doesn't exist, skip
    }
  }

  return scripts;
}

/**
 * Detect dependencies from various sources
 */
async function detectDependencies(
  skillDir: string
): Promise<
  Array<{ type: 'python' | 'node' | 'system' | 'external'; name: string; version?: string }>
> {
  const dependencies: Array<{
    type: 'python' | 'node' | 'system' | 'external';
    name: string;
    version?: string;
  }> = [];

  // Check for requirements.txt
  const reqPath = path.join(skillDir, 'requirements.txt');
  try {
    const reqContent = await fs.readFile(reqPath, 'utf-8');
    const lines = reqContent.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
    for (const line of lines) {
      const match = line.match(/^([a-zA-Z0-9_-]+)(?:===?|>=?|<=?|~=)([^,]+)?/);
      if (match) {
        dependencies.push({ type: 'python', name: match[1], version: match[2] });
      } else {
        const name = line.split('===?|>=?|<=?|~|=')[0].trim();
        if (name) {
          dependencies.push({ type: 'python', name });
        }
      }
    }
  } catch {
    // requirements.txt doesn't exist
  }

  // Check for package.json
  const pkgPath = path.join(skillDir, 'package.json');
  try {
    const pkgContent = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
    const deps = { ...pkgContent.dependencies, ...pkgContent.devDependencies };
    for (const [name, version] of Object.entries(deps)) {
      dependencies.push({ type: 'node', name, version: String(version) });
    }
  } catch {
    // package.json doesn't exist or is invalid
  }

  // Check for pyproject.toml
  const pyprojectPath = path.join(skillDir, 'pyproject.toml');
  try {
    const pyprojectContent = await fs.readFile(pyprojectPath, 'utf-8');
    // Simple parsing (for full support, consider using a TOML parser)
    const depsMatch = pyprojectContent.match(/\[project\.dependencies?\]([\s\S]*?)(?=\n\[|\n*$)/);
    if (depsMatch) {
      const depLines = depsMatch[1].split('\n').filter((l) => l.trim() && !l.startsWith('#'));
      for (const line of depLines) {
        const match = line.match(/^([a-zA-Z0-9_-]+)(?:===?|>=?|<=?|~=)?(.*)/);
        if (match) {
          dependencies.push({ type: 'python', name: match[1], version: match[2] || undefined });
        }
      }
    }
  } catch {
    // pyproject.toml doesn't exist
  }

  // Check SKILL.md for external tool mentions
  const skillPath = path.join(skillDir, 'SKILL.md');
  try {
    const skillContent = await fs.readFile(skillPath, 'utf-8');
    const externalTools = [
      { name: 'LibreOffice', pattern: /LibreOffice|soffice/gi },
      { name: 'Poppler', pattern: /pdftoppm|pdftotext/gi },
      { name: 'ImageMagick', pattern: /ImageMagick|convert\s+\$|convert\s/gi },
    ];

    for (const tool of externalTools) {
      if (tool.pattern.test(skillContent)) {
        dependencies.push({ type: 'external', name: tool.name });
      }
    }
  } catch {
    // SKILL.md doesn't exist
  }

  return dependencies;
}

/**
 * Load a single skill from a directory
 */
export async function loadSkillFromDir(skillDir: string): Promise<LoadedSkill> {
  const skillFilePath = path.join(skillDir, 'SKILL.md');

  // Check if SKILL.md exists
  try {
    await fs.access(skillFilePath);
  } catch {
    throw new Error(`SKILL.md not found in directory: ${skillDir}`);
  }

  // Parse the skill file
  const { frontmatter, content } = await parseMarkdownFrontmatter(skillFilePath);

  // Load references
  const referencesDir = path.join(skillDir, 'references');
  const references = await loadReferences(referencesDir);

  // Scan for scripts
  const scripts = await scanScripts(skillDir);

  // Detect dependencies
  const dependencies = await detectDependencies(skillDir);

  // Build the complete content with references
  let fullContent = content;
  if (Object.keys(references).length > 0) {
    fullContent += '\n\n## References\n\n';
    for (const [key, refContent] of Object.entries(references)) {
      fullContent += `\n### ${key}\n\n${refContent}\n\n`;
    }
  }

  // Normalize metadata field names
  const metadata = frontmatter.metadata || {};
  const normalizedMetadata: SkillMetadata = {
    author: metadata.author,
    version: metadata.version,
    domain: metadata.domain,
    triggers: metadata.triggers,
    role: metadata.role,
    scope: metadata.scope,
    outputFormat: metadata.outputFormat,
    relatedSkills: metadata.relatedSkills,
  };

  return {
    name: frontmatter.name,
    description: frontmatter.description,
    license: frontmatter.license,
    allowedTools: frontmatter.allowedTools,
    metadata: normalizedMetadata,
    content: fullContent,
    references,
    scripts,
    dependencies,
    skillDir,
    isBuiltin: true,
    enabled: true,
  };
}

/**
 * Load all skills from a directory
 */
export async function loadSkillsFromDir(skillsDir: string): Promise<LoadedSkill[]> {
  const skills: LoadedSkill[] = [];

  try {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillDir = path.join(skillsDir, entry.name);
        const skillFilePath = path.join(skillDir, 'SKILL.md');

        // Check if this is a skill directory (has SKILL.md)
        try {
          await fs.access(skillFilePath);
          const skill = await loadSkillFromDir(skillDir);
          skills.push(skill);
        } catch {
          // Not a skill directory, skip
        }
      }
    }
  } catch {
    throw new Error(`Failed to read skills directory: ${skillsDir}`);
  }

  return skills;
}

/**
 * Extract trigger keywords from skill metadata
 */
export function extractTriggerKeywords(skill: LoadedSkill): string[] {
  const triggers = skill.metadata?.triggers || [];

  // Also extract from description
  const descWords = skill.description
    .toLowerCase()
    .split(/[,\s.]+/)
    .filter((w) => w.length > 3)
    .slice(0, 5);

  return [...new Set([...triggers, ...descWords])];
}

/**
 * Find skills matching a query
 */
export function findMatchingSkills(skills: LoadedSkill[], query: string): LoadedSkill[] {
  const lowerQuery = query.toLowerCase();
  const words = lowerQuery.split(/\s+/);

  return skills.filter((skill) => {
    // Check name
    if (skill.name.toLowerCase().includes(lowerQuery)) {
      return true;
    }

    // Check description
    if (skill.description.toLowerCase().includes(lowerQuery)) {
      return true;
    }

    // Check triggers
    const triggers = skill.metadata?.triggers || [];
    if (triggers.some((t) => t.toLowerCase().includes(lowerQuery))) {
      return true;
    }

    // Check domain
    if (skill.metadata?.domain?.toLowerCase().includes(lowerQuery)) {
      return true;
    }

    // Check content
    if (skill.content.toLowerCase().includes(lowerQuery)) {
      return true;
    }

    // Check individual words
    return words.some(
      (word) =>
        skill.name.toLowerCase().includes(word) ||
        skill.description.toLowerCase().includes(word) ||
        triggers.some((t) => t.toLowerCase().includes(word))
    );
  });
}
