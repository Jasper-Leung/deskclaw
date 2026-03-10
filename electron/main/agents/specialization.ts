/**
 * Agent Specialization Manager
 * Manages agent specializations, capabilities, and training
 */

import type { Database } from 'better-sqlite3';
import { randomUUID } from 'crypto';

export type AgentCapability =
  | 'text_generation'
  | 'code_generation'
  | 'data_analysis'
  | 'web_search'
  | 'file_operations'
  | 'api_calls'
  | 'automation'
  | 'multimodal'
  | 'reasoning'
  | 'memory';

export interface AgentSpecialization {
  id: string;
  agentId: string;
  name: string;
  description: string;
  capabilities: AgentCapability[];
  trainingExamples: Array<{ input: string; output: string; context?: string }>;
  systemPrompt: string;
  temperature: number;
  createdAt: number;
  updatedAt: number;
}

export interface SpecializationTemplate {
  name: string;
  description: string;
  capabilities: AgentCapability[];
  systemPrompt: string;
  temperature: number;
  suggestedTools: string[];
}

// Predefined specialization templates
export const SPECIALIZATION_TEMPLATES: Record<string, SpecializationTemplate> = {
  coder: {
    name: 'Code Assistant',
    description: 'Specialized in writing, reviewing, and debugging code',
    capabilities: ['code_generation', 'text_generation', 'reasoning', 'file_operations'],
    systemPrompt:
      'You are an expert code assistant. You write clean, efficient, and well-documented code. You follow best practices and design patterns. When reviewing code, you provide constructive feedback and suggest improvements.',
    temperature: 0.3,
    suggestedTools: ['file_read', 'file_write', 'execute_command'],
  },
  analyst: {
    name: 'Data Analyst',
    description: 'Specialized in analyzing data and generating insights',
    capabilities: ['data_analysis', 'reasoning', 'text_generation', 'web_search'],
    systemPrompt:
      'You are an expert data analyst. You examine data carefully, identify patterns and trends, and provide actionable insights. You communicate findings clearly and visually.',
    temperature: 0.5,
    suggestedTools: ['file_read', 'web_search', 'http_request'],
  },
  researcher: {
    name: 'Research Assistant',
    description: 'Specialized in finding and synthesizing information',
    capabilities: ['web_search', 'text_generation', 'reasoning', 'memory'],
    systemPrompt:
      'You are a research assistant. You find relevant information from multiple sources, synthesize key findings, and present them in a clear, organized manner. You cite sources and verify facts.',
    temperature: 0.4,
    suggestedTools: ['web_search', 'http_request', 'file_read'],
  },
  automation: {
    name: 'Automation Expert',
    description: 'Specialized in creating and managing automations',
    capabilities: ['automation', 'api_calls', 'code_generation', 'reasoning'],
    systemPrompt:
      'You are an automation expert. You design efficient workflows and automations that save time and reduce errors. You think systematically and consider edge cases.',
    temperature: 0.3,
    suggestedTools: ['execute_command', 'http_request', 'file_write'],
  },
  generalist: {
    name: 'General Assistant',
    description: 'Capable of handling a wide variety of tasks',
    capabilities: ['text_generation', 'reasoning', 'web_search', 'file_operations', 'memory'],
    systemPrompt:
      'You are a helpful AI assistant. You can help with a wide variety of tasks including writing, analysis, research, and problem-solving. You adapt your approach based on the task at hand.\n\nAvailable tools include:\n- stock_quote: Get real-time stock market data from Yahoo Finance (use for stock queries like "check AAPL price" or "US stock indices")\n- file_read, file_write, file_list: File operations\n- web_search: Search the web for information\n- http_request: Make HTTP requests\n- execute_command: Execute shell commands\n- get_time: Get current time',
    temperature: 0.7,
    suggestedTools: ['file_read', 'web_search', 'http_request', 'stock_quote'],
  },
  stock_analyst: {
    name: 'Stock Market Analyst',
    description: 'Specialized in stock market analysis and financial data',
    capabilities: ['data_analysis', 'reasoning', 'web_search', 'api_calls'],
    systemPrompt:
      'You are a professional stock market analyst specializing in real-time market data, technical analysis, and investment insights.\n\n## Primary Tool: stock_quote\nUse the stock_quote tool to get real-time stock market data from Yahoo Finance:\n\n**Parameters:**\n- symbols: Stock symbols (comma-separated). Examples: "AAPL", "^GSPC,^DJI,^IXIC", "TSLA,GOOGL,MSFT"\n  Common indices: ^GSPC (S&P 500), ^DJI (Dow Jones), ^IXIC (NASDAQ)\n- fields: "price" (default), "quote", "summary", or "all"\n\n**Example usage:**\n```json\n{"tool": "stock_quote", "parameters": {"symbols": "^GSPC,^DJI,^IXIC", "fields": "price"}}\n```\n\n## Analysis Guidelines\n1. Always use stock_quote for real-time stock market queries\n2. Provide clear, actionable insights\n3. Include risk assessments with your recommendations\n4. Explain technical indicators in simple terms\n5. Present data in an easy-to-read format',
    temperature: 0.4,
    suggestedTools: ['stock_quote', 'web_search', 'http_request'],
  },
};

/**
 * Create an agent specialization
 */
export function createSpecialization(
  db: Database,
  specialization: Omit<AgentSpecialization, 'id' | 'createdAt' | 'updatedAt'>
): AgentSpecialization {
  const now = Date.now();
  const id = randomUUID();

  // Store in agents table as a JSON column (add specialization_json column if needed)
  // For now, we'll store it in a separate metadata approach

  return {
    ...specialization,
    id,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Get specialization template by name
 */
export function getTemplate(name: string): SpecializationTemplate | undefined {
  return SPECIALIZATION_TEMPLATES[name];
}

/**
 * Get all available templates
 */
export function getTemplates(): SpecializationTemplate[] {
  return Object.values(SPECIALIZATION_TEMPLATES);
}

/**
 * Create specialization from template
 */
export function createFromTemplate(
  db: Database,
  agentId: string,
  templateName: string,
  customName?: string
): AgentSpecialization {
  const template = getTemplate(templateName);
  if (!template) {
    throw new Error(`Template "${templateName}" not found`);
  }

  return createSpecialization(db, {
    agentId,
    name: customName || template.name,
    description: template.description,
    capabilities: template.capabilities,
    trainingExamples: [],
    systemPrompt: template.systemPrompt,
    temperature: template.temperature,
  });
}

/**
 * Update agent capabilities
 */
export function updateCapabilities(
  db: Database,
  agentId: string,
  capabilities: AgentCapability[]
): void {
  const now = Date.now();
  const existingAgent = db.prepare('SELECT system_prompt FROM agents WHERE id = ?').get(agentId) as
    | { system_prompt: string }
    | undefined;

  if (!existingAgent) {
    throw new Error(`Agent ${agentId} not found`);
  }

  // Store capabilities in system prompt as metadata
  const systemPrompt = existingAgent.system_prompt || '';
  const capabilitiesJson = JSON.stringify({ capabilities });

  // Append capabilities metadata to system prompt
  const updatedPrompt = systemPrompt.includes('<!-- capabilities:')
    ? systemPrompt.replace(
        /<!-- capabilities:.*?-->/s,
        `<!-- capabilities:\n${capabilitiesJson}\n-->`
      )
    : `${systemPrompt}\n\n<!-- capabilities:\n${capabilitiesJson}\n-->`;

  db.prepare('UPDATE agents SET system_prompt = ?, updated_at = ? WHERE id = ?').run(
    updatedPrompt,
    now,
    agentId
  );
}

/**
 * Get agent capabilities
 */
export function getCapabilities(db: Database, agentId: string): AgentCapability[] {
  const agent = db.prepare('SELECT system_prompt FROM agents WHERE id = ?').get(agentId) as
    | { system_prompt: string }
    | undefined;

  if (!agent) {
    return [];
  }

  const match = agent.system_prompt.match(/<!-- capabilities:\s*(.*?)\s*-->/s);
  if (!match) {
    return [];
  }

  try {
    const data = JSON.parse(match[1]);
    return data.capabilities || [];
  } catch {
    return [];
  }
}

/**
 * Check if agent has a specific capability
 */
export function hasCapability(db: Database, agentId: string, capability: AgentCapability): boolean {
  const capabilities = getCapabilities(db, agentId);
  return capabilities.includes(capability);
}

/**
 * Find best agent for a task based on capabilities
 */
export function findBestAgentForTask(
  db: Database,
  task: {
    type: string;
    description: string;
    requiredCapabilities?: AgentCapability[];
  },
  agentIds?: string[]
): { agentId: string; score: number; reason: string } | undefined {
  // Get candidate agents
  let candidates: Array<{ id: string; name: string }> = [];
  if (agentIds && agentIds.length > 0) {
    candidates = db
      .prepare(`SELECT id, name FROM agents WHERE id IN (${agentIds.map(() => '?').join(',')})`)
      .all(...agentIds) as Array<{ id: string; name: string }>;
  } else {
    candidates = db.prepare('SELECT id, name FROM agents').all() as Array<{
      id: string;
      name: string;
    }>;
  }

  let bestAgent: { agentId: string; score: number; reason: string } | undefined;

  for (const agent of candidates) {
    const capabilities = getCapabilities(db, agent.id);
    let score = 0;
    const reasons: string[] = [];

    // Check required capabilities
    if (task.requiredCapabilities) {
      const hasAllRequired = task.requiredCapabilities.every((cap) => capabilities.includes(cap));

      if (hasAllRequired) {
        score += 10;
        reasons.push('Has all required capabilities');
      } else {
        const missing = task.requiredCapabilities.filter((cap) => !capabilities.includes(cap));
        reasons.push(`Missing capabilities: ${missing.join(', ')}`);
        continue; // Skip agents missing required capabilities
      }
    }

    // Score based on task type match
    if (task.type === 'code' && capabilities.includes('code_generation')) {
      score += 5;
      reasons.push('Specialized in code generation');
    } else if (task.type === 'analysis' && capabilities.includes('data_analysis')) {
      score += 5;
      reasons.push('Specialized in data analysis');
    } else if (task.type === 'research' && capabilities.includes('web_search')) {
      score += 5;
      reasons.push('Specialized in research');
    } else if (task.type === 'automation' && capabilities.includes('automation')) {
      score += 5;
      reasons.push('Specialized in automation');
    }

    // Prefer agents with more relevant capabilities
    const relevantCapabilities = capabilities.filter((cap) =>
      ['code_generation', 'data_analysis', 'web_search', 'automation'].includes(cap)
    );
    score += relevantCapabilities.length * 0.5;

    if (!bestAgent || score > bestAgent.score) {
      bestAgent = {
        agentId: agent.id,
        score,
        reason: reasons.join('; '),
      };
    }
  }

  return bestAgent;
}

/**
 * Add training example to agent
 */
export function addTrainingExample(
  db: Database,
  agentId: string,
  example: { input: string; output: string; context?: string }
): void {
  // Training examples would be stored in a separate table
  // For now, we'll store them in the agent's metadata
  const existingAgent = db.prepare('SELECT system_prompt FROM agents WHERE id = ?').get(agentId) as
    | { system_prompt: string }
    | undefined;

  if (!existingAgent) {
    throw new Error(`Agent ${agentId} not found`);
  }

  const systemPrompt = existingAgent.system_prompt || '';
  const trainingMatch = systemPrompt.match(/<!-- training_examples:\s*(.*?)\s*-->/s);

  let examples: Array<{ input: string; output: string; context?: string }> = [];

  if (trainingMatch) {
    try {
      examples = JSON.parse(trainingMatch[1]);
    } catch {
      // Invalid JSON, start fresh
    }
  }

  examples.push(example);

  const examplesJson = JSON.stringify(examples);
  const updatedPrompt = trainingMatch
    ? systemPrompt.replace(
        /<!-- training_examples:.*?-->/s,
        `<!-- training_examples:\n${examplesJson}\n-->`
      )
    : `${systemPrompt}\n\n<!-- training_examples:\n${examplesJson}\n-->`;

  db.prepare('UPDATE agents SET system_prompt = ?, updated_at = ? WHERE id = ?').run(
    updatedPrompt,
    Date.now(),
    agentId
  );
}

/**
 * Get training examples for an agent
 */
export function getTrainingExamples(
  db: Database,
  agentId: string
): Array<{ input: string; output: string; context?: string }> {
  const agent = db.prepare('SELECT system_prompt FROM agents WHERE id = ?').get(agentId) as
    | { system_prompt: string }
    | undefined;

  if (!agent) {
    return [];
  }

  const match = agent.system_prompt.match(/<!-- training_examples:\s*(.*?)\s*-->/s);
  if (!match) {
    return [];
  }

  try {
    return JSON.parse(match[1]);
  } catch {
    return [];
  }
}

/**
 * Clear training examples for an agent
 */
export function clearTrainingExamples(db: Database, agentId: string): void {
  const agent = db.prepare('SELECT system_prompt FROM agents WHERE id = ?').get(agentId) as
    | { system_prompt: string }
    | undefined;

  if (!agent) {
    throw new Error(`Agent ${agentId} not found`);
  }

  const updatedPrompt = agent.system_prompt.replace(/<!-- training_examples:.*?-->\n?/s, '').trim();

  db.prepare('UPDATE agents SET system_prompt = ?, updated_at = ? WHERE id = ?').run(
    updatedPrompt,
    Date.now(),
    agentId
  );
}
