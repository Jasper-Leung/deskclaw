/**
 * Database Migration Script for Evolution Features
 *
 * Run this script to add the evolution tables to an existing database.
 * This is a one-time migration for existing installations.
 */

import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import { existsSync, mkdirSync } from 'fs';
import { dbLogger } from '../lib/logger.js';

// ============================================================================
// Migration Versions
// ============================================================================

const MIGRATIONS = [
  {
    version: 1,
    name: 'initial_evolution_tables',
    up: (db: Database.Database) => {
      dbLogger.info('Running migration v1: initial_evolution_tables');

      // Evolution events table
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

      // Evolution patterns table
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

      // Evolution suggestions table
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

      // Evolution metrics table
      db.exec(`
        CREATE TABLE IF NOT EXISTS evolution_metrics (
          id TEXT PRIMARY KEY,
          metric_name TEXT NOT NULL,
          metric_value REAL NOT NULL,
          context_json TEXT,
          timestamp INTEGER NOT NULL
        )
      `);

      // Create indexes
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_evolution_events_type ON evolution_events(event_type, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_evolution_events_session ON evolution_events(session_id, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_evolution_patterns_type ON evolution_patterns(pattern_type, confidence DESC);
        CREATE INDEX IF NOT EXISTS idx_evolution_patterns_usage ON evolution_patterns(usage_count DESC);
      `);
    },
  },
  {
    version: 2,
    name: 'proactive_content_tables',
    up: (db: Database.Database) => {
      dbLogger.info('Running migration v2: proactive_content_tables');

      // User intents table
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

      // Predicted tasks table
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

      // Content deliveries table
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

      // Create indexes
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_user_intents_type ON user_intents(type, confidence DESC);
        CREATE INDEX IF NOT EXISTS idx_user_intents_frequency ON user_intents(frequency, times_matched DESC);
        CREATE INDEX IF NOT EXISTS idx_predicted_tasks_intent ON predicted_tasks(intent_id);
        CREATE INDEX IF NOT EXISTS idx_predicted_tasks_enabled ON predicted_tasks(enabled, estimated_value DESC);
        CREATE INDEX IF NOT EXISTS idx_predicted_tasks_created ON predicted_tasks(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_content_deliveries_task ON content_deliveries(task_id, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_content_deliveries_viewed ON content_deliveries(viewed, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_content_deliveries_feedback ON content_deliveries(feedback, timestamp DESC);
      `);
    },
  },
];

// ============================================================================
// Migration State Management
// ============================================================================

interface MigrationState {
  currentVersion: number;
  completedMigrations: string[];
}

const MIGRATION_STATE_KEY = 'evolution_migration_state';

// ============================================================================
// Migration Runner
// ============================================================================

export class EvolutionMigration {
  private db: Database.Database;
  private state: MigrationState;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.state = this.loadState();
  }

  /**
   * Get the database path
   */
  static getDatabasePath(): string {
    const userDataPath = app.getPath('userData');
    const dbDir = path.join(userDataPath, 'data');

    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    return path.join(dbDir, 'deskclaw.db');
  }

  /**
   * Load migration state from database
   */
  private loadState(): MigrationState {
    const stmt = this.db.prepare(`SELECT value FROM settings WHERE key = ?`);
    const row = stmt.get(MIGRATION_STATE_KEY) as { value: string } | undefined;

    if (row?.value) {
      try {
        return JSON.parse(row.value) as MigrationState;
      } catch {
        // Invalid state, start fresh
      }
    }

    // Check for evolution tables to determine current version
    const hasV2Tables = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_intents'")
      .get();

    return {
      currentVersion: hasV2Tables ? 2 : 0,
      completedMigrations: hasV2Tables ? ['1', '2'] : [],
    };
  }

  /**
   * Save migration state to database
   */
  private saveState(): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
    `);

    stmt.run(MIGRATION_STATE_KEY, JSON.stringify(this.state), Date.now());
  }

  /**
   * Get pending migrations
   */
  private getPendingMigrations() {
    return MIGRATIONS.filter((m) => !this.state.completedMigrations.includes(`v${m.version}`));
  }

  /**
   * Run all pending migrations
   */
  migrateUp(): {
    success: boolean;
    message: string;
    currentVersion: number;
    migratedVersions?: number[];
    error?: string;
  } {
    const pending = this.getPendingMigrations();

    if (pending.length === 0) {
      dbLogger.info('Database is up to date (evolution features)');
      return {
        success: true,
        message: 'Already up to date',
        currentVersion: this.state.currentVersion,
      };
    }

    dbLogger.info(`Found ${pending.length} pending migration(s)`);

    for (const migration of pending) {
      try {
        dbLogger.info(`Running migration v${migration.version}: ${migration.name}`);

        // Run migration
        migration.up(this.db);

        // Update state
        this.state.completedMigrations.push(`v${migration.version}`);
        this.state.currentVersion = migration.version;
        this.saveState();

        dbLogger.info(`Migration v${migration.version} completed`);
      } catch (error) {
        dbLogger.error(error as Error, `Migration v${migration.version} failed`);
        return {
          success: false,
          message: `Migration v${migration.version} failed`,
          error: String(error),
          currentVersion: this.state.currentVersion,
        };
      }
    }

    dbLogger.info('All migrations completed successfully');

    return {
      success: true,
      message: 'Migrations completed',
      migratedVersions: pending.map((m) => m.version),
      currentVersion: this.state.currentVersion,
    };
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}

// ============================================================================
// CLI Interface
// ============================================================================

/**
 * Run migrations directly
 */
export function runMigrations(): {
  success: boolean;
  message: string;
  currentVersion: number;
  migratedVersions?: number[];
  error?: string;
} {
  const dbPath = EvolutionMigration.getDatabasePath();
  const migration = new EvolutionMigration(dbPath);

  console.log('Starting evolution feature migrations...');
  console.log(`Database: ${dbPath}`);

  const result = migration.migrateUp();

  console.log('\nMigration Result:', JSON.stringify(result, null, 2));

  migration.close();

  return result;
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations();
}

// EvolutionMigration class is already exported above
