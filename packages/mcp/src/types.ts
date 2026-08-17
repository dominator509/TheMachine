// MCP types and interfaces.

import type { EntityId } from "@the-machine/core";

/** Registered MCP tool descriptor. */
export interface MCPTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

/** Permission for an MCP tool. */
export interface MCPToolPermission {
  readonly toolName: string;
  readonly allowed: boolean;
  readonly requireApproval: boolean;
}

/** A registered MCP server in the registry. */
export interface MCPServerRegistration {
  readonly id: EntityId;
  readonly name: string;
  readonly transport: "stdio" | "sse" | "websocket";
  /** Direct executable for stdio transports. Shell command strings are not accepted. */
  readonly endpoint: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly timeoutMs?: number;
  readonly protocolVersion?: string;
  readonly tools: MCPTool[];
  readonly permissions: MCPToolPermission[];
}

export interface MCPInvocationOptions {
  readonly approved?: boolean;
  readonly approvalId?: string;
}

/** Result of invoking an MCP tool. */
export interface MCPInvocationResult {
  readonly success: boolean;
  readonly output: string;
  readonly error?: string;
}

/** MCP registry interface. */
export interface MCPRegistry {
  register(server: MCPServerRegistration): void;
  unregister(id: EntityId): boolean;
  get(id: EntityId): MCPServerRegistration | null;
  list(): MCPServerRegistration[];
  invoke(
    serverId: EntityId,
    toolName: string,
    args: Record<string, unknown>,
    options?: MCPInvocationOptions,
  ): MCPInvocationResult;
}
