// Provider, MCP, Plugin, and Readiness entities.
// No infrastructure imports.

import type { EntityId, ActivityStatus, SemVer } from "./types.js";

/** Provider capability tier. */
export type ProviderTier = "cloud" | "local" | "hybrid";

/** LLM provider adapter configuration (no secret values — use SecretReference). */
export interface ProviderConfig {
  readonly id: EntityId;
  readonly name: string;
  readonly tier: ProviderTier;
  readonly endpoint: string;
  readonly models: string[];
  readonly timeoutMs: number;
  readonly healthCheckCommand: string;
}

/** MCP server registry entry. */
export interface MCPConfig {
  readonly id: EntityId;
  readonly name: string;
  readonly transport: "stdio" | "sse" | "websocket";
  readonly endpoint: string;
  readonly tools: string[];
  readonly permissions: MCPPermission[];
  readonly healthCheckCommand: string;
}

/** A single MCP tool permission. */
export interface MCPPermission {
  readonly toolName: string;
  readonly allowed: boolean;
  readonly requireApproval: boolean;
}

/** Plugin manifest (no secret values). */
export interface PluginManifest {
  readonly id: EntityId;
  readonly name: string;
  readonly version: SemVer;
  readonly entryPoint: string;
  readonly permissions: PluginPermission[];
}

/** Plugin permission entry. */
export interface PluginPermission {
  readonly resource: string;
  readonly actions: string[];
  readonly allowed: boolean;
}

/** Readiness gate state for a subsystem. */
export interface ReadinessGate {
  readonly subsystem: string;
  readonly status: ActivityStatus;
  readonly checks: ReadinessCheck[];
}

/** A single readiness check result. */
export interface ReadinessCheck {
  readonly name: string;
  readonly passed: boolean;
  readonly detail: string;
}

/** A reference to a secret — never the raw secret value. */
export interface SecretReference {
  readonly key: string;
  readonly provider: string;
}

/** Profiles aggregate: all external service configurations for one workspace. */
export interface IntegrationProfile {
  readonly workspaceId: EntityId;
  readonly providers: ProviderConfig[];
  readonly mcpServers: MCPConfig[];
  readonly plugins: PluginManifest[];
  readonly readinessGates: ReadinessGate[];
}
