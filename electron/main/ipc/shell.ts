import { exec } from 'child_process';
import { promisify } from 'util';
import { BrowserWindow } from 'electron';
import { showApprovalNotification, clearApproval } from '../tray/index.js';
import { getDatabase } from '../db/index.js';

const execAsync = promisify(exec);

export interface ShellOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  requireApproval?: boolean;
}

const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+\//,
  /rm\s+-rf\s+~/,

  /:\(\)\{.*;\};:/,
  />\s*\/dev\/sda/,
  /mkfs\./,
  /dd\s+if=.*of=\/dev/,
  /chmod\s+777\s+\//,
  /chown\s+.*\s+\//,
];

const isDangerousCommand = (command: string): boolean => {
  return DANGEROUS_PATTERNS.some((pattern) => pattern.test(command));
};

// eslint-disable-next-line prefer-const -- Map is mutated via set/delete methods
let pendingApprovals: Map<string, { command: string; resolve: (approved: boolean) => void }> =
  new Map();
let mainWindow: BrowserWindow | null = null;

export const setShellMainWindow = (window: BrowserWindow | null) => {
  mainWindow = window;
};

export const approveCommand = (approvalId: string): boolean => {
  const pending = pendingApprovals.get(approvalId);
  if (pending) {
    pending.resolve(true);
    pendingApprovals.delete(approvalId);
    clearApproval(); // Clear from tray
    return true;
  }
  return false;
};

export const rejectCommand = (approvalId: string): boolean => {
  const pending = pendingApprovals.get(approvalId);
  if (pending) {
    pending.resolve(false);
    pendingApprovals.delete(approvalId);
    clearApproval(); // Clear from tray
    return true;
  }
  return false;
};

export const executeShell = async (
  command: string,
  options: ShellOptions = {}
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  approvalRequired?: boolean;
  approvalId?: string;
}> => {
  // Check if user has disabled security prompts
  let skipSecurityPrompts = false;
  try {
    const db = getDatabase();
    const setting = db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get('skipSecurityPrompts') as any;
    skipSecurityPrompts = setting?.value === 'true' || setting?.value === true;
  } catch {
    // Database not available, default to requiring approval
  }

  const needsApproval = options.requireApproval || isDangerousCommand(command);

  // If security prompts are disabled and command is not explicitly requiring approval, skip it
  if (needsApproval && skipSecurityPrompts && !options.requireApproval) {
    console.log(`[Shell] Skipping security check for command: ${command}`);
    return executeCommand(command, options);
  }

  if (needsApproval) {
    const approvalId = `approval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    if (mainWindow) {
      mainWindow.webContents.send('shell:approval-request', {
        approvalId,
        command,
        isDangerous: isDangerousCommand(command),
      });

      // Use tray notification system
      showApprovalNotification(approvalId, command, isDangerousCommand(command));
    }

    return new Promise((resolve) => {
      pendingApprovals.set(approvalId, {
        command,
        resolve: (approved: boolean) => {
          if (!approved) {
            resolve({
              stdout: '',
              stderr: 'Command was rejected by user',
              exitCode: 1,
            });
          } else {
            executeCommand(command, options).then(resolve);
          }
        },
      });

      setTimeout(() => {
        if (pendingApprovals.has(approvalId)) {
          pendingApprovals.delete(approvalId);
          resolve({
            stdout: '',
            stderr: 'Approval request timed out',
            exitCode: 1,
          });
        }
      }, 60000);
    });
  }

  return executeCommand(command, options);
};

const executeCommand = async (
  command: string,
  options: ShellOptions = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      timeout: options.timeout || 30000,
    });

    return {
      stdout: stdout.toString(),
      stderr: stderr.toString(),
      exitCode: 0,
    };
  } catch (error: any) {
    return {
      stdout: error.stdout?.toString() || '',
      stderr: error.stderr?.toString() || error.message,
      exitCode: error.code || 1,
    };
  }
};
