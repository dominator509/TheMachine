// Permission types — deny-by-default permission system.

import type { EntityId, Severity } from "@the-machine/core";

/** Resource types that can be permissioned. */
export type PermissionResource =
  | "provider"
  | "mcp_tool"
  | "plugin"
  | "command"
  | "filesystem"
  | "network"
  | "secret";

/** A single permission grant or denial for a specific resource+action combination. */
export interface PermissionGrant {
  readonly resource: PermissionResource;
  readonly action: string;
  readonly allowed: boolean;
  readonly requireApproval: boolean;
}

/** A request to check whether an action is permitted. */
export interface PermissionCheck {
  readonly resource: PermissionResource;
  readonly action: string;
  readonly context?: string;
}

/** Result of a permission check. */
export interface PermissionResult {
  readonly allowed: boolean;
  readonly requireApproval: boolean;
  readonly reason: string | undefined;
}

/** Audit event recorded when a permission is checked. */
export interface PermissionAuditEvent {
  readonly id: EntityId;
  readonly timestamp: number;
  readonly check: PermissionCheck;
  readonly result: PermissionResult;
  readonly severity: Severity;
}

/** Registry that holds permission grants and processes checks. */
export interface PermissionRegistry {
  /** Grant or deny a specific permission. */
  grant(permission: PermissionGrant): void;

  /** Remove a previously granted permission. */
  revoke(resource: PermissionResource, action: string): boolean;

  /** Check if an action is permitted. Returns the result. */
  check(check: PermissionCheck): PermissionResult;

  /** List all registered permission grants. */
  list(): PermissionGrant[];

  /** Get the audit trail of permission checks. */
  auditLog(): PermissionAuditEvent[];
}

/** Options for creating a permission registry. */
export interface PermissionRegistryOptions {
  /** If true, verbose logging of all checks (default: false). */
  readonly auditAll?: boolean;
}
