import type {
  ReadinessRequest,
  ReadinessResponse,
  ReadinessGateSummary,
} from "../contracts/readiness.js";

export interface ReadinessHandler {
  check(req: ReadinessRequest): ReadinessResponse;
}

export function createReadinessHandler(): ReadinessHandler {
  return {
    check(req: ReadinessRequest): ReadinessResponse {
      const gates: ReadinessGateSummary[] = [
        { subsystem: "core", status: "completed", passedChecks: 3, totalChecks: 3 },
        { subsystem: "storage", status: "completed", passedChecks: 2, totalChecks: 2 },
        { subsystem: "service", status: "completed", passedChecks: 2, totalChecks: 2 },
        { subsystem: "providers", status: "pending", passedChecks: 1, totalChecks: 2 },
        { subsystem: "mcp", status: "pending", passedChecks: 1, totalChecks: 2 },
        { subsystem: "security", status: "completed", passedChecks: 3, totalChecks: 3 },
        { subsystem: "observability", status: "completed", passedChecks: 3, totalChecks: 3 },
        { subsystem: "agent-runtime", status: "completed", passedChecks: 2, totalChecks: 2 },
        { subsystem: "plugin-sdk", status: "pending", passedChecks: 1, totalChecks: 2 },
        { subsystem: "cli", status: "completed", passedChecks: 2, totalChecks: 2 },
        { subsystem: "desktop", status: "completed", passedChecks: 1, totalChecks: 1 },
        { subsystem: "ui-components", status: "completed", passedChecks: 1, totalChecks: 1 },
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
