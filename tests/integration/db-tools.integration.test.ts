import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));

function runTool(script: string, env: NodeJS.ProcessEnv, args: string[] = []) {
  return execFileSync(process.execPath, [resolve(ROOT, script), ...args], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

describe("db tools", () => {
  it("sets up and reapplies migrations against a temp database", () => {
    const dir = mkdtempSync(join(tmpdir(), "machine-db-tool-"));
    const dbPath = join(dir, "the-machine.db");

    const setup = runTool("tools/db/setup.mjs", { MACHINE_DB_PATH: dbPath });
    expect(setup).toContain("Database setup: ok");
    expect(setup).toContain("M001_initial_schema");
    expect(existsSync(dbPath)).toBe(true);

    const migrate = runTool("tools/db/migrate.mjs", { MACHINE_DB_PATH: dbPath });
    expect(migrate).toContain("Migrations: ok");
    expect(migrate).toContain("Applied now: none");
  });

  it("guards rollback unless explicit rollback intent is provided", () => {
    const dir = mkdtempSync(join(tmpdir(), "machine-db-rollback-"));
    const dbPath = join(dir, "the-machine.db");

    expect(() => runTool("tools/db/rollback.mjs", { MACHINE_DB_PATH: dbPath })).toThrow(
      /Rollback stopped/,
    );

    const output = runTool("tools/db/rollback.mjs", {
      MACHINE_DB_PATH: dbPath,
      MACHINE_ALLOW_DB_ROLLBACK: "1",
    });
    expect(output).toContain("Rollback: no reversible down migrations are registered");
  });

  it("creates deterministic migration scaffolds in the requested directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "machine-migrations-"));
    const output = runTool(
      "tools/db/create-migration.mjs",
      { MACHINE_MIGRATIONS_DIR: dir },
      ["add provider cache"],
    );

    const migrationPath = join(dir, "M001_add_provider_cache.ts");
    expect(output).toContain("Migration scaffold created");
    expect(existsSync(migrationPath)).toBe(true);
    expect(readFileSync(migrationPath, "utf-8")).toContain("M001_ADD_PROVIDER_CACHE");
  });
});
