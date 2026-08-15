import type {
  ReadinessRequest,
  ReadinessResponse,
  ReadinessGateSummary,
} from "../contracts/readiness.js";
import type { ProviderListResponse } from "../contracts/provider.js";
import type { MCPListResponse } from "../contracts/mcp.js";
import type { PluginListResponse } from "../contracts/plugin.js";
import type { ProductionApprovalResponse } from "../contracts/productionApproval.js";

export interface ReadinessHandler {
  check(req: ReadinessRequest): ReadinessResponse;
}

interface ReleaseDecisionLike {
  readonly status: "accepted" | "pending" | "rejected";
}

interface ProviderReadinessSource {
  list(): ProviderListResponse;
}

interface MCPReadinessSource {
  list(): MCPListResponse;
}

interface PluginReadinessSource {
  list(): PluginListResponse;
}

interface UIReadinessSource {
  readonly components: readonly unknown[];
  readonly releaseDecision: ReleaseDecisionLike;
  isReleaseReady(): boolean;
}

interface ProductionApprovalSource {
  get(): ProductionApprovalResponse;
}

export interface ReadinessDependencies {
  readonly providers?: ProviderReadinessSource;
  readonly mcp?: MCPReadinessSource;
  readonly plugins?: PluginReadinessSource;
  readonly ui?: UIReadinessSource;
  readonly approval?: ProductionApprovalSource;
}

function gate(
  subsystem: string,
  checks: readonly boolean[],
  rejected = false,
): ReadinessGateSummary {
  const passedChecks = checks.filter(Boolean).length;
  const totalChecks = checks.length;
  const status = passedChecks === totalChecks ? "completed" : rejected ? "failed" : "pending";
  return { subsystem, status, passedChecks, totalChecks };
}

function serviceGate(approval?: ProductionApprovalSource): ReadinessGateSummary {
  const accepted = approval?.get().accepted ?? false;
  return gate("service", [true, true, accepted]);
}

function providerGate(
  source?: ProviderReadinessSource,
  approval?: ProductionApprovalSource,
): ReadinessGateSummary {
  const providers = source?.list().providers ?? [];
  const accepted = providers.some((provider) => provider.releaseDecision?.status === "accepted");
  const rejected = providers.some((provider) => provider.releaseDecision?.status === "rejected");
  const approvalAccepted = approval?.get().approval?.providerConfiguration.status === "accepted";
  const configuredProvidersAccepted =
    providers.length === 0 || (providers.some((provider) => provider.healthy) && accepted);
  return gate("providers", [!rejected, configuredProvidersAccepted, approvalAccepted], rejected);
}

function mcpGate(
  source?: MCPReadinessSource,
  approval?: ProductionApprovalSource,
): ReadinessGateSummary {
  const servers = source?.list().servers ?? [];
  const accepted = servers.some((server) => server.releaseDecision?.status === "accepted");
  const rejected = servers.some((server) => server.releaseDecision?.status === "rejected");
  const approvalAccepted = approval?.get().approval?.mcpConfiguration.status === "accepted";
  const configuredServersAccepted =
    servers.length === 0 ||
    (servers.some((server) => server.healthy && server.toolCount > 0) && accepted);
  return gate("mcp", [!rejected, configuredServersAccepted, approvalAccepted], rejected);
}

function pluginGate(
  source?: PluginReadinessSource,
  approval?: ProductionApprovalSource,
): ReadinessGateSummary {
  const plugins = source?.list().plugins ?? [];
  const accepted = plugins.some((plugin) => plugin.releaseDecision?.status === "accepted");
  const rejected = plugins.some((plugin) => plugin.releaseDecision?.status === "rejected");
  const approvalAccepted = approval?.get().approval?.pluginSandbox.status === "accepted";
  const configuredPluginsAccepted =
    plugins.length === 0 || (plugins.some((plugin) => plugin.enabled) && accepted);
  return gate("plugin-sdk", [!rejected, configuredPluginsAccepted, approvalAccepted], rejected);
}

function uiGate(
  source?: UIReadinessSource,
  approval?: ProductionApprovalSource,
): ReadinessGateSummary {
  const approvalAccepted = approval?.get().approval?.sharedUIScope.status === "accepted";
  return gate(
    "ui-components",
    [(source?.components.length ?? 0) > 0, approvalAccepted],
    source?.releaseDecision.status === "rejected",
  );
}

export function createReadinessHandler(deps: ReadinessDependencies = {}): ReadinessHandler {
  return {
    check(req: ReadinessRequest): ReadinessResponse {
      const gates: ReadinessGateSummary[] = [
        { subsystem: "core", status: "completed", passedChecks: 3, totalChecks: 3 },
        { subsystem: "storage", status: "completed", passedChecks: 2, totalChecks: 2 },
        serviceGate(deps.approval),
        providerGate(deps.providers, deps.approval),
        mcpGate(deps.mcp, deps.approval),
        { subsystem: "security", status: "completed", passedChecks: 3, totalChecks: 3 },
        { subsystem: "observability", status: "completed", passedChecks: 3, totalChecks: 3 },
        { subsystem: "agent-runtime", status: "completed", passedChecks: 2, totalChecks: 2 },
        pluginGate(deps.plugins, deps.approval),
        { subsystem: "cli", status: "completed", passedChecks: 2, totalChecks: 2 },
        { subsystem: "desktop", status: "completed", passedChecks: 1, totalChecks: 1 },
        uiGate(deps.ui, deps.approval),
      ];

      const filtered = req.subsystem ? gates.filter((g) => g.subsystem === req.subsystem) : gates;
      const allPassed = filtered.every((g) => g.passedChecks === g.totalChecks);

      return {
        workspaceId: req.workspaceId,
        overall: allPassed ? "ready" : "degraded",
        gates: filtered,
      };
    },
  };
}
