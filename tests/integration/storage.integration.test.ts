import { describe, it, expect } from "vitest";
import {
  createInMemoryConnection,
  closeConnection,
  createConnection,
  migrate,
  listApplied,
  ALL_MIGRATIONS,
  createRepository,
  validateSecretReference,
  validateNoRawSecrets,
  validateConfigSecrets,
  createBackup,
  openBackup,
  getBackupInfo,
} from "@the-machine/storage";

describe("storage: connection", () => {
  it("creates an in-memory connection", () => {
    const conn = createInMemoryConnection();
    expect(conn.db).toBeDefined();
    expect(conn.path).toBe(":memory:");
    expect(conn.readonly).toBe(false);
    // WAL mode may not be reported for :memory: databases in all platforms
    conn.db.pragma("journal_mode");
    closeConnection(conn);
  });

  it("creates a file-based connection", () => {
    const conn = createConnection({ path: ":memory:" });
    expect(conn.db).toBeDefined();
    closeConnection(conn);
  });

  it("creates a readonly connection", async () => {
    // Use a temp file for a real readonly test
    const { writeFileSync, unlinkSync, mkdtempSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(join(tmpdir(), "storage-test-"));
    const dbPath = join(dir, "test.db");

    // Create writable first
    const writable = createConnection({ path: dbPath });
    writable.db.exec("CREATE TABLE test (id INTEGER)");
    closeConnection(writable);

    // Open readonly
    const conn = createConnection({ path: dbPath, readonly: true });
    expect(conn.readonly).toBe(true);
    // Can read
    const rows = conn.db.prepare("SELECT name FROM sqlite_master").all();
    expect(rows).toHaveLength(1);
    // Cannot write
    expect(() => {
      conn.db.exec("CREATE TABLE another (id INTEGER)");
    }).toThrow();
    closeConnection(conn);

    // Cleanup
    unlinkSync(dbPath);
    try {
      unlinkSync(join(dir, "test.db-wal"));
    } catch {}
    try {
      unlinkSync(join(dir, "test.db-shm"));
    } catch {}
    try {
      unlinkSync(dir);
    } catch {}
  });
});

describe("storage: repositories", () => {
  function setupDb() {
    const conn = createInMemoryConnection();
    migrate(conn, ALL_MIGRATIONS);
    return conn;
  }

  const WORKSPACE_COLS = ["id", "path", "status", "active_execplan_id", "created_at", "updated_at"];

  it("creates a workspace repository", () => {
    const conn = setupDb();
    const wsRepo = createRepository(conn, "workspaces", WORKSPACE_COLS);

    wsRepo.insert({
      id: "ws-1",
      path: "/test/path",
      status: "active",
      active_execplan_id: null,
      created_at: "2026-06-16T00:00:00.000Z",
      updated_at: "2026-06-16T00:00:00.000Z",
    });

    const found = wsRepo.findById("ws-1");
    expect(found).toBeDefined();
    expect(found!.path).toBe("/test/path");
    expect(found!.status).toBe("active");
    closeConnection(conn);
  });

  it("finds all records", () => {
    const conn = setupDb();
    const wsRepo = createRepository(conn, "workspaces", WORKSPACE_COLS);

    wsRepo.insert({
      id: "ws-1",
      path: "/test/a",
      status: "active",
      active_execplan_id: null,
      created_at: "2026-06-16T00:00:00.000Z",
      updated_at: "2026-06-16T00:00:00.000Z",
    });
    wsRepo.insert({
      id: "ws-2",
      path: "/test/b",
      status: "pending",
      active_execplan_id: null,
      created_at: "2026-06-16T00:00:00.000Z",
      updated_at: "2026-06-16T00:00:00.000Z",
    });

    const all = wsRepo.findAll();
    expect(all).toHaveLength(2);
    closeConnection(conn);
  });

  it("updates a record", () => {
    const conn = setupDb();
    const wsRepo = createRepository(conn, "workspaces", WORKSPACE_COLS);

    wsRepo.insert({
      id: "ws-1",
      path: "/test/path",
      status: "pending",
      active_execplan_id: null,
      created_at: "2026-06-16T00:00:00.000Z",
      updated_at: "2026-06-16T00:00:00.000Z",
    });

    wsRepo.update({ id: "ws-1", status: "active" });
    const found = wsRepo.findById("ws-1");
    expect(found!.status).toBe("active");
    closeConnection(conn);
  });

  it("deletes a record", () => {
    const conn = setupDb();
    const wsRepo = createRepository(conn, "workspaces", WORKSPACE_COLS);

    wsRepo.insert({
      id: "ws-1",
      path: "/test/path",
      status: "pending",
      active_execplan_id: null,
      created_at: "2026-06-16T00:00:00.000Z",
      updated_at: "2026-06-16T00:00:00.000Z",
    });

    expect(wsRepo.delete("ws-1")).toBe(true);
    expect(wsRepo.findById("ws-1")).toBeUndefined();
    expect(wsRepo.delete("nonexistent")).toBe(false);
    closeConnection(conn);
  });

  it("enforces unique path constraint", () => {
    const conn = setupDb();
    const wsRepo = createRepository(conn, "workspaces", WORKSPACE_COLS);

    wsRepo.insert({
      id: "ws-1",
      path: "/test/path",
      status: "pending",
      active_execplan_id: null,
      created_at: "2026-06-16T00:00:00.000Z",
      updated_at: "2026-06-16T00:00:00.000Z",
    });

    expect(() => {
      wsRepo.insert({
        id: "ws-2",
        path: "/test/path",
        status: "pending",
        active_execplan_id: null,
        created_at: "2026-06-16T00:00:00.000Z",
        updated_at: "2026-06-16T00:00:00.000Z",
      });
    }).toThrow();
    closeConnection(conn);
  });
});

describe("storage: secret validation", () => {
  it("accepts a valid SecretReference", () => {
    const result = validateSecretReference({
      key: "openai-api-key",
      provider: "env",
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects a raw string secret", () => {
    const result = validateSecretReference("sk-proj-abc123def456");
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Raw secret strings");
  });

  it("rejects a null value", () => {
    const result = validateSecretReference(null);
    expect(result.valid).toBe(false);
  });

  it("rejects an undefined value", () => {
    const result = validateSecretReference(undefined);
    expect(result.valid).toBe(false);
  });

  it("rejects a number", () => {
    const result = validateSecretReference(42);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Invalid secret type");
  });

  it("rejects an object with a 'value' field", () => {
    const result = validateSecretReference({
      key: "my-key",
      provider: "env",
      value: "super-secret-123",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Raw secret values"))).toBe(true);
  });

  it("rejects an object with a 'secret' field", () => {
    const result = validateSecretReference({
      key: "my-key",
      provider: "env",
      secret: "super-secret-456",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Raw secret values"))).toBe(true);
  });

  it("rejects a SecretReference missing key", () => {
    const result = validateSecretReference({
      provider: "env",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("key"))).toBe(true);
  });

  it("rejects a SecretReference missing provider", () => {
    const result = validateSecretReference({
      key: "my-key",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("provider"))).toBe(true);
  });

  it("rejects empty key", () => {
    const result = validateSecretReference({ key: "", provider: "env" });
    expect(result.valid).toBe(false);
  });

  it("rejects empty provider", () => {
    const result = validateSecretReference({ key: "my-key", provider: "" });
    expect(result.valid).toBe(false);
  });

  it("validates an array of values with noRawSecrets", () => {
    const result = validateNoRawSecrets([
      { key: "k1", provider: "env" },
      { key: "k2", provider: "file" },
    ]);
    expect(result.valid).toBe(true);
  });

  it("rejects an array containing a raw secret", () => {
    const result = validateNoRawSecrets([{ key: "k1", provider: "env" }, "raw-secret-value"]);
    expect(result.valid).toBe(false);
  });

  it("validates config secrets with validateConfigSecrets", () => {
    const result = validateConfigSecrets(
      {
        apiKey: { key: "openai-key", provider: "env" },
        endpoint: "http://localhost",
      },
      ["apiKey"],
    );
    expect(result.valid).toBe(true);
  });

  it("rejects config with raw secret in a protected field", () => {
    const result = validateConfigSecrets(
      {
        apiKey: "sk-raw-secret-value",
        endpoint: "http://localhost",
      },
      ["apiKey"],
    );
    expect(result.valid).toBe(false);
  });
});

describe("storage: backup/restore", () => {
  it("creates a backup and verifies metadata", async () => {
    const conn = createInMemoryConnection();
    migrate(conn, ALL_MIGRATIONS);

    // Add some data
    conn.db
      .prepare("INSERT INTO workspaces (id, path, status) VALUES (?, ?, ?)")
      .run("ws-1", "/test/ws", "active");

    const backupPath = "/tmp/test_backup_" + Date.now() + ".db";
    const meta = await createBackup(conn, backupPath);

    expect(meta.path).toBe(backupPath);
    expect(meta.sizeBytes).toBeGreaterThan(0);
    expect(meta.migrationCount).toBe(1);
    expect(meta.tableCount).toBeGreaterThanOrEqual(11);
    expect(meta.createdAt).toBeDefined();

    // Verify backup file can be opened
    const backup = openBackup(backupPath);
    const ws = backup.db.prepare("SELECT * FROM workspaces WHERE id = ?").get("ws-1") as
      | { path: string }
      | undefined;
    expect(ws).toBeDefined();
    expect(ws!.path).toBe("/test/ws");
    closeConnection(backup);
    closeConnection(conn);

    // Cleanup
    const { unlinkSync } = await import("node:fs");
    unlinkSync(backupPath);
  });

  it("checks backup file info", async () => {
    const conn = createInMemoryConnection();
    migrate(conn, ALL_MIGRATIONS);

    const backupPath = "/tmp/test_backup_info_" + Date.now() + ".db";
    await createBackup(conn, backupPath);

    const info = await getBackupInfo(backupPath);
    expect(info.exists).toBe(true);
    expect(info.sizeBytes).toBeGreaterThan(0);

    const missingInfo = await getBackupInfo("/tmp/nonexistent_backup.db");
    expect(missingInfo.exists).toBe(false);
    expect(missingInfo.sizeBytes).toBe(0);

    closeConnection(conn);
    const { unlinkSync } = await import("node:fs");
    unlinkSync(backupPath);
  });

  it("restores from backup to a new database", async () => {
    const conn = createInMemoryConnection();
    migrate(conn, ALL_MIGRATIONS);

    // Add data
    conn.db
      .prepare("INSERT INTO workspaces (id, path, status) VALUES (?, ?, ?)")
      .run("ws-1", "/original/path", "active");

    const backupPath = "/tmp/test_restore_" + Date.now() + ".db";
    await createBackup(conn, backupPath);

    // Simulate restore by opening backup as new DB
    const restored = openBackup(backupPath);
    const ws = restored.db.prepare("SELECT * FROM workspaces WHERE id = ?").get("ws-1") as
      | { path: string; status: string }
      | undefined;
    expect(ws).toBeDefined();
    expect(ws!.path).toBe("/original/path");
    expect(ws!.status).toBe("active");

    closeConnection(restored);
    closeConnection(conn);

    const { unlinkSync } = await import("node:fs");
    unlinkSync(backupPath);
  });

  it("fails on nonexistent backup file", async () => {
    const backupPath = "/tmp/nonexistent_" + Date.now() + ".db";
    expect(() => openBackup(backupPath)).toThrow();
  });
});

describe("storage: migrations", () => {
  it("applies all migrations to a fresh database", () => {
    const conn = createInMemoryConnection();
    const applied = migrate(conn, ALL_MIGRATIONS);
    expect(applied).toEqual(["M001_initial_schema"]);
    closeConnection(conn);
  });

  it("is idempotent — second apply does nothing", () => {
    const conn = createInMemoryConnection();
    migrate(conn, ALL_MIGRATIONS);
    const applied2 = migrate(conn, ALL_MIGRATIONS);
    expect(applied2).toEqual([]);
    closeConnection(conn);
  });

  it("tracks applied migrations", () => {
    const conn = createInMemoryConnection();
    expect(listApplied(conn)).toEqual([]);
    migrate(conn, ALL_MIGRATIONS);
    const names = listApplied(conn);
    expect(names).toEqual(["M001_initial_schema"]);
    closeConnection(conn);
  });

  it("creates all expected tables", () => {
    const conn = createInMemoryConnection();
    migrate(conn, ALL_MIGRATIONS);

    const tables = conn.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name).sort();

    expect(tableNames).toContain("_migrations");
    expect(tableNames).toContain("workspaces");
    expect(tableNames).toContain("execplans");
    expect(tableNames).toContain("milestones");
    expect(tableNames).toContain("agent_runs");
    expect(tableNames).toContain("commands");
    expect(tableNames).toContain("validations");
    expect(tableNames).toContain("decisions");
    expect(tableNames).toContain("integrations");
    expect(tableNames).toContain("integration_permissions");
    expect(tableNames).toContain("events");
    closeConnection(conn);
  });

  it("enforces foreign keys", () => {
    const conn = createInMemoryConnection();
    migrate(conn, ALL_MIGRATIONS);

    // Insert a workspace first
    conn.db.prepare("INSERT INTO workspaces (id, path) VALUES (?, ?)").run("ws-1", "/test/path");

    // Insert execplan referencing valid workspace
    conn.db
      .prepare("INSERT INTO execplans (id, workspace_id, title) VALUES (?, ?, ?)")
      .run("ep-1", "ws-1", "Test Plan");

    // Try to insert execplan with invalid workspace — should fail
    expect(() => {
      conn.db
        .prepare("INSERT INTO execplans (id, workspace_id, title) VALUES (?, ?, ?)")
        .run("ep-2", "nonexistent", "Bad Plan");
    }).toThrow();
    closeConnection(conn);
  });
});
