import type { DbConnection } from "./connection.js";

/** A single migration: name and up function. */
export interface Migration {
  readonly name: string;
  up(db: DbConnection): void;
}

/** Default migrations table name. */
const MIGRATIONS_TABLE = "_migrations";

/** Ensures the migrations tracking table exists. */
function ensureMigrationsTable(conn: DbConnection): void {
  conn.db.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

/** Returns the set of already-applied migration names. */
function appliedNames(conn: DbConnection): Set<string> {
  const rows = conn.db.prepare(`SELECT name FROM ${MIGRATIONS_TABLE} ORDER BY name`).all() as {
    name: string;
  }[];
  return new Set(rows.map((r) => r.name));
}

/** Applies all pending migrations in order. Returns names of newly-applied migrations. */
export function migrate(conn: DbConnection, migrations: Migration[]): string[] {
  ensureMigrationsTable(conn);
  const applied = appliedNames(conn);
  const appliedNow: string[] = [];

  for (const m of migrations) {
    if (applied.has(m.name)) continue;
    conn.db.exec("BEGIN");
    try {
      m.up(conn);
      conn.db.prepare(`INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES (?)`).run(m.name);
      conn.db.exec("COMMIT");
      appliedNow.push(m.name);
    } catch (err) {
      conn.db.exec("ROLLBACK");
      throw err;
    }
  }

  return appliedNow;
}

/** Returns the list of migrations that have been applied. */
export function listApplied(conn: DbConnection): string[] {
  ensureMigrationsTable(conn);
  const rows = conn.db.prepare(`SELECT name FROM ${MIGRATIONS_TABLE} ORDER BY name`).all() as {
    name: string;
  }[];
  return rows.map((r) => r.name);
}
