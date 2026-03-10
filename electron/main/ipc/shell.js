import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
export const executeShell = async (command, options = {}) => {
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
  } catch (error) {
    return {
      stdout: error.stdout?.toString() || '',
      stderr: error.stderr?.toString() || error.message,
      exitCode: error.code || 1,
    };
  }
};
