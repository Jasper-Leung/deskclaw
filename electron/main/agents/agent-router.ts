/**
 * Agent Router
 * Routes incoming messages to the appropriate agent based on rules and context
 */

import type { Database } from 'better-sqlite3';
import { randomUUID } from 'crypto';

export type RuleType = 'keyword' | 'pattern' | 'llm_classification' | 'channel' | 'sender';

export interface AgentRoutingRule {
  id: string;
  name: string;
  agentId: string;
  ruleType: RuleType;
  conditionJson: string;
  priority: number;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface RoutingCondition {
  keywords?: string[];
  pattern?: string;
  channelTypes?: string[];
  senderIds?: string[];
  llmCategories?: string[];
}

// Database row types
interface RoutingRuleRow {
  id: string;
  name: string;
  agent_id: string;
  rule_type: string;
  condition_json: string;
  priority: number;
  enabled: number;
  created_at: number;
  updated_at: number;
}

export interface RoutingResult {
  agentId: string;
  confidence: number;
  matchedRule?: string;
  reason: string;
}

/**
 * Create a routing rule
 */
export function createRoutingRule(
  db: Database,
  rule: Omit<AgentRoutingRule, 'id' | 'createdAt' | 'updatedAt'>
): AgentRoutingRule {
  const now = Date.now();
  const id = randomUUID();

  db.prepare(
    `INSERT INTO agent_routing_rules (id, name, agent_id, rule_type, condition_json, priority, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    rule.name,
    rule.agentId,
    rule.ruleType,
    rule.conditionJson,
    rule.priority,
    rule.enabled ? 1 : 0,
    now,
    now
  );

  return {
    ...rule,
    id,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Update a routing rule
 */
export function updateRoutingRule(
  db: Database,
  ruleId: string,
  updates: Partial<Omit<AgentRoutingRule, 'id' | 'createdAt' | 'updatedAt'>>
): AgentRoutingRule | undefined {
  const existing = db.prepare('SELECT * FROM agent_routing_rules WHERE id = ?').get(ruleId) as
    | RoutingRuleRow
    | undefined;
  if (!existing) return undefined;

  const now = Date.now();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.agentId !== undefined) {
    fields.push('agent_id = ?');
    values.push(updates.agentId);
  }
  if (updates.ruleType !== undefined) {
    fields.push('rule_type = ?');
    values.push(updates.ruleType);
  }
  if (updates.conditionJson !== undefined) {
    fields.push('condition_json = ?');
    values.push(updates.conditionJson);
  }
  if (updates.priority !== undefined) {
    fields.push('priority = ?');
    values.push(updates.priority);
  }
  if (updates.enabled !== undefined) {
    fields.push('enabled = ?');
    values.push(updates.enabled ? 1 : 0);
  }

  fields.push('updated_at = ?');
  values.push(now);
  values.push(ruleId);

  db.prepare(`UPDATE agent_routing_rules SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  return {
    id: ruleId,
    name: updates.name ?? existing.name,
    agentId: updates.agentId ?? existing.agent_id,
    ruleType: updates.ruleType ?? (existing.rule_type as RuleType),
    conditionJson: updates.conditionJson ?? existing.condition_json,
    priority: updates.priority ?? existing.priority,
    enabled: updates.enabled ?? existing.enabled === 1,
    createdAt: existing.created_at,
    updatedAt: now,
  };
}

/**
 * Delete a routing rule
 */
export function deleteRoutingRule(db: Database, ruleId: string): boolean {
  const result = db.prepare('DELETE FROM agent_routing_rules WHERE id = ?').run(ruleId);
  return result.changes > 0;
}

/**
 * Get all routing rules
 */
export function getRoutingRules(db: Database, enabledOnly: boolean = false): AgentRoutingRule[] {
  let query = 'SELECT * FROM agent_routing_rules';
  if (enabledOnly) {
    query += ' WHERE enabled = 1';
  }
  query += ' ORDER BY priority DESC, created_at ASC';

  const results = db.prepare(query).all() as RoutingRuleRow[];
  return results.map(mapRowToRule);
}

/**
 * Get routing rules for an agent
 */
export function getAgentRoutingRules(db: Database, agentId: string): AgentRoutingRule[] {
  const results = db
    .prepare(
      'SELECT * FROM agent_routing_rules WHERE agent_id = ? ORDER BY priority DESC, created_at ASC'
    )
    .all(agentId) as RoutingRuleRow[];
  return results.map(mapRowToRule);
}

/**
 * Get a routing rule by ID
 */
export function getRoutingRule(db: Database, ruleId: string): AgentRoutingRule | undefined {
  const result = db.prepare('SELECT * FROM agent_routing_rules WHERE id = ?').get(ruleId) as
    | RoutingRuleRow
    | undefined;
  if (!result) return undefined;
  return mapRowToRule(result);
}

/**
 * Route a message to the appropriate agent
 */
export function routeMessage(
  db: Database,
  message: {
    content: string;
    channelType?: string;
    senderId?: string;
    sessionId?: string;
  },
  fallbackAgentId?: string
): RoutingResult {
  const rules = getRoutingRules(db, true);

  for (const rule of rules) {
    const condition = JSON.parse(rule.conditionJson) as RoutingCondition;

    try {
      let matches = false;
      let confidence = 0.5;

      switch (rule.ruleType) {
        case 'keyword':
          matches = checkKeywordMatch(message.content, condition.keywords || []);
          confidence = condition.keywords?.some((k) =>
            message.content.toLowerCase().includes(k.toLowerCase())
          )
            ? 0.8
            : 0.5;
          break;

        case 'pattern':
          matches = checkPatternMatch(message.content, condition.pattern || '');
          confidence = 0.7;
          break;

        case 'channel':
          matches = condition.channelTypes?.includes(message.channelType || '') || false;
          confidence = 0.9;
          break;

        case 'sender':
          matches = condition.senderIds?.includes(message.senderId || '') || false;
          confidence = 0.95;
          break;

        case 'llm_classification':
          // LLM classification would be handled separately
          // This is a placeholder for future implementation
          matches = false;
          confidence = 0.6;
          break;
      }

      if (matches) {
        return {
          agentId: rule.agentId,
          confidence,
          matchedRule: rule.id,
          reason: `Matched rule "${rule.name}" (${rule.ruleType})`,
        };
      }
    } catch (error) {
      console.error(`Error evaluating routing rule ${rule.id}:`, error);
    }
  }

  // Fallback
  if (fallbackAgentId) {
    return {
      agentId: fallbackAgentId,
      confidence: 0.1,
      reason: 'No matching rules, using fallback agent',
    };
  }

  return {
    agentId: '',
    confidence: 0,
    reason: 'No matching rules and no fallback agent available',
  };
}

/**
 * Check if message content contains any of the keywords
 */
function checkKeywordMatch(content: string, keywords: string[]): boolean {
  const lowerContent = content.toLowerCase();
  return keywords.some((keyword) => lowerContent.includes(keyword.toLowerCase()));
}

/**
 * Check if message content matches a regex pattern
 */
function checkPatternMatch(content: string, pattern: string): boolean {
  try {
    const regex = new RegExp(pattern, 'i');
    return regex.test(content);
  } catch {
    return false;
  }
}

/**
 * Reorder routing rules by priority
 */
export function reorderRoutingRules(db: Database, ruleIds: string[]): void {
  const stmt = db.prepare(
    'UPDATE agent_routing_rules SET priority = ?, updated_at = ? WHERE id = ?'
  );
  const now = Date.now();

  const transaction = db.transaction(() => {
    ruleIds.forEach((id, index) => {
      // Higher priority = lower number, so reverse
      const priority = ruleIds.length - index;
      stmt.run(priority, now, id);
    });
  });

  transaction();
}

/**
 * Enable or disable a routing rule
 */
export function setRoutingRuleEnabled(db: Database, ruleId: string, enabled: boolean): boolean {
  const result = db
    .prepare('UPDATE agent_routing_rules SET enabled = ?, updated_at = ? WHERE id = ?')
    .run(enabled ? 1 : 0, Date.now(), ruleId);
  return result.changes > 0;
}

/**
 * Test a routing rule against a message
 */
export function testRoutingRule(
  db: Database,
  ruleId: string,
  message: { content: string; channelType?: string; senderId?: string }
): { matches: boolean; confidence: number; reason: string } {
  const rule = getRoutingRule(db, ruleId);
  if (!rule) {
    return {
      matches: false,
      confidence: 0,
      reason: 'Rule not found',
    };
  }

  const condition = JSON.parse(rule.conditionJson) as RoutingCondition;

  try {
    let matches = false;
    let confidence = 0.5;

    switch (rule.ruleType) {
      case 'keyword':
        matches = checkKeywordMatch(message.content, condition.keywords || []);
        confidence = matches ? 0.8 : 0;
        break;

      case 'pattern':
        matches = checkPatternMatch(message.content, condition.pattern || '');
        confidence = matches ? 0.7 : 0;
        break;

      case 'channel':
        matches = condition.channelTypes?.includes(message.channelType || '') || false;
        confidence = matches ? 0.9 : 0;
        break;

      case 'sender':
        matches = condition.senderIds?.includes(message.senderId || '') || false;
        confidence = matches ? 0.95 : 0;
        break;

      case 'llm_classification':
        matches = false;
        confidence = 0;
        break;
    }

    return {
      matches,
      confidence,
      reason: matches
        ? `Message matches ${rule.ruleType} rule`
        : `Message does not match ${rule.ruleType} rule`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      matches: false,
      confidence: 0,
      reason: `Error evaluating rule: ${errorMessage}`,
    };
  }
}

/**
 * Map database row to AgentRoutingRule interface
 */
function mapRowToRule(row: RoutingRuleRow): AgentRoutingRule {
  return {
    id: row.id,
    name: row.name,
    agentId: row.agent_id,
    ruleType: row.rule_type as RuleType,
    conditionJson: row.condition_json,
    priority: row.priority,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Get routing statistics
 */
export function getRoutingStats(db: Database): {
  totalRules: number;
  enabledRules: number;
  rulesByType: Record<string, number>;
  rulesByAgent: Record<string, number>;
} {
  const total = db.prepare('SELECT COUNT(*) as count FROM agent_routing_rules').get() as {
    count: number;
  };
  const enabled = db
    .prepare('SELECT COUNT(*) as count FROM agent_routing_rules WHERE enabled = 1')
    .get() as { count: number };

  const byType = db
    .prepare('SELECT rule_type, COUNT(*) as count FROM agent_routing_rules GROUP BY rule_type')
    .all() as Array<{ rule_type: string; count: number }>;

  const byAgent = db
    .prepare('SELECT agent_id, COUNT(*) as count FROM agent_routing_rules GROUP BY agent_id')
    .all() as Array<{ agent_id: string; count: number }>;

  const rulesByType: Record<string, number> = {};
  for (const row of byType) {
    rulesByType[row.rule_type] = row.count;
  }

  const rulesByAgent: Record<string, number> = {};
  for (const row of byAgent) {
    rulesByAgent[row.agent_id] = row.count;
  }

  return {
    totalRules: total.count,
    enabledRules: enabled.count,
    rulesByType,
    rulesByAgent,
  };
}
