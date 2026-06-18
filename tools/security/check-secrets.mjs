#!/usr/bin/env node
// Check for uncommitted secrets in staged files.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const SECRET_PATTERNS = [
  /(?:sk-[A-Za-z0-9]{20,})/, // OpenAI-style keys
  /(?:ghp_[A-Za-z0-9]{36,})/, // GitHub PATs
  /(?:gho_[A-Za-z0-9]{36,})/, // GitHub OAuth
  /(?:-----BEGIN (?:RSA |EC )?PRIVATE KEY-----)/,
];

const files = execSync("git diff --cached --name-only", { encoding: "utf-8" })
  .trim()
  .split("\n")
  .filter(Boolean);

let found = 0;

for (const file of files) {
  try {
    const content = readFileSync(file, "utf-8");
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(content)) {
        console.error(`WARNING: Possible secret in ${file}`);
        found++;
      }
    }
  } catch {
    // Binary or deleted file — skip
  }
}

if (found > 0) {
  console.error(`Found ${found} possible secret(s). Review before committing.`);
  process.exit(1);
}

console.log("No secrets detected in staged files.");
