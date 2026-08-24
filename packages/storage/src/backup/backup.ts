import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  copyFileSync,
  createReadStream,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import type { DbConnection } from "../db/connection.js";
import { closeConnection, createConnection } from "../db/connection.js";

export interface BackupMetadata {
  readonly path: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly migrationCount: number;
  readonly tableCount: number;
  readonly createdAt: string;
}

export interface RestoreBackupOptions {
  readonly backupPath: string;
  readonly targetPath: string;
  readonly expectedSha256?: string;
  readonly preservePrevious?: boolean;
}

export interface RestoreBackupResult {
  readonly backupPath: string;
  readonly targetPath: string;
  readonly targetSha256: string;
  readonly previousDatabasePath: string | null;
  readonly migrationCount: number;
  readonly tableCount: number;
  readonly restoredAt: string;
}

interface DatabaseVerification {
  readonly migrationCount: number;
  readonly tableCount: number;
}

async function sha256File(filePath: string): Promise<string> {
  return await new Promise<string>((resolveHash, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });
}

function syncFile(filePath: string): void {
  const descriptor = openSync(filePath, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function syncDirectory(directory: string): void {
  let descriptor: number | null = null;
  try {
    descriptor = openSync(directory, "r");
    fsyncSync(descriptor);
  } catch {
    // Directory fsync is unavailable on some Windows filesystems.
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

function countRows(connection: DbConnection): DatabaseVerification {
  const quickCheck = connection.db.pragma("quick_check", { simple: true }) as string;
  if (quickCheck !== "ok") throw new Error(`SQLite quick_check failed: ${quickCheck}`);
  const migrationTable = connection.db
    .prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='_migrations'")
    .get() as { count: number };
  const migrationCount =
    migrationTable.count === 1
      ? (connection.db.prepare("SELECT COUNT(*) AS count FROM _migrations").get() as {
          count: number;
        }).count
      : 0;
  const tableCount = (
    connection.db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table'").get() as {
      count: number;
    }
  ).count;
  return { migrationCount, tableCount };
}

function verifyDatabase(filePath: string): DatabaseVerification {
  const connection = createConnection({ path: filePath, readonly: true });
  try {
    return countRows(connection);
  } finally {
    closeConnection(connection);
  }
}

/** Create and independently verify a SQLite backup. */
export async function createBackup(
  source: DbConnection,
  backupPath: string,
): Promise<BackupMetadata> {
  if (source.readonly) throw new Error("Cannot create a backup from a readonly connection.");
  const absolutePath = resolve(backupPath);
  mkdirSync(dirname(absolutePath), { recursive: true, mode: 0o700 });
  await source.db.backup(absolutePath);
  syncFile(absolutePath);
  syncDirectory(dirname(absolutePath));
  const verified = verifyDatabase(absolutePath);
  const stats = statSync(absolutePath);
  return {
    path: absolutePath,
    sizeBytes: stats.size,
    sha256: await sha256File(absolutePath),
    migrationCount: verified.migrationCount,
    tableCount: verified.tableCount,
    createdAt: new Date().toISOString(),
  };
}

/** Open a backup file readonly for additional operator verification. */
export function openBackup(backupPath: string): DbConnection {
  return createConnection({ path: resolve(backupPath), readonly: true });
}

export async function getBackupInfo(
  backupPath: string,
): Promise<{ exists: boolean; sizeBytes: number; sha256: string | null }> {
  const absolutePath = resolve(backupPath);
  if (!existsSync(absolutePath)) return { exists: false, sizeBytes: 0, sha256: null };
  return {
    exists: true,
    sizeBytes: statSync(absolutePath).size,
    sha256: await sha256File(absolutePath),
  };
}

/**
 * Restore a verified backup to a closed SQLite database path.
 *
 * The function refuses to proceed when WAL/SHM sidecars exist because that can
 * indicate an active or incompletely checkpointed database. It copies and
 * verifies a staging database, atomically swaps paths, verifies the installed
 * database, and restores the previous database if final verification fails.
 */
export async function restoreBackup(
  options: RestoreBackupOptions,
): Promise<RestoreBackupResult> {
  const backupPath = resolve(options.backupPath);
  const targetPath = resolve(options.targetPath);
  if (backupPath === targetPath) throw new Error("Backup and target paths must differ.");
  if (!existsSync(backupPath)) throw new Error(`Backup does not exist: ${backupPath}`);
  for (const sidecar of [`${targetPath}-wal`, `${targetPath}-shm`]) {
    if (existsSync(sidecar)) {
      throw new Error(
        `Refusing restore while SQLite sidecar exists: ${sidecar}. Close the application and checkpoint the database first.`,
      );
    }
  }

  const backupDigest = await sha256File(backupPath);
  if (options.expectedSha256 && backupDigest !== options.expectedSha256.toLowerCase()) {
    throw new Error(
      `Backup checksum mismatch: expected ${options.expectedSha256.toLowerCase()}, received ${backupDigest}.`,
    );
  }
  const sourceVerification = verifyDatabase(backupPath);
  const targetDirectory = dirname(targetPath);
  mkdirSync(targetDirectory, { recursive: true, mode: 0o700 });
  const stagingPath = `${targetPath}.restore-${randomUUID()}.tmp`;
  const previousPath = existsSync(targetPath)
    ? `${targetPath}.pre-restore-${new Date().toISOString().replace(/[:.]/g, "-")}.bak`
    : null;

  copyFileSync(backupPath, stagingPath);
  syncFile(stagingPath);
  const stagingDigest = await sha256File(stagingPath);
  if (stagingDigest !== backupDigest) {
    rmSync(stagingPath, { force: true });
    throw new Error("Staging copy checksum does not match the backup.");
  }
  verifyDatabase(stagingPath);

  let previousMoved = false;
  try {
    if (previousPath) {
      renameSync(targetPath, previousPath);
      previousMoved = true;
    }
    renameSync(stagingPath, targetPath);
    syncFile(targetPath);
    syncDirectory(targetDirectory);
    const installedVerification = verifyDatabase(targetPath);
    const targetSha256 = await sha256File(targetPath);
    if (targetSha256 !== backupDigest) throw new Error("Installed database checksum mismatch.");

    if (previousPath && options.preservePrevious === false) rmSync(previousPath, { force: true });
    return {
      backupPath,
      targetPath,
      targetSha256,
      previousDatabasePath:
        previousPath && options.preservePrevious !== false ? previousPath : null,
      migrationCount: installedVerification.migrationCount,
      tableCount: installedVerification.tableCount,
      restoredAt: new Date().toISOString(),
    };
  } catch (error) {
    rmSync(stagingPath, { force: true });
    rmSync(targetPath, { force: true });
    if (previousPath && previousMoved && existsSync(previousPath)) renameSync(previousPath, targetPath);
    syncDirectory(targetDirectory);
    throw error;
  }
}
