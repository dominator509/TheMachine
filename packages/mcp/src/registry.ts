// MCP registry implementation with permission checks and shell-free stdio JSON-RPC transport.

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import type { EntityId } from "@the-machine/core";
import type {
  MCPInvocationOptions,
  MCPInvocationResult,
  MCPRegistry,
  MCPServerRegistration,
  MCPToolPermission,
} from "./types.js";

const DEFAULT_PROTOCOL_VERSION = "2025-06-18";
const MAX_INPUT_BYTES = 1024 * 1024;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

interface JsonRpcResponse {
  readonly jsonrpc?: string;
  readonly id?: string | number;
  readonly result?: unknown;
  readonly error?: { readonly code?: number; readonly message?: string; readonly data?: unknown };
}

function minimalEnvironment(): NodeJS.ProcessEnv {
  const allowed = [
    "PATH",
    "Path",
    "HOME",
    "USERPROFILE",
    "SystemRoot",
    "COMSPEC",
    "PATHEXT",
    "TMP",
    "TEMP",
    "SSL_CERT_FILE",
    "NODE_EXTRA_CA_CERTS",
  ];
  const environment: NodeJS.ProcessEnv = {};
  for (const name of allowed) {
    const value = process.env[name];
    if (value !== undefined) environment[name] = value;
  }
  return environment;
}

function validExecutable(value: string): boolean {
  return value.trim().length > 0 && !value.includes("\0") && !value.includes("\n") && !value.includes("\r");
}

function validArgument(value: string): boolean {
  return !value.includes("\0") && !value.includes("\n") && !value.includes("\r");
}

function permissionFor(
  permissions: readonly MCPToolPermission[],
  toolName: string,
): MCPToolPermission | null {
  return permissions.find((permission) => permission.toolName === toolName) ?? null;
}

function parseJsonRpcLines(stdout: string): JsonRpcResponse[] {
  const responses: JsonRpcResponse[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (line.trim().length === 0) continue;
    try {
      const value = JSON.parse(line) as unknown;
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        responses.push(value as JsonRpcResponse);
      }
    } catch {
      // Server log lines are ignored; required JSON-RPC responses are validated below.
    }
  }
  return responses;
}

function rpcError(prefix: string, response: JsonRpcResponse): MCPInvocationResult {
  return {
    success: false,
    output: "",
    error: `${prefix}: ${response.error?.message ?? "MCP JSON-RPC error"}`,
  };
}

export function createMCPRegistry(): MCPRegistry {
  const servers = new Map<string, MCPServerRegistration>();

  return {
    register(server: MCPServerRegistration): void {
      if (server.transport === "stdio") {
        if (!validExecutable(server.endpoint)) {
          throw new Error(`MCP stdio executable is invalid for server '${server.name}'.`);
        }
        if ((server.args ?? []).some((argument) => !validArgument(argument))) {
          throw new Error(`MCP stdio arguments contain a control character for server '${server.name}'.`);
        }
      }
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

      if (server.transport !== "stdio") {
        return {
          success: false,
          output: "",
          error: `Transport '${server.transport}' is not supported for server ${server.name}`,
        };
      }

      const protocolVersion = server.protocolVersion ?? DEFAULT_PROTOCOL_VERSION;
      const input = [
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion,
            capabilities: {},
            clientInfo: { name: "the-machine", version: "0.3.0-alpha.1" },
          },
        }),
        JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }),
        JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: toolName, arguments: args },
        }),
      ].join("\n");
      if (Buffer.byteLength(input, "utf-8") > MAX_INPUT_BYTES) {
        return { success: false, output: "", error: "MCP request exceeds the input limit" };
      }

      try {
        const timeoutMs = Math.min(Math.max(server.timeoutMs ?? 10_000, 100), 120_000);
        const result = spawnSync(server.endpoint, [...(server.args ?? [])], {
          cwd: server.cwd ? resolve(server.cwd) : process.cwd(),
          env: minimalEnvironment(),
          input: `${input}\n`,
          encoding: "utf-8",
          timeout: timeoutMs,
          maxBuffer: MAX_OUTPUT_BYTES,
          shell: false,
          windowsHide: true,
          stdio: ["pipe", "pipe", "pipe"],
        });
        if (result.error) {
          return {
            success: false,
            output: "",
            error: `MCP stdio invocation failed: ${result.error.message}`,
          };
        }
        if (result.status !== 0) {
          return {
            success: false,
            output: "",
            error: `MCP stdio server exited with ${String(result.status)}: ${(result.stderr ?? "").trim().slice(0, 500)}`,
          };
        }

        const responses = parseJsonRpcLines(result.stdout ?? "");
        const initialize = responses.find((response) => response.id === 1);
        if (!initialize) {
          return { success: false, output: "", error: "MCP server did not answer initialize" };
        }
        if (initialize.error) return rpcError("MCP initialize failed", initialize);
        const initializedResult = initialize.result as { protocolVersion?: unknown } | undefined;
        if (typeof initializedResult?.protocolVersion !== "string") {
          return {
            success: false,
            output: "",
            error: "MCP initialize response omitted protocolVersion",
          };
        }

        const invocation = responses.find((response) => response.id === 2);
        if (!invocation) {
          return { success: false, output: "", error: "MCP server did not answer tools/call" };
        }
        if (invocation.error) return rpcError("MCP tool failed", invocation);
        return { success: true, output: JSON.stringify(invocation.result ?? null) };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          output: "",
          error: `MCP stdio invocation failed: ${message.slice(0, 500)}`,
        };
      }
    },
  };
}
