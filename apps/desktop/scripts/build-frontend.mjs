#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const APP_ROOT = fileURLToPath(new URL("../", import.meta.url));
const REPOSITORY_ROOT = resolve(APP_ROOT, "../..");
const DIST = resolve(APP_ROOT, "dist");
const FRONTEND = resolve(APP_ROOT, "frontend");
const FRONTEND_TSCONFIG = resolve(APP_ROOT, "tsconfig.frontend.json");
const TSC = resolve(REPOSITORY_ROOT, "node_modules", "typescript", "bin", "tsc");

if (!existsSync(TSC)) {
  throw new Error(`TypeScript compiler not found at ${TSC}. Run pnpm install first.`);
}
if (!existsSync(FRONTEND_TSCONFIG)) {
  throw new Error(`Desktop frontend TypeScript configuration missing: ${FRONTEND_TSCONFIG}`);
}

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

const compilation = spawnSync(process.execPath, [TSC, "-p", FRONTEND_TSCONFIG], {
  cwd: REPOSITORY_ROOT,
  encoding: "utf-8",
  shell: false,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
if ((compilation.status ?? 1) !== 0) {
  process.stderr.write(compilation.stdout ?? "");
  process.stderr.write(compilation.stderr ?? "");
  process.exit(compilation.status ?? 1);
}

for (const name of ["index.html", "styles.css"]) {
  const source = resolve(FRONTEND, name);
  if (!existsSync(source)) throw new Error(`Desktop frontend asset missing: ${source}`);
  cpSync(source, resolve(DIST, name));
}
const assets = resolve(FRONTEND, "assets");
if (existsSync(assets)) cpSync(assets, resolve(DIST, "assets"), { recursive: true });

writeFileSync(
  resolve(DIST, "build.json"),
  `${JSON.stringify(
    {
      product: "The Machine Run Console",
      version: "0.3.0-alpha.1",
      builtAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`,
  "utf-8",
);
console.log(`desktop frontend built: ${DIST}`);
