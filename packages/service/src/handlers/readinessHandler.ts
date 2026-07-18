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
