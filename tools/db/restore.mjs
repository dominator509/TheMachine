#!/usr/bin/env node
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  isTempPath,
  loadStorageApi,
  resolveDbPath,
} from "./common.mjs";

const backupArgument = process.argv.find((argument) => !argument.startsWith("--"));
const approved = process.argv.includes("--yes");
const expectedSha256 = process.argv
  .find((argument) => argument.startsWith("--sha256="))
  ?.slice("--sha256=".length);
const targetPath = resolveDbPath();

if (!backupArgument) {
  console.error(
    "Usage: node tools/db/restore.mjs <backup.sqlite> --yes [--sha256=<expected>]",
  );
  process.exit(2);
}
const backupPath = resolve(backupArgument);
if (!existsSync(backupPath)) {
  console.error(`Backup not found: ${backupPath}`);
  process.exit(1);
}

const destructiveAuthorized =
  isTempPath(targetPath) || process.env.MACHINE_ALLOW_DESTRUCTIVE_RESTORE === "1";
if (!approved || !destructiveAuthorized) {
  console.error("Restore refused.");
  console.error("Required: --yes and MACHINE_ALLOW_DESTRUCTIVE_RESTORE=1.");
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
console.log("Restore completed and independently verified.");
console.log("The pre-restore database is retained until an operator removes it.");
