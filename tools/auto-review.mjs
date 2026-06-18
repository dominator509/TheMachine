#!/usr/bin/env node
// The Machine — Auto Review Runner
// Runs typecheck, lint, unit tests, and integration tests in sequence
// (sequential gate pattern, each gate blocks the next on failure).
// Prints a summary table with pass/fail/exit-code per gate.

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../", import.meta.url).pathname;

// Sequential gates — each must pass before the next runs
const GATES = [
  { name: "typecheck", cmd: "pnpm typecheck", cwd: ROOT },
  { name: "lint", cmd: "pnpm lint", cwd: ROOT },
  { name: "unit tests", cmd: "pnpm test:unit", cwd: ROOT },
  { name: "integration tests", cmd: "pnpm test:integration", cwd: ROOT },
];

function runGate(gate) {
  const { name, cmd, cwd } = gate;
  try {
    const out = execSync(cmd, { stdio: "pipe", cwd, timeout: 300_000 });
    const stdout = out.stdout.toString().trim();
    const lastLine = stdout.split("\n").pop() || "";
    return { name, passed: true, exitCode: 0, summary: lastLine.slice(0, 80) };
  } catch (e) {
    const stderr = e.stderr ? e.stderr.toString().trim() : "";
    const stdout = e.stdout ? e.stdout.toString().trim() : "";
    const summary = (stderr || stdout).split("\n").slice(-2).join("; ").slice(0, 80);
    return { name, passed: false, exitCode: e.status || 1, summary };
  }
}

console.log("=== The Machine — Auto Review ===");
console.log("");

const results = [];
let allPassed = true;

for (const gate of GATES) {
  console.log(`[gate] Running ${gate.name}...`);
  const result = runGate(gate);
  results.push(result);
  const icon = result.passed ? "✓" : "✗";
  console.log(`[gate] ${icon} ${gate.name} exited ${result.exitCode}`);
  console.log("");

  if (!result.passed) {
    allPassed = false;
    console.log(`[gate] ${gate.name} FAILED — halting pipeline`);
    console.log(`       ${result.summary}`);
    console.log("");
    break; // Sequential gate: stop on first failure
  }
}

// Summary table
console.log("=== Summary Table ===");
const pad = Math.max(...results.map((r) => r.name.length), 12) + 2;
console.log(`  ${"Gate".padEnd(pad)}  Result     Exit Code  Detail`);
console.log(`  ${"".padEnd(pad, "-")}  ------     ---------  ------`);
for (const r of results) {
  const icon = r.passed ? "PASS" : "FAIL";
  console.log(
    `  ${r.name.padEnd(pad)}  ${icon}      ${String(r.exitCode).padEnd(10)} ${r.summary}`,
  );
}

const total = results.length;
const passed = results.filter((r) => r.passed).length;
const failed = total - passed;
console.log(`\nResults: ${passed}/${total} passed, ${failed}/${total} failed`);
console.log(`Status:  ${allPassed ? "ALL GATES PASSED" : "BLOCKED AT " + results.find((r) => !r.passed)?.name || "UNKNOWN"}`);

process.exit(allPassed ? 0 : 1);
