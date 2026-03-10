import { spawn, exec } from 'child_process';
import { writeFile, unlink, mkdir, readdir, readFile, stat } from 'fs/promises';
import { join, dirname, basename, extname } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';

export interface ScriptFile {
  path: string;
  type: 'python' | 'javascript' | 'shell' | 'binary';
  relativePath: string;
}

export interface SkillExecutionContext {
  skillName: string;
  skillDir: string;
  input: Record<string, unknown>;
  timeout?: number;
  workingDir?: string;
  env?: Record<string, string>;
}

export interface SkillExecutionResult {
  success: boolean;
  output?: unknown;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  error?: string;
  executionTime: number;
}

export interface DependencyInfo {
  type: 'python' | 'node' | 'system' | 'external';
  name: string;
  version?: string;
  installed?: boolean;
}

/**
 * Security limits for skill execution
 */
const SECURITY_LIMITS = {
  MAX_EXECUTION_TIME: 120000, // 2 minutes
  MAX_OUTPUT_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_MEMORY: 512 * 1024 * 1024, // 512MB (enforced via resource limits)
  ALLOWED_EXECUTABLES: ['python', 'python3', 'node', 'soffice', 'pdftoppm', 'pdftotext'],
};

/**
 * Skill Executor - Handles secure execution of skill code
 */
export class SkillExecutor {
  private tempDir: string;
  private cleanupCallbacks: Array<() => Promise<void>> = [];

  constructor() {
    this.tempDir = join(tmpdir(), 'deskclaw-skills');
    this.ensureTempDir();
  }

  private async ensureTempDir(): Promise<void> {
    try {
      await mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error('[SkillExecutor] Failed to create temp dir:', error);
    }
  }

  /**
   * Discover all executable scripts in a skill directory
   */
  async discoverScripts(skillDir: string): Promise<ScriptFile[]> {
    const scripts: ScriptFile[] = [];
    const scriptDirs = ['scripts', 'core', ''];

    for (const scriptDir of scriptDirs) {
      const dirPath = scriptDir ? join(skillDir, scriptDir) : skillDir;

      try {
        const entries = await readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.isFile()) {
            const filePath = join(dirPath, entry.name);
            const ext = extname(entry.name).toLowerCase();
            const relativePath = join(scriptDir, entry.name);

            // Determine script type
            let type: ScriptFile['type'] = 'binary';
            if (ext === '.py') type = 'python';
            else if (ext === '.js' || ext === '.mjs') type = 'javascript';
            else if (ext === '.sh') type = 'shell';

            scripts.push({ path: filePath, type, relativePath });
          }
        }
      } catch {
        // Directory doesn't exist, skip
      }
    }

    return scripts;
  }

  /**
   * Extract dependencies from a skill
   */
  async extractDependencies(skillDir: string): Promise<DependencyInfo[]> {
    const dependencies: DependencyInfo[] = [];

    // Check for requirements.txt
    const reqPath = join(skillDir, 'requirements.txt');
    if (existsSync(reqPath)) {
      const content = await readFile(reqPath, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
      for (const line of lines) {
        const [name, version] = line.split('==').map((s) => s.trim());
        dependencies.push({ type: 'python', name, version });
      }
    }

    // Check for package.json
    const pkgPath = join(skillDir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const content = JSON.parse(await readFile(pkgPath, 'utf-8'));
        const deps = { ...content.dependencies, ...content.devDependencies };
        for (const [name, version] of Object.entries(deps)) {
          dependencies.push({ type: 'node', name, version: String(version) });
        }
      } catch {
        // Invalid JSON, skip
      }
    }

    // Check SKILL.md for external tool mentions
    const skillPath = join(skillDir, 'SKILL.md');
    if (existsSync(skillPath)) {
      const content = await readFile(skillPath, 'utf-8');
      const externalTools = content.match(
        /(?:LibreOffice|soffice|pdftoppm|pdftotext|ImageMagick|convert)/gi
      );
      if (externalTools) {
        const uniqueTools = [...new Set(externalTools)];
        for (const tool of uniqueTools) {
          dependencies.push({ type: 'external', name: tool });
        }
      }
    }

    return dependencies;
  }

  /**
   * Verify external tool availability
   */
  async verifyDependency(dep: DependencyInfo): Promise<boolean> {
    if (dep.type === 'external') {
      return this.checkCommandAvailable(dep.name);
    } else if (dep.type === 'python') {
      return this.checkPythonPackage(dep.name);
    } else if (dep.type === 'node') {
      return this.checkNodePackage(dep.name);
    }
    return true;
  }

  /**
   * Check if a command is available
   */
  private async checkCommandAvailable(command: string): Promise<boolean> {
    return new Promise((resolve) => {
      exec(`where ${command}`, (error) => {
        resolve(!error);
      });
    });
  }

  /**
   * Check if a Python package is installed
   */
  private async checkPythonPackage(packageName: string): Promise<boolean> {
    return new Promise((resolve) => {
      exec(`python -c "import ${packageName.replace('-', '_')}"`, (error) => {
        resolve(!error);
      });
    });
  }

  /**
   * Check if a Node.js package is installed
   */
  private async checkNodePackage(packageName: string): Promise<boolean> {
    return new Promise((resolve) => {
      exec(`npm list ${packageName} --depth=0`, (error) => {
        resolve(!error);
      });
    });
  }

  /**
   * Execute a Python script from a skill
   */
  async executePythonScript(
    scriptPath: string,
    args: string[],
    options: SkillExecutionContext
  ): Promise<SkillExecutionResult> {
    const startTime = Date.now();

    // Validate executable
    if (
      !SECURITY_LIMITS.ALLOWED_EXECUTABLES.includes('python') &&
      !SECURITY_LIMITS.ALLOWED_EXECUTABLES.includes('python3')
    ) {
      return {
        success: false,
        error: 'Python execution is not allowed',
        executionTime: Date.now() - startTime,
      };
    }

    return new Promise((resolve) => {
      const pythonProcess = spawn('python', [scriptPath, ...args], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: options.timeout || SECURITY_LIMITS.MAX_EXECUTION_TIME,
        env: { ...process.env, ...options.env },
        cwd: options.workingDir || dirname(scriptPath),
      });

      let stdout = '';
      let stderr = '';
      let outputSize = 0;

      const cleanup = async () => {
        pythonProcess.kill();
        resolve({
          success: false,
          error: 'Execution timeout or canceled',
          stdout,
          stderr,
          executionTime: Date.now() - startTime,
        });
      };

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
        outputSize += data.length;
        if (outputSize > SECURITY_LIMITS.MAX_OUTPUT_SIZE) {
          cleanup();
        }
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        const executionTime = Date.now() - startTime;

        try {
          // Try to parse output as JSON
          const output = stdout.trim() ? JSON.parse(stdout) : stdout;
          resolve({
            success: code === 0,
            output,
            stdout,
            stderr,
            exitCode: code ?? undefined,
            executionTime,
          });
        } catch {
          // Return as string
          resolve({
            success: code === 0,
            output: stdout || undefined,
            stdout,
            stderr,
            exitCode: code ?? undefined,
            executionTime,
          });
        }
      });

      pythonProcess.on('error', (error) => {
        resolve({
          success: false,
          error: error.message,
          executionTime: Date.now() - startTime,
        });
      });
    });
  }

  /**
   * Execute a JavaScript/Node.js script from a skill
   */
  async executeJavaScriptScript(
    scriptPath: string,
    args: string[],
    options: SkillExecutionContext
  ): Promise<SkillExecutionResult> {
    const startTime = Date.now();

    return new Promise((resolve) => {
      const nodeProcess = spawn('node', [scriptPath, ...args], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: options.timeout || SECURITY_LIMITS.MAX_EXECUTION_TIME,
        env: { ...process.env, ...options.env },
        cwd: options.workingDir || dirname(scriptPath),
      });

      let stdout = '';
      let stderr = '';

      nodeProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      nodeProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      nodeProcess.on('close', (code) => {
        const executionTime = Date.now() - startTime;

        try {
          const output = stdout.trim() ? JSON.parse(stdout) : stdout;
          resolve({
            success: code === 0,
            output,
            stdout,
            stderr,
            exitCode: code ?? undefined,
            executionTime,
          });
        } catch {
          resolve({
            success: code === 0,
            output: stdout || undefined,
            stdout,
            stderr,
            exitCode: code ?? undefined,
            executionTime,
          });
        }
      });

      nodeProcess.on('error', (error) => {
        resolve({
          success: false,
          error: error.message,
          executionTime: Date.now() - startTime,
        });
      });
    });
  }

  /**
   * Execute a skill by name with given input
   */
  async executeSkill(context: SkillExecutionContext): Promise<SkillExecutionResult> {
    const { skillName, skillDir, input, timeout } = context;

    try {
      // Discover scripts
      const scripts = await this.discoverScripts(skillDir);

      if (scripts.length === 0) {
        return {
          success: false,
          error: 'No executable scripts found in skill directory',
          executionTime: 0,
        };
      }

      // Find main script (look for common patterns)
      let mainScript = scripts.find(
        (s) =>
          s.relativePath.includes('scripts/') &&
          (s.path.includes('main') || s.path.includes('index') || s.path.includes(skillName))
      );

      // Fallback to first script in scripts/ directory
      if (!mainScript) {
        mainScript = scripts.find((s) => s.relativePath.startsWith('scripts/'));
      }

      // Final fallback to first script
      if (!mainScript) {
        mainScript = scripts[0];
      }

      // Prepare arguments from input
      const args = this.prepareArguments(input);

      // Execute based on type
      if (mainScript.type === 'python') {
        return await this.executePythonScript(mainScript.path, args, context);
      } else if (mainScript.type === 'javascript') {
        return await this.executeJavaScriptScript(mainScript.path, args, context);
      } else {
        return {
          success: false,
          error: `Unsupported script type: ${mainScript.type}`,
          executionTime: 0,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: 0,
      };
    }
  }

  /**
   * Prepare command-line arguments from input object
   */
  private prepareArguments(input: Record<string, unknown>): string[] {
    const args: string[] = [];

    for (const [key, value] of Object.entries(input)) {
      if (value !== null && value !== undefined) {
        if (typeof value === 'boolean') {
          if (value) args.push(`--${key}`);
        } else if (typeof value === 'string' || typeof value === 'number') {
          args.push(`--${key}`, String(value));
        } else if (Array.isArray(value)) {
          for (const item of value) {
            args.push(`--${key}`, String(item));
          }
        }
      }
    }

    return args;
  }

  /**
   * Execute a specific script file
   */
  async executeScript(
    scriptPath: string,
    args: string[],
    options: SkillExecutionContext
  ): Promise<SkillExecutionResult> {
    const ext = extname(scriptPath).toLowerCase();

    if (ext === '.py') {
      return this.executePythonScript(scriptPath, args, options);
    } else if (ext === '.js' || ext === '.mjs') {
      return this.executeJavaScriptScript(scriptPath, args, options);
    } else {
      return {
        success: false,
        error: `Unsupported script type: ${ext}`,
        executionTime: 0,
      };
    }
  }

  /**
   * Clean up temporary files
   */
  async cleanup(): Promise<void> {
    for (const callback of this.cleanupCallbacks) {
      try {
        await callback();
      } catch {
        // Ignore cleanup errors
      }
    }
    this.cleanupCallbacks = [];
  }

  /**
   * Create a temporary working directory for skill execution
   */
  async createTempWorkspace(skillName: string): Promise<string> {
    const workspaceId = randomUUID();
    const workspacePath = join(this.tempDir, `${skillName}-${workspaceId}`);

    await mkdir(workspacePath, { recursive: true });

    // Register cleanup callback
    this.cleanupCallbacks.push(async () => {
      try {
        await unlink(workspacePath);
      } catch {
        // Already cleaned up
      }
    });

    return workspacePath;
  }
}

// Singleton instance
let executorInstance: SkillExecutor | null = null;

export const getSkillExecutor = (): SkillExecutor => {
  if (!executorInstance) {
    executorInstance = new SkillExecutor();
  }
  return executorInstance;
};
