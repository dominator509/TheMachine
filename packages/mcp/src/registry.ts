// MCP registry implementation with permission checks and stdio JSON-RPC transport.

import { execSync } from "node:child_process";
import type { EntityId } from "@the-machine/core";
import type {
  MCPRegistry,
  MCPServerRegistration,
  MCPInvocationResult,
  MCPToolPermission,
} from "./types.js";

export function createMCPRegistry(): MCPRegistry {
  const servers = new Map<string, MCPServerRegistration>();

  function isToolAllowed(permissions: MCPToolPermission[], toolName: string): boolean {
    const perm = permissions.find((p) => p.toolName === toolName);
    if (!perm) return false; // Implicit deny
    return perm.allowed;
  }

  return {
    register(server: MCPServerRegistration): void {
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
    ): MCPInvocationResult {
      const server = servers.get(serverId);
      if (!server) {
        return { success: false, output: "", error: `MCP server not found: ${serverId}` };
      }

      const tool = server.tools.find((t) => t.name === toolName);
      if (!tool) {
        return {
          success: false,
          output: "",
          error: `Unknown tool: ${toolName} on server ${server.name}`,
        };
      }

      if (!isToolAllowed(server.permissions, toolName)) {
        return {
          success: false,
          output: "",
          error: `Tool '${toolName}' not permitted on server ${server.name}`,
        };
      }

      if (server.transport !== "stdio") {
        return {
          success: false,
          output: "",
          error: `Transport '${server.transport}' is not supported yet for server ${server.name}`,
        };
      }

      try {
        const request = JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: toolName,
          params: args,
        });
        const stdout = execSync(server.endpoint, {
          input: request,
          encoding: "utf-8",
          timeout: 10000,
        });
        const response = JSON.parse(stdout) as {
          result?: unknown;
          error?: { message?: string } | string;
        };
        if (response.error !== undefined) {
          return {
            success: false,
            output: "",
            error:
              typeof response.error === "string"
                ? response.error
                : response.error.message ?? "MCP tool error",
          };
        }
        return {
          success: true,
          output: JSON.stringify(response.result ?? null),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          output: "",
          error: `MCP stdio invocation failed: ${message}`,
        };
      }
    },
  };
}
