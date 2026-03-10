import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import cron from 'node-cron';
import { executeWorkflow as runWorkflow } from '../workflow-engine/index.js';
import { executeTool } from '../tools/index.js';
import { executeShell } from './shell.js';
import { executeSkill } from './skills.js';
import { BrowserWindow, Notification } from 'electron';
import { ipcLogger } from '../lib/logger.js';

// Global reference to main window for sending messages
let mainWindow: BrowserWindow | null = null;

export const setScheduledMainWindow = (window: BrowserWindow | null) => {
  mainWindow = window;
};

export type TaskType = 'workflow' | 'tool' | 'command' | 'prompt' | 'reminder' | 'skill';

export interface TaskConfig {
  // For workflow type
  workflowId?: string;

  // For tool type
  toolName?: string;
  toolParams?: Record<string, unknown>;

  // For command type
  command?: string;

  // For prompt type (AI task)
  prompt?: string;
  modelId?: string;

  // For reminder type
  message?: string;

  // For skill type
  skillId?: string;
  skillInput?: Record<string, unknown>;
  skillAutoMatch?: boolean; // If true, automatically find matching skill based on prompt
}

export interface CreateScheduledData {
  name: string;
  taskType: TaskType;
  cronExpression: string;
  taskConfig: TaskConfig;
  enabled?: boolean;
  oneTime?: boolean;
}

export interface UpdateScheduledData {
  name?: string;
  cronExpression?: string;
  taskConfig?: TaskConfig;
  enabled?: boolean;
}

const runningTasks = new Map<string, cron.ScheduledTask>();
const executingTasks = new Set<string>(); // Track tasks currently executing to prevent concurrent runs

export const initializeScheduledTasks = (db: Database.Database): void => {
  // First, clean up any one-time tasks that have run but are still enabled
  const cleanupStmt = db.prepare(`
    UPDATE scheduled_tasks
    SET enabled = 0
    WHERE one_time = 1
    AND enabled = 1
    AND last_run IS NOT NULL
  `);
  const cleanupResult = cleanupStmt.run();
  if (cleanupResult.changes > 0) {
    ipcLogger.info(
      `[Scheduled] Cleaned up ${cleanupResult.changes} old one-time task(s) that were still enabled`
    );
  }

  // Skip one-time tasks that have already run (have a last_run timestamp)
  // Only load recurring tasks or one-time tasks that haven't run yet
  const stmt = db.prepare(`
    SELECT id, name, task_type, one_time, last_run
    FROM scheduled_tasks
    WHERE enabled = 1
    AND (one_time = 0 OR last_run IS NULL)
  `);
  const tasks = stmt.all() as any[];

  for (const task of tasks) {
    startScheduledTask(db, task.id);
  }

  ipcLogger.info(`Initialized ${tasks.length} scheduled task(s)`);
};

export const stopAllScheduledTasks = (): void => {
  for (const [id, task] of runningTasks.entries()) {
    task.stop();
  }
  runningTasks.clear();
  ipcLogger.info('Stopped all scheduled tasks');
};

export const listScheduled = (db: Database.Database) => {
  const stmt = db.prepare(`
    SELECT id, name, task_type, cron_expression, task_config, enabled, one_time, last_run, last_result, created_at
    FROM scheduled_tasks
    ORDER BY created_at DESC
  `);

  const tasks = stmt.all() as any[];
  return tasks.map((t) => ({
    id: t.id,
    name: t.name,
    taskType: t.task_type,
    cronExpression: t.cron_expression,
    taskConfig: JSON.parse(t.task_config),
    enabled: t.enabled === 1,
    oneTime: t.one_time === 1,
    lastRun: t.last_run,
    lastResult: t.last_result,
    createdAt: t.created_at,
  }));
};

export const createScheduled = (db: Database.Database, data: CreateScheduledData) => {
  const id = randomUUID();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO scheduled_tasks (id, name, task_type, cron_expression, task_config, enabled, one_time, last_run, last_result, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    data.name,
    data.taskType,
    data.cronExpression,
    JSON.stringify(data.taskConfig),
    data.enabled !== false ? 1 : 0,
    data.oneTime ? 1 : 0,
    null,
    null,
    now
  );

  if (data.enabled !== false) {
    startScheduledTask(db, id);
  }

  return { id, ...data, lastRun: null, lastResult: null, createdAt: now };
};

export const updateScheduled = (db: Database.Database, id: string, data: UpdateScheduledData) => {
  const updates: string[] = [];
  const values: unknown[] = [];

  if (data.name !== undefined) {
    updates.push('name = ?');
    values.push(data.name);
  }
  if (data.cronExpression !== undefined) {
    updates.push('cron_expression = ?');
    values.push(data.cronExpression);
  }
  if (data.taskConfig !== undefined) {
    updates.push('task_config = ?');
    values.push(JSON.stringify(data.taskConfig));
  }
  if (data.enabled !== undefined) {
    updates.push('enabled = ?');
    values.push(data.enabled ? 1 : 0);
  }

  if (updates.length === 0) {
    throw new Error('No fields to update');
  }

  values.push(id);

  const stmt = db.prepare(`
    UPDATE scheduled_tasks
    SET ${updates.join(', ')}
    WHERE id = ?
  `);

  const result = stmt.run(...values);

  if (result.changes === 0) {
    throw new Error('Scheduled task not found');
  }

  if (data.enabled !== undefined) {
    if (data.enabled) {
      startScheduledTask(db, id);
    } else {
      stopScheduledTask(id);
    }
  } else if (data.cronExpression !== undefined || data.taskConfig !== undefined) {
    const currentStmt = db.prepare('SELECT enabled FROM scheduled_tasks WHERE id = ?');
    const current = currentStmt.get(id) as any;
    if (current && current.enabled === 1) {
      startScheduledTask(db, id);
    }
  }

  return getScheduled(db, id);
};

export const getScheduled = (db: Database.Database, id: string) => {
  const stmt = db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?');
  const task = stmt.get(id) as any;

  if (!task) {
    throw new Error('Scheduled task not found');
  }

  return {
    id: task.id,
    name: task.name,
    taskType: task.task_type,
    cronExpression: task.cron_expression,
    taskConfig: JSON.parse(task.task_config),
    enabled: task.enabled === 1,
    lastRun: task.last_run,
    lastResult: task.last_result,
    createdAt: task.created_at,
  };
};

export const deleteScheduled = (db: Database.Database, id: string) => {
  stopScheduledTask(id);

  const stmt = db.prepare('DELETE FROM scheduled_tasks WHERE id = ?');
  const result = stmt.run(id);

  if (result.changes === 0) {
    throw new Error('Scheduled task not found');
  }

  return { success: true };
};

export const toggleScheduled = (db: Database.Database, id: string) => {
  const stmt = db.prepare('SELECT enabled FROM scheduled_tasks WHERE id = ?');
  const result = stmt.get(id) as any;

  if (!result) {
    throw new Error('Scheduled task not found');
  }

  return updateScheduled(db, id, { enabled: !result.enabled });
};

const startScheduledTask = (db: Database.Database, id: string) => {
  const stmt = db.prepare(
    'SELECT task_type, cron_expression, task_config, name FROM scheduled_tasks WHERE id = ?'
  );
  const task = stmt.get(id) as any;

  if (!task) {
    return;
  }

  stopScheduledTask(id);

  const cronExpression = task.cron_expression;

  // node-cron supports 5 or 6 field cron (with seconds as first field)
  // Get system timezone or use UTC as fallback
  const systemTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const scheduledTask = cron.schedule(
    cronExpression,
    () => {
      executeScheduledTask(db, id);
    },
    {
      scheduled: true,
      // Don't run immediately on creation - wait for the next scheduled time
      timezone: process.env.TZ || systemTimezone,
    }
  );

  runningTasks.set(id, scheduledTask);
  ipcLogger.info(
    `[Scheduled] Started task "${task.name}" (${task.task_type}) with cron: ${cronExpression} (next run at scheduled time)`
  );
};

const stopScheduledTask = (id: string) => {
  const task = runningTasks.get(id);
  if (task) {
    task.stop();
    runningTasks.delete(id);
  }
  // Also remove from executing set to allow future executions if needed
  executingTasks.delete(id);
};

const executeScheduledTask = async (db: Database.Database, id: string) => {
  const now = Date.now();

  // Check if task is already executing (prevent concurrent runs)
  if (executingTasks.has(id)) {
    ipcLogger.info(`[Scheduled] Task ${id} is already executing, skipping this run`);
    return;
  }

  // First check if task is still enabled (prevents race condition with one-time tasks)
  const enabledCheckStmt = db.prepare('SELECT enabled, last_run FROM scheduled_tasks WHERE id = ?');
  const enabledCheck = enabledCheckStmt.get(id) as any;
  if (!enabledCheck || enabledCheck.enabled !== 1) {
    ipcLogger.info(`[Scheduled] Task ${id} is disabled or not found, skipping execution`);
    stopScheduledTask(id);
    return;
  }

  // Prevent immediate execution on newly created tasks
  // Check if this task was just created (within the last 2 seconds)
  const stmt = db.prepare('SELECT created_at FROM scheduled_tasks WHERE id = ?');
  const taskData = stmt.get(id) as any;
  if (taskData && taskData.created_at && now - taskData.created_at < 2000) {
    ipcLogger.info(
      `[Scheduled] Task ${id} was just created, skipping immediate execution to prevent duplicate runs`
    );
    return;
  }

  const taskStmt = db.prepare(
    'SELECT name, task_type, task_config, one_time FROM scheduled_tasks WHERE id = ?'
  );
  const task = taskStmt.get(id) as any;

  if (!task) {
    ipcLogger.error(`[Scheduled] Task not found: ${id}`);
    return;
  }

  // Mark task as executing
  executingTasks.add(id);

  const config: TaskConfig = JSON.parse(task.task_config);
  let result: string;
  let success = true;
  const isOneTime = task.one_time === 1;

  ipcLogger.info(
    `[Scheduled] Executing task "${task.name}" (${task.task_type})${isOneTime ? ' (one-time)' : ''}`
  );

  try {
    switch (task.task_type) {
      case 'workflow':
        result = await executeWorkflowTask(db, config);
        break;
      case 'tool':
        result = await executeToolTask(config);
        break;
      case 'command':
        result = await executeCommandTask(config);
        break;
      case 'prompt':
        result = await executePromptTask(db, config, task.name, id);
        break;
      case 'reminder':
        result = await executeReminderTask(config);
        break;
      case 'skill':
        result = await executeSkillTask(db, config);
        break;
      default:
        throw new Error(`Unknown task type: ${task.task_type}`);
    }

    // Track execution for evolution learning
    try {
      const { getEvolutionAnalytics } = await import('../evolution/analytics.js');
      getEvolutionAnalytics().trackCommand(task.name, { taskType: task.task_type, success: true });
    } catch {
      // silently ignore
    }
  } catch (error: any) {
    success = false;
    result = `Error: ${error.message}`;
    ipcLogger.error(`[Scheduled] Task "${task.name}" failed:`, error);
  }

  // Update task result
  const updateStmt = db.prepare(`
    UPDATE scheduled_tasks
    SET last_run = ?, last_result = ?, enabled = ?
    WHERE id = ?
  `);

  // For one-time tasks, always disable after first run (regardless of success/failure)
  // This prevents them from running again on next cron trigger or app restart
  const newEnabledValue = isOneTime ? 0 : success ? 1 : 1;
  updateStmt.run(now, result, newEnabledValue, id);

  ipcLogger.info(
    `[Scheduled] Task "${task.name}" ${success ? 'completed' : 'failed'}: ${result.substring(0, 200)}`
  );

  // If it's a one-time task, always stop the scheduler after execution
  if (isOneTime) {
    const scheduledTask = runningTasks.get(id);
    if (scheduledTask) {
      scheduledTask.stop();
      runningTasks.delete(id);
      ipcLogger.info(`[Scheduled] One-time task "${task.name}" has been disabled and stopped`);
    }
  }

  // Remove from executing set
  executingTasks.delete(id);
};

const executeWorkflowTask = async (db: Database.Database, config: TaskConfig): Promise<string> => {
  if (!config.workflowId) {
    throw new Error('workflowId is required for workflow task');
  }

  const workflowStmt = db.prepare('SELECT name, definition_json FROM workflows WHERE id = ?');
  const workflow = workflowStmt.get(config.workflowId) as any;

  if (!workflow) {
    throw new Error(`Workflow not found: ${config.workflowId}`);
  }

  const definition = JSON.parse(workflow.definition_json);
  await runWorkflow(db, config.workflowId, definition.nodes, definition.edges);

  return `Workflow "${workflow.name}" executed successfully`;
};

const executeToolTask = async (config: TaskConfig): Promise<string> => {
  if (!config.toolName) {
    throw new Error('toolName is required for tool task');
  }

  const result = await executeTool(config.toolName, config.toolParams || {});

  if (result.error) {
    throw new Error(result.error);
  }

  return JSON.stringify(result.result, null, 2);
};

const executeCommandTask = async (config: TaskConfig): Promise<string> => {
  if (!config.command) {
    throw new Error('command is required for command task');
  }

  const result = await executeShell(config.command, { requireApproval: false });

  if (result.exitCode !== 0) {
    throw new Error(`Command failed with exit code ${result.exitCode}: ${result.stderr}`);
  }

  return result.stdout || 'Command executed successfully (no output)';
};

const executePromptTask = async (
  db: Database.Database,
  config: TaskConfig,
  taskName: string,
  taskId?: string
): Promise<string> => {
  if (!config.prompt) {
    throw new Error('prompt is required for prompt task');
  }

  // Create or get session for this task
  let sessionId: string | undefined;
  if (taskId) {
    // Check if task already has a session
    const sessionStmt = db.prepare('SELECT session_id FROM scheduled_tasks WHERE id = ?');
    const taskData = sessionStmt.get(taskId) as any;

    if (taskData?.session_id) {
      sessionId = taskData.session_id;
    } else {
      // Create a new session for this task
      const { createSession } = await import('./sessions.js');
      const newSession = createSession(db, {
        title: `⏰ 定时任务: ${taskName}`,
        messages: [],
      });
      sessionId = newSession.id;

      // Update task with session_id
      const updateTaskStmt = db.prepare('UPDATE scheduled_tasks SET session_id = ? WHERE id = ?');
      updateTaskStmt.run(sessionId, taskId);
    }
  }

  // Get available tools
  const { getAvailableTools } = await import('../tools/index.js');
  const availableTools = getAvailableTools();

  // Build tools info for AI
  const toolsInfo = Object.values(availableTools)
    .map((tool: { name: string; description: string }) => `- ${tool.name}: ${tool.description}`)
    .join('\n');

  // Build system message with tool instructions
  const toolsSystemMessage = {
    role: 'system' as const,
    content: `You have access to the following tools:\n${toolsInfo}\n\n## IMPORTANT: Tool Calling Rules

1. When you need to use a tool, respond ONLY with a JSON object in this EXACT format:
{"tool": "tool_name", "parameters": {"param": "value"}}

2. Do NOT use any other format. Do NOT wrap in code blocks. Do NOT add explanations before or after the JSON.

3. Available tool names (use EXACTLY these names):
   - file_read: Read file content
   - file_write: Write content to file
   - file_list: List directory contents
   - execute_command: Run shell commands (requires approval)
   - web_search: Search the web
   - http_request: Make HTTP requests
   - get_time: Get current time
   - set_work_directory: Set working directory for file operations
   - get_work_directory: Get current working directory

4. For Windows paths, use double backslashes: "D:\\\\MyProjects\\\\MyProject"
5. After each tool call, you will receive the result and can continue with more actions.`,
    timestamp: Date.now(),
  };

  // Get model
  let modelId = config.modelId;
  if (!modelId) {
    const settingsStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
    const defaultModel = settingsStmt.get('defaultModel') as any;
    modelId = defaultModel?.value;
  }

  if (!modelId) {
    const modelsStmt = db.prepare('SELECT id FROM models ORDER BY is_custom DESC, id LIMIT 1');
    const firstModel = modelsStmt.get() as any;
    if (firstModel) {
      modelId = firstModel.id;
      ipcLogger.info(`[Scheduled] Using first available model: ${modelId}`);
    }
  }

  if (!modelId) {
    throw new Error('No model configured for prompt task. Please add a model in Settings.');
  }

  // Show start notification
  showNotification(`⏰ 定时任务开始`, `任务 "${taskName}" 开始执行...`);

  // Create a sendToChat function that saves to session
  const sendToChatWindow = async (message: any) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.webContents.send('scheduled:message', message);
      } catch (e) {
        ipcLogger.info({ error: e }, '[Scheduled] Failed to send message to chat window');
      }
    }

    // Also save to session if available
    if (sessionId) {
      try {
        const { appendMessage } = await import('./sessions.js');
        appendMessage(db, sessionId, message);
      } catch (e) {
        ipcLogger.info({ error: e }, '[Scheduled] Failed to save message to session');
      }
    }
  };

  // Send start message to chat window
  sendToChatWindow({
    role: 'system',
    content: `⏰ 定时任务开始执行：${taskName}\n任务内容：${config.prompt}`,
    timestamp: Date.now(),
  });

  const messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool' | 'tool_result';
    content: string;
    timestamp?: number;
  }> = [toolsSystemMessage, { role: 'user' as const, content: config.prompt }];
  const { chat: llmChat } = await import('./llm.js');

  // Multi-turn conversation loop for tool calls
  const maxIterations = 10;
  let finalResponse = '';
  const toolCalls: Array<{ tool: string; parameters: Record<string, unknown>; result: unknown }> =
    [];
  let lastToolCalled = '';
  let sameToolCallCount = 0;
  const maxSameToolCalls = 3; // Prevent infinite loops with same tool

  for (let i = 0; i < maxIterations; i++) {
    ipcLogger.info(`[Scheduled] Conversation loop iteration ${i + 1}/${maxIterations}`);
    ipcLogger.info(
      `[Scheduled] Messages count: ${messages.length}, last message type: ${messages[messages.length - 1]?.role}`
    );

    let llmResult;
    try {
      llmResult = await llmChat(db, {
        model: modelId,
        messages,
        temperature: 0.7,
        maxTokens: 8192,
      });
      ipcLogger.info(`[Scheduled] llmChat completed successfully`);
    } catch (e) {
      ipcLogger.error({ error: e }, '[Scheduled] llmChat failed');
      finalResponse = `Error: LLLM call failed: ${e instanceof Error ? e.message : String(e)}`;
      break;
    }

    // Check for tool call in response
    const content = llmResult?.content || '';
    ipcLogger.info(
      `[Scheduled] AI Response length: ${content.length}, first 500 chars: ${content.substring(0, 500)}`
    );

    // Extract ALL tool calls from the response using a regex to find all JSON objects

    const toolCallPattern =
      /\{[^{}]*"tool"\s*:\s*"[^"]+"[^{}]*"parameters"\s*:\s*\{[^{}]*\}[^{}]*\}/g;
    const toolCallMatches = content.match(toolCallPattern);

    ipcLogger.info(
      `[Scheduled] Regex test: ${toolCallPattern.test(content) ? 'matches' : 'no match'}`
    );

    if (toolCallMatches && toolCallMatches.length > 0) {
      ipcLogger.info(`[Scheduled] Found ${toolCallMatches.length} tool call(s) in response`);

      for (const match of toolCallMatches) {
        try {
          const toolCall = JSON.parse(match);

          if (toolCall.tool && toolCall.parameters) {
            // Check for repeated tool calls (potential infinite loop)
            // Skip this check for execute_command as it may need to be called multiple times
            if (toolCall.tool !== 'execute_command') {
              if (toolCall.tool === lastToolCalled) {
                sameToolCallCount++;
                ipcLogger.info(
                  `[Scheduled] Same tool called ${sameToolCallCount} times: ${toolCall.tool}`
                );

                if (sameToolCallCount >= maxSameToolCalls) {
                  ipcLogger.info(
                    `[Scheduled] Tool ${toolCall.tool} called too many times, breaking loop`
                  );
                  finalResponse = `Error: Tool ${toolCall.tool} was called repeatedly. Please try a different approach.`;
                  break;
                }
              } else {
                lastToolCalled = toolCall.tool;
                sameToolCallCount = 1;
              }
            }

            ipcLogger.info(`[Scheduled] Executing tool: ${toolCall.tool}`);

            // Send tool call to chat window
            sendToChatWindow({
              role: 'tool',
              content: `调用工具: ${toolCall.tool} ${JSON.stringify(toolCall.parameters)}`,
              timestamp: Date.now(),
              toolName: toolCall.tool,
            });

            const toolResult = await executeTool(toolCall.tool, toolCall.parameters);

            toolCalls.push({
              tool: toolCall.tool,
              parameters: toolCall.parameters,
              result: toolResult.result,
            });

            // Send tool result to chat window
            if (toolResult.error) {
              sendToChatWindow({
                role: 'tool_error',
                content: `工具 ${toolCall.tool} 错误: ${toolResult.error}`,
                timestamp: Date.now(),
                toolName: toolCall.tool,
              });
            } else {
              sendToChatWindow({
                role: 'tool_result',
                content: `工具 ${toolCall.tool} 结果:\n${JSON.stringify(toolResult.result, null, 2).substring(0, 1000)}`,
                timestamp: Date.now(),
                toolName: toolCall.tool,
              });
            }
          }
        } catch (e) {
          ipcLogger.info({ error: e }, `[Scheduled] Failed to parse tool call: ${match}`);
        }
      }

      // If we broke out due to too many same tool calls, exit the loop
      if (finalResponse.startsWith('Error:')) {
        break;
      }

      // Add all tool results to messages and continue conversation
      messages.push({ role: 'assistant', content });
      messages.push({
        role: 'user' as const,
        content: `[Tool Results]: ${toolCalls.map((tc) => `${tc.tool}: ${JSON.stringify(tc.result || 'error')}`).join('\n')}`,
      });

      continue;
    }

    // No tool call found, use this as final response
    finalResponse = content;
    ipcLogger.info(
      `[Scheduled] No tool call found in iteration ${i + 1}. Using as final response. Length: ${finalResponse.length}`
    );
    ipcLogger.info(
      `[Scheduled] Final response (first 500 chars): ${finalResponse.substring(0, 500)}`
    );
    break;
  }

  // Check if we hit max iterations
  if (finalResponse === '' && toolCalls.length >= maxIterations) {
    finalResponse = `Task completed after ${toolCalls.length} tool calls. The AI may need more iterations to complete the task.`;
    ipcLogger.info(`[Scheduled] Hit max iterations, returning summary response`);
  }

  // Show completion notification
  showNotification(`✅ 定时任务完成`, `任务 "${taskName}" 执行完成`);

  // Send final response to chat window
  sendToChatWindow({
    role: 'assistant',
    content: finalResponse || '任务执行完成（无返回结果）',
    timestamp: Date.now(),
  });

  return finalResponse || 'Task completed successfully (no response)';
};

// Helper function to show notification
const showNotification = (title: string, body: string) => {
  if (Notification.isSupported()) {
    try {
      const notification = new Notification({
        title,
        body,
      });
      notification.show();
    } catch (e) {
      ipcLogger.info({ error: e }, '[Scheduled] Failed to show notification');
    }
  }
};

const executeReminderTask = async (config: TaskConfig): Promise<string> => {
  const { Notification } = await import('electron');

  const message = config.message || "Time's up!";

  if (Notification.isSupported()) {
    const notification = new Notification({
      title: '⏰ Reminder',
      body: message,
    });
    notification.show();
  }

  return `Reminder sent: ${message}`;
};

/**
 * Execute a skill task
 */
const executeSkillTask = async (db: Database.Database, config: TaskConfig): Promise<string> => {
  // If auto-match is enabled, find the best matching skill based on prompt
  if (config.skillAutoMatch && config.prompt) {
    // Get all enabled skills
    const skillsStmt = db.prepare(`
      SELECT id, name, description, metadata_json
      FROM skills
      WHERE enabled = 1
    `);
    const skills = skillsStmt.all() as any[];

    let bestMatch: any = null;
    let bestScore = 0;

    for (const skill of skills) {
      let score = 0;
      const metadata = skill.metadata_json ? JSON.parse(skill.metadata_json) : {};
      const triggers = metadata.triggers || [];

      // Check triggers
      for (const trigger of triggers) {
        if (config.prompt!.toLowerCase().includes(trigger.toLowerCase())) {
          score += 10;
        }
      }

      // Check domain
      if (metadata.domain && config.prompt!.toLowerCase().includes(metadata.domain.toLowerCase())) {
        score += 5;
      }

      // Check description
      if (skill.description) {
        const words = config.prompt!.toLowerCase().split(' ');
        for (const word of words) {
          if (skill.description.toLowerCase().includes(word)) {
            score += 2;
          }
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = skill;
      }
    }

    if (bestMatch && bestScore >= 5) {
      ipcLogger.info(`[Scheduled] Auto-matched skill: ${bestMatch.name} (score: ${bestScore})`);
      config.skillId = bestMatch.id;
      config.skillInput = { prompt: config.prompt };
    } else {
      throw new Error(`No matching skill found for prompt: ${config.prompt}`);
    }
  }

  if (!config.skillId) {
    throw new Error('skillId is required for skill task (or enable skillAutoMatch with a prompt)');
  }

  // Execute the skill with progress tracking
  const progressMessages: string[] = [];

  const result = await executeSkill(db, config.skillId, {
    input: config.skillInput || {},
    timeout: 120000, // 2 minutes for scheduled tasks
    onProgress: (progress) => {
      const message = `[${progress.type.toUpperCase()}] ${progress.message}`;
      progressMessages.push(message);
      ipcLogger.info(`[Scheduled Skill] ${message}`);
    },
  });

  if (result.success) {
    const output = JSON.stringify(result.output, null, 2);
    return `Skill executed successfully in ${result.executionTime}ms\n\nOutput:\n${output}\n\n${progressMessages.join('\n')}`;
  } else {
    throw new Error(`Skill execution failed: ${result.error}\n\n${progressMessages.join('\n')}`);
  }
};
