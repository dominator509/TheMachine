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

export interface ExecutedReadinessEvidence {
  readonly subsystem: string;
  readonly candidateSha: string;
  readonly passed: boolean;
  readonly checkCount: number;
  readonly evidenceDigest: string;
  readonly completedAt: string;
}

export interface ReadinessEvidenceSource {
  readonly expectedCandidateSha?: string;
  get(subsystem: string): ExecutedReadinessEvidence | null;
}

export interface ReadinessDependencies {
  readonly providers?: ProviderReadinessSource;
  readonly mcp?: MCPReadinessSource;
  readonly plugins?: PluginReadinessSource;
  readonly ui?: UIReadinessSource;
  readonly approval?: ProductionApprovalSource;
  readonly evidence?: ReadinessEvidenceSource;
}

function gate(
  subsystem: string,
  checks: readonly boolean[],
  failed = false,
): ReadinessGateSummary {
  const passedChecks = checks.filter(Boolean).length;
  const totalChecks = checks.length;
  const status = passedChecks === totalChecks ? "completed" : failed ? "failed" : "pending";
  return { subsystem, status, passedChecks, totalChecks };
}

function executionState(source: ReadinessEvidenceSource | undefined, subsystem: string): {
  checks: boolean[];
  failed: boolean;
} {
  const record = source?.get(subsystem) ?? null;
  const expectedSha = source?.expectedCandidateSha;
  const candidateMatches =
    record !== null && (expectedSha === undefined || record.candidateSha === expectedSha);
  const checks = [
    record !== null,
    candidateMatches,
    (record?.checkCount ?? 0) > 0,
    (record?.evidenceDigest.trim().length ?? 0) > 0,
    record?.passed === true,
  ];
  const failed =
    record !== null &&
    (!candidateMatches || record.checkCount < 1 || record.evidenceDigest.trim().length === 0 || !record.passed);
  return { checks, failed };
}

function executedGate(
  subsystem: string,
  evidence?: ReadinessEvidenceSource,
): ReadinessGateSummary {
  const execution = executionState(evidence, subsystem);
  return gate(subsystem, execution.checks, execution.failed);
}

function serviceGate(deps: ReadinessDependencies): ReadinessGateSummary {
  const execution = executionState(deps.evidence, "service");
  const accepted = deps.approval?.get().accepted ?? false;
  return gate("service", [...execution.checks, accepted], execution.failed);
}

function providerGate(deps: ReadinessDependencies): ReadinessGateSummary {
  const execution = executionState(deps.evidence, "providers");
  const providers = deps.providers?.list().providers ?? [];
  const accepted = providers.some((provider) => provider.releaseDecision?.status === "accepted");
  const rejected = providers.some((provider) => provider.releaseDecision?.status === "rejected");
  const approvalAccepted =
    deps.approval?.get().approval?.providerConfiguration.status === "accepted";
  const liveProbe = providers.some(
    (provider) =>
      provider.healthy &&
      provider.healthCheckedAt !== undefined &&
      (provider.healthEvidence?.trim().length ?? 0) > 0,
  );
  return gate(
    "providers",
    [...execution.checks, providers.length > 0, liveProbe, accepted, approvalAccepted],
    execution.failed || rejected,
  );
}

function mcpGate(deps: ReadinessDependencies): ReadinessGateSummary {
  const execution = executionState(deps.evidence, "mcp");
  const servers = deps.mcp?.list().servers ?? [];
  const accepted = servers.some((server) => server.releaseDecision?.status === "accepted");
  const rejected = servers.some((server) => server.releaseDecision?.status === "rejected");
  const approvalAccepted = deps.approval?.get().approval?.mcpConfiguration.status === "accepted";
  const liveProbe = servers.some(
    (server) =>
      server.healthy &&
      server.toolCount > 0 &&
      server.healthCheckedAt !== undefined &&
      (server.healthEvidence?.trim().length ?? 0) > 0,
  );
  return gate(
    "mcp",
    [...execution.checks, servers.length > 0, liveProbe, accepted, approvalAccepted],
    execution.failed || rejected,
  );
}

function pluginGate(deps: ReadinessDependencies): ReadinessGateSummary {
  const execution = executionState(deps.evidence, "plugin-sdk");
  const plugins = deps.plugins?.list().plugins ?? [];
  const accepted = plugins.some((plugin) => plugin.releaseDecision?.status === "accepted");
  const rejected = plugins.some((plugin) => plugin.releaseDecision?.status === "rejected");
  const approvalAccepted = deps.approval?.get().approval?.pluginSandbox.status === "accepted";
  const verifiedActivation = plugins.some(
    (plugin) =>
      plugin.enabled &&
      plugin.activationCheckedAt !== undefined &&
      (plugin.activationEvidence?.trim().length ?? 0) > 0,
  );
  return gate(
    "plugin-sdk",
    [...execution.checks, plugins.length > 0, verifiedActivation, accepted, approvalAccepted],
    execution.failed || rejected,
  );
}

function uiGate(deps: ReadinessDependencies): ReadinessGateSummary {
  const execution = executionState(deps.evidence, "ui-components");
  const approvalAccepted = deps.approval?.get().approval?.sharedUIScope.status === "accepted";
  return gate(
    "ui-components",
    [
      ...execution.checks,
      (deps.ui?.components.length ?? 0) > 0,
      deps.ui?.isReleaseReady() === true,
      approvalAccepted,
    ],
    execution.failed || deps.ui?.releaseDecision.status === "rejected",
  );
}

export function createReadinessHandler(deps: ReadinessDependencies = {}): ReadinessHandler {
  return {
    check(req: ReadinessRequest): ReadinessResponse {
      const gates: ReadinessGateSummary[] = [
        executedGate("core", deps.evidence),
        executedGate("storage", deps.evidence),
        serviceGate(deps),
        providerGate(deps),
        mcpGate(deps),
        executedGate("security", deps.evidence),
        executedGate("observability", deps.evidence),
        executedGate("agent-runtime", deps.evidence),
        pluginGate(deps),
        executedGate("cli", deps.evidence),
        executedGate("desktop", deps.evidence),
        uiGate(deps),
      ];

      const filtered = req.subsystem ? gates.filter((candidate) => candidate.subsystem === req.subsystem) : gates;
      const anyFailed = filtered.some((candidate) => candidate.status === "failed");
      const allCompleted =
        filtered.length > 0 && filtered.every((candidate) => candidate.status === "completed");

      return {
        workspaceId: req.workspaceId,
        overall: anyFailed ? "not_ready" : allCompleted ? "ready" : "degraded",
        gates: filtered,
      };
    },
  };
}
