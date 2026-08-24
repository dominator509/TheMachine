import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";

interface StdioRequest {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
  readonly protocolVersion: string;
  readonly toolName: string;
  readonly arguments: Readonly<Record<string, unknown>>;
}

interface JsonRpcResponse {
  readonly id?: string | number;
  readonly result?: unknown;
  readonly error?: { readonly message?: string };
}

interface HelperResult {
  readonly success: boolean;
  readonly output?: string;
  readonly error?: string;
}

let settled = false;
let child: ChildProcessWithoutNullStreams | null = null;
let timer: NodeJS.Timeout | null = null;
let stderr = "";

function terminateChild(): void {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const pid = child.pid;
  if (!pid) {
    child.kill("SIGTERM");
    return;
  }
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], {
      shell: false,
      windowsHide: true,
      stdio: "ignore",
    });
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

function emit(result: HelperResult): void {
  if (settled) return;
  settled = true;
  if (timer) clearTimeout(timer);
  terminateChild();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.success ? 0 : 1;
}

function rpcError(prefix: string, response: JsonRpcResponse): string {
  return `${prefix}: ${response.error?.message ?? "MCP JSON-RPC error"}`;
}

async function readRequest(): Promise<StdioRequest> {
  let contents = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) contents += chunk;
  return JSON.parse(contents) as StdioRequest;
}

async function main(): Promise<void> {
  const request = await readRequest();
  child = spawn(request.executable, [...request.args], {
    cwd: request.cwd,
    env: { ...request.environment },
    detached: process.platform !== "win32",
    shell: false,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    if (stderr.length < request.maxOutputBytes) {
      stderr += chunk.slice(0, request.maxOutputBytes - stderr.length);
    }
  });
  child.on("error", (error) => {
    emit({ success: false, error: `MCP server launch failed: ${error.message}` });
  });
  child.on("close", (code, signal) => {
    if (settled) return;
    const detail = stderr.trim().slice(0, 1000);
    emit({
      success: false,
      error: `MCP server exited before tools/call completed (code=${String(code)}, signal=${String(signal)})${detail ? `: ${detail}` : ""}`,
    });
  });

  const lines = createInterface({ input: child.stdout });
  let initialized = false;
  lines.on("line", (line) => {
    if (settled || line.trim().length === 0) return;
    if (Buffer.byteLength(line, "utf8") > request.maxOutputBytes) {
      emit({ success: false, error: "MCP response exceeded the output limit" });
      return;
    }

    let response: JsonRpcResponse;
    try {
      response = JSON.parse(line) as JsonRpcResponse;
    } catch {
      return;
    }

    if (response.id === 1) {
      if (response.error) {
        emit({ success: false, error: rpcError("MCP initialize failed", response) });
        return;
      }
      const result = response.result as { protocolVersion?: unknown } | undefined;
      if (typeof result?.protocolVersion !== "string") {
        emit({ success: false, error: "MCP initialize response omitted protocolVersion" });
        return;
      }
      initialized = true;
      child?.stdin.write(
        `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })}\n`,
      );
      child?.stdin.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: request.toolName, arguments: request.arguments },
        })}\n`,
      );
      return;
    }

    if (response.id === 2) {
      if (!initialized) {
        emit({
          success: false,
          error: "MCP tools/call response arrived before initialization completed",
        });
        return;
      }
      if (response.error) {
        emit({ success: false, error: rpcError("MCP tool failed", response) });
        return;
      }
      emit({ success: true, output: JSON.stringify(response.result ?? null) });
    }
  });

  child.stdin.write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: request.protocolVersion,
        capabilities: {},
        clientInfo: { name: "the-machine", version: "0.3.0-alpha.1" },
      },
    })}\n`,
  );

  timer = setTimeout(() => {
    emit({
      success: false,
      error: `MCP stdio invocation timed out after ${String(request.timeoutMs)}ms`,
    });
  }, request.timeoutMs);
}

main().catch((error: unknown) => {
  emit({ success: false, error: error instanceof Error ? error.message : String(error) });
});
