import type { DbConnection } from "../db/connection.js";
import { createConnection } from "../db/connection.js";

/** Metadata for a database backup. */
export interface BackupMetadata {
  readonly path: string;
  readonly sizeBytes: number;
  readonly migrationCount: number;
  readonly tableCount: number;
  readonly createdAt: string;
}

/** Creates a backup of the current database to a file path. */
export async function createBackup(
  source: DbConnection,
  backupPath: string,
): Promise<BackupMetadata> {
  const { statSync } = await import("node:fs");

  // Use SQLite backup API via better-sqlite3 (returns a Promise)
  await source.db.backup(backupPath);

  const migrationCount = (
    source.db.prepare("SELECT COUNT(*) as count FROM _migrations").get() as { count: number }
  ).count;

  const tableCount = (
    source.db.prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'").get() as {
      count: number;
    }
  ).count;

  const stats = statSync(backupPath);

  return {
    path: backupPath,
    sizeBytes: stats.size,
    migrationCount,
    tableCount,
    createdAt: new Date().toISOString(),
  };
}

/** Opens a backup file as a new database connection for verification. */
export function openBackup(backupPath: string): DbConnection {
  return createConnection({ path: backupPath, readonly: true });
}

/** Gets the backup file info without opening the database. */
export async function getBackupInfo(
  backupPath: string,
): Promise<{ exists: boolean; sizeBytes: number }> {
  const { existsSync, statSync } = await import("node:fs");
  if (!existsSync(backupPath)) {
    return { exists: false, sizeBytes: 0 };
  }
  const stats = statSync(backupPath);
  return { exists: true, sizeBytes: stats.size };
}
