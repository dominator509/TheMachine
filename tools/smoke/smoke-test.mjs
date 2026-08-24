#!/usr/bin/env node
// Smoke the built CLI and the exact installable release artifact.

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const CLI_PATH = join(ROOT, "apps", "cli", "dist", "index.js");
const RELEASE_DIR = join(ROOT, "release");
const MANIFEST_PATH = join(RELEASE_DIR, "release-manifest.json");
const CHECKSUM_PATH = join(RELEASE_DIR, "checksums.sha256");
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";
const VERSION = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")).version;
let passed = 0;
let failed = 0;

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function execute(executable, args, cwd = ROOT, expectedExitCode = 0, timeout = 30_000) {
  const result = spawnSync(executable, args, {
    cwd,
    encoding: "utf-8",
    shell: false,
    windowsHide: true,
    timeout,
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exitCode = result.status ?? 1;
  if (exitCode !== expectedExitCode) {
    throw new Error(
      `exit=${String(exitCode)} expected=${String(expectedExitCode)} stdout=${result.stdout} stderr=${result.stderr}${result.error ? ` error=${result.error.message}` : ""}`,
    );
  }
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

function check(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
    passed += 1;
  } catch (error) {
    console.error(`FAIL: ${name} — ${error instanceof Error ? error.message : String(error)}`);
    failed += 1;
  }
}

for (const required of [CLI_PATH, join(ROOT, "packages", "service", "dist", "index.js"), MANIFEST_PATH, CHECKSUM_PATH]) {
  if (!existsSync(required)) {
    console.error(`Smoke prerequisite missing: ${required}`);
    console.error("Run `pnpm build` and `pnpm build:release` first.");
    process.exit(1);
  }
}

check("built CLI help", () => {
  const output = execute(process.execPath, [CLI_PATH, "help"]);
  for (const expected of ["Usage", "run <plan.machine.json>", "evidence verify", "kaizen"]) {
    if (!output.includes(expected)) throw new Error(`missing '${expected}'`);
  }
});

check("built CLI exact version", () => {
  const output = execute(process.execPath, [CLI_PATH, "version"]);
  if (!output.includes(VERSION)) throw new Error(`expected version ${VERSION}, received ${output}`);
});

check("built CLI health JSON", () => {
  const output = execute(process.execPath, [CLI_PATH, "--json", "health"]);
  const parsed = JSON.parse(output);
  if (parsed.status !== "ok" || parsed.version !== VERSION) {
    throw new Error(`unexpected health response: ${output}`);
  }
});

check("unknown CLI command fails", () => {
  const output = execute(process.execPath, [CLI_PATH, "nonexistent-command"], ROOT, 1);
  if (!output.includes("Unknown command")) throw new Error("missing unknown-command diagnostic");
});

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
const candidateSha = execute("git", ["rev-parse", "HEAD"]).trim();
check("release manifest pins the exact candidate", () => {
  if (manifest.version !== VERSION) throw new Error("manifest version mismatch");
  if (manifest.candidateSha !== candidateSha) {
    throw new Error(`manifest SHA ${manifest.candidateSha} does not match ${candidateSha}`);
  }
  if (manifest.nativeDesktop?.javascriptSubstituteAllowed !== false) {
    throw new Error("native desktop manifest permits a JavaScript substitute");
  }
});

const checksumEntries = new Map();
for (const line of readFileSync(CHECKSUM_PATH, "utf-8").split("\n").filter(Boolean)) {
  const match = /^([a-f0-9]{64})\s{2}(.+)$/.exec(line);
  if (!match) throw new Error(`Malformed checksum line: ${line}`);
  if (checksumEntries.has(match[2])) throw new Error(`Duplicate checksum entry: ${match[2]}`);
  checksumEntries.set(match[2], match[1]);
}

check("release checksums match every declared artifact", () => {
  for (const artifact of manifest.artifacts ?? []) {
    const filePath = join(RELEASE_DIR, artifact.path);
    if (!existsSync(filePath)) throw new Error(`missing artifact ${artifact.path}`);
    const actual = sha256(filePath);
    if (actual !== artifact.sha256) throw new Error(`manifest hash mismatch for ${artifact.path}`);
    if (checksumEntries.get(artifact.path) !== actual) {
      throw new Error(`checksum file mismatch for ${artifact.path}`);
    }
  }
});

const tarballs = (manifest.artifacts ?? []).filter((artifact) => artifact.type === "npm-tarball");
check("release contains exactly one installable CLI tarball", () => {
  if (tarballs.length !== 1) throw new Error(`expected one CLI tarball, received ${String(tarballs.length)}`);
  if (!tarballs[0].path.endsWith(".tgz")) throw new Error("CLI artifact is not an npm tarball");
});

if (tarballs.length === 1 && process.env.MACHINE_SMOKE_SKIP_CLEAN_ROOM !== "1") {
  const cleanRoom = mkdtempSync(join(tmpdir(), "machine-release-install-"));
  try {
    writeFileSync(
      join(cleanRoom, "package.json"),
      `${JSON.stringify({ name: "machine-clean-room", version: "1.0.0", private: true }, null, 2)}\n`,
    );
    check("clean-room install exact CLI tarball", () => {
      execute(
        NPM,
        [
          "install",
          "--no-audit",
          "--no-fund",
          "--save-exact",
          resolve(RELEASE_DIR, tarballs[0].path),
        ],
        cleanRoom,
        0,
        300_000,
      );
    });

    const installedBin =
      process.platform === "win32"
        ? join(cleanRoom, "node_modules", ".bin", "machine.cmd")
        : join(cleanRoom, "node_modules", ".bin", "machine");
    check("installed artifact reports exact version", () => {
      if (!existsSync(installedBin)) throw new Error(`installed executable missing: ${installedBin}`);
      const output = execute(installedBin, ["version"], cleanRoom);
      if (!output.includes(VERSION)) throw new Error(`installed version mismatch: ${output}`);
    });
    check("installed artifact health works", () => {
      const output = execute(installedBin, ["--json", "health"], cleanRoom);
      const parsed = JSON.parse(output);
      if (parsed.status !== "ok" || parsed.version !== VERSION) {
        throw new Error(`installed health mismatch: ${output}`);
      }
    });
  } finally {
    rmSync(cleanRoom, { recursive: true, force: true });
  }
}

check("release directory contains no fake desktop JavaScript artifact", () => {
  const names = readdirSync(RELEASE_DIR);
  if (names.includes("desktop.js") || names.includes("package-desktop.json")) {
    throw new Error("legacy fake desktop artifact is still present");
  }
});

console.log(`\n${String(passed)} passed, ${String(failed)} failed`);
process.exit(failed > 0 ? 1 : 0);
