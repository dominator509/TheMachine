// MCP registry implementation — permissioned mock with fake transport.

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

      // Mock invocation — no real MCP transport.
      return {
        success: true,
        output: JSON.stringify({
          result: `[MOCK MCP] ${server.name}/${toolName} invoked`,
          args,
        }),
      };
    },
  };
}
