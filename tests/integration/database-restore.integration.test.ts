import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ALL_MIGRATIONS,
  closeConnection,
  createBackup,
  createConnection,
  migrate,
  restoreBackup,
} from "@the-machine/storage";

const cleanup: string[] = [];

afterEach(() => {
  while (cleanup.length > 0) {
    const target = cleanup.pop();
    if (target) rmSync(target, { recursive: true, force: true });
  }
});

function database(directory: string, name: string, workspacePath: string): string {
  const filePath = join(directory, name);
  const connection = createConnection({ path: filePath });
  try {
    migrate(connection, ALL_MIGRATIONS);
    connection.db
      .prepare("INSERT INTO workspaces (id, path, status) VALUES (?, ?, ?)")
      .run("workspace", workspacePath, "active");
  } finally {
    closeConnection(connection);
  }
  return filePath;
}

function workspacePath(databasePath: string): string {
  const connection = createConnection({ path: databasePath, readonly: true });
  try {
    return (
      connection.db.prepare("SELECT path FROM workspaces WHERE id = ?").get("workspace") as {
        path: string;
      }
    ).path;
  } finally {
    closeConnection(connection);
  }
}

describe("verified SQLite restore", () => {
  it("atomically restores the exact backup and retains the previous database", async () => {
    const directory = mkdtempSync(join(tmpdir(), "machine-restore-"));
    cleanup.push(directory);
    const sourcePath = database(directory, "source.sqlite", "/backup-state");
    const backupPath = join(directory, "backup.sqlite");
    const source = createConnection({ path: sourcePath });
    const metadata = await createBackup(source, backupPath);
    closeConnection(source);

    const targetPath = database(directory, "target.sqlite", "/current-state");
    const result = await restoreBackup({
      backupPath,
      targetPath,
      expectedSha256: metadata.sha256,
      preservePrevious: true,
    });

    expect(result.targetSha256).toBe(metadata.sha256);
    expect(result.previousDatabasePath).not.toBeNull();
    expect(existsSync(result.previousDatabasePath ?? "")).toBe(true);
    expect(workspacePath(targetPath)).toBe("/backup-state");
    expect(workspacePath(result.previousDatabasePath ?? "")).toBe("/current-state");
  });

  it("rejects an incorrect expected checksum without modifying the target", async () => {
    const directory = mkdtempSync(join(tmpdir(), "machine-restore-checksum-"));
    cleanup.push(directory);
    const sourcePath = database(directory, "source.sqlite", "/backup-state");
    const backupPath = join(directory, "backup.sqlite");
    const source = createConnection({ path: sourcePath });
    await createBackup(source, backupPath);
    closeConnection(source);
    const targetPath = database(directory, "target.sqlite", "/current-state");

    await expect(
      restoreBackup({
        backupPath,
        targetPath,
        expectedSha256: "0".repeat(64),
      }),
    ).rejects.toThrow(/checksum mismatch/i);
    expect(workspacePath(targetPath)).toBe("/current-state");
  });

  it("refuses a restore while WAL or SHM sidecars indicate unsafe database state", async () => {
    const directory = mkdtempSync(join(tmpdir(), "machine-restore-sidecar-"));
    cleanup.push(directory);
    const sourcePath = database(directory, "source.sqlite", "/backup-state");
    const backupPath = join(directory, "backup.sqlite");
    const source = createConnection({ path: sourcePath });
    await createBackup(source, backupPath);
    closeConnection(source);
    const targetPath = database(directory, "target.sqlite", "/current-state");
    writeFileSync(`${targetPath}-wal`, "unsafe", "utf-8");

    await expect(restoreBackup({ backupPath, targetPath })).rejects.toThrow(/sidecar exists/i);
    expect(workspacePath(targetPath)).toBe("/current-state");
  });

  it("rejects a corrupt backup before touching the target", async () => {
    const directory = mkdtempSync(join(tmpdir(), "machine-restore-corrupt-"));
    cleanup.push(directory);
    const targetPath = database(directory, "target.sqlite", "/current-state");
    const backupPath = join(directory, "corrupt.sqlite");
    writeFileSync(backupPath, "not a sqlite database", "utf-8");

    await expect(restoreBackup({ backupPath, targetPath })).rejects.toThrow();
    expect(workspacePath(targetPath)).toBe("/current-state");
  });
});
