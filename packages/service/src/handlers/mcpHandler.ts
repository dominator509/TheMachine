import type { MCPRequest, MCPResponse, MCPListResponse } from "../contracts/mcp.js";
import type { ReleaseDecision } from "../contracts/releaseDecision.js";
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
    releaseDecision?: ReleaseDecision,
  ): MCPResponse;
  recordHealth(
    mcpId: EntityId,
    healthy: boolean,
    evidence: string,
    checkedAt?: string,
  ): MCPResponse | null;
  acceptRelease(mcpId: EntityId, decision: ReleaseDecision): MCPResponse | null;
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
      releaseDecision?: ReleaseDecision,
    ): MCPResponse {
      const server: MCPResponse = {
        id,
        name,
        transport,
        endpoint,
        tools,
        toolCount: tools.length,
        healthy: false,
        ...(releaseDecision ? { releaseDecision } : {}),
      };
      servers.set(id, server);
      return server;
    },

    recordHealth(mcpId, healthy, evidence, checkedAt): MCPResponse | null {
      const server = servers.get(mcpId);
      if (!server) return null;
      if (evidence.trim().length === 0) throw new Error("MCP health evidence must not be empty.");
      const updated: MCPResponse = {
        ...server,
        healthy,
        healthCheckedAt: checkedAt ?? new Date().toISOString(),
        healthEvidence: evidence,
      };
      servers.set(mcpId, updated);
      return updated;
    },

    acceptRelease(mcpId: EntityId, decision: ReleaseDecision): MCPResponse | null {
      const server = servers.get(mcpId);
      if (!server) return null;
      const updated: MCPResponse = { ...server, releaseDecision: decision };
      servers.set(mcpId, updated);
      return updated;
    },
  };
}
