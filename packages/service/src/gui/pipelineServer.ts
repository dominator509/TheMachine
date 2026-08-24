import { randomBytes, timingSafeEqual } from "node:crypto";
import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { clearThemeCache, listThemes, loadTheme } from "./themes/index.js";
import type { ThemeManifest } from "./themes/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const SESSION_COOKIE = "machine_session";

export interface GuiServerConfig {
  readonly port: number;
  readonly host: string;
  readonly themeAssetsDir: string;
  readonly dashboardPath: string;
  readonly builderPath: string;
  readonly maxBodyBytes: number;
  readonly allowRemote: boolean;
  /** Optional externally generated capabilities for a supervised launch. */
  readonly viewerToken?: string;
  readonly eventToken?: string;
}

export interface GuiServerAccess {
  readonly dashboardUrl: string;
  readonly builderUrl: string;
  readonly eventWebhookUrl: string;
  readonly eventToken: string;
}

type ResolvedGuiServerConfig = Omit<GuiServerConfig, "viewerToken" | "eventToken">;

const DEFAULT_CONFIG: ResolvedGuiServerConfig = {
  port: 3000,
  host: "127.0.0.1",
  themeAssetsDir: path.resolve(__dirname, "../../src/gui/themes"),
  dashboardPath: path.resolve(__dirname, "../../src/gui/dashboard.html"),
  builderPath: path.resolve(__dirname, "../../src/gui/builder.html"),
  maxBodyBytes: 1024 * 1024,
  allowRemote: false,
};

interface SseClient {
  readonly id: number;
  readonly res: http.ServerResponse;
}

interface ActiveServer {
  readonly server: http.Server;
  readonly config: ResolvedGuiServerConfig;
  readonly sessionToken: string;
  readonly viewerToken: string;
  readonly eventToken: string;
  readonly access: GuiServerAccess;
}

let activeServer: ActiveServer | null = null;
let sseClients: SseClient[] = [];
let nextClientId = 0;

const MIME_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasUnsafeDisplayCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (character === "<" || character === ">" || code <= 0x1f) return true;
  }
  return false;
}

function safeDisplayText(value: unknown, maximumLength: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximumLength &&
    !hasUnsafeDisplayCharacter(value)
  );
}

function validTheme(value: unknown): value is ThemeManifest {
  if (!isRecord(value)) return false;
  const name = value["name"];
  if (typeof name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(name)) {
    return false;
  }
  for (const [key, maximum] of [
    ["label", 100],
    ["description", 500],
    ["style", 100],
    ["version", 40],
  ] as const) {
    if (!safeDisplayText(value[key], maximum)) return false;
  }
  if (!isRecord(value["chrome"]) || !isRecord(value["stations"]) || !isRecord(value["sprites"])) {
    return false;
  }
  return (
    Object.keys(value["stations"]).length <= 200 && Object.keys(value["sprites"]).length <= 500
  );
}

function broadcastToSseClients(data: string): void {
  const failed = new Set<number>();
  for (const client of sseClients) {
    try {
      client.res.write(data);
    } catch {
      failed.add(client.id);
    }
  }
  if (failed.size > 0) sseClients = sseClients.filter((client) => !failed.has(client.id));
}

function hostWithoutPort(hostHeader: string): string {
  if (hostHeader.startsWith("[")) return hostHeader.slice(0, hostHeader.indexOf("]") + 1);
  return hostHeader.split(":")[0] ?? hostHeader;
}

function requestHostAllowed(req: http.IncomingMessage, config: ResolvedGuiServerConfig): boolean {
  const hostHeader = req.headers.host;
  if (!hostHeader) return false;
  const host = hostWithoutPort(hostHeader).toLowerCase();
  return config.allowRemote ? host === config.host.toLowerCase() : LOOPBACK_HOSTS.has(host);
}

function remoteIsLoopback(req: http.IncomingMessage): boolean {
  const address = req.socket.remoteAddress ?? "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function originAllowed(req: http.IncomingMessage, config: ResolvedGuiServerConfig): boolean {
  if (req.headers["sec-fetch-site"] === "cross-site") return false;
  const origin = req.headers.origin;
  if (!origin) return remoteIsLoopback(req);
  try {
    const parsed = new URL(origin);
    const originHost = parsed.hostname.toLowerCase();
    const expectedPort = String(config.port);
    const actualPort = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
    return (
      parsed.protocol === "http:" &&
      actualPort === expectedPort &&
      (config.allowRemote
        ? originHost === config.host.toLowerCase()
        : LOOPBACK_HOSTS.has(originHost))
    );
  } catch {
    return false;
  }
}

function parseCookies(req: http.IncomingMessage): Readonly<Record<string, string>> {
  const cookies: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key) cookies[key] = value;
  }
  return cookies;
}

function safeTokenEqual(left: string | undefined, right: string): boolean {
  if (!left) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function sessionAllowed(req: http.IncomingMessage, token: string): boolean {
  return safeTokenEqual(parseCookies(req)[SESSION_COOKIE], token);
}

function bearerAllowed(req: http.IncomingMessage, token: string): boolean {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) return false;
  return safeTokenEqual(authorization.slice("Bearer ".length), token);
}

function setSecurityHeaders(res: http.ServerResponse): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  );
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function forbidden(res: http.ServerResponse, message: string): void {
  json(res, 403, { ok: false, error: message });
}

async function readBody(req: http.IncomingMessage, maximumBytes: number): Promise<string> {
  return await new Promise<string>((resolveBody, reject) => {
    let data = "";
    let bytes = 0;
    req.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maximumBytes) {
        reject(new Error(`Request body exceeds ${String(maximumBytes)} bytes.`));
        req.destroy();
        return;
      }
      data += chunk.toString("utf-8");
    });
    req.on("end", () => resolveBody(data));
    req.on("error", reject);
  });
}

function handlePipelineEvent(res: http.ServerResponse, body: string): void {
  try {
    const event = JSON.parse(body) as unknown;
    if (!isRecord(event)) {
      json(res, 400, { ok: false, error: "Event must be a JSON object." });
      return;
    }
    broadcastToSseClients(`data: ${JSON.stringify(event)}\n\n`);
    json(res, 200, { ok: true, eventId: event["eventId"] ?? null });
  } catch {
    json(res, 400, { ok: false, error: "Invalid JSON." });
  }
}

function handleSseStream(req: http.IncomingMessage, res: http.ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-store",
    Connection: "keep-alive",
  });
  const client: SseClient = { id: ++nextClientId, res };
  sseClients.push(client);
  res.write(`data: ${JSON.stringify({ type: "connected", clientId: client.id })}\n\n`);
  req.on("close", () => {
    sseClients = sseClients.filter((candidate) => candidate.id !== client.id);
  });
}

function handleTheme(res: http.ServerResponse, name: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(name)) {
    json(res, 400, { ok: false, error: "Invalid theme name." });
    return;
  }
  try {
    const theme: unknown = loadTheme(name);
    if (!validTheme(theme)) {
      json(res, 500, { ok: false, error: "Stored theme failed schema validation." });
      return;
    }
    json(res, 200, theme);
  } catch {
    json(res, 404, {
      ok: false,
      error: `Theme not found: ${name}`,
      available: listThemes().map((theme) => theme.name),
    });
  }
}

function handleSaveTheme(
  res: http.ServerResponse,
  body: string,
  config: ResolvedGuiServerConfig,
): void {
  try {
    const parsed: unknown = JSON.parse(body);
    if (!validTheme(parsed)) {
      json(res, 400, { ok: false, error: "Theme manifest failed schema validation." });
      return;
    }
    const safeName = parsed.name.toLowerCase();
    fs.mkdirSync(config.themeAssetsDir, { recursive: true, mode: 0o700 });
    const filePath = path.resolve(config.themeAssetsDir, `${safeName}.json`);
    const relativePath = path.relative(path.resolve(config.themeAssetsDir), filePath);
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      forbidden(res, "Theme path escapes the configured theme directory.");
      return;
    }
    fs.writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`, {
      encoding: "utf-8",
      mode: 0o600,
    });
    clearThemeCache();
    json(res, 200, { ok: true, name: safeName });
  } catch (error) {
    json(res, 400, {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid JSON or write error.",
    });
  }
}

function allowedStaticPath(filePath: string, config: ResolvedGuiServerConfig): boolean {
  const resolved = path.resolve(filePath);
  const roots = [
    path.resolve(config.themeAssetsDir),
    path.dirname(path.resolve(config.dashboardPath)),
    path.dirname(path.resolve(config.builderPath)),
  ];
  return roots.some((root) => {
    const relativePath = path.relative(root, resolved);
    return (
      relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
    );
  });
}

function serveStatic(
  res: http.ServerResponse,
  config: ResolvedGuiServerConfig,
  urlPath: string,
  sessionToken: string,
  establishSession: boolean,
): void {
  let filePath: string;
  if (urlPath === "/" || urlPath === "/index.html") filePath = config.dashboardPath;
  else if (urlPath === "/builder") filePath = config.builderPath;
  else if (urlPath.startsWith("/assets/")) {
    const assetPath = urlPath.slice("/assets/".length);
    if (assetPath.includes("\0") || assetPath.split("/").includes("..")) {
      forbidden(res, "Invalid asset path.");
      return;
    }
    filePath = path.resolve(config.themeAssetsDir, assetPath);
  } else {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  if (!allowedStaticPath(filePath, config)) {
    forbidden(res, "Static path escapes the configured roots.");
    return;
  }
  try {
    const content = fs.readFileSync(filePath);
    const extension = path.extname(filePath).toLowerCase();
    const headers: Record<string, string> = {
      "Content-Type": MIME_TYPES[extension] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    };
    if (establishSession) {
      headers["Set-Cookie"] =
        `${SESSION_COOKIE}=${sessionToken}; HttpOnly; SameSite=Strict; Path=/`;
    }
    res.writeHead(200, headers);
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  active: ActiveServer,
): Promise<void> {
  const { config, sessionToken, viewerToken, eventToken } = active;
  setSecurityHeaders(res);
  if (!requestHostAllowed(req, config)) {
    forbidden(res, "Host is not allowed.");
    return;
  }
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const method = (req.method ?? "GET").toUpperCase();

  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (method === "POST" && !originAllowed(req, config)) {
    forbidden(res, "Cross-origin write request denied.");
    return;
  }

  if (method === "POST" && url.pathname === "/api/pipeline-event") {
    if (!bearerAllowed(req, eventToken)) {
      forbidden(res, "Missing or invalid event-producer capability.");
      return;
    }
    handlePipelineEvent(res, await readBody(req, config.maxBodyBytes));
    return;
  }

  if (url.pathname.startsWith("/api/") && !sessionAllowed(req, sessionToken)) {
    forbidden(res, "Missing or invalid viewer session.");
    return;
  }

  if (method === "GET" && url.pathname === "/api/pipeline-stream") {
    handleSseStream(req, res);
    return;
  }
  if (method === "GET" && url.pathname === "/api/themes") {
    json(res, 200, { themes: listThemes() });
    return;
  }
  if (method === "GET" && url.pathname.startsWith("/api/theme/")) {
    handleTheme(res, decodeURIComponent(url.pathname.slice("/api/theme/".length)));
    return;
  }
  if (method === "POST" && url.pathname === "/api/save-theme") {
    handleSaveTheme(res, await readBody(req, config.maxBodyBytes), config);
    return;
  }
  if (method !== "GET") {
    res.writeHead(405, { Allow: "GET, POST, OPTIONS" });
    res.end("Method not allowed");
    return;
  }

  const hasSession = sessionAllowed(req, sessionToken);
  const hasBootstrapCapability = safeTokenEqual(
    url.searchParams.get("access") ?? undefined,
    viewerToken,
  );
  const canBootstrap =
    (url.pathname === "/" || url.pathname === "/index.html" || url.pathname === "/builder") &&
    hasBootstrapCapability;
  if (!hasSession && !canBootstrap) {
    forbidden(res, "A viewer launch capability is required.");
    return;
  }
  serveStatic(res, config, url.pathname, sessionToken, canBootstrap);
}

function createAccess(
  config: ResolvedGuiServerConfig,
  viewerToken: string,
  eventToken: string,
): GuiServerAccess {
  const base = `http://${config.host}:${String(config.port)}`;
  return {
    dashboardUrl: `${base}/?access=${encodeURIComponent(viewerToken)}`,
    builderUrl: `${base}/builder?access=${encodeURIComponent(viewerToken)}`,
    eventWebhookUrl: `${base}/api/pipeline-event`,
    eventToken,
  };
}

export function startGuiServer(config?: Partial<GuiServerConfig>): http.Server {
  if (activeServer) return activeServer.server;
  const merged: ResolvedGuiServerConfig = {
    ...DEFAULT_CONFIG,
    ...config,
  };
  if (!merged.allowRemote && !LOOPBACK_HOSTS.has(merged.host.toLowerCase())) {
    throw new Error("The GUI server is loopback-only unless allowRemote is explicitly enabled.");
  }
  if (!Number.isInteger(merged.port) || merged.port < 1 || merged.port > 65_535) {
    throw new Error(`Invalid GUI port: ${String(merged.port)}`);
  }
  const sessionToken = randomBytes(32).toString("base64url");
  const viewerToken = config?.viewerToken ?? randomBytes(32).toString("base64url");
  const eventToken = config?.eventToken ?? randomBytes(32).toString("base64url");
  const access = createAccess(merged, viewerToken, eventToken);
  const server = http.createServer((req, res) => {
    const active = activeServer;
    if (!active) {
      json(res, 503, { ok: false, error: "GUI server is stopping." });
      return;
    }
    handleRequest(req, res, active).catch((error: unknown) => {
      console.error("[pipeline-gui] Unhandled error:", error);
      if (!res.headersSent) json(res, 500, { ok: false, error: "Internal server error." });
      else res.end();
    });
  });
  activeServer = { server, config: merged, sessionToken, viewerToken, eventToken, access };
  server.listen(merged.port, merged.host, () => {
    console.log(`[pipeline-gui] Running at http://${merged.host}:${String(merged.port)}`);
    console.log(`[pipeline-gui] Dashboard launch URL: ${access.dashboardUrl}`);
    console.log(`[pipeline-gui] Builder launch URL: ${access.builderUrl}`);
  });
  return server;
}

export function stopGuiServer(): void {
  if (!activeServer) return;
  for (const client of sseClients) {
    try {
      client.res.end();
    } catch {
      // Connection already closed.
    }
  }
  sseClients = [];
  activeServer.server.close();
  activeServer = null;
}

export function getSseClientCount(): number {
  return sseClients.length;
}

export function getGuiServerConfig(): ResolvedGuiServerConfig | null {
  return activeServer?.config ?? null;
}

export function getGuiServerAccess(): GuiServerAccess | null {
  return activeServer ? { ...activeServer.access } : null;
}
