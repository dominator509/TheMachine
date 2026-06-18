// Permission engine — deny-by-default with explicit grants.

import type { EntityId } from "@the-machine/core";
import type {
  PermissionGrant,
  PermissionCheck,
  PermissionResult,
  PermissionAuditEvent,
  PermissionRegistry,
  PermissionRegistryOptions,
  PermissionResource,
} from "./types.js";

let nextAuditId = 1;

function generateAuditId(): EntityId {
  const id = `audit-${String(nextAuditId)}`;
  nextAuditId++;
  return id as unknown as EntityId;
}

/**
 * Create a deny-by-default permission registry.
 * All actions are denied unless explicitly granted.
 * Audits every denied check; can optionally audit all checks.
 */
export function createPermissionRegistry(options?: PermissionRegistryOptions): PermissionRegistry {
  const auditAll = options?.auditAll ?? false;
  const grants = new Map<string, PermissionGrant>();
  const auditLog: PermissionAuditEvent[] = [];

  function grantKey(resource: PermissionResource, action: string): string {
    return `${resource}:${action}`;
  }

  function recordAudit(check: PermissionCheck, result: PermissionResult): void {
    if (!auditAll && result.allowed) return; // Only record denied by default
    auditLog.push({
      id: generateAuditId(),
      timestamp: Date.now(),
      check,
      result,
      severity: result.allowed ? "info" : "warning",
    });
  }

  return {
    grant(permission: PermissionGrant): void {
      grants.set(grantKey(permission.resource, permission.action), permission);
    },

    revoke(resource: PermissionResource, action: string): boolean {
      return grants.delete(grantKey(resource, action));
    },

    check(check: PermissionCheck): PermissionResult {
      const key = grantKey(check.resource, check.action);
      const grant = grants.get(key);

      if (!grant) {
        // Implicit deny — not explicitly granted
        const result: PermissionResult = {
          allowed: false,
          requireApproval: false,
          reason: `Action '${check.action}' on resource '${check.resource}' is not permitted (deny-by-default).`,
        };
        recordAudit(check, result);
        return result;
      }

      const result: PermissionResult = {
        allowed: grant.allowed,
        requireApproval: grant.requireApproval,
        reason: undefined,
      };
      recordAudit(check, result);
      return result;
    },

    list(): PermissionGrant[] {
      return Array.from(grants.values());
    },

    auditLog(): PermissionAuditEvent[] {
      return [...auditLog];
    },
  };
}
