#!/usr/bin/env node
// Rollback is implemented as an exact, verified backup restore. There are no down migrations.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { isTempPath, loadStorageApi, resolveDbPath } from "./common.mjs";

const backupArgument = process.argv.slice(2).find((argument) => !argument.startsWith("--"));
const approved = process.argv.includes("--yes");
const expectedSha256 = process.argv
  .find((argument) => argument.startsWith("--sha256="))
  ?.slice("--sha256=".length);
const targetPath = resolveDbPath();

if (!backupArgument) {
  console.error(
    "Usage: node tools/db/rollback.mjs <pre-upgrade-backup.sqlite> --yes [--sha256=<expected>]",
  );
  process.exit(2);
}
const backupPath = resolve(backupArgument);
if (!existsSync(backupPath)) {
  console.error(`Rollback backup not found: ${backupPath}`);
  process.exit(1);
}

const rollbackAuthorized = isTempPath(targetPath) || process.env.MACHINE_ALLOW_DB_ROLLBACK === "1";
if (!approved || !rollbackAuthorized) {
  console.error("Rollback refused.");
  console.error("Required: --yes and MACHINE_ALLOW_DB_ROLLBACK=1.");
  console.error("The environment flag is waived only for an operating-system temporary database.");
  process.exit(3);
}

const storage = await loadStorageApi();
const result = await storage.restoreBackup({
  backupPath,
  targetPath,
  expectedSha256,
  preservePrevious: true,
});
console.log(JSON.stringify(result, null, 2));
console.log("Rollback restored and independently verified the exact pre-upgrade backup.");
