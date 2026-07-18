// MCP server registry schemas.

import type { EntityId } from "@the-machine/core";

export interface MCPRequest {
  readonly workspaceId: EntityId;
  readonly mcpId?: EntityId;
}

export interface MCPResponse {
  readonly id: EntityId;
  readonly name: string;
  readonly transport: "stdio" | "sse" | "websocket";
  readonly endpoint: string;
  readonly tools: string[];
  readonly toolCount: number;
  readonly healthy: boolean;
}

export interface MCPListResponse {
  readonly servers: MCPResponse[];
}
