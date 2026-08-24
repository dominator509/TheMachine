#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ensureDbDirectory, loadStorageApi, resolveDbPath, ROOT } from "./common.mjs";

const databasePath = resolveDbPath();
if (!existsSync(databasePath)) {
  console.error(`Database not found: ${databasePath}`);
  process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const requestedPath = process.argv[2];
const backupPath = resolve(
  requestedPath || resolve(ROOT, ".machine", "backups", `the-machine-${timestamp}.sqlite`),
);
ensureDbDirectory(backupPath);

const storage = await loadStorageApi();
const connection = storage.createConnection({ path: databasePath });
try {
  const metadata = await storage.createBackup(connection, backupPath);
  console.log(JSON.stringify({ source: databasePath, ...metadata }, null, 2));
} finally {
  storage.closeConnection(connection);
}

console.log(`Backup directory: ${dirname(backupPath)}`);
