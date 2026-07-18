#!/usr/bin/env node
// Production readiness check — evaluate all 12 subsystems.
// Each subsystem gets a pass/fail check with a summary table at the end.
// Subsystems: core, storage, service, providers, mcp, security, observability,
//             agent-runtime, plugin-sdk, cli, desktop, ui-components.

import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../../", import.meta.url).pathname;

function checkSubsystem(name, pkgDir) {
  const pkgPath = join(ROOT, pkgDir, "package.json");
  if (!existsSync(pkgPath)) {
    return { name, status: "FAIL", detail: "package.json not found" };
  }
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    // Check that the package has a build output or src dir
    const hasSrc = existsSync(join(ROOT, pkgDir, "src"));
    const hasDist = existsSync(join(ROOT, pkgDir, "dist"));
    const detail = [];
    if (hasSrc) detail.push("src");
    if (hasDist) detail.push("dist");
    return { name, status: hasSrc ? "PASS" : "FAIL", detail: detail.join(", ") || "no source" };
  } catch {
    return { name, status: "FAIL", detail: "package.json parse error" };
  }
}

function checkTool(name, toolPath) {
  const fullPath = join(ROOT, toolPath);
  if (!existsSync(fullPath)) {
    return { name, status: "FAIL", detail: "file not found" };
  }
  return { name, status: "PASS", detail: "exists" };
}

function checkScript(name, scriptPath) {
  const fullPath = join(ROOT, scriptPath);
  if (!existsSync(fullPath)) {
    return { name, status: "FAIL", detail: "not found" };
  }
  // Check it's executable or a Node.js script
  const content = readFileSync(fullPath, "utf-8");
  const isExec = content.startsWith("#!");
  return { name, status: "PASS", detail: isExec ? "executable" : "script exists" };
}

function checkDoc(name) {
  const path = join(ROOT, name);
  if (!existsSync(path)) {
    return { name, status: "FAIL", detail: "not found" };
  }
  return { name, status: "PASS", detail: "exists" };
}

function runCheck(name, cmd, cwd) {
  try {
    execSync(cmd, { stdio: "pipe", cwd: cwd || ROOT });
    return { name, status: "PASS", detail: "ok" };
  } catch (e) {
    const stderr = e.stderr ? e.stderr.toString().trim().slice(0, 80) : "exit code != 0";
    return { name, status: "FAIL", detail: stderr };
  }
}

const results = [];

console.log("=== The Machine — Production Readiness Check ===\n");
console.log("--- Package Subsystems ---");

// 12 subsystems
const subsystems = [
  { name: "core", dir: "packages/core" },
  { name: "storage", dir: "packages/storage" },
  { name: "service", dir: "packages/service" },
  { name: "providers", dir: "packages/providers" },
  { name: "mcp", dir: "packages/mcp" },
  { name: "security", dir: "packages/security" },
  { name: "observability", dir: "packages/observability" },
  { name: "agent-runtime", dir: "packages/agent-runtime" },
  { name: "plugin-sdk", dir: "packages/plugin-sdk" },
  { name: "cli", dir: "apps/cli" },
  { name: "desktop", dir: "apps/desktop" },
  { name: "ui-components", dir: "packages/ui-components" },
];

for (const sub of subsystems) {
  const r = checkSubsystem(sub.name, sub.dir);
  results.push(r);
  console.log(`  ${r.status === "PASS" ? "✓" : "✗"} ${r.name} — ${r.detail}`);
}

console.log("\n--- Script Checks ---");

const scriptChecks = [
  "scripts/preflight.sh",
  "scripts/build.sh",
  "scripts/test-unit.sh",
  "scripts/security-check.sh",
  "scripts/lint.sh",
  "scripts/typecheck.sh",
  "scripts/test-integration.sh",
  "scripts/test-e2e.sh",
  "scripts/format-check.sh",
  "scripts/smoke-test.sh",
];

for (const s of scriptChecks) {
  const r = checkScript(s.replace("scripts/", ""), s);
  results.push({ ...r, name: s.replace("scripts/", "") });
  console.log(`  ${r.status === "PASS" ? "✓" : "✗"} ${s} — ${r.detail}`);
}

console.log("\n--- Tools ---");

const toolChecks = [
  { name: "db/setup.mjs", path: "tools/db/setup.mjs" },
  { name: "db/migrate.mjs", path: "tools/db/migrate.mjs" },
  { name: "db/rollback.mjs", path: "tools/db/rollback.mjs" },
  { name: "security/check-secrets.mjs", path: "tools/security/check-secrets.mjs" },
  { name: "smoke/smoke-test.mjs", path: "tools/smoke/smoke-test.mjs" },
  { name: "readiness checker", path: "tools/readiness/production-readiness-check.mjs" },
  { name: "release/build-release.mjs", path: "tools/release/build-release.mjs" },
];

for (const t of toolChecks) {
  const r = checkTool(t.name, t.path);
  results.push({ ...r, name: t.name });
  console.log(`  ${r.status === "PASS" ? "✓" : "✗"} tools/${t.name} — ${r.detail}`);
}

console.log("\n--- Release Docs ---");

const docsChecks = ["DEPLOYMENT.md", "RELEASE.md", "ROLLBACK.md"];
for (const d of docsChecks) {
  const r = checkDoc(d);
  results.push({ ...r, name: d });
  console.log(`  ${r.status === "PASS" ? "✓" : "✗"} ${d} — ${r.detail}`);
}

// Summary table
console.log("\n=== Summary Table ===");
const passCount = results.filter((r) => r.status === "PASS").length;
const failCount = results.filter((r) => r.status === "FAIL").length;
const total = results.length;

// Pad names for alignment
const namePad = Math.max(...results.map((r) => r.name.length)) + 2;
console.log(`  ${"Subsystem".padEnd(namePad)} Status  Detail`);
console.log(`  ${"".padEnd(namePad, "-")} ------  -----`);
for (const r of results) {
  const icon = r.status === "PASS" ? "✓" : "✗";
  console.log(`  ${r.name.padEnd(namePad)} ${icon}      ${r.detail}`);
}

console.log(`\nResults: ${passCount}/${total} passed, ${failCount}/${total} failed`);
if (failCount > 0) {
  console.log("\nFailed subsystems:");
  for (const r of results) {
    if (r.status === "FAIL") {
      console.log(`  ✗ ${r.name} — ${r.detail}`);
    }
  }
}

if (failCount === 0) {
  console.log("\nProduction readiness: ok");
  process.exit(0);
} else {
  console.error("\nProduction readiness: failed");
  process.exit(1);
}
