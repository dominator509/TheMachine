// MCP server registry schemas.

import type { EntityId } from "@the-machine/core";
import type { ReleaseDecision } from "./releaseDecision.js";

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
  readonly healthCheckedAt?: string;
  readonly healthEvidence?: string;
  readonly releaseDecision?: ReleaseDecision;
}

export interface MCPListResponse {
  readonly servers: MCPResponse[];
}
