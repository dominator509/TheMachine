#!/usr/bin/env node

import { existsSync, readFileSync, statSync, watch } from "node:fs";
import { createServer } from "node:http";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const APP_ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIST = resolve(APP_ROOT, "dist");
const BUILD_SCRIPT = resolve(APP_ROOT, "scripts", "build-frontend.mjs");
const HOST = "127.0.0.1";
const PORT = 1420;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function build() {
  const result = spawnSync(process.execPath, [BUILD_SCRIPT], {
    cwd: APP_ROOT,
    encoding: "utf-8",
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if ((result.status ?? 1) !== 0) console.error("desktop rebuild failed");
}

build();
let rebuildTimer = null;
const scheduleBuild = () => {
  if (rebuildTimer) clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(build, 120);
};
for (const directory of [resolve(APP_ROOT, "src"), resolve(APP_ROOT, "frontend")]) {
  if (!existsSync(directory)) continue;
  try {
    watch(directory, { recursive: true }, scheduleBuild);
  } catch {
    watch(directory, scheduleBuild);
  }
}

createServer((request, response) => {
  const requestUrl = new URL(request.url ?? "/", `http://${HOST}:${String(PORT)}`);
  const requested = requestUrl.pathname === "/" ? "index.html" : requestUrl.pathname.slice(1);
  const filePath = resolve(DIST, requested);
  const rel = relative(DIST, filePath);
  if (rel.startsWith("..") || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  response.writeHead(200, {
    "content-type": MIME[extname(filePath)] ?? "application/octet-stream",
    "cache-control": "no-store",
    "content-security-policy":
      "default-src 'self'; connect-src 'self' ipc: http://ipc.localhost; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  });
  response.end(readFileSync(filePath));
}).listen(PORT, HOST, () => {
  console.log(`desktop dev server: http://${HOST}:${String(PORT)}`);
});
