#!/usr/bin/env node
// Build the exact candidate twice in independent output roots and require byte-for-byte identity.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const BUILD_SCRIPT = join(ROOT, "tools", "release", "build-release.mjs");
const WORK_ROOT = join(ROOT, ".machine", "reproducible-build");
const FIRST = join(WORK_ROOT, "first");
const SECOND = join(WORK_ROOT, "second");
const REPORT_DIRECTORY = join(ROOT, "artifacts", "reproducibility");
const REPORT_PATH = join(REPORT_DIRECTORY, "REPRODUCIBLE_BUILD.json");

function capture(executable, args) {
  return execFileSync(executable, args, {
    cwd: ROOT,
    encoding: "utf-8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function listFiles(root, current = root) {
  const files = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const entryPath = join(current, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(root, entryPath));
    else if (entry.isFile()) files.push(relative(root, entryPath).replaceAll("\\", "/"));
  }
  return files.sort();
}

function build(outputDirectory) {
  execFileSync(process.execPath, [BUILD_SCRIPT], {
    cwd: ROOT,
    env: {
      ...process.env,
      MACHINE_RELEASE_DIR: relative(ROOT, outputDirectory).replaceAll("\\", "/"),
    },
    shell: false,
    stdio: "inherit",
  });
}

function inventory(root) {
  return Object.fromEntries(
    listFiles(root).map((name) => {
      const filePath = join(root, name);
      return [
        name,
        {
          sha256: sha256(filePath),
          sizeBytes: statSync(filePath).size,
        },
      ];
    }),
  );
}

rmSync(WORK_ROOT, { recursive: true, force: true });
mkdirSync(WORK_ROOT, { recursive: true, mode: 0o700 });
const candidateSha = capture("git", ["rev-parse", "HEAD"]);
const candidateTree = capture("git", ["rev-parse", "HEAD^{tree}"]);
const startedAt = new Date().toISOString();
let firstInventory = {};
let secondInventory = {};
let mismatches = [];

try {
  build(FIRST);
  build(SECOND);
  firstInventory = inventory(FIRST);
  secondInventory = inventory(SECOND);
  const allNames = [...new Set([...Object.keys(firstInventory), ...Object.keys(secondInventory)])].sort();
  mismatches = allNames
    .filter((name) => {
      const first = firstInventory[name];
      const second = secondInventory[name];
      return !first || !second || first.sha256 !== second.sha256 || first.sizeBytes !== second.sizeBytes;
    })
    .map((name) => ({
      path: name,
      first: firstInventory[name] ?? null,
      second: secondInventory[name] ?? null,
    }));
} finally {
  mkdirSync(REPORT_DIRECTORY, { recursive: true, mode: 0o700 });
  const report = {
    schemaVersion: 1,
    candidateSha,
    candidateTree,
    startedAt,
    completedAt: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
    passed: mismatches.length === 0 && Object.keys(firstInventory).length > 0,
    comparedFileCount: new Set([...Object.keys(firstInventory), ...Object.keys(secondInventory)]).size,
    mismatches,
    firstInventory,
    secondInventory,
  };
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf-8",
    mode: 0o600,
  });
  rmSync(WORK_ROOT, { recursive: true, force: true });
}

if (!existsSync(REPORT_PATH)) throw new Error("Reproducible-build report was not written.");
const report = JSON.parse(readFileSync(REPORT_PATH, "utf-8"));
if (!report.passed) {
  console.error(`Reproducible build failed with ${String(report.mismatches.length)} mismatch(es).`);
  for (const mismatch of report.mismatches.slice(0, 20)) {
    console.error(`- ${mismatch.path}`);
  }
  console.error(`Evidence: ${REPORT_PATH}`);
  process.exit(1);
}
console.log(
  `Reproducible build passed: ${String(report.comparedFileCount)} files are byte-identical across two independent builds.`,
);
console.log(`Evidence: ${REPORT_PATH}`);
