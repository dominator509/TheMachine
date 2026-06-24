#!/usr/bin/env node
import { writeMigrationScaffold } from "./common.mjs";

const name = process.argv[2];
if (!name) {
  console.error("Usage: node tools/db/create-migration.mjs <name>");
  process.exit(1);
}

try {
  const migration = writeMigrationScaffold(name);
  console.log("Migration scaffold created");
  console.log(`Path: ${migration.path}`);
  console.log(`Export: ${migration.exportName}`);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Migration scaffold failed: ${message}`);
  process.exit(1);
}
