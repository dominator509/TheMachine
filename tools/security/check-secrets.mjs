#!/usr/bin/env node
// Scan the exact tracked candidate by default. Use --staged only for pre-commit hooks.

import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const stagedOnly = process.argv.includes("--staged");
const SECRET_PATTERNS = [
  { name: "OpenAI-style API key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { name: "Anthropic API key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { name: "GitHub token", pattern: /\bgh[opurs]_[A-Za-z0-9]{20,}\b/g },
  { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  { name: "Private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
];
const PLACEHOLDER_PATTERN =
  /(?:test|example|dummy|fake|placeholder|sample|redacted|abcdefghijkl|0123456789|xxxx)/i;

function gitFiles() {
  const args = stagedOnly
    ? ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]
    : ["ls-files", "-z"];
  const result = spawnSync("git", args, {
    encoding: "buffer",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    console.error(`Unable to enumerate candidate files: ${String(result.stderr)}`);
    process.exit(2);
  }
  return result.stdout
    .toString("utf-8")
    .split("\0")
    .filter((file) => file.length > 0);
}

function lineNumber(contents, index) {
  let line = 1;
  for (let position = 0; position < index; position += 1) {
    if (contents.charCodeAt(position) === 10) line += 1;
  }
  return line;
}

function looksLikePlaceholder(value) {
  return value.includes("[REDACTED]") || PLACEHOLDER_PATTERN.test(value);
}

let findings = 0;
let scanned = 0;
let skipped = 0;
let placeholders = 0;

for (const file of gitFiles()) {
  try {
    const stats = statSync(file);
    if (!stats.isFile() || stats.size > MAX_FILE_BYTES) {
      skipped += 1;
      continue;
    }
    const buffer = readFileSync(file);
    if (buffer.includes(0)) {
      skipped += 1;
      continue;
    }
    const contents = buffer.toString("utf-8");
    scanned += 1;
    for (const candidate of SECRET_PATTERNS) {
      candidate.pattern.lastIndex = 0;
      for (const match of contents.matchAll(candidate.pattern)) {
        const value = match[0] ?? "";
        if (looksLikePlaceholder(value)) {
          placeholders += 1;
          continue;
        }
        console.error(
          `SECRET_FINDING: ${file}:${String(lineNumber(contents, match.index ?? 0))} (${candidate.name})`,
        );
        findings += 1;
      }
    }
  } catch {
    skipped += 1;
  }
}

console.log(
  `Secret scan mode=${stagedOnly ? "staged" : "tracked"} scanned=${String(scanned)} skipped=${String(skipped)} placeholders=${String(placeholders)} findings=${String(findings)}`,
);
if (findings > 0) {
  console.error("Possible committed secret material found. Values were intentionally not printed.");
  process.exit(1);
}
console.log("No known non-placeholder secret patterns detected in the selected candidate files.");
