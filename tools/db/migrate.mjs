#!/usr/bin/env node
import { ensureDbDirectory, loadStorageApi, resolveDbPath } from "./common.mjs";

const dbPath = resolveDbPath();
ensureDbDirectory(dbPath);

const storage = await loadStorageApi();
const conn = storage.createConnection({ path: dbPath });
try {
  const applied = storage.migrate(conn, storage.ALL_MIGRATIONS);
  console.log("Migrations: ok");
  console.log(`Path: ${dbPath}`);
  console.log(`Applied now: ${applied.length ? applied.join(", ") : "none"}`);
} finally {
  storage.closeConnection(conn);
}
