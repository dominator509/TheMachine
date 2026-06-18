// Readiness gate schemas.

import type { EntityId, ActivityStatus } from "@the-machine/core";

export interface ReadinessRequest {
  readonly workspaceId: EntityId;
  readonly subsystem?: string;
}

export interface ReadinessResponse {
  readonly workspaceId: EntityId;
  readonly overall: "ready" | "degraded" | "not_ready";
  readonly gates: ReadinessGateSummary[];
}

export interface ReadinessGateSummary {
  readonly subsystem: string;
  readonly status: ActivityStatus;
  readonly passedChecks: number;
  readonly totalChecks: number;
}
