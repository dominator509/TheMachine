// Security integration compositors — wrap existing components with permission checks.
// These compose with (rather than replace) existing factories.

import { createCommandRegistry } from "@the-machine/agent-runtime";
import type { CommandRegistry, CommandEntry, CommandResult } from "@the-machine/agent-runtime";
import type { MCPRegistry, MCPServerRegistration, MCPInvocationResult } from "@the-machine/mcp";
import type { PermissionRegistry } from "./permissions/types.js";
import type { ProviderAdapter } from "@the-machine/providers";
import type {
  ProviderCompletionRequest,
  ProviderCompletionResponse,
  ProviderHealth,
} from "@the-machine/providers";
import type { EntityId } from "@the-machine/core";

// ── Secure Command Registry ──────────────────────────────────────────────────

/**
 * Create a command registry with permission checks before execution.
 * Wraps the standard command registry with an additional permission gate.
 */
export function createSecureCommandRegistry(permissions: PermissionRegistry): CommandRegistry {
  const inner = createCommandRegistry();

  const baseExecute = inner.execute.bind(inner);

  return {
    register(cmd: CommandEntry): void {
      inner.register(cmd);
    },
    isAllowed(name: string): boolean {
      return inner.isAllowed(name);
    },
    get(name: string): CommandEntry | null {
      return inner.get(name);
    },
    list(): CommandEntry[] {
      return inner.list();
    },
    async execute(name: string, args?: string[]): Promise<CommandResult> {
      const permResult = permissions.check({ resource: "command", action: name });
      if (!permResult.allowed) {
        return {
          command: name,
          exitCode: 1,
          stdout: "",
          stderr: `Permission denied: command '${name}' not permitted (${permResult.reason ?? "deny-by-default"}).`,
        };
      }
      return baseExecute(name, args);
    },
  };
}

// ── Secure MCP Registry ──────────────────────────────────────────────────────

/**
 * Create an MCP registry wrapper that enforces a global permission check
 * before allowing tool invocation (in addition to per-server permission checks).
 */
export function createSecureMCPRegistry(
  inner: MCPRegistry,
  permissions: PermissionRegistry,
): MCPRegistry {
  return {
    register(server: MCPServerRegistration): void {
      inner.register(server);
    },
    unregister(id: EntityId): boolean {
      return inner.unregister(id);
    },
    get(id: EntityId): MCPServerRegistration | null {
      return inner.get(id);
    },
    list(): MCPServerRegistration[] {
      return inner.list();
    },
    invoke(
      serverId: EntityId,
      toolName: string,
      args: Record<string, unknown>,
    ): MCPInvocationResult {
      const permResult = permissions.check({ resource: "mcp_tool", action: toolName });
      if (!permResult.allowed) {
        return {
          success: false,
          output: "",
          error: `Permission denied: MCP tool '${toolName}' not permitted (${permResult.reason ?? "deny-by-default"}).`,
        };
      }
      return inner.invoke(serverId, toolName, args);
    },
  };
}

// ── Secure Provider Adapter ──────────────────────────────────────────────────

/**
 * Wrap a provider adapter with permission checks before completing requests.
 */
export function secureProviderAdapter(
  adapter: ProviderAdapter,
  permissions: PermissionRegistry,
): ProviderAdapter {
  const permCheck = { resource: "provider" as const, action: `invoke:${adapter.name}` };

  return {
    get id() {
      return adapter.id;
    },
    get name() {
      return adapter.name;
    },
    get tier() {
      return adapter.tier;
    },

    async complete(req: ProviderCompletionRequest): Promise<ProviderCompletionResponse> {
      const permResult = permissions.check(permCheck);
      if (!permResult.allowed) {
        return {
          id: "",
          model: req.model,
          content: "",
          finishReason: "error",
        };
      }
      return adapter.complete(req);
    },

    async health(): Promise<ProviderHealth> {
      return adapter.health();
    },
  };
}

// ── Secure Plugin Host ───────────────────────────────────────────────────────

/**
 * Plugin host that checks permissions before allowing plugin operations.
 * This is the security-augmented version of the plugin host.
 */
export interface SecurePluginHost {
  /** Check if a plugin action is permitted. */
  checkAction(pluginName: string, action: string): { allowed: boolean; reason: string | undefined };
}

/**
 * Create a secure plugin host that enforces deny-by-default.
 */
export function createSecurePluginHost(permissions: PermissionRegistry): SecurePluginHost {
  return {
    checkAction(
      pluginName: string,
      action: string,
    ): { allowed: boolean; reason: string | undefined } {
      const result = permissions.check({ resource: "plugin", action: `${pluginName}:${action}` });
      return { allowed: result.allowed, reason: result.reason };
    },
  };
}
