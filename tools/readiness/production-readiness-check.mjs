#!/usr/bin/env node
// Evidence-producing production-readiness gate runner.
// A source directory or registration is never counted as proof of functionality.

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PROFILE = process.env.MACHINE_READINESS_PROFILE || "ci";
const OUTPUT_ROOT = resolve(
  process.env.MACHINE_READINESS_OUTPUT || join(ROOT, "artifacts", "readiness"),
);
const LOG_ROOT = join(OUTPUT_ROOT, "gates");
const PNPM_CLI = process.env.npm_execpath;
const PNPM = process.platform === "win32" ? process.execPath : "pnpm";
const PNPM_ARGS = process.platform === "win32" ? [PNPM_CLI] : [];
const MAX_OUTPUT = 32 * 1024 * 1024;

if (process.platform === "win32" && (!PNPM_CLI || !existsSync(PNPM_CLI))) {
  throw new Error("Production readiness must be invoked through `pnpm run production:readiness`.");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function gitSha() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: ROOT,
    encoding: "utf-8",
    shell: false,
  });
  if (result.status !== 0 || !result.stdout.trim()) {
    throw new Error(
      `Unable to pin candidate SHA: ${result.stderr || result.error?.message || "unknown"}`,
    );
  }
  return result.stdout.trim();
}

function runGate(definition) {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const args =
    definition.executable === PNPM ? [...PNPM_ARGS, ...definition.args] : definition.args;
  const result = spawnSync(definition.executable, args, {
    cwd: definition.cwd || ROOT,
    env: process.env,
    encoding: "utf-8",
    shell: false,
    windowsHide: true,
    maxBuffer: MAX_OUTPUT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = result.stdout || "";
  const stderr = `${result.stderr || ""}${result.error ? `\n${result.error.message}` : ""}`;
  const exitCode = result.status ?? 1;
  const completedAt = new Date().toISOString();
  const log = [
    `$ ${definition.executable} ${args.join(" ")}`,
    `started_at=${startedAt}`,
    `completed_at=${completedAt}`,
    `exit_code=${String(exitCode)}`,
    "",
    "--- stdout ---",
    stdout,
    "--- stderr ---",
    stderr,
  ].join("\n");
  const logPath = join(LOG_ROOT, `${definition.id}.log`);
  writeFileSync(logPath, log, { encoding: "utf-8", mode: 0o600 });
  return {
    id: definition.id,
    command: [definition.executable, ...args],
    subsystems: definition.subsystems,
    blocking: definition.blocking !== false,
    passed: exitCode === 0,
    exitCode,
    startedAt,
    completedAt,
    durationMs: Date.now() - started,
    stdoutSha256: sha256(stdout),
    stderrSha256: sha256(stderr),
    logPath: relative(ROOT, logPath).replaceAll("\\", "/"),
    logSha256: sha256(log),
  };
}

function fileGate(id, filePath, subsystems) {
  const absolutePath = resolve(ROOT, filePath);
  const passed = existsSync(absolutePath);
  const contents = passed ? readFileSync(absolutePath) : Buffer.alloc(0);
  const now = new Date().toISOString();
  return {
    id,
    command: ["verify-file", filePath],
    subsystems,
    blocking: true,
    passed,
    exitCode: passed ? 0 : 1,
    startedAt: now,
    completedAt: now,
    durationMs: 0,
    stdoutSha256: sha256(contents),
    stderrSha256: sha256(""),
    logPath: null,
    logSha256: sha256(contents),
  };
}

const definitions = [
  {
    id: "lint",
    executable: PNPM,
    args: ["lint"],
    subsystems: [
      "core",
      "storage",
      "service",
      "providers",
      "mcp",
      "security",
      "observability",
      "agent-runtime",
      "plugin-sdk",
      "cli",
      "desktop",
      "ui-components",
    ],
  },
  {
    id: "format",
    executable: PNPM,
    args: ["format:check"],
    subsystems: [
      "core",
      "storage",
      "service",
      "providers",
      "mcp",
      "security",
      "observability",
      "agent-runtime",
      "plugin-sdk",
      "cli",
      "desktop",
      "ui-components",
    ],
  },
  {
    id: "typecheck",
    executable: PNPM,
    args: ["typecheck"],
    subsystems: [
      "core",
      "storage",
      "service",
      "providers",
      "mcp",
      "security",
      "observability",
      "agent-runtime",
      "plugin-sdk",
      "cli",
      "desktop",
      "ui-components",
    ],
  },
  {
    id: "unit",
    executable: PNPM,
    args: ["test:unit"],
    subsystems: [
      "core",
      "security",
      "observability",
      "agent-runtime",
      "plugin-sdk",
      "cli",
      "desktop",
      "ui-components",
    ],
  },
  {
    id: "integration",
    executable: PNPM,
    args: ["test:integration"],
    subsystems: [
      "storage",
      "service",
      "providers",
      "mcp",
      "security",
      "observability",
      "agent-runtime",
      "plugin-sdk",
      "cli",
    ],
  },
  {
    id: "build",
    executable: PNPM,
    args: ["build"],
    subsystems: [
      "core",
      "storage",
      "service",
      "providers",
      "mcp",
      "security",
      "observability",
      "agent-runtime",
      "plugin-sdk",
      "cli",
      "desktop",
      "ui-components",
    ],
  },
  {
    id: "e2e",
    executable: PNPM,
    args: ["test:e2e"],
    subsystems: ["service", "agent-runtime", "cli", "ui-components"],
  },
  {
    id: "benchmark-smoke",
    executable: PNPM,
    args: ["benchmark:smoke"],
    subsystems: ["agent-runtime", "cli"],
  },
  { id: "secret-scan", executable: PNPM, args: ["security:check"], subsystems: ["security"] },
  { id: "dependency-audit", executable: PNPM, args: ["audit"], subsystems: ["security"] },
  { id: "release-build", executable: PNPM, args: ["build:release"], subsystems: ["cli"] },
  { id: "smoke", executable: PNPM, args: ["smoke"], subsystems: ["service", "cli"] },
];

rmSync(OUTPUT_ROOT, { recursive: true, force: true });
mkdirSync(LOG_ROOT, { recursive: true, mode: 0o700 });
const candidateSha = gitSha();
const generatedAt = new Date().toISOString();
const gates = definitions.map(runGate);
gates.push(fileGate("cargo-lock", "apps/desktop/src-tauri/Cargo.lock", ["desktop"]));

if (PROFILE === "release") {
  const nativeManifest =
    process.env.MACHINE_NATIVE_ARTIFACT_MANIFEST || "release/native-artifacts.json";
  gates.push(fileGate("native-artifact-manifest", nativeManifest, ["desktop"]));
  gates.push(fileGate("release-manifest", "release/release-manifest.json", ["cli", "desktop"]));
}

const subsystemNames = [
  "core",
  "storage",
  "service",
  "providers",
  "mcp",
  "security",
  "observability",
  "agent-runtime",
  "plugin-sdk",
  "cli",
  "desktop",
  "ui-components",
];
const subsystems = {};
for (const subsystem of subsystemNames) {
  const relevant = gates.filter((gate) => gate.subsystems.includes(subsystem));
  const passed = relevant.length > 0 && relevant.every((gate) => gate.passed);
  const canonical = JSON.stringify(
    relevant.map((gate) => ({ id: gate.id, passed: gate.passed, logSha256: gate.logSha256 })),
  );
  subsystems[subsystem] = {
    subsystem,
    candidateSha,
    passed,
    checkCount: relevant.length,
    evidenceDigest: `sha256:${sha256(canonical)}`,
    completedAt: relevant.at(-1)?.completedAt || generatedAt,
    gates: relevant.map((gate) => gate.id),
  };
}

const blockingFailures = gates.filter((gate) => gate.blocking && !gate.passed);
const evidence = {
  schemaVersion: 1,
  profile: PROFILE,
  candidateSha,
  generatedAt,
  toolchain: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  },
  gates,
  subsystems,
  overall: blockingFailures.length === 0 ? "ready" : "not_ready",
};
const evidencePath = join(OUTPUT_ROOT, "READINESS_EVIDENCE.json");
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {
  encoding: "utf-8",
  mode: 0o600,
});
writeFileSync(
  join(OUTPUT_ROOT, "READINESS_EVIDENCE.sha256"),
  `${sha256(readFileSync(evidencePath))}  READINESS_EVIDENCE.json\n`,
  { encoding: "utf-8", mode: 0o600 },
);

console.log(`Candidate: ${candidateSha}`);
console.log(`Profile: ${PROFILE}`);
for (const gate of gates) {
  console.log(`${gate.passed ? "PASS" : "FAIL"}: ${gate.id} (${String(gate.exitCode)})`);
}
console.log(`Evidence: ${evidencePath}`);
if (blockingFailures.length > 0) {
  console.error(
    `Production readiness: failed (${String(blockingFailures.length)} blocking gate(s))`,
  );
  process.exit(1);
}
console.log("Production readiness: ok");
