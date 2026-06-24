#!/usr/bin/env node
import { isTempPath, loadStorageApi, resolveDbPath } from "./common.mjs";

const dbPath = resolveDbPath();
const allowRollback = process.env.MACHINE_ALLOW_DB_ROLLBACK === "1";

if (!allowRollback) {
  console.error("Rollback stopped: set MACHINE_ALLOW_DB_ROLLBACK=1 to acknowledge rollback intent.");
  console.error(`Path: ${dbPath}`);
  process.exit(1);
}

if (!isTempPath(dbPath)) {
  console.error("Rollback stopped: destructive rollback is only allowed for temp database paths.");
  console.error(`Path: ${dbPath}`);
  process.exit(1);
}

const storage = await loadStorageApi();
const conn = storage.createConnection({ path: dbPath });
try {
  const applied = storage.listApplied(conn);
  console.log("Rollback: no reversible down migrations are registered.");
  console.log(`Path: ${dbPath}`);
  console.log(`Applied migrations: ${applied.length ? applied.join(", ") : "none"}`);
} finally {
  storage.closeConnection(conn);
}
