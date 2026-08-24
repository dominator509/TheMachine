import type { Migration } from "../db/migrator.js";

/** Persist operator release approvals so process restarts cannot silently erase them. */
export const M002_PRODUCTION_APPROVALS: Migration = {
  name: "M002_production_approvals",
  up(connection): void {
    connection.db.exec(`
      CREATE TABLE production_approvals (
        workspace_id TEXT PRIMARY KEY,
        approval_json TEXT NOT NULL,
        approved_by TEXT NOT NULL,
        approved_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_production_approvals_updated_at
        ON production_approvals(updated_at DESC);
    `);
  },
};
