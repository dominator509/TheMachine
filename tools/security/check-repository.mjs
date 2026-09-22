#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, readlinkSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = realpathSync(fileURLToPath(new URL("../../", import.meta.url)));
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const failures = [];
const warnings = [];
let scannedFiles = 0;
let skippedBinary = 0;
let skippedLarge = 0;

const HIGH_CONFIDENCE_PATTERNS = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g],
  ["GitHub token", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/g],
  ["GitHub fine-grained token", /\bgithub_pat_[A-Za-z0-9_]{60,}\b/g],
  ["OpenAI key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}\b/g],
  ["Anthropic key", /\bsk-ant-[A-Za-z0-9_-]{40,}\b/g],
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ["Google API key", /\bAIza[A-Za-z0-9_-]{35}\b/g],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g],
  ["Stripe live secret", /\bsk_live_[A-Za-z0-9]{20,}\b/g],
];

const tracked = git(["ls-files", "-z"]);
if (tracked.status !== 0) {
  console.error(tracked.stderr || "Unable to enumerate tracked files.");
  process.exit(1);
}
const paths = tracked.stdout.split("\0").filter(Boolean);
if (paths.length === 0) {
  console.error("Security scan vacuity guard: git returned zero tracked files.");
  process.exit(1);
}

for (const repositoryPath of paths) {
  const absolutePath = resolve(ROOT, repositoryPath);
  const containment = relative(ROOT, absolutePath);
  if (containment.startsWith("..") || isAbsolute(containment)) {
    failures.push(`${repositoryPath}: tracked path escapes repository root`);
    continue;
  }
  let metadata;
  try {
    metadata = lstatSync(absolutePath);
  } catch (error) {
    failures.push(
      `${repositoryPath}: tracked path cannot be read (${error instanceof Error ? error.message : String(error)})`,
    );
    continue;
  }
  if (metadata.isSymbolicLink()) {
    const target = readlinkSync(absolutePath);
    const resolvedTarget = resolve(dirname(absolutePath), target);
    const targetContainment = relative(ROOT, resolvedTarget);
    if (targetContainment.startsWith("..") || isAbsolute(targetContainment)) {
      failures.push(`${repositoryPath}: tracked symlink escapes repository root -> ${target}`);
    }
    continue;
  }
  if (!metadata.isFile()) continue;
  if (metadata.size > MAX_FILE_BYTES) {
    skippedLarge += 1;
    warnings.push(`${repositoryPath}: skipped because it exceeds ${String(MAX_FILE_BYTES)} bytes`);
    continue;
  }
  const contents = readFileSync(absolutePath);
  if (contents.includes(0)) {
    skippedBinary += 1;
    continue;
  }
  scannedFiles += 1;
  const text = contents.toString("utf8");
  for (const [label, pattern] of HIGH_CONFIDENCE_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match)
      failures.push(`${repositoryPath}:${lineNumber(text, match.index)}: possible ${label}`);
  }
  if (repositoryPath.startsWith(".github/workflows/") && /\.ya?ml$/i.test(repositoryPath)) {
    checkWorkflow(repositoryPath, text);
  }
}

if (scannedFiles === 0)
  failures.push("Security scan vacuity guard: zero tracked text files were scanned.");
console.log(
  `security scan: ${String(scannedFiles)} text files, ${String(skippedBinary)} binary files skipped, ${String(skippedLarge)} oversized files skipped`,
);
for (const warning of warnings) console.warn(`WARN: ${warning}`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
console.log("security: ok");

function checkWorkflow(repositoryPath, text) {
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const uses = line.match(/^\s*-?\s*uses:\s*([^#\s]+)\s*(?:#.*)?$/);
    if (uses) {
      const reference = uses[1];
      if (!reference.startsWith("./")) {
        const separator = reference.lastIndexOf("@");
        const revision = separator >= 0 ? reference.slice(separator + 1) : "";
        if (!/^[a-f0-9]{40}$/i.test(revision)) {
          failures.push(
            `${repositoryPath}:${String(index + 1)}: action is not pinned to a full commit SHA (${reference})`,
          );
        }
      }
    }
    if (/\bnpm\s+(?:install|i)\b[^\n]*@latest\b/i.test(line)) {
      failures.push(
        `${repositoryPath}:${String(index + 1)}: npm installs a floating @latest package`,
      );
    }
    if (
      /\b(?:pip|python\s+-m\s+pip)\s+install\b[^#\n]*(?:aider-chat|openhands)(?!\s*==)/i.test(line)
    ) {
      failures.push(
        `${repositoryPath}:${String(index + 1)}: benchmark worker installation is not version-pinned`,
      );
    }
  }
}

function git(args) {
  const result = spawnSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: `${result.stderr ?? ""}${result.error ? `\n${result.error.message}` : ""}`.trim(),
  };
}

function lineNumber(text, offset) {
  return String(text.slice(0, offset).split("\n").length);
}
