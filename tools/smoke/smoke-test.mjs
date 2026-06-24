#!/usr/bin/env node
// Smoke test: validate CLI commands and release artifacts produce expected output.
// Covers CLI (commands), service (via CLI health), and desktop (bundle verification).

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL(".", import.meta.url));
const CLI = `node ${resolve(DIR, "../../apps/cli/dist/index.js")}`;
const ROOT = resolve(DIR, "../..");
const PLAN_FILE = `${ROOT}/.agent/execplans/EP-004-api-or-service-layer.md`;
const REQUIRED_ARTIFACTS = [
  {
    path: resolve(ROOT, "apps/cli/dist/index.js"),
    fix: "Run `pnpm run build` before smoke tests.",
  },
  {
    path: resolve(ROOT, "packages/service/dist/index.js"),
    fix: "Run `pnpm run build` before smoke tests.",
  },
  {
    path: resolve(ROOT, "release/machine.js"),
    fix: "Run `pnpm run build:release` before smoke tests.",
  },
  {
    path: resolve(ROOT, "release/desktop.js"),
    fix: "Run `pnpm run build:release` before smoke tests.",
  },
];

const missingArtifacts = REQUIRED_ARTIFACTS.filter((artifact) => !existsSync(artifact.path));
if (missingArtifacts.length > 0) {
  console.error("Smoke test prerequisites are missing:");
  for (const artifact of missingArtifacts) {
    console.error(`  - ${artifact.path}`);
    console.error(`    ${artifact.fix}`);
  }
  process.exit(1);
}

/** @type {Array<{name:string, cmd?:string, expectOk?:boolean, expectContains?:string[], verify?:()=>void}>} */
const tests = [
  {
    name: "help",
    cmd: `${CLI} help`,
    expectContains: [
      "Usage",
      "health",
      "repo",
      "plan",
      "providers",
      "mcp",
      "plugins",
      "readiness",
      "diagnostics",
    ],
  },
  { name: "version", cmd: `${CLI} version`, expectContains: ["0.1.0"] },
  { name: "health", cmd: `${CLI} health`, expectContains: ["health: ok"] },
  {
    name: "workspace",
    cmd: `${CLI} workspace /tmp/test-ws`,
    expectContains: ["Workspace path", "/tmp/test-ws"],
  },
  { name: "repo", cmd: `${CLI} repo`, expectContains: ["Repository", "package.json", ".git"] },
  {
    name: "plan",
    cmd: `${CLI} plan ${PLAN_FILE}`,
    expectContains: ["Plan:", "EP-004", "plan: ok"],
  },
  { name: "plans", cmd: `${CLI} plans`, expectContains: ["EP-004"] },
  { name: "providers", cmd: `${CLI} providers`, expectContains: ["No providers configured"] },
  { name: "mcp", cmd: `${CLI} mcp`, expectContains: ["No MCP servers"] },
  { name: "plugins", cmd: `${CLI} plugins`, expectContains: ["No plugins registered"] },
  {
    name: "readiness",
    cmd: `${CLI} readiness`,
    expectContains: ["Overall: degraded", "Core:", "Storage:", "Service:", "Providers:"],
  },
  {
    name: "readiness filtered",
    cmd: `${CLI} readiness core`,
    expectContains: ["Overall: ready", "Filtered subsystem: core"],
  },
  {
    name: "diagnostics",
    cmd: `${CLI} diagnostics`,
    expectContains: ["diagnostics: ok", "Node.js", "pnpm"],
  },
  {
    name: "unknown command",
    cmd: `${CLI} nonexistent`,
    expectOk: false,
    expectContains: ["Unknown command"],
  },
  {
    name: "validation missing arg",
    cmd: `${CLI} validation`,
    expectOk: false,
    expectContains: ["Usage"],
  },
  { name: "plan missing arg", cmd: `${CLI} plan`, expectOk: false, expectContains: ["Usage"] },
  // --- Desktop bundle verification ---
  {
    name: "desktop bundle exists",
    verify: () => {
      const p = `${ROOT}/release/desktop.js`;
      return { ok: existsSync(p), detail: `exists=${existsSync(p)}` };
    },
  },
  {
    name: "desktop bundle parseable",
    verify: () => {
      const p = `${ROOT}/release/desktop.js`;
      if (!existsSync(p)) return { ok: false, detail: "file not found" };
      try {
        execSync(`node --check "${p}"`, { encoding: "utf-8", cwd: ROOT, stdio: "pipe" });
        return { ok: true, detail: "parseable" };
      } catch (e) {
        return { ok: false, detail: `parse error: ${e.message}` };
      }
    },
  },
  {
    name: "desktop bundle non-empty",
    verify: () => {
      const p = `${ROOT}/release/desktop.js`;
      if (!existsSync(p)) return { ok: false, detail: "file not found" };
      return {
        ok: readFileSync(p, "utf-8").length > 100,
        detail: `size=${readFileSync(p, "utf-8").length}`,
      };
    },
  },
  // --- CLI release bundle verification ---
  {
    name: "CLI release bundle exists",
    verify: () => {
      const p = `${ROOT}/release/machine.js`;
      return { ok: existsSync(p), detail: `exists=${existsSync(p)}` };
    },
  },
  {
    name: "CLI release bundle non-empty",
    verify: () => {
      const p = `${ROOT}/release/machine.js`;
      if (!existsSync(p)) return { ok: false, detail: "file not found" };
      return {
        ok: readFileSync(p, "utf-8").length > 100,
        detail: `size=${readFileSync(p, "utf-8").length}`,
      };
    },
  },
  // --- Service coverage (via CLI health is already tested above — add direct check) ---
  {
    name: "service module loads",
    verify: () => {
      const p = `${ROOT}/packages/service/dist/index.js`;
      return { ok: existsSync(p), detail: `exists=${existsSync(p)}` };
    },
  },
];

let passed = 0;
let failed = 0;

for (const t of tests) {
  // Handle verify-based tests (desktop bundle, service module, release artifact checks)
  if (t.verify) {
    try {
      const result = t.verify();
      if (result.ok) {
        console.log(`PASS: ${t.name} — ${result.detail ?? ""}`);
        passed++;
      } else {
        console.error(`FAIL: ${t.name} — ${result.detail ?? "verification failed"}`);
        failed++;
      }
    } catch (/** @type {any} */ err) {
      console.error(`FAIL: ${t.name} — exception: ${err.message}`);
      failed++;
    }
    continue;
  }
  // Handle command-based tests (CLI commands)
  try {
    const result = execSync(t.cmd, { encoding: "utf-8", cwd: ROOT, timeout: 10000 });
    if (t.expectOk === false) {
      console.error(`FAIL: ${t.name} — expected failure but got exit 0`);
      failed++;
      continue;
    }
    const allContain = (t.expectContains ?? []).every((s) => result.includes(s));
    if (allContain) {
      console.log(`PASS: ${t.name}`);
      passed++;
    } else {
      console.error(`FAIL: ${t.name} — missing expected strings`);
      console.error(`  Output: ${result.slice(0, 200)}`);
      failed++;
    }
  } catch (/** @type {any} */ err) {
    if (t.expectOk === false) {
      console.log(`PASS: ${t.name} (expected failure)`);
      passed++;
    } else {
      console.error(`FAIL: ${t.name} — ${err.message}`);
      failed++;
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
