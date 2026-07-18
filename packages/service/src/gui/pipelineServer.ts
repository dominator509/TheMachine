// Pipeline GUI Server — Lightweight HTTP + SSE server for the War Council GUI.
// Pure Node.js (zero dependencies). Starts via `machine gui`.
//
// Endpoints:
//   POST /api/pipeline-event     — receive events from emitToGUI()
//   GET  /api/pipeline-stream    — SSE stream for real-time GUI updates
//   GET  /api/theme/:name        — load a theme manifest
//   GET  /                        — serve the GUI dashboard
//   GET  /assets/*                — serve theme sprites & assets

import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTheme, listThemes, clearThemeCache, type ThemeManifest } from "./themes/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface GuiServerConfig {
  port: number;
  host: string;
  /** Where theme assets live on disk. */
  themeAssetsDir: string;
  /** Path to the GUI dashboard HTML. */
  dashboardPath: string;
  /** Path to the GUI builder HTML. */
  builderPath: string;
}

const DEFAULT_CONFIG: GuiServerConfig = {
  port: 3000,
  host: "127.0.0.1",
  themeAssetsDir: path.resolve(__dirname, "../../src/gui/themes"),
  // In production (compiled to dist/): resolve to source. At dev time: same dir.
  dashboardPath: path.resolve(__dirname, "../../src/gui/dashboard.html"),
  builderPath: path.resolve(__dirname, "../../src/gui/builder.html"),
};

// ---------------------------------------------------------------------------
// SSE Client Registry
// ---------------------------------------------------------------------------

interface SseClient {
  id: number;
  res: http.ServerResponse;
}

let sseClients: SseClient[] = [];
let nextClientId = 0;

function broadcastToSseClients(data: string): void {
  const dead: SseClient[] = [];
  for (const client of sseClients) {
    try {
      client.res.write(data);
    } catch {
      dead.push(client);
    }
  }
  // Clean up dead connections.
  if (dead.length > 0) {
    sseClients = sseClients.filter((c) => !dead.includes(c));
  }
}

// ---------------------------------------------------------------------------
// MIME types for common asset files
// ---------------------------------------------------------------------------

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

function handlePipelineEvent(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  body: string,
): void {
  try {
    const event = JSON.parse(body) as { eventId?: string };
    void event;
    // Broadcast to all SSE clients.
    const sseData = `data: ${body}\n\n`;
    broadcastToSseClients(sseData);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, eventId: event.eventId }));
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "Invalid JSON" }));
  }
}

function handleSseStream(req: http.IncomingMessage, res: http.ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  const client: SseClient = { id: ++nextClientId, res };
  sseClients.push(client);

  // Send initial heartbeat so the client knows the connection is live.
  res.write(`data: ${JSON.stringify({ type: "connected", clientId: client.id })}\n\n`);

  req.on("close", () => {
    sseClients = sseClients.filter((c) => c !== client);
  });
}

function handleTheme(req: http.IncomingMessage, res: http.ServerResponse, themeName: string): void {
  try {
    const theme = loadTheme(themeName);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(theme));
  } catch {
    const available = listThemes().map((t) => t.name);
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: false,
        error: `Theme not found: ${themeName}`,
        available,
      }),
    );
  }
}

function handleListThemes(req: http.IncomingMessage, res: http.ServerResponse): void {
  const themes = listThemes();
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ themes }));
}

function handleSaveTheme(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  body: string,
  _config: GuiServerConfig,
): void {
  try {
    const theme = JSON.parse(body) as ThemeManifest;
    if (!theme.name || typeof theme.name !== "string") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Missing theme name" }));
      return;
    }
    // Sanitize name for filesystem
    const safeName = theme.name.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
    // Resolve the themes source directory
    const srcDir = path.resolve(__dirname, "../../src/gui/themes");
    const distDir = path.resolve(__dirname, "themes");
    const filePath = path.join(srcDir, `${safeName}.json`);

    // Write to source directory
    fs.writeFileSync(filePath, JSON.stringify(theme, null, 2), "utf-8");

    // Mirror entire theme set to dist so compiled code can find them
    if (fs.existsSync(distDir)) {
      fs.writeFileSync(path.join(distDir, `${safeName}.json`), JSON.stringify(theme, null, 2), "utf-8");
      // Also copy all existing source themes to dist if dist is stale
      const srcFiles = fs.readdirSync(srcDir).filter(f => f.endsWith(".json"));
      for (const f of srcFiles) {
        const dest = path.join(distDir, f);
        if (!fs.existsSync(dest)) {
          fs.copyFileSync(path.join(srcDir, f), dest);
        }
      }
    }

    // Invalidate cache so the new theme is immediately available
    clearThemeCache();

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, name: safeName }));
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "Invalid JSON or write error" }));
  }
}

function serveStatic(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  config: GuiServerConfig,
  urlPath: string,
): void {
  // Resolve the file path, preventing directory traversal.
  let filePath: string;

  if (urlPath === "/" || urlPath === "/index.html") {
    filePath = config.dashboardPath;
  } else if (urlPath === "/builder") {
    filePath = config.builderPath;
  } else if (urlPath.startsWith("/assets/")) {
    // Theme assets: /assets/fft-chibi/samurai-idle.png → themeAssetsDir/fft-chibi/assets/samurai-idle.png
    const assetPath = path.normalize(urlPath.replace("/assets/", "")).replace(/^\/+/, "");
    filePath = path.join(config.themeAssetsDir, assetPath);
  } else {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  // Safety: ensure resolved path is within allowed directories
  const resolved = path.resolve(filePath);
  const allowedDirs = [
    config.themeAssetsDir,
    path.dirname(config.dashboardPath),
    path.dirname(config.builderPath),
  ];
  if (!allowedDirs.some((dir) => resolved.startsWith(dir))) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const ext = path.extname(resolved).toLowerCase();
  const mimeType = MIME_TYPES[ext] ?? "application/octet-stream";

  try {
    const content = fs.readFileSync(resolved);
    res.writeHead(200, {
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=3600",
    });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

// ---------------------------------------------------------------------------
// Request router
// ---------------------------------------------------------------------------

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => { data += chunk.toString(); return; });
    req.on("end", () => { resolve(data); });
    req.on("error", reject);
  });
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  config: GuiServerConfig,
): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const method = (req.method ?? "GET").toUpperCase();

  // CORS headers for GUI clients on different ports.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (method === "POST" && url.pathname === "/api/pipeline-event") {
    const body = await readBody(req);
    handlePipelineEvent(req, res, body);
    return;
  }

  if (method === "GET" && url.pathname === "/api/pipeline-stream") {
    handleSseStream(req, res);
    return;
  }

  if (method === "GET" && url.pathname === "/api/themes") {
    handleListThemes(req, res);
    return;
  }

  if (method === "GET" && url.pathname.startsWith("/api/theme/")) {
    const themeName = url.pathname.replace("/api/theme/", "");
    handleTheme(req, res, themeName);
    return;
  }

  if (method === "POST" && url.pathname === "/api/save-theme") {
    const body = await readBody(req);
    handleSaveTheme(req, res, body, config);
    return;
  }

  // Everything else: static files
  serveStatic(req, res, config, url.pathname);
}

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

let server: http.Server | null = null;

export function startGuiServer(config?: Partial<GuiServerConfig>): http.Server {
  if (server) return server;

  const cfg: GuiServerConfig = { ...DEFAULT_CONFIG, ...config };

  server = http.createServer((req, res) => {
    handleRequest(req, res, cfg).catch((err: unknown) => {
      console.error("[pipeline-gui] Unhandled error:", err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal server error");
      }
    });
  });

  server.listen(cfg.port, cfg.host, () => {
    console.log(`[pipeline-gui] War Council GUI server running at http://${cfg.host}:${String(cfg.port)}`);
    console.log(`[pipeline-gui] Dashboard:   http://${cfg.host}:${String(cfg.port)}/`);
    console.log(`[pipeline-gui] Builder:     http://${cfg.host}:${String(cfg.port)}/builder`);
    console.log(`[pipeline-gui] SSE stream:  http://${cfg.host}:${String(cfg.port)}/api/pipeline-stream`);
    console.log(`[pipeline-gui] Themes:      http://${cfg.host}:${String(cfg.port)}/api/themes`);
    console.log(`[pipeline-gui] Available themes: ${listThemes().map(t => t.name).join(', ')}`);
  });

  return server;
}

export function stopGuiServer(): void {
  if (server) {
    // Close all SSE connections.
    for (const client of sseClients) {
      try { client.res.end(); } catch { /* ignore */ }
    }
    sseClients = [];

    server.close();
    server = null;
    console.log("[pipeline-gui] Server stopped.");
  }
}

export function getSseClientCount(): number {
  return sseClients.length;
}
