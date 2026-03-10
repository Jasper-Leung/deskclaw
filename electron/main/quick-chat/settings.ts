/**
 * Quick Chat Settings Service
 * 管理 Quick Chat 的专属 Agent 配置和设置
 */

import type { Database } from 'better-sqlite3';
import { randomUUID } from 'crypto';

export interface QuickChatSettings {
  id: string;
  agentId?: string | null;
  modelId?: string | null;
  systemPrompt?: string | null;
  temperature: number;
  memoryEnabled: boolean;
  memoryMaxCount: number;
  memoryMinImportance: number;
  autoCreateMemories: boolean;
  selectedTools?: string[] | null;
  createdAt: number;
  updatedAt: number;
}

export interface QuickChatSessionConfig {
  agentId?: string;
  modelId?: string;
  systemPrompt?: string;
  temperature?: number;
  memoryOptions?: {
    enabled?: boolean;
    maxMemories?: number;
    minImportance?: number;
  };
}

const DEFAULT_SETTINGS_ID = 'default';

/**
 * 获取 Quick Chat 设置
 */
export function getQuickChatSettings(db: Database): QuickChatSettings {
  const result = db
    .prepare('SELECT * FROM quick_chat_settings WHERE id = ?')
    .get(DEFAULT_SETTINGS_ID) as any;

  if (result) {
    // Parse selectedTools from JSON string to array
    let selectedTools: string[] | null = null;
    if (result.selected_tools) {
      try {
        selectedTools = JSON.parse(result.selected_tools);
      } catch {
        selectedTools = null;
      }
    }

    return {
      id: result.id,
      agentId: result.agent_id,
      modelId: result.model_id,
      systemPrompt: result.system_prompt,
      temperature: result.temperature,
      memoryEnabled: result.memory_enabled === 1,
      memoryMaxCount: result.memory_max_count,
      memoryMinImportance: result.memory_min_importance,
      autoCreateMemories: result.auto_create_memories === 1,
      selectedTools,
      createdAt: result.created_at,
      updatedAt: result.updated_at,
    };
  }

  // 返回默认设置
  return {
    id: DEFAULT_SETTINGS_ID,
    agentId: null,
    modelId: null,
    systemPrompt: null,
    temperature: 0.7,
    memoryEnabled: true,
    memoryMaxCount: 5,
    memoryMinImportance: 0.5,
    autoCreateMemories: true,
    selectedTools: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * 更新 Quick Chat 设置
 */
export function updateQuickChatSettings(
  db: Database,
  updates: Partial<Omit<QuickChatSettings, 'id' | 'createdAt'>>
): QuickChatSettings {
  const now = Date.now();
  const existing = getQuickChatSettings(db);

  const fields: string[] = [];
  const values: any[] = [];

  if (updates.agentId !== undefined) {
    fields.push('agent_id = ?');
    values.push(updates.agentId || null);
  }
  if (updates.modelId !== undefined) {
    fields.push('model_id = ?');
    values.push(updates.modelId || null);
  }
  if (updates.systemPrompt !== undefined) {
    fields.push('system_prompt = ?');
    values.push(updates.systemPrompt || null);
  }
  if (updates.temperature !== undefined) {
    fields.push('temperature = ?');
    values.push(updates.temperature);
  }
  if (updates.memoryEnabled !== undefined) {
    fields.push('memory_enabled = ?');
    values.push(updates.memoryEnabled ? 1 : 0);
  }
  if (updates.memoryMaxCount !== undefined) {
    fields.push('memory_max_count = ?');
    values.push(updates.memoryMaxCount);
  }
  if (updates.memoryMinImportance !== undefined) {
    fields.push('memory_min_importance = ?');
    values.push(updates.memoryMinImportance);
  }
  if (updates.autoCreateMemories !== undefined) {
    fields.push('auto_create_memories = ?');
    values.push(updates.autoCreateMemories ? 1 : 0);
  }
  if (updates.selectedTools !== undefined) {
    fields.push('selected_tools = ?');
    // Convert array to JSON string for storage
    const toolsValue = Array.isArray(updates.selectedTools)
      ? JSON.stringify(updates.selectedTools)
      : updates.selectedTools;
    values.push(toolsValue);
  }

  fields.push('updated_at = ?');
  values.push(now);

  if (existing.id === DEFAULT_SETTINGS_ID) {
    // 更新现有设置
    values.push(DEFAULT_SETTINGS_ID);
    db.prepare(`UPDATE quick_chat_settings SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  } else {
    // 创建新设置
    const allFields = [
      'id',
      'agent_id',
      'model_id',
      'system_prompt',
      'temperature',
      'memory_enabled',
      'memory_max_count',
      'memory_min_importance',
      'auto_create_memories',
      'selected_tools',
      'created_at',
      'updated_at',
    ];

    db.prepare(
      `INSERT INTO quick_chat_settings (${allFields.join(', ')}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      DEFAULT_SETTINGS_ID,
      updates.agentId || null,
      updates.modelId || null,
      updates.systemPrompt || null,
      updates.temperature ?? 0.7,
      (updates.memoryEnabled ?? true) ? 1 : 0,
      updates.memoryMaxCount ?? 5,
      updates.memoryMinImportance ?? 0.5,
      (updates.autoCreateMemories ?? true) ? 1 : 0,
      updates.selectedTools ? JSON.stringify(updates.selectedTools) : null,
      existing.createdAt,
      now
    );
  }

  return getQuickChatSettings(db);
}

/**
 * 获取当前 Quick Chat 会话配置（用于 LLM 调用）
 */
export function getQuickChatSessionConfig(db: Database): QuickChatSessionConfig {
  const settings = getQuickChatSettings(db);
  const config: QuickChatSessionConfig = {};

  // 如果设置了 agentId，使用 Agent 的配置
  if (settings.agentId) {
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(settings.agentId) as any;

    if (agent) {
      config.agentId = agent.id;
      config.systemPrompt = agent.system_prompt || undefined;
      config.temperature = agent.temperature;
    }
  }

  // Quick Chat 优先使用自己的设置
  if (settings.modelId) {
    config.modelId = settings.modelId;
  }
  if (settings.systemPrompt) {
    config.systemPrompt = settings.systemPrompt;
  }
  if (settings.temperature !== 0.7) {
    config.temperature = settings.temperature;
  }

  // 记忆设置
  if (settings.memoryEnabled && settings.agentId) {
    config.memoryOptions = {
      enabled: true,
      maxMemories: settings.memoryMaxCount,
      minImportance: settings.memoryMinImportance,
    };
  }

  return config;
}

/**
 * 重置 Quick Chat 设置为默认值
 */
export function resetQuickChatSettings(db: Database): QuickChatSettings {
  const defaultSettings: QuickChatSettings = {
    id: DEFAULT_SETTINGS_ID,
    agentId: null,
    modelId: null,
    systemPrompt: null,
    temperature: 0.7,
    memoryEnabled: true,
    memoryMaxCount: 5,
    memoryMinImportance: 0.5,
    autoCreateMemories: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  return updateQuickChatSettings(db, defaultSettings);
}

/**
 * 设置 Quick Chat 的 Agent
 */
export function setQuickChatAgent(db: Database, agentId: string | null): QuickChatSettings {
  return updateQuickChatSettings(db, { agentId });
}

/**
 * 设置 Quick Chat 的模型
 */
export function setQuickChatModel(db: Database, modelId: string | null): QuickChatSettings {
  return updateQuickChatSettings(db, { modelId });
}

/**
 * 获取可用的 Agent 列表（用于 Quick Chat 选择器）
 */
export function getAvailableAgentsForQuickChat(db: Database): Array<{
  id: string;
  name: string;
  description: string | null;
  memoryCount: number;
}> {
  const agents = db
    .prepare(
      `
      SELECT a.id, a.name, a.description,
             COUNT(DISTINCT m.id) as memory_count
      FROM agents a
      LEFT JOIN memories m ON a.id = m.agent_id
      GROUP BY a.id
      ORDER BY a.created_at DESC
    `
    )
    .all() as any[];

  return agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    description: agent.description,
    memoryCount: agent.memory_count || 0,
  }));
}

/**
 * 获取 Quick Chat 统计信息
 */
export function getQuickChatStats(db: Database): {
  totalSessions: number;
  activeAgent: string | null;
  activeAgentName: string | null;
  memoryEnabled: boolean;
  totalMemories: number;
} {
  const settings = getQuickChatSettings(db);

  // 获取 Quick Chat 相关的会话统计
  const sessionCount = db
    .prepare(
      `SELECT COUNT(DISTINCT s.id) as count
              FROM sessions s
              WHERE s.title LIKE 'Quick Chat%' OR s.id IN (
                SELECT session_id FROM channel_session_mappings WHERE unified_conversation_id IN (
                  SELECT id FROM unified_conversations WHERE title LIKE 'Quick Chat%'
                )
              )`
    )
    .get() as { count: number } | { count: 0 };

  let activeAgentName: string | null = null;
  if (settings.agentId) {
    const agent = db.prepare('SELECT name FROM agents WHERE id = ?').get(settings.agentId) as any;
    if (agent) {
      activeAgentName = agent.name;
    }
  }

  // 获取当前 Agent 的记忆数量
  let totalMemories = 0;
  if (settings.agentId) {
    const memoryCount = db
      .prepare('SELECT COUNT(*) as count FROM memories WHERE agent_id = ?')
      .get(settings.agentId) as { count: number } | { count: 0 };
    totalMemories = memoryCount.count;
  }

  return {
    totalSessions: sessionCount.count,
    activeAgent: settings.agentId || null,
    activeAgentName,
    memoryEnabled: settings.memoryEnabled,
    totalMemories,
  };
}

/**
 * 为 Quick Chat 创建默认会话
 */
export function createQuickChatSession(db: Database): string {
  const sessionId = randomUUID();
  const now = Date.now();

  db.prepare(
    `INSERT INTO sessions (id, agent_id, title, messages_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(sessionId, null, 'Quick Chat', '[]', now, now);

  return sessionId;
}

/**
 * 保存 Quick Chat 对话到会话中（使用智能记忆创建）
 */
export async function saveQuickChatConversation(
  db: Database,
  sessionId: string,
  messages: Array<{ role: string; content: string }>
): Promise<void> {
  const settings = getQuickChatSettings(db);

  // 如果启用了自动创建记忆，使用智能评估系统
  if (settings.autoCreateMemories && settings.agentId) {
    try {
      const { smartCreateMemoriesFromConversation } = await import('../ipc/memory-smart.js');

      // 使用智能记忆创建：评估内容、检查重复、自动调整重要性
      const result = await smartCreateMemoriesFromConversation(db, settings.agentId, messages, {
        autoEvaluate: true,
        checkDuplicates: true,
        similarityThreshold: 0.85,
        trackCreation: true,
        maxMemories: 3, // 限制每次对话最多创建3个记忆
      });

      console.log(
        `Quick Chat memory creation: ${result.created} created, ${result.skipped} skipped`
      );
    } catch (error) {
      console.error('Failed to auto-create smart memories:', error);
    }
  }
}
