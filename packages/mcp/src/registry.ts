// MCP registry implementation with approval checks and a persistent shell-free stdio client.

import { spawnSync } from "node:child_process";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { EntityId } from "@the-machine/core";
import type {
  MCPInvocationOptions,
  MCPInvocationResult,
  MCPRegistry,
  MCPServerRegistration,
  MCPToolPermission,
} from "./types.js";

const DEFAULT_PROTOCOL_VERSION = "2025-06-18";
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_INPUT_BYTES = 1024 * 1024;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const STDIO_HELPER = fileURLToPath(new URL("./stdio-helper.js", import.meta.url));
const DENIED_EXECUTABLES = new Set([
  "bash",
  "bash.exe",
  "cmd",
  "cmd.exe",
  "dash",
  "fish",
  "powershell",
  "powershell.exe",
  "pwsh",
  "pwsh.exe",
  "sh",
  "sh.exe",
  "zsh",
]);

function permissionFor(
  permissions: readonly MCPToolPermission[],
  toolName: string,
): MCPToolPermission | null {
  return permissions.find((permission) => permission.toolName === toolName) ?? null;
}

function safeEnvironment(server: MCPServerRegistration): Record<string, string> {
  const environment: Record<string, string> = {};
  const safeNames = [
    "HOME",
    "LANG",
    "LC_ALL",
    "NO_PROXY",
    "PATH",
    "PATHEXT",
    "SSL_CERT_FILE",
    "SystemRoot",
    "TEMP",
    "TMP",
    "USERPROFILE",
  ];
  for (const name of safeNames) {
    const value = process.env[name];
    if (value !== undefined) environment[name] = value;
  }
  for (const name of server.passEnvironment ?? []) {
    const value = process.env[name];
    if (value !== undefined) environment[name] = value;
  }
  for (const [name, value] of Object.entries(server.environment ?? {})) {
    environment[name] = value;
  }
  return environment;
}

function validateRegistration(server: MCPServerRegistration): void {
  if (server.transport !== "stdio") return;
  const executable = server.endpoint.trim();
  if (executable.length === 0 || executable.includes("\0") || /[\r\n]/.test(executable)) {
    throw new Error(`MCP server '${server.name}' must declare one direct executable.`);
  }
  if (DENIED_EXECUTABLES.has(basename(executable).toLowerCase())) {
    throw new Error(`MCP server '${server.name}' cannot use a shell executable.`);
  }
  for (const argument of server.args ?? []) {
    if (argument.includes("\0") || /[\r\n]/.test(argument)) {
      throw new Error(`MCP server '${server.name}' has an invalid argument.`);
    }
  }
}

function parseHelperResult(result: ReturnType<typeof spawnSync>): MCPInvocationResult {
  const stdout = result.stdout ?? "";
  try {
    const parsed = JSON.parse(stdout.trim()) as {
      success: boolean;
      output?: string;
      error?: string;
    };
    return parsed.success
      ? { success: true, output: parsed.output ?? "null" }
      : { success: false, output: "", error: parsed.error ?? "MCP invocation failed" };
  } catch {
    const detail = `${result.stderr ?? ""}${result.error ? `\n${result.error.message}` : ""}`.trim();
    return {
      success: false,
      output: "",
      error: `MCP stdio client returned no valid result${detail ? `: ${detail.slice(0, 1000)}` : "."}`,
    };
  }
}

export function createMCPRegistry(): MCPRegistry {
  const servers = new Map<string, MCPServerRegistration>();

  return {
    register(server: MCPServerRegistration): void {
      validateRegistration(server);
      servers.set(server.id, server);
    },

    unregister(id: EntityId): boolean {
      return servers.delete(id);
    },

    get(id: EntityId): MCPServerRegistration | null {
      return servers.get(id) ?? null;
    },

    list(): MCPServerRegistration[] {
      return Array.from(servers.values());
    },

    invoke(
      serverId: EntityId,
      toolName: string,
      args: Record<string, unknown>,
      options: MCPInvocationOptions = {},
    ): MCPInvocationResult {
      const server = servers.get(serverId);
      if (!server) {
        return { success: false, output: "", error: `MCP server not found: ${serverId}` };
      }

      const tool = server.tools.find((candidate) => candidate.name === toolName);
      if (!tool) {
        return {
          success: false,
          output: "",
          error: `Unknown tool: ${toolName} on server ${server.name}`,
        };
      }

      const permission = permissionFor(server.permissions, toolName);
      if (!permission?.allowed) {
        return {
          success: false,
          output: "",
          error: `Tool '${toolName}' not permitted on server ${server.name}`,
        };
      }
      if (permission.requireApproval && options.approved !== true) {
        return {
          success: false,
          output: "",
          error: `Tool '${toolName}' requires explicit approval on server ${server.name}`,
        };
      }
      if (permission.requireApproval && !options.approvalId?.trim()) {
        return {
          success: false,
          output: "",
          error: `Tool '${toolName}' approval must include a durable approval ID.`,
        };
      }

      if (server.transport !== "stdio") {
        return {
          success: false,
          output: "",
          error: `Transport '${server.transport}' is not supported for server ${server.name}`,
        };
      }

      const timeoutMs = Math.min(Math.max(server.timeoutMs ?? DEFAULT_TIMEOUT_MS, 100), 120_000);
      const request = JSON.stringify({
        executable: server.endpoint,
        args: [...(server.args ?? [])],
        cwd: resolve(server.cwd ?? process.cwd()),
        environment: safeEnvironment(server),
        timeoutMs,
        maxOutputBytes: MAX_OUTPUT_BYTES,
        protocolVersion: server.protocolVersion ?? DEFAULT_PROTOCOL_VERSION,
        toolName,
        arguments: args,
      });
      if (Buffer.byteLength(request, "utf8") > MAX_INPUT_BYTES) {
        return { success: false, output: "", error: "MCP request exceeds the input limit" };
      }

      const result = spawnSync(process.execPath, [STDIO_HELPER], {
        input: request,
        encoding: "utf-8",
        shell: false,
        windowsHide: true,
        timeout: timeoutMs + 2_500,
        maxBuffer: MAX_OUTPUT_BYTES,
        stdio: ["pipe", "pipe", "pipe"],
      });
      return parseHelperResult(result);
    },
  };
}
