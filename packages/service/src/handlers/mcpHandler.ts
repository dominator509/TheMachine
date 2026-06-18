import type { MCPRequest, MCPResponse, MCPListResponse } from "../contracts/mcp.js";
import type { EntityId } from "@the-machine/core";

export interface MCPHandler {
  get(req: MCPRequest): MCPResponse | null;
  list(): MCPListResponse;
  register(
    id: EntityId,
    name: string,
    transport: "stdio" | "sse" | "websocket",
    endpoint: string,
    tools: string[],
  ): MCPResponse;
}

export function createMCPHandler(): MCPHandler {
  const servers = new Map<string, MCPResponse>();

  return {
    get(req: MCPRequest): MCPResponse | null {
      if (req.mcpId) return servers.get(req.mcpId) ?? null;
      const all = Array.from(servers.values());
      return all[0] ?? null;
    },

    list(): MCPListResponse {
      return { servers: Array.from(servers.values()) };
    },

    register(
      id: EntityId,
      name: string,
      transport: "stdio" | "sse" | "websocket",
      endpoint: string,
      tools: string[],
    ): MCPResponse {
      const server: MCPResponse = {
        id,
        name,
        transport,
        endpoint,
        tools,
        toolCount: tools.length,
        healthy: true,
      };
      servers.set(id, server);
      return server;
    },
  };
}
