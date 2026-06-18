// AgentRun schemas.

import type { EntityId, ActivityStatus } from "@the-machine/core";

export interface RunRequest {
  readonly workspaceId: EntityId;
  readonly planId: EntityId;
  readonly milestoneId?: EntityId;
}

export interface RunResponse {
  readonly id: EntityId;
  readonly execPlanId: EntityId;
  readonly milestoneId: EntityId | null;
  readonly status: ActivityStatus;
  readonly commandCount: number;
  readonly validationCount: number;
}

export interface RunListResponse {
  readonly runs: RunResponse[];
}
