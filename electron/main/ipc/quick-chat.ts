/**
 * IPC Handlers for Quick Chat Settings
 */

import type { Database } from 'better-sqlite3';
import type { Message } from '../../../shared/types/index.js';
import * as quickChat from '../quick-chat/settings.js';

// ============================================================================
// QUICK CHAT SETTINGS HANDLERS
// ============================================================================

export const quickChatGetSettings = (db: Database) => {
  return quickChat.getQuickChatSettings(db);
};

export const quickChatUpdateSettings = (
  db: Database,
  updates: Partial<Omit<quickChat.QuickChatSettings, 'id' | 'createdAt'>>
) => {
  return quickChat.updateQuickChatSettings(db, updates);
};

export const quickChatGetSessionConfig = (db: Database) => {
  return quickChat.getQuickChatSessionConfig(db);
};

export const quickChatResetSettings = (db: Database) => {
  return quickChat.resetQuickChatSettings(db);
};

export const quickChatSetAgent = (db: Database, agentId: string | null) => {
  return quickChat.setQuickChatAgent(db, agentId);
};

export const quickChatSetModel = (db: Database, modelId: string | null) => {
  return quickChat.setQuickChatModel(db, modelId);
};

export const quickChatGetAvailableAgents = (db: Database) => {
  return quickChat.getAvailableAgentsForQuickChat(db);
};

export const quickChatGetStats = (db: Database) => {
  return quickChat.getQuickChatStats(db);
};

export const quickChatCreateSession = (db: Database) => {
  return quickChat.createQuickChatSession(db);
};

export const quickChatSaveConversation = (db: Database, sessionId: string, messages: Message[]) => {
  return quickChat.saveQuickChatConversation(db, sessionId, messages);
};

// ============================================================================
// QUICK CHAT LLM HANDLERS (with memory integration)
// ============================================================================

/**
 * Quick Chat 专用的 LLM 调用 - 自动使用配置的 Agent 和记忆
 */
export const quickChatChat = async (
  db: Database,
  request: {
    model?: string;
    messages: Message[];
    temperature?: number;
    maxTokens?: number;
  }
) => {
  // 获取 Quick Chat 会话配置
  const sessionConfig = quickChat.getQuickChatSessionConfig(db);

  // 准备完整的 LLM 请求
  const fullRequest = {
    model: request.model || sessionConfig.modelId || 'gpt-4',
    messages: request.messages,
    temperature: request.temperature ?? sessionConfig.temperature ?? 0.7,
    maxTokens: request.maxTokens ?? 4096,
  };

  // 如果有 Agent ID，使用增强的 LLM 处理器（带记忆）
  if (sessionConfig.agentId) {
    const { chat } = await import('../ipc/llm-enhanced.js');

    return await chat(db, fullRequest, {
      agentId: sessionConfig.agentId,
      enabled: sessionConfig.memoryOptions?.enabled ?? true,
      maxMemories: sessionConfig.memoryOptions?.maxMemories ?? 5,
      minImportance: sessionConfig.memoryOptions?.minImportance ?? 0.5,
      useSemantic: true,
    });
  }

  // 否则使用基础 LLM 处理器
  const { chat: baseChat } = await import('../ipc/llm.js');
  return await baseChat(db, fullRequest);
};

/**
 * Quick Chat 流式 LLM 调用 - 自动使用配置的 Agent 和记忆
 */
export const quickChatStream = async (
  db: Database,
  request: {
    model?: string;
    messages: Message[];
    temperature?: number;
    maxTokens?: number;
  },
  mainWindow: Electron.BrowserWindow | null
) => {
  // 获取 Quick Chat 会话配置
  const sessionConfig = quickChat.getQuickChatSessionConfig(db);

  // 准备完整的 LLM 请求
  const fullRequest = {
    model: request.model || sessionConfig.modelId || 'gpt-4',
    messages: request.messages,
    temperature: request.temperature ?? sessionConfig.temperature ?? 0.7,
    maxTokens: request.maxTokens ?? 4096,
  };

  // 如果有 Agent ID，使用增强的 LLM 处理器（带记忆）
  if (sessionConfig.agentId) {
    const { chatStream } = await import('../ipc/llm-enhanced.js');

    return await chatStream(db, fullRequest, mainWindow, {
      agentId: sessionConfig.agentId,
      enabled: sessionConfig.memoryOptions?.enabled ?? true,
      maxMemories: sessionConfig.memoryOptions?.maxMemories ?? 5,
      minImportance: sessionConfig.memoryOptions?.minImportance ?? 0.5,
      useSemantic: true,
    });
  }

  // 否则使用基础 LLM 处理器
  const { chatStream: baseChatStream } = await import('../ipc/llm.js');
  return await baseChatStream(db, fullRequest, mainWindow);
};

/**
 * 获取 Quick Chat 的完整配置（包括当前选择的 Agent 信息）
 */
export const quickChatGetFullConfig = async (db: Database) => {
  const settings = quickChat.getQuickChatSettings(db);
  const config = quickChat.getQuickChatSessionConfig(db);

  let agentInfo: {
    id: string;
    name: string;
    description: string | null;
    systemPrompt: string | null;
    temperature: number;
  } | null = null;

  if (settings.agentId) {
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(settings.agentId) as any;

    if (agent) {
      agentInfo = {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        systemPrompt: agent.system_prompt,
        temperature: agent.temperature,
      };
    }
  }

  // 获取当前 Agent 的记忆统计
  let memoryStats = null;
  if (settings.agentId) {
    const { getMemoryStats } = await import('../memory/service.js');
    memoryStats = getMemoryStats(db, settings.agentId);
  }

  return {
    settings,
    config,
    agentInfo,
    memoryStats,
  };
};
