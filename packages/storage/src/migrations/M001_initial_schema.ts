import type { Migration } from "../db/migrator.js";

/**
 * M001: Initial schema — creates all core tables for The Machine.
 *
 * Tables:
 *   - workspaces: one per repository
 *   - execplans: active and historical ExecPlans
 *   - milestones: individual milestones within an ExecPlan
 *   - agent_runs: runs of an agent or runtime pass
 *   - commands: commands executed during a run
 *   - validations: validation results
 *   - decisions: decision log entries
 *   - integrations: provider/MCP/plugin configs
 *   - integration_permissions: granular permission entries
 *   - events: structured observability events
 */
export const M001_INITIAL_SCHEMA: Migration = {
  name: "M001_initial_schema",
  up(conn) {
    conn.db.exec(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY NOT NULL,
        path TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'pending',
        active_execplan_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS execplans (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        priority INTEGER NOT NULL DEFAULT 5,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
      );

      -- Enforce one active ExecPlan per workspace at the application level
      CREATE UNIQUE INDEX IF NOT EXISTS idx_execplans_active
        ON execplans(workspace_id) WHERE status = 'active';

      CREATE TABLE IF NOT EXISTS milestones (
        id TEXT PRIMARY KEY NOT NULL,
        execplan_id TEXT NOT NULL,
        label TEXT NOT NULL,
        goal TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        validation_command TEXT,
        expected_result TEXT,
        recovery_instruction TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (execplan_id) REFERENCES execplans(id)
      );

      CREATE TABLE IF NOT EXISTS agent_runs (
        id TEXT PRIMARY KEY NOT NULL,
        execplan_id TEXT NOT NULL,
        milestone_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (execplan_id) REFERENCES execplans(id),
        FOREIGN KEY (milestone_id) REFERENCES milestones(id)
      );

      CREATE TABLE IF NOT EXISTS commands (
        id TEXT PRIMARY KEY NOT NULL,
        run_id TEXT NOT NULL,
        command TEXT NOT NULL,
        exit_code INTEGER,
        stdout TEXT,
        stderr TEXT,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (run_id) REFERENCES agent_runs(id)
      );

      CREATE TABLE IF NOT EXISTS validations (
        id TEXT PRIMARY KEY NOT NULL,
        run_id TEXT NOT NULL,
        command TEXT NOT NULL,
        passed INTEGER NOT NULL DEFAULT 0,
        exit_code INTEGER,
        output TEXT,
        severity TEXT NOT NULL DEFAULT 'error',
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (run_id) REFERENCES agent_runs(id)
      );

      CREATE TABLE IF NOT EXISTS decisions (
        id TEXT PRIMARY KEY NOT NULL,
        execplan_id TEXT NOT NULL,
        decision TEXT NOT NULL,
        reason TEXT NOT NULL,
        alternatives TEXT,
        files_affected TEXT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (execplan_id) REFERENCES execplans(id)
      );

      CREATE TABLE IF NOT EXISTS integrations (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('provider', 'mcp', 'plugin')),
        name TEXT NOT NULL,
        config_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
      );

      CREATE TABLE IF NOT EXISTS integration_permissions (
        id TEXT PRIMARY KEY NOT NULL,
        integration_id TEXT NOT NULL,
        resource TEXT NOT NULL,
        actions TEXT NOT NULL,
        allowed INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (integration_id) REFERENCES integrations(id)
      );

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL,
        type TEXT NOT NULL,
        payload_json TEXT,
        severity TEXT NOT NULL DEFAULT 'info',
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
      );
    `);
  },
};
