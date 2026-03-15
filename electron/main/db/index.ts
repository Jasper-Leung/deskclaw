import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';
import crypto from 'crypto';
import { initializePresetWorkflows } from './preset-workflows.js';
import { dbLogger } from '../lib/logger.js';

// Get the app data directory
const getAppDataPath = () => {
  const userDataPath = app.getPath('userData');
  const dbDir = path.join(userDataPath, 'data');

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  return path.join(dbDir, 'deskclaw.db');
};

// Get or create encryption key
const getEncryptionKey = (): Buffer => {
  const userDataPath = app.getPath('userData');
  const keyPath = path.join(userDataPath, '.encryption-key');

  // Check if key file exists
  if (fs.existsSync(keyPath)) {
    const key = fs.readFileSync(keyPath);
    if (key.length === 32) {
      return key;
    }
    // If key is invalid, regenerate it
  }

  // Generate new key and save it
  const key = crypto.randomBytes(32);
  fs.writeFileSync(keyPath, key);
  return key;
};

// Encryption utilities
const ENCRYPTION_KEY = process.env.DESKCLAW_ENCRYPTION_KEY
  ? Buffer.from(process.env.DESKCLAW_ENCRYPTION_KEY, 'hex')
  : getEncryptionKey();
const ALGORITHM = 'aes-256-gcm';

export const encrypt = (text: string): string => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
};

export const decrypt = (encrypted: string): string => {
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  try {
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encryptedData = parts[2];

    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch {
    throw new Error(
      'Failed to decrypt API key. This can happen if the app was recently updated. ' +
        'Please delete and re-add your provider to fix this issue.'
    );
  }
};

// Database initialization
export const initDatabase = (): Database.Database => {
  const dbPath = getAppDataPath();
  const db = new Database(dbPath);

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Create tables
  createTables(db);

  return db;
};

const createTables = (db: Database.Database): void => {
  // Providers table
  db.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      protocol TEXT NOT NULL CHECK(protocol IN ('openai', 'anthropic', 'ollama', 'custom')),
      base_url TEXT,
      api_key_encrypted TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Models table
  db.exec(`
    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      model_id TEXT NOT NULL,
      display_name TEXT,
      is_custom INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (provider_id) REFERENCES providers(id)
    )
  `);

  // Agents table
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      model_id TEXT,
      system_prompt TEXT,
      temperature REAL DEFAULT 0.7,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      agent_id TEXT,
      title TEXT NOT NULL,
      messages_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Workflows table
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      definition_json TEXT NOT NULL,
      is_preset INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Workflow versions table - Track workflow version history
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_versions (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      definition_json TEXT NOT NULL,
      change_description TEXT,
      created_at INTEGER NOT NULL,
      created_by TEXT,
      UNIQUE(workflow_id, version)
    )
  `);

  // Workflow executions table - Track workflow execution history
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_executions (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      workflow_version INTEGER,
      status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled')) DEFAULT 'pending',
      started_at INTEGER,
      completed_at INTEGER,
      duration_ms INTEGER,
      input_data_json TEXT,
      output_data_json TEXT,
      error_text TEXT,
      node_results_json TEXT,
      triggered_by TEXT CHECK(triggered_by IN ('manual', 'scheduled', 'api', 'sub_workflow', 'automation')),
      trigger_source_id TEXT,
      created_at INTEGER NOT NULL
    )
  `);

  // Memories table
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      content TEXT NOT NULL,
      embedding TEXT,
      importance REAL DEFAULT 1.0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER,
      metadata TEXT,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
    )
  `);

  // Memory access tracking table - for importance adjustment
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_access_tracking (
      id TEXT PRIMARY KEY,
      memory_id TEXT NOT NULL,
      access_type TEXT NOT NULL CHECK(access_type IN ('retrieved', 'viewed', 'edited', 'referenced')),
      retrieval_rank INTEGER,
      retrieval_count INTEGER,
      session_id TEXT,
      query TEXT,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_memory_access_memory ON memory_access_tracking(memory_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_memory_access_type ON memory_access_tracking(access_type, timestamp);
  `);

  // Scheduled tasks table - supports multiple task types
  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      task_type TEXT NOT NULL CHECK(task_type IN ('workflow', 'tool', 'command', 'prompt', 'reminder', 'skill')),
      cron_expression TEXT NOT NULL,
      task_config TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      one_time INTEGER DEFAULT 0,
      last_run INTEGER,
      last_result TEXT,
      session_id TEXT,
      created_at INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Skills table
  db.exec(`
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      schema_json TEXT,
      code TEXT,
      metadata_json TEXT,
      license TEXT,
      allowed_tools TEXT,
      content TEXT,
      is_builtin INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Quick Chat Settings - Quick Chat 的专属 Agent 和配置
  db.exec(`
    CREATE TABLE IF NOT EXISTS quick_chat_settings (
      id TEXT PRIMARY KEY,
      agent_id TEXT,
      model_id TEXT,
      system_prompt TEXT,
      temperature REAL DEFAULT 0.7,
      memory_enabled INTEGER DEFAULT 1,
      memory_max_count INTEGER DEFAULT 5,
      memory_min_importance REAL DEFAULT 0.5,
      auto_create_memories INTEGER DEFAULT 1,
      selected_tools TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
    )
  `);

  // Migrations: Add missing columns if they don't exist
  try {
    db.exec(`ALTER TABLE quick_chat_settings ADD COLUMN selected_tools TEXT`);
  } catch {
    // Column already exists, ignore
  }

  try {
    db.exec(`ALTER TABLE scheduled_tasks ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0`);
  } catch {
    // Column already exists, ignore
  }

  // Migration: Recreate scheduled_tasks table with new schema
  try {
    const tableInfo = db.prepare('PRAGMA table_info(scheduled_tasks)').all() as any[];
    const hasTaskType = tableInfo.some((col) => col.name === 'task_type');

    if (!hasTaskType) {
      // Backup and recreate table with new schema
      db.exec(`
        CREATE TABLE IF NOT EXISTS scheduled_tasks_new (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          task_type TEXT NOT NULL CHECK(task_type IN ('workflow', 'tool', 'command', 'prompt', 'reminder')),
          cron_expression TEXT NOT NULL,
          task_config TEXT NOT NULL,
          enabled INTEGER DEFAULT 1,
          last_run INTEGER,
          last_result TEXT,
          created_at INTEGER NOT NULL DEFAULT 0
        )
      `);
      db.exec(`DROP TABLE scheduled_tasks`);
      db.exec(`ALTER TABLE scheduled_tasks_new RENAME TO scheduled_tasks`);
      dbLogger.info('Migrated scheduled_tasks table to new schema');
    }
  } catch (error) {
    dbLogger.error(error as Error, 'Migration error');
  }

  // Migration for workflows table - add description and is_preset columns
  try {
    db.exec(`ALTER TABLE workflows ADD COLUMN description TEXT`);
  } catch {
    // Column already exists, ignore
  }

  try {
    db.exec(`ALTER TABLE workflows ADD COLUMN is_preset INTEGER DEFAULT 0`);
  } catch {
    // Column already exists, ignore
  }

  // Migration: Add one_time column to scheduled_tasks
  try {
    db.exec(`ALTER TABLE scheduled_tasks ADD COLUMN one_time INTEGER DEFAULT 0`);
  } catch {
    // Column already exists, ignore
  }

  // Migration: Add session_id column to scheduled_tasks
  try {
    db.exec(`ALTER TABLE scheduled_tasks ADD COLUMN session_id TEXT`);
  } catch {
    // Column already exists, ignore
  }

  // Migration: Add skill to task_type check constraint
  // SQLite doesn't support ALTER CONSTRAINT, so we need to recreate the table
  try {
    const tableInfo = db.prepare('PRAGMA table_info(scheduled_tasks)').all() as any[];
    const hasSkillType = tableInfo.some((col) => col.name === 'task_type');

    if (hasSkillType) {
      // Check if 'skill' is in the check constraint by trying to insert a test value
      // If it fails, we need to migrate
      const testStmt = db.prepare(`
        INSERT INTO scheduled_tasks (id, name, task_type, cron_expression, task_config, enabled, one_time, created_at)
        VALUES ('test-skill-migration', 'test', 'skill', '* * * * *', '{}', 0, 1, 1)
      `);

      try {
        testStmt.run();
        // Clean up test row
        db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run('test-skill-migration');
      } catch {
        // Migration needed - recreate table
        dbLogger.info('Migrating scheduled_tasks table to support skill task type');

        // Backup data
        const backupData = db.prepare('SELECT * FROM scheduled_tasks').all();

        // Drop old table
        db.exec('DROP TABLE scheduled_tasks');

        // Create new table with updated constraint
        db.exec(`
          CREATE TABLE scheduled_tasks (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            task_type TEXT NOT NULL CHECK(task_type IN ('workflow', 'tool', 'command', 'prompt', 'reminder', 'skill')),
            cron_expression TEXT NOT NULL,
            task_config TEXT NOT NULL,
            enabled INTEGER DEFAULT 1,
            one_time INTEGER DEFAULT 0,
            last_run INTEGER,
            last_result TEXT,
            session_id TEXT,
            created_at INTEGER NOT NULL DEFAULT 0
          )
        `);

        // Restore data (excluding skill type which didn't exist before)
        const insertStmt = db.prepare(`
          INSERT INTO scheduled_tasks (id, name, task_type, cron_expression, task_config, enabled, one_time, last_run, last_result, session_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const row of backupData as any) {
          insertStmt.run(
            row.id,
            row.name,
            row.task_type,
            row.cron_expression,
            row.task_config,
            row.enabled,
            row.one_time,
            row.last_run,
            row.last_result,
            row.session_id || null,
            row.created_at
          );
        }

        dbLogger.info('Successfully migrated scheduled_tasks table');
      }
    }
  } catch {
    // Table doesn't exist or other error, skip
  }

  // Migration: Add new columns to skills table for metadata
  try {
    db.exec(`ALTER TABLE skills ADD COLUMN metadata_json TEXT`);
  } catch {
    // Column already exists, ignore
  }
  try {
    db.exec(`ALTER TABLE skills ADD COLUMN license TEXT`);
  } catch {
    // Column already exists, ignore
  }
  try {
    db.exec(`ALTER TABLE skills ADD COLUMN allowed_tools TEXT`);
  } catch {
    // Column already exists, ignore
  }
  try {
    db.exec(`ALTER TABLE skills ADD COLUMN content TEXT`);
  } catch {
    // Column already exists, ignore
  }
  try {
    db.exec(`ALTER TABLE skills ADD COLUMN is_builtin INTEGER DEFAULT 0`);
  } catch {
    // Column already exists, ignore
  }
  try {
    db.exec(`ALTER TABLE skills ADD COLUMN enabled INTEGER DEFAULT 1`);
  } catch {
    // Column already exists, ignore
  }

  // Migration: Add columns for scripts and dependencies
  try {
    db.exec(`ALTER TABLE skills ADD COLUMN scripts_json TEXT`);
  } catch {
    // Column already exists, ignore
  }
  try {
    db.exec(`ALTER TABLE skills ADD COLUMN dependencies_json TEXT`);
  } catch {
    // Column already exists, ignore
  }
  try {
    db.exec(`ALTER TABLE skills ADD COLUMN skill_dir TEXT`);
  } catch {
    // Column already exists, ignore
  }

  // Migration: Add CDP endpoint column to browser_profiles for connecting to existing browsers
  try {
    db.exec(`ALTER TABLE browser_profiles ADD COLUMN cdp_endpoint TEXT`);
  } catch {
    // Column already exists, ignore
  }

  // Channels table
  db.exec(`
    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      channel_type TEXT NOT NULL,
      account_id TEXT NOT NULL,
      name TEXT,
      enabled INTEGER DEFAULT 1,
      config_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Channel messages table
  db.exec(`
    CREATE TABLE IF NOT EXISTS channel_messages (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      peer_id TEXT NOT NULL,
      peer_type TEXT NOT NULL CHECK(peer_type IN ('direct', 'group', 'channel', 'thread')),
      direction TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound')),
      content TEXT,
      metadata_json TEXT,
      timestamp INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  // Browser profiles table
  db.exec(`
    CREATE TABLE IF NOT EXISTS browser_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      user_data_dir TEXT,
      headless INTEGER DEFAULT 1,
      viewport_width INTEGER DEFAULT 1280,
      viewport_height INTEGER DEFAULT 720,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Browser sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS browser_sessions (
      id TEXT PRIMARY KEY,
      profile_id TEXT,
      page_id TEXT NOT NULL,
      url TEXT,
      title TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // ============================================================================
  // DeskClaw Enhanced Features - New Tables for OpenClaw-like Functionality
  // ============================================================================

  // 1. TOOL SYSTEM ENHANCEMENT TABLES

  // Tools registry - Central registry for all tools
  db.exec(`
    CREATE TABLE IF NOT EXISTS tools (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      description TEXT,
      schema_json TEXT NOT NULL,
      code TEXT,
      handler_type TEXT CHECK(handler_type IN ('builtin', 'custom', 'skill')) DEFAULT 'builtin',
      permissions_json TEXT,
      enabled INTEGER DEFAULT 1,
      is_builtin INTEGER DEFAULT 0,
      version TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Agent tool permissions - Control which agents can use which tools
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_tool_permissions (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      tool_id TEXT NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
      permission_level TEXT CHECK(permission_level IN ('allowed', 'require_approval', 'blocked')) DEFAULT 'allowed',
      max_calls_per_hour INTEGER DEFAULT 100,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(agent_id, tool_id)
    )
  `);

  // Tool execution logs - Monitor tool usage
  db.exec(`
    CREATE TABLE IF NOT EXISTS tool_executions (
      id TEXT PRIMARY KEY,
      tool_id TEXT NOT NULL REFERENCES tools(id),
      agent_id TEXT REFERENCES agents(id),
      session_id TEXT REFERENCES sessions(id),
      parameters_json TEXT,
      result_json TEXT,
      error_text TEXT,
      execution_time_ms INTEGER,
      status TEXT CHECK(status IN ('success', 'error', 'blocked')) NOT NULL,
      timestamp INTEGER NOT NULL
    )
  `);

  // 2. MULTI-AGENT ROUTING TABLES

  // Agent routing rules - Define when to use which agent
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_routing_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      rule_type TEXT CHECK(rule_type IN ('keyword', 'pattern', 'llm_classification', 'channel', 'sender')) NOT NULL,
      condition_json TEXT NOT NULL,
      priority INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Agent handoffs - Track when conversations are transferred between agents
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_handoffs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      from_agent_id TEXT REFERENCES agents(id),
      to_agent_id TEXT REFERENCES agents(id),
      reason TEXT,
      context_json TEXT,
      timestamp INTEGER NOT NULL
    )
  `);

  // 3. CROSS-CHANNEL SESSIONS TABLES

  // Unified conversations - Track conversations across multiple channels
  db.exec(`
    CREATE TABLE IF NOT EXISTS unified_conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      participant_identity TEXT NOT NULL,
      channels_involved_json TEXT NOT NULL,
      metadata_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Channel session mappings - Link channel sessions to unified conversations
  db.exec(`
    CREATE TABLE IF NOT EXISTS channel_session_mappings (
      id TEXT PRIMARY KEY,
      unified_conversation_id TEXT NOT NULL REFERENCES unified_conversations(id) ON DELETE CASCADE,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
      peer_id TEXT NOT NULL,
      role_in_conversation TEXT CHECK(role_in_conversation IN ('primary', 'secondary', 'observer')),
      joined_at INTEGER NOT NULL,
      left_at INTEGER
    )
  `);

  // Cross-channel context - Maintain context across channels
  db.exec(`
    CREATE TABLE IF NOT EXISTS cross_channel_context (
      id TEXT PRIMARY KEY,
      unified_conversation_id TEXT NOT NULL REFERENCES unified_conversations(id) ON DELETE CASCADE,
      channel_id TEXT NOT NULL,
      context_summary TEXT,
      key_points_json TEXT,
      last_sync INTEGER NOT NULL
    )
  `);

  // 4. PERMISSION CONTROL SYSTEM TABLES

  // Channel permissions - Fine-grained access control
  db.exec(`
    CREATE TABLE IF NOT EXISTS channel_permissions (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      permission_type TEXT CHECK(permission_type IN ('allow_from', 'block_from', 'allow_command', 'block_command', 'allow_mention', 'require_mention')) NOT NULL,
      rule_value TEXT NOT NULL,
      priority INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    )
  `);

  // Rate limit rules - Prevent abuse
  db.exec(`
    CREATE TABLE IF NOT EXISTS rate_limit_rules (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      limit_type TEXT CHECK(limit_type IN ('total', 'per_user', 'per_command')) NOT NULL,
      max_requests INTEGER NOT NULL,
      window_seconds INTEGER NOT NULL,
      block_action TEXT CHECK(block_action IN ('reject', 'queue', 'throttle')) DEFAULT 'reject',
      created_at INTEGER NOT NULL
    )
  `);

  // Group mention rules - Control who can trigger group mentions
  db.exec(`
    CREATE TABLE IF NOT EXISTS group_mention_rules (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      group_pattern TEXT NOT NULL,
      required_permission TEXT CHECK(required_permission IN ('anyone', 'admin', 'specific_user')) NOT NULL,
      allowed_users_json TEXT,
      created_at INTEGER NOT NULL
    )
  `);

  // 5. ENHANCED DASHBOARD TABLES

  // Channel health metrics - Monitor channel connectivity and performance
  db.exec(`
    CREATE TABLE IF NOT EXISTS channel_health_metrics (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      metric_type TEXT CHECK(metric_type IN ('connectivity', 'response_time', 'error_rate', 'message_count')) NOT NULL,
      value REAL NOT NULL,
      timestamp INTEGER NOT NULL
    )
  `);

  // Dashboard snapshots - Periodic snapshots for historical analysis
  db.exec(`
    CREATE TABLE IF NOT EXISTS dashboard_snapshots (
      id TEXT PRIMARY KEY,
      snapshot_time INTEGER NOT NULL,
      total_messages INTEGER DEFAULT 0,
      active_channels INTEGER DEFAULT 0,
      total_agents INTEGER DEFAULT 0,
      active_workflows INTEGER DEFAULT 0,
      system_health_score REAL,
      metadata_json TEXT
    )
  `);

  // Activity feed - Real-time activity tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_feed (
      id TEXT PRIMARY KEY,
      activity_type TEXT CHECK(activity_type IN ('message', 'agent_action', 'workflow_execution', 'system_event', 'error')) NOT NULL,
      source_type TEXT CHECK(source_type IN ('channel', 'agent', 'workflow', 'system')) NOT NULL,
      source_id TEXT NOT NULL,
      description TEXT NOT NULL,
      metadata_json TEXT,
      timestamp INTEGER NOT NULL
    )
  `);

  // Message audit log - Comprehensive message tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS message_audit_log (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      channel_id TEXT REFERENCES channels(id) ON DELETE SET NULL,
      session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
      agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
      action_type TEXT CHECK(action_type IN ('received', 'processed', 'responded', 'error', 'blocked')) NOT NULL,
      details_json TEXT,
      timestamp INTEGER NOT NULL
    )
  `);

  // 6. SEMANTIC SEARCH & RAG TABLES

  // Message embeddings - Store vector embeddings for messages
  db.exec(`
    CREATE TABLE IF NOT EXISTS message_embeddings (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES channel_messages(id) ON DELETE CASCADE,
      embedding TEXT NOT NULL,
      embedding_model TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  // Semantic index - General semantic search index
  db.exec(`
    CREATE TABLE IF NOT EXISTS semantic_index (
      id TEXT PRIMARY KEY,
      content_type TEXT CHECK(content_type IN ('message', 'memory', 'document')) NOT NULL,
      content_id TEXT NOT NULL,
      chunk_text TEXT NOT NULL,
      embedding TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  // RAG context cache - Cache retrieved contexts
  db.exec(`
    CREATE TABLE IF NOT EXISTS rag_context_cache (
      id TEXT PRIMARY KEY,
      query_hash TEXT NOT NULL UNIQUE,
      retrieved_contexts_json TEXT NOT NULL,
      cache_hit_count INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      last_accessed INTEGER NOT NULL
    )
  `);

  // 7. VISUAL AUTOMATION ENHANCEMENT TABLES

  // Automation triggers - Enhanced trigger system
  db.exec(`
    CREATE TABLE IF NOT EXISTS automation_triggers (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      trigger_type TEXT CHECK(trigger_type IN ('schedule', 'channel_event', 'system_event', 'webhook', 'conditional')) NOT NULL,
      trigger_config_json TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      last_triggered INTEGER,
      next_trigger INTEGER,
      created_at INTEGER NOT NULL
    )
  `);

  // Channel event subscriptions - Subscribe to channel events
  db.exec(`
    CREATE TABLE IF NOT EXISTS channel_event_subscriptions (
      id TEXT PRIMARY KEY,
      trigger_id TEXT NOT NULL REFERENCES automation_triggers(id) ON DELETE CASCADE,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      event_type TEXT CHECK(event_type IN ('message_received', 'message_sent', 'user_joined', 'user_left', 'channel_mention', 'keyword')) NOT NULL,
      filter_json TEXT,
      created_at INTEGER NOT NULL
    )
  `);

  // Automation executions - Track automation run history
  db.exec(`
    CREATE TABLE IF NOT EXISTS automation_executions (
      id TEXT PRIMARY KEY,
      trigger_id TEXT NOT NULL REFERENCES automation_triggers(id) ON DELETE CASCADE,
      workflow_id TEXT NOT NULL REFERENCES workflows(id),
      status TEXT CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled')) NOT NULL,
      input_data_json TEXT,
      output_data_json TEXT,
      error_text TEXT,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      duration_ms INTEGER
    )
  `);

  // Webhook endpoints - Webhook trigger support
  db.exec(`
    CREATE TABLE IF NOT EXISTS webhook_endpoints (
      id TEXT PRIMARY KEY,
      trigger_id TEXT NOT NULL REFERENCES automation_triggers(id) ON DELETE CASCADE,
      endpoint_path TEXT NOT NULL UNIQUE,
      secret TEXT,
      created_at INTEGER NOT NULL,
      last_called INTEGER
    )
  `);

  // ============================================================================
  // CREATE INDEXES FOR NEW TABLES
  // ============================================================================

  // Tool system indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tools_category ON tools(category);
    CREATE INDEX IF NOT EXISTS idx_tools_enabled ON tools(enabled);
    CREATE INDEX IF NOT EXISTS idx_agent_tool_permissions_agent ON agent_tool_permissions(agent_id);
    CREATE INDEX IF NOT EXISTS idx_agent_tool_permissions_tool ON agent_tool_permissions(tool_id);
    CREATE INDEX IF NOT EXISTS idx_tool_executions_tool ON tool_executions(tool_id);
    CREATE INDEX IF NOT EXISTS idx_tool_executions_agent ON tool_executions(agent_id);
    CREATE INDEX IF NOT EXISTS idx_tool_executions_timestamp ON tool_executions(timestamp);
  `);

  // Multi-agent routing indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_agent_routing_rules_agent ON agent_routing_rules(agent_id);
    CREATE INDEX IF NOT EXISTS idx_agent_routing_rules_enabled ON agent_routing_rules(enabled);
    CREATE INDEX IF NOT EXISTS idx_agent_routing_rules_priority ON agent_routing_rules(priority);
    CREATE INDEX IF NOT EXISTS idx_agent_handoffs_session ON agent_handoffs(session_id);
    CREATE INDEX IF NOT EXISTS idx_agent_handoffs_timestamp ON agent_handoffs(timestamp);
  `);

  // Cross-channel sessions indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_unified_conversations_participant ON unified_conversations(participant_identity);
    CREATE INDEX IF NOT EXISTS idx_channel_session_mappings_unified ON channel_session_mappings(unified_conversation_id);
    CREATE INDEX IF NOT EXISTS idx_channel_session_mappings_channel ON channel_session_mappings(channel_id);
    CREATE INDEX IF NOT EXISTS idx_channel_session_mappings_peer ON channel_session_mappings(peer_id);
    CREATE INDEX IF NOT EXISTS idx_cross_channel_context_unified ON cross_channel_context(unified_conversation_id);
  `);

  // Permission system indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_channel_permissions_channel ON channel_permissions(channel_id);
    CREATE INDEX IF NOT EXISTS idx_channel_permissions_type ON channel_permissions(permission_type);
    CREATE INDEX IF NOT EXISTS idx_channel_permissions_priority ON channel_permissions(priority);
    CREATE INDEX IF NOT EXISTS idx_rate_limit_rules_channel ON rate_limit_rules(channel_id);
    CREATE INDEX IF NOT EXISTS idx_group_mention_rules_channel ON group_mention_rules(channel_id);
  `);

  // Dashboard indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_channel_health_metrics_channel ON channel_health_metrics(channel_id);
    CREATE INDEX IF NOT EXISTS idx_channel_health_metrics_type ON channel_health_metrics(metric_type);
    CREATE INDEX IF NOT EXISTS idx_channel_health_metrics_timestamp ON channel_health_metrics(timestamp);
    CREATE INDEX IF NOT EXISTS idx_dashboard_snapshots_time ON dashboard_snapshots(snapshot_time);
    CREATE INDEX IF NOT EXISTS idx_activity_feed_timestamp ON activity_feed(timestamp);
    CREATE INDEX IF NOT EXISTS idx_activity_feed_type ON activity_feed(activity_type);
    CREATE INDEX IF NOT EXISTS idx_message_audit_log_timestamp ON message_audit_log(timestamp);
    CREATE INDEX IF NOT EXISTS idx_message_audit_log_message ON message_audit_log(message_id);
  `);

  // Semantic search indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_message_embeddings_message ON message_embeddings(message_id);
    CREATE INDEX IF NOT EXISTS idx_semantic_index_content ON semantic_index(content_id);
    CREATE INDEX IF NOT EXISTS idx_semantic_index_type ON semantic_index(content_type);
    CREATE INDEX IF NOT EXISTS idx_rag_context_cache_query ON rag_context_cache(query_hash);
    CREATE INDEX IF NOT EXISTS idx_rag_context_cache_accessed ON rag_context_cache(last_accessed);
  `);

  // Automation indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_automation_triggers_workflow ON automation_triggers(workflow_id);
    CREATE INDEX IF NOT EXISTS idx_automation_triggers_enabled ON automation_triggers(enabled);
    CREATE INDEX IF NOT EXISTS idx_automation_triggers_next ON automation_triggers(next_trigger);
    CREATE INDEX IF NOT EXISTS idx_channel_event_subscriptions_trigger ON channel_event_subscriptions(trigger_id);
    CREATE INDEX IF NOT EXISTS idx_channel_event_subscriptions_channel ON channel_event_subscriptions(channel_id);
    CREATE INDEX IF NOT EXISTS idx_automation_executions_trigger ON automation_executions(trigger_id);
    CREATE INDEX IF NOT EXISTS idx_automation_executions_workflow ON automation_executions(workflow_id);
    CREATE INDEX IF NOT EXISTS idx_automation_executions_status ON automation_executions(status);
    CREATE INDEX IF NOT EXISTS idx_automation_executions_started ON automation_executions(started_at);
    CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_trigger ON webhook_endpoints(trigger_id);
    CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_path ON webhook_endpoints(endpoint_path);
  `);

  // ============================================================================
  // EVOLUTION & PROACTIVE CONTENT TABLES
  // ============================================================================

  // User intents table - stores learned user behavior patterns
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_intents (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('information', 'task', 'monitoring', 'recommendation')),
      topic TEXT NOT NULL,
      keywords TEXT NOT NULL,
      confidence REAL DEFAULT 0.0,
      frequency TEXT NOT NULL CHECK(frequency IN ('realtime', 'hourly', 'daily', 'weekly')),
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

  // Predicted tasks table - auto-generated tasks based on user intents
  db.exec(`
    CREATE TABLE IF NOT EXISTS predicted_tasks (
      id TEXT PRIMARY KEY,
      intent_id TEXT NOT NULL REFERENCES user_intents(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      cron_expression TEXT NOT NULL,
      task_type TEXT NOT NULL CHECK(task_type IN ('prompt', 'workflow', 'reminder')),
      task_config TEXT NOT NULL,
      estimated_value REAL DEFAULT 0.5,
      enabled INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Content delivery log - tracks all proactive content deliveries
  db.exec(`
    CREATE TABLE IF NOT EXISTS content_deliveries (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES predicted_tasks(id) ON DELETE CASCADE,
      user_id TEXT,
      content_type TEXT NOT NULL CHECK(content_type IN ('notification', 'chat_message', 'dashboard_update', 'email')),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      data_json TEXT,
      actions_json TEXT,
      delivered INTEGER DEFAULT 1,
      viewed INTEGER DEFAULT 0,
      feedback TEXT CHECK(feedback IN ('positive', 'neutral', 'negative')),
      timestamp INTEGER NOT NULL
    )
  `);

  // Evolution events table - usage tracking for learning
  db.exec(`
    CREATE TABLE IF NOT EXISTS evolution_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      session_id TEXT NOT NULL,
      user_id TEXT,
      context_json TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    )
  `);

  // Evolution patterns table - learned behavioral patterns
  db.exec(`
    CREATE TABLE IF NOT EXISTS evolution_patterns (
      id TEXT PRIMARY KEY,
      pattern_type TEXT NOT NULL,
      pattern_data TEXT NOT NULL,
      confidence REAL DEFAULT 0.0,
      usage_count INTEGER DEFAULT 0,
      last_success INTEGER,
      last_failure INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Evolution suggestions table - generated suggestions
  db.exec(`
    CREATE TABLE IF NOT EXISTS evolution_suggestions (
      id TEXT PRIMARY KEY,
      suggestion_type TEXT NOT NULL,
      suggestion_data TEXT NOT NULL,
      priority REAL DEFAULT 0.5,
      status TEXT DEFAULT 'pending',
      user_feedback INTEGER,
      created_at INTEGER NOT NULL
    )
  `);

  // Evolution metrics history
  db.exec(`
    CREATE TABLE IF NOT EXISTS evolution_metrics (
      id TEXT PRIMARY KEY,
      metric_name TEXT NOT NULL,
      metric_value REAL NOT NULL,
      context_json TEXT,
      timestamp INTEGER NOT NULL
    )
  `);

  // ============================================================================
  // EVOLUTION INDEXES
  // ============================================================================

  db.exec(`
    -- User intents indexes
    CREATE INDEX IF NOT EXISTS idx_user_intents_type ON user_intents(type, confidence DESC);
    CREATE INDEX IF NOT EXISTS idx_user_intents_frequency ON user_intents(frequency, times_matched DESC);

    -- Predicted tasks indexes
    CREATE INDEX IF NOT EXISTS idx_predicted_tasks_intent ON predicted_tasks(intent_id);
    CREATE INDEX IF NOT EXISTS idx_predicted_tasks_enabled ON predicted_tasks(enabled, estimated_value DESC);
    CREATE INDEX IF NOT EXISTS idx_predicted_tasks_created ON predicted_tasks(created_at DESC);

    -- Content deliveries indexes
    CREATE INDEX IF NOT EXISTS idx_content_deliveries_task ON content_deliveries(task_id, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_content_deliveries_viewed ON content_deliveries(viewed, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_content_deliveries_feedback ON content_deliveries(feedback, timestamp DESC);

    -- Evolution events indexes
    CREATE INDEX IF NOT EXISTS idx_evolution_events_type ON evolution_events(event_type, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_evolution_events_session ON evolution_events(session_id, timestamp DESC);

    -- Evolution patterns indexes
    CREATE INDEX IF NOT EXISTS idx_evolution_patterns_type ON evolution_patterns(pattern_type, confidence DESC);
    CREATE INDEX IF NOT EXISTS idx_evolution_patterns_usage ON evolution_patterns(usage_count DESC);
  `);

  // ============================================================================
  // EXISTING INDEXES (Keep backward compatibility)
  // ============================================================================

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_models_provider ON models(provider_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent_id);
    CREATE INDEX IF NOT EXISTS idx_memories_agent ON memories(agent_id);
    CREATE INDEX IF NOT EXISTS idx_channel_messages_channel ON channel_messages(channel_id);
    CREATE INDEX IF NOT EXISTS idx_channel_messages_peer ON channel_messages(peer_id);
    CREATE INDEX IF NOT EXISTS idx_channel_messages_timestamp ON channel_messages(timestamp);
    CREATE INDEX IF NOT EXISTS idx_browser_sessions_profile ON browser_sessions(profile_id);
  `);

  // ============================================================================
  // WORKFLOW VERSION CONTROL INDEXES
  // ============================================================================

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_workflow_versions_workflow ON workflow_versions(workflow_id, version DESC);
    CREATE INDEX IF NOT EXISTS idx_workflow_versions_created ON workflow_versions(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow ON workflow_executions(workflow_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON workflow_executions(status, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_workflow_executions_triggered ON workflow_executions(triggered_by, created_at DESC);
  `);

  // Initialize preset workflows
  initializePresetWorkflows(db);
};

// Database instance (singleton)
let dbInstance: Database.Database | null = null;

export const getDatabase = (): Database.Database => {
  if (!dbInstance) {
    dbInstance = initDatabase();
  }
  return dbInstance;
};

export const closeDatabase = (): void => {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
};
