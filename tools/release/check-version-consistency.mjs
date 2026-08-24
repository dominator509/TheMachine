#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

function json(relativePath) {
  return JSON.parse(readFileSync(join(ROOT, relativePath), "utf-8"));
}

function cargoVersion() {
  const contents = readFileSync(join(ROOT, "apps/desktop/src-tauri/Cargo.toml"), "utf-8");
  const packageSection = /\[package\]([\s\S]*?)(?:\n\[|$)/.exec(contents)?.[1] ?? "";
  const match = /^version\s*=\s*"([^"]+)"/m.exec(packageSection);
  if (!match) throw new Error("Cargo package version is missing");
  return match[1];
}

const rootVersion = json("package.json").version;
const versions = {
  root: rootVersion,
  cli: json("apps/cli/package.json").version,
  desktopPackage: json("apps/desktop/package.json").version,
  tauri: json("apps/desktop/src-tauri/tauri.conf.json").version,
  cargo: cargoVersion(),
};
const mismatches = Object.entries(versions).filter(([, version]) => version !== rootVersion);
if (mismatches.length > 0) {
  console.error(`Release version mismatch. Canonical root version: ${rootVersion}`);
  for (const [component, version] of Object.entries(versions)) {
    console.error(`- ${component}: ${version}`);
  }
  process.exit(1);
}
console.log(`Release versions are consistent: ${rootVersion}`);
