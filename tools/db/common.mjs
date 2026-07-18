import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../..", import.meta.url));

export function defaultDbPath() {
  return resolve(ROOT, ".machine", "the-machine.db");
}

export function resolveDbPath() {
  return resolve(process.env.MACHINE_DB_PATH || defaultDbPath());
}

export async function loadStorageApi() {
  try {
    return await import("../../packages/storage/dist/index.js");
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("Storage package build is missing or invalid.");
    console.error("Run `pnpm run build` before database tooling.");
    console.error(detail);
    process.exit(1);
  }
}

export function ensureDbDirectory(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
}

export function isTempPath(targetPath) {
  const tempRoot = resolve(tmpdir()).toLowerCase();
  return resolve(targetPath).toLowerCase().startsWith(tempRoot);
}

export function migrationsDir() {
  return resolve(process.env.MACHINE_MIGRATIONS_DIR || resolve(ROOT, "packages/storage/src/migrations"));
}

export function nextMigrationPath(rawName) {
  const dir = migrationsDir();
  const sanitized = rawName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!sanitized) {
    throw new Error("Migration name must contain at least one letter or number.");
  }

  const files = existsSync(dir) ? readdirSync(dir) : [];
  const max = files.reduce((highest, file) => {
    const match = /^M(\d{3})_/i.exec(file);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  const sequence = String(max + 1).padStart(3, "0");
  return {
    dir,
    path: resolve(dir, `M${sequence}_${sanitized}.ts`),
    exportName: `M${sequence}_${sanitized.toUpperCase()}`,
  };
}

export function writeMigrationScaffold(rawName) {
  const migration = nextMigrationPath(rawName);
  mkdirSync(migration.dir, { recursive: true });
  if (existsSync(migration.path)) {
    throw new Error(`Migration already exists: ${migration.path}`);
  }
  writeFileSync(
    migration.path,
    `import type { Migration } from "../db/migrator.js";\n\nexport const ${migration.exportName}: Migration = {\n  name: "${migration.exportName.toLowerCase()}",\n  up(conn) {\n    conn.db.exec(\`\\n      -- Add migration SQL here.\\n    \`);\n  },\n};\n`,
    "utf-8",
  );
  return migration;
}
