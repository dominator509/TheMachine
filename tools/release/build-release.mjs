#!/usr/bin/env node
// Release build — bundle CLI and desktop into release/ directory.
// Produces unsigned local artifacts. Use --sign for production signing (STOP required).

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, cpSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RELEASE_DIR = join(ROOT, "release");

const pkgPath = join(ROOT, "package.json");
const PKG_JSON = JSON.parse(readFileSync(pkgPath, "utf-8"));

const version = PKG_JSON.version ?? "0.0.0";
const args = process.argv.slice(2);
const signMode = args.includes("--sign");

if (signMode) {
  console.error("ERROR: Production signing requires explicit STOP and approval.");
  process.exit(1);
}

// Ensure clean release directory
if (existsSync(RELEASE_DIR)) {
  rmSync(RELEASE_DIR, { recursive: true, force: true });
}
mkdirSync(RELEASE_DIR, { recursive: true });

console.log(`Building release v${version}...`);

// Step 1: Run the normal turbo build first
console.log("\n[1/3] Running turbo build...");
execSync("pnpm run build", { cwd: ROOT, stdio: "inherit" });

// Step 2: Bundle CLI with esbuild
console.log("\n[2/3] Bundling CLI...");
execSync(
  `npx esbuild apps/cli/src/index.ts --bundle --platform=node --target=node20 --format=esm --outfile=release/machine.js --external:esbuild --external:better-sqlite3`,
  { cwd: ROOT, stdio: "inherit" },
);

// Step 3: Bundle desktop with esbuild
console.log("\n[3/3] Bundling desktop...");
execSync(
  `npx esbuild apps/desktop/src/index.ts --bundle --platform=node --target=node20 --format=esm --outfile=release/desktop.js --external:esbuild --external:better-sqlite3`,
  { cwd: ROOT, stdio: "inherit" },
);

// Write version info
writeFileSync(join(RELEASE_DIR, "version.txt"), `${version}\n`, "utf-8");

// Copy package files for npm distribution
const cliPkgPath = join(ROOT, "apps", "cli", "package.json");
const cliPkg = JSON.parse(readFileSync(cliPkgPath, "utf-8"));
const desktopPkgPath = join(ROOT, "apps", "desktop", "package.json");
const desktopPkg = JSON.parse(readFileSync(desktopPkgPath, "utf-8"));

cliPkg.main = "machine.js";
cliPkg.bin = { machine: "machine.js" };
desktopPkg.main = "desktop.js";

writeFileSync(
  join(RELEASE_DIR, "package-cli.json"),
  JSON.stringify(cliPkg, null, 2) + "\n",
  "utf-8",
);
writeFileSync(
  join(RELEASE_DIR, "package-desktop.json"),
  JSON.stringify(desktopPkg, null, 2) + "\n",
  "utf-8",
);

console.log(`\nRelease v${version} built in release/`);
console.log("  release/machine.js   — CLI (unsigned)");
console.log("  release/desktop.js   — Desktop shell (unsigned)");
console.log("  release/version.txt  — version info");
console.log("\nbuild: ok");
