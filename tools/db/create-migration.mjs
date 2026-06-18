#!/usr/bin/env node
// Create migration placeholder.

const name = process.argv[2];
if (!name) {
  console.error("Usage: node tools/db/create-migration.mjs <name>");
  process.exit(1);
}
console.log(`Migration scaffold for: ${name} (placeholder)`);
