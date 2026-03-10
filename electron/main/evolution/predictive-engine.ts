/**
 * Predictive Content Engine
 *
 * Analyzes user behavior to predict content needs and automatically
 * sets up scheduled tasks for proactive content delivery.
 */

import { randomUUID } from 'crypto';
import type { Database } from 'better-sqlite3';
import { getDatabase } from '../db/index.js';
import { getEvolutionAnalytics } from './analytics.js';
import { dbLogger } from '../lib/logger.js';

// ============================================================================
// Type Definitions
// ============================================================================

export interface UserIntent {
  id: string;
  type: 'information' | 'task' | 'monitoring' | 'recommendation';
  topic: string;
  keywords: string[];
  confidence: number;
  frequency: 'realtime' | 'hourly' | 'daily' | 'weekly';
  preferredTime?: TimeOfDay;
  sources: ContentSource[];
  lastMatched: number;
  timesMatched: number;
}

export interface TimeOfDay {
  hour: number;
  minute: number;
  timezone?: string;
}

export interface ContentSource {
  type: 'web' | 'api' | 'workflow' | 'agent';
  config: Record<string, unknown>;
  priority: number;
}

export interface PredictedTask {
  id: string;
  intentId: string;
  name: string;
  description: string;
  cronExpression: string;
  taskType: 'prompt' | 'workflow' | 'reminder';
  taskConfig: Record<string, unknown>;
  estimatedValue: number; // 0-1
  enabled: boolean;
}

export interface ContentDelivery {
  id: string;
  taskId: string;
  userId?: string;
  content: DeliveredContent;
  timestamp: number;
  delivered: boolean;
  viewed: boolean;
  feedback?: 'positive' | 'neutral' | 'negative';
}

export interface DeliveredContent {
  type: 'notification' | 'chat_message' | 'dashboard_update' | 'email';
  title: string;
  body: string;
  data?: Record<string, unknown>;
  actions?: ContentAction[];
}

export interface ContentAction {
  label: string;
  type: 'open' | 'reply' | 'dismiss' | 'snooze';
  parameters?: Record<string, unknown>;
}

// ============================================================================
// Predictive Engine
// ============================================================================

export class PredictiveContentEngine {
  private db: Database;
  private analytics: ReturnType<typeof getEvolutionAnalytics>;
  private learnings: Map<string, UserIntent> = new Map();

  constructor() {
    this.db = getDatabase();
    this.analytics = getEvolutionAnalytics();
    this.initializeDatabase();
    this.loadExistingLearnings();
  }

  // ============================================================================
  // Database Initialization
  // ============================================================================

  private initializeDatabase(): void {
    // User intents table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_intents (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        topic TEXT NOT NULL,
        keywords TEXT NOT NULL,
        confidence REAL DEFAULT 0.0,
        frequency TEXT NOT NULL,
        preferred_hour INTEGER,
        preferred_minute INTEGER,
        timezone TEXT,
        sources_json TEXT NOT NULL,
        last_matched INTEGER,
        times_matched INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // Predicted tasks table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS predicted_tasks (
        id TEXT PRIMARY KEY,
        intent_id TEXT NOT NULL REFERENCES user_intents(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        cron_expression TEXT NOT NULL,
        task_type TEXT NOT NULL,
        task_config TEXT NOT NULL,
        estimated_value REAL DEFAULT 0.5,
        enabled INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // Content delivery log
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS content_deliveries (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES predicted_tasks(id) ON DELETE CASCADE,
        user_id TEXT,
        content_type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        data_json TEXT,
        actions_json TEXT,
        delivered INTEGER DEFAULT 1,
        viewed INTEGER DEFAULT 0,
        feedback TEXT,
        timestamp INTEGER NOT NULL
      )
    `);

    dbLogger.info('Predictive content engine database initialized');
  }

  // ============================================================================
  // Intent Detection & Learning
  // ============================================================================

  /**
   * Analyze user behavior to detect content intents
   */
  async detectContentIntents(): Promise<UserIntent[]> {
    const events = this.getRecentEvents(7 * 24 * 60 * 60 * 1000); // Last 7 days

    const intents: UserIntent[] = [];

    // Detect information-seeking patterns
    intents.push(...this.detectInformationIntents(events));

    // Detect task patterns
    intents.push(...this.detectTaskIntents(events));

    // Detect monitoring patterns
    intents.push(...this.detectMonitoringIntents(events));

    return intents;
  }

  /**
   * Detect information-seeking intents
   * (e.g., user always asks for news in the morning)
   */
  private detectInformationIntents(
    events: Array<{ type: string; context: Record<string, unknown>; timestamp: number }>
  ): UserIntent[] {
    const intents: UserIntent[] = [];

    // Group events by topic keywords
    const topicGroups = this.groupByTopic(events);

    for (const [topic, groupEvents] of topicGroups.entries()) {
      if (groupEvents.length < 3) continue; // Need at least 3 occurrences

      // Detect time patterns
      const timePattern = this.analyzeTimePattern(groupEvents);

      // Extract keywords from queries
      const keywords = this.extractKeywords(groupEvents);

      // Determine appropriate sources
      const sources = this.suggestSourcesForTopic(topic, keywords);

      const intent: UserIntent = {
        id: randomUUID(),
        type: 'information',
        topic,
        keywords,
        confidence: Math.min(groupEvents.length / 10, 1), // More occurrences = higher confidence
        frequency: this.inferFrequency(groupEvents),
        preferredTime: timePattern,
        sources,
        lastMatched: Math.max(...groupEvents.map((e) => e.timestamp)),
        timesMatched: groupEvents.length,
      };

      intents.push(intent);
    }

    return intents;
  }

  /**
   * Detect task automation intents
   * (e.g., user runs certain reports daily)
   */
  private detectTaskIntents(
    events: Array<{ type: string; context: Record<string, unknown>; timestamp: number }>
  ): UserIntent[] {
    const intents: UserIntent[] = [];

    // Find repeated workflow executions
    const workflowExecutions = events.filter(
      (e) => e.type === 'workflow_execution' && e.context.success === true
    );

    const workflowGroups = new Map<string, typeof workflowExecutions>();

    for (const execution of workflowExecutions) {
      const workflowName = execution.context.workflowName as string;
      if (!workflowGroups.has(workflowName)) {
        workflowGroups.set(workflowName, []);
      }
      workflowGroups.get(workflowName)!.push(execution);
    }

    // Analyze each workflow pattern
    for (const [workflowName, executions] of workflowGroups.entries()) {
      if (executions.length < 3) continue;

      const timePattern = this.analyzeTimePattern(executions);

      intents.push({
        id: randomUUID(),
        type: 'task',
        topic: workflowName,
        keywords: [workflowName],
        confidence: Math.min(executions.length / 10, 1),
        frequency: this.inferFrequency(executions),
        preferredTime: timePattern,
        sources: [
          {
            type: 'workflow',
            config: { workflowName },
            priority: 1,
          },
        ],
        lastMatched: Math.max(...executions.map((e) => e.timestamp)),
        timesMatched: executions.length,
      });
    }

    return intents;
  }

  /**
   * Detect monitoring intents
   * (e.g., user checks system status, errors, etc.)
   */
  private detectMonitoringIntents(
    events: Array<{ type: string; context: Record<string, unknown>; timestamp: number }>
  ): UserIntent[] {
    const intents: UserIntent[] = [];

    // Look for error checking patterns
    const errorChecks = events.filter(
      (e) => e.type === 'command' && (e.context.command as string)?.includes('error')
    );

    if (errorChecks.length >= 3) {
      intents.push({
        id: randomUUID(),
        type: 'monitoring',
        topic: 'system_errors',
        keywords: ['error', 'log', 'status'],
        confidence: Math.min(errorChecks.length / 10, 1),
        frequency: 'hourly',
        sources: [
          {
            type: 'api',
            config: { endpoint: '/api/errors', method: 'GET' },
            priority: 1,
          },
        ],
        lastMatched: Math.max(...errorChecks.map((e) => e.timestamp)),
        timesMatched: errorChecks.length,
      });
    }

    return intents;
  }

  // ============================================================================
  // Task Generation
  // ============================================================================

  /**
   * Generate predicted tasks based on detected intents
   */
  async generatePredictedTasks(): Promise<PredictedTask[]> {
    const intents = await this.detectContentIntents();
    const tasks: PredictedTask[] = [];

    for (const intent of intents) {
      // Check if task already exists for this intent
      const existing = this.db
        .prepare('SELECT id FROM predicted_tasks WHERE intent_id = ?')
        .get(intent.id);

      if (existing) {
        // Update existing task
        const task = this.createTaskFromIntent(intent);
        this.updatePredictedTask(task);
        tasks.push(task);
      } else {
        // Create new task
        const task = this.createTaskFromIntent(intent);
        this.savePredictedTask(task);
        tasks.push(task);
      }
    }

    return tasks;
  }

  /**
   * Create a scheduled task from an intent
   */
  private createTaskFromIntent(intent: UserIntent): PredictedTask {
    const cronExpression = this.buildCronExpression(intent);

    let taskConfig: Record<string, unknown> = {};

    switch (intent.type) {
      case 'information':
        taskConfig = {
          prompt: this.buildInformationPrompt(intent),
          modelId: this.getDefaultModel(),
          autoCreateMemories: true,
        };
        break;

      case 'task':
        taskConfig = {
          workflowId: intent.sources.find((s) => s.type === 'workflow')?.config,
        };
        break;

      case 'monitoring':
        taskConfig = {
          prompt: `Check ${intent.topic} and report any issues`,
          modelId: this.getDefaultModel(),
        };
        break;
    }

    return {
      id: randomUUID(),
      intentId: intent.id,
      name: this.generateTaskName(intent),
      description: this.generateTaskDescription(intent),
      cronExpression,
      taskType: intent.type === 'task' ? 'workflow' : 'prompt',
      taskConfig,
      estimatedValue: intent.confidence,
      enabled: true,
    };
  }

  /**
   * Build a cron expression from intent preferences
   */
  private buildCronExpression(intent: UserIntent): string {
    if (intent.preferredTime) {
      const { hour, minute } = intent.preferredTime;

      switch (intent.frequency) {
        case 'daily':
          return `${minute} ${hour} * * *`;
        case 'weekly':
          return `${minute} ${hour} * * 1`; // Monday
        case 'hourly':
          return `${minute} * * * *`;
      }
    }

    // Default: daily at 9 AM
    return '0 9 * * *';
  }

  /**
   * Build an information-gathering prompt
   */
  private buildInformationPrompt(intent: UserIntent): string {
    const keywords = intent.keywords.slice(0, 5).join(', ');
    return `Please gather and summarize the latest information about: ${keywords}.

Focus on:
1. Key developments and updates
2. Important news or changes
3. Action items or recommendations

Provide a concise summary that I can quickly review.`;
  }

  /**
   * Generate a human-readable task name
   */
  private generateTaskName(intent: UserIntent): string {
    const timeStr = intent.preferredTime
      ? ` at ${intent.preferredTime.hour}:${String(intent.preferredTime.minute).padStart(2, '0')}`
      : '';

    switch (intent.type) {
      case 'information':
        return `Daily ${intent.topic} Update${timeStr}`;
      case 'task':
        return `Automated ${intent.topic}`;
      case 'monitoring':
        return `${intent.topic} Monitor`;
      default:
        return `Auto ${intent.topic}`;
    }
  }

  /**
   * Generate task description
   */
  private generateTaskDescription(intent: UserIntent): string {
    return `Automatically fetch and deliver ${intent.topic} content ${intent.frequency}.`;
  }

  // ============================================================================
  // Content Delivery
  // ============================================================================

  /**
   * Deliver content to user
   */
  async deliverContent(taskId: string): Promise<void> {
    const task = this.db
      .prepare('SELECT * FROM predicted_tasks WHERE id = ?')
      .get(taskId) as PredictedTask & { intent_id: string };

    if (!task) {
      dbLogger.error(`Task not found: ${taskId}`);
      return;
    }

    // Generate content based on task type
    const content = await this.generateContent(task);

    // Create delivery record
    const delivery: ContentDelivery = {
      id: randomUUID(),
      taskId,
      content,
      timestamp: Date.now(),
      delivered: false,
      viewed: false,
    };

    // Deliver through appropriate channel
    await this.sendContent(content);

    // Mark as delivered
    delivery.delivered = true;
    this.saveDelivery(delivery);

    dbLogger.info(`Content delivered for task: ${taskId}`);
  }

  /**
   * Generate content for a task
   */
  private async generateContent(
    task: PredictedTask & { intent_id: string }
  ): Promise<DeliveredContent> {
    switch (task.taskType) {
      case 'prompt':
        return await this.generatePromptContent(task);
      case 'workflow':
        return await this.generateWorkflowContent(task);
      case 'reminder':
        return this.generateReminderContent(task);
      default:
        throw new Error(`Unknown task type: ${task.taskType}`);
    }
  }

  /**
   * Generate content from prompt execution
   */
  private async generatePromptContent(
    task: PredictedTask & { intent_id: string }
  ): Promise<DeliveredContent> {
    try {
      const { chat } = await import('../ipc/llm.js');
      const config = task.taskConfig as { prompt: string; modelId?: string };

      // Check if the model exists before trying to use it
      const modelId = config.modelId || this.getDefaultModel();
      const modelExists = this.db.prepare('SELECT id FROM models WHERE id = ?').get(modelId);

      if (!modelExists) {
        dbLogger.warn(`Model ${modelId} not configured, skipping content generation`);
        return {
          type: 'notification',
          title: task.name,
          body: 'Configure a model to enable AI-generated content for this task.',
          actions: [{ label: 'Dismiss', type: 'dismiss' }],
        };
      }

      // Execute the prompt
      const result = await chat(this.db, {
        model: modelId,
        messages: [
          {
            role: 'user',
            content: config.prompt,
          },
        ],
        temperature: 0.7,
      });

      const content = result.content || 'Failed to generate content';

      return {
        type: 'chat_message',
        title: task.name,
        body: content,
        actions: [
          { label: 'View Details', type: 'open' },
          { label: 'Snooze', type: 'snooze' },
          { label: 'Dismiss', type: 'dismiss' },
        ],
      };
    } catch (error) {
      dbLogger.error(error as Error, 'Failed to generate prompt content');
      return {
        type: 'notification',
        title: task.name,
        body: 'Unable to generate content. Please check your model configuration.',
        actions: [{ label: 'Dismiss', type: 'dismiss' }],
      };
    }
  }

  /**
   * Generate content from workflow execution
   */
  private async generateWorkflowContent(
    task: PredictedTask & { intent_id: string }
  ): Promise<DeliveredContent> {
    try {
      const { executeWorkflow } = await import('../workflow-engine/index.js');
      const config = task.taskConfig as { workflowId: string };

      // Check if workflow exists
      const workflowExists = this.db
        .prepare('SELECT id FROM workflows WHERE id = ?')
        .get(config.workflowId);

      if (!workflowExists) {
        dbLogger.warn(`Workflow ${config.workflowId} not found, skipping execution`);
        return {
          type: 'notification',
          title: task.name,
          body: 'Configured workflow not found. Please check your workflow settings.',
          actions: [{ label: 'Dismiss', type: 'dismiss' }],
        };
      }

      // Execute workflow
      const result = await executeWorkflow(this.db, config.workflowId, [], [], () => {});

      return {
        type: 'dashboard_update',
        title: task.name,
        body: `Workflow completed: ${result.status}`,
        data: result as unknown as Record<string, unknown>,
        actions: [
          { label: 'View Results', type: 'open' },
          { label: 'Dismiss', type: 'dismiss' },
        ],
      };
    } catch (error) {
      dbLogger.error(error as Error, 'Failed to generate workflow content');
      return {
        type: 'notification',
        title: task.name,
        body: 'Unable to execute workflow. Please check your workflow configuration.',
        actions: [{ label: 'Dismiss', type: 'dismiss' }],
      };
    }
  }

  /**
   * Generate reminder content
   */
  private generateReminderContent(task: PredictedTask): DeliveredContent {
    return {
      type: 'notification',
      title: task.name,
      body: task.description || 'Scheduled reminder',
      actions: [
        { label: 'Acknowledge', type: 'open' },
        { label: 'Snooze', type: 'snooze' },
      ],
    };
  }

  /**
   * Send content to user through appropriate channel
   */
  private async sendContent(content: DeliveredContent): Promise<void> {
    const { BrowserWindow } = await import('electron');

    // Get main window
    const windows = BrowserWindow.getAllWindows();
    const mainWindow = windows[0];

    if (!mainWindow) {
      dbLogger.warn('No main window found for content delivery');
      return;
    }

    switch (content.type) {
      case 'notification': {
        // Send system notification
        const { Notification } = await import('electron');
        new Notification({
          title: content.title,
          body: content.body,
        }).show();
        break;
      }

      case 'chat_message':
        // Send to chat window
        mainWindow.webContents.send('evolution:content-delivery', {
          type: 'chat',
          title: content.title,
          content: content.body,
          actions: content.actions,
        });
        break;

      case 'dashboard_update':
        // Send to dashboard
        mainWindow.webContents.send('evolution:content-delivery', {
          ...content,
        });
        break;
    }
  }

  // ============================================================================
  // Helper Functions
  // ============================================================================

  private getRecentEvents(timeRange: number): Array<{
    type: string;
    context: Record<string, unknown>;
    timestamp: number;
  }> {
    const since = Date.now() - timeRange;

    const events = this.db
      .prepare(
        `
        SELECT event_type, context_json, timestamp
        FROM evolution_events
        WHERE timestamp >= ?
        ORDER BY timestamp ASC
      `
      )
      .all(since) as Array<{ event_type: string; context_json: string; timestamp: number }>;

    return events.map((e) => ({
      type: e.event_type,
      context: JSON.parse(e.context_json),
      timestamp: e.timestamp,
    }));
  }

  private groupByTopic(
    events: Array<{ type: string; context: Record<string, unknown>; timestamp: number }>
  ): Map<string, typeof events> {
    const groups = new Map<string, typeof events>();

    for (const event of events) {
      // Extract topic from context
      let topic = 'general';

      if (event.context.workflowName) {
        topic = String(event.context.workflowName);
      } else if (event.context.command) {
        topic = String(event.context.command).split(' ')[0];
      } else if (event.type === 'chat_message') {
        // Extract topic from message (simple implementation)
        topic = 'chat';
      }

      if (!groups.has(topic)) {
        groups.set(topic, []);
      }
      groups.get(topic)!.push(event);
    }

    return groups;
  }

  private analyzeTimePattern(events: Array<{ timestamp: number }>): TimeOfDay | undefined {
    const hours = events.map((e) => new Date(e.timestamp).getHours());
    const hourCounts = new Array(24).fill(0);

    for (const hour of hours) {
      hourCounts[hour]++;
    }

    const peakHour = hourCounts.indexOf(Math.max(...hourCounts));

    // Only return if there's a clear pattern (>30% of events at this hour)
    if (hourCounts[peakHour] / events.length > 0.3) {
      return { hour: peakHour, minute: 0 };
    }

    return undefined;
  }

  private extractKeywords(events: Array<{ context: Record<string, unknown> }>): string[] {
    const keywords = new Set<string>();

    for (const event of events) {
      if (event.context.command) {
        const parts = String(event.context.command).split(' ');
        parts.forEach((p) => keywords.add(p));
      }
      if (event.context.workflowName) {
        keywords.add(String(event.context.workflowName));
      }
    }

    return Array.from(keywords).slice(0, 10);
  }

  private inferFrequency(events: Array<{ timestamp: number }>): UserIntent['frequency'] {
    const dayInMs = 24 * 60 * 60 * 1000;

    // Check if events are spread across multiple days
    const daysCovered = new Set(events.map((e) => Math.floor(e.timestamp / dayInMs))).size;

    if (daysCovered >= 7) {
      return 'daily';
    } else if (daysCovered >= 3) {
      return 'weekly';
    } else {
      return 'hourly';
    }
  }

  private suggestSourcesForTopic(topic: string, keywords: string[]): ContentSource[] {
    const sources: ContentSource[] = [];

    // Suggest web scraping for news/info topics
    if (keywords.some((k) => ['news', 'weather', 'stock', 'price'].includes(k))) {
      sources.push({
        type: 'web',
        config: { url: `https://api.example.com/${topic}` },
        priority: 1,
      });
    }

    // Suggest agent for analysis
    sources.push({
      type: 'agent',
      config: { agentType: 'analyst' },
      priority: 0.5,
    });

    return sources;
  }

  private getDefaultModel(): string {
    // Get default model from settings
    const setting = this.db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get('defaultModel') as { value: string } | undefined;

    if (!setting?.value) {
      return ''; // Return empty string if no model configured
    }

    // Verify the model still exists
    const modelExists = this.db.prepare('SELECT id FROM models WHERE id = ?').get(setting.value);

    return modelExists ? setting.value : '';
  }

  private loadExistingLearnings(): void {
    const intents = this.db.prepare('SELECT * FROM user_intents').all() as Array<
      UserIntent & { sources_json: string }
    >;

    for (const intent of intents) {
      this.learnings.set(intent.id, {
        ...intent,
        sources: JSON.parse(intent.sources_json),
      });
    }

    dbLogger.info(`Loaded ${this.learnings.size} existing intents`);
  }

  private savePredictedTask(task: PredictedTask): void {
    this.db
      .prepare(
        `
        INSERT INTO predicted_tasks (
          id, intent_id, name, description, cron_expression,
          task_type, task_config, estimated_value, enabled,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        task.id,
        task.intentId,
        task.name,
        task.description,
        task.cronExpression,
        task.taskType,
        JSON.stringify(task.taskConfig),
        task.estimatedValue,
        task.enabled ? 1 : 0,
        Date.now(),
        Date.now()
      );
  }

  private updatePredictedTask(task: PredictedTask): void {
    this.db
      .prepare(
        `
        UPDATE predicted_tasks
        SET name = ?, description = ?, cron_expression = ?,
            task_config = ?, estimated_value = ?, updated_at = ?
        WHERE id = ?
      `
      )
      .run(
        task.name,
        task.description,
        task.cronExpression,
        JSON.stringify(task.taskConfig),
        task.estimatedValue,
        Date.now(),
        task.id
      );
  }

  private saveDelivery(delivery: ContentDelivery): void {
    this.db
      .prepare(
        `
        INSERT INTO content_deliveries (
          id, task_id, content_type, title, body,
          data_json, actions_json, delivered, viewed,
          timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        delivery.id,
        delivery.taskId,
        delivery.content.type,
        delivery.content.title,
        delivery.content.body,
        JSON.stringify(delivery.content.data),
        JSON.stringify(delivery.content.actions),
        delivery.delivered ? 1 : 0,
        delivery.viewed ? 1 : 0,
        delivery.timestamp
      );
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let engineInstance: PredictiveContentEngine | null = null;

export function getPredictiveEngine(): PredictiveContentEngine {
  if (!engineInstance) {
    engineInstance = new PredictiveContentEngine();
  }
  return engineInstance;
}
