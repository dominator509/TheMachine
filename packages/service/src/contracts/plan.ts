// ExecPlan schemas.

import type { EntityId, Priority } from "@the-machine/core";

export interface PlanRequest {
  readonly workspaceId: EntityId;
  readonly planId?: EntityId;
  readonly filePath?: string;
}

export interface PlanResponse {
  readonly id: EntityId;
  readonly title: string;
  readonly status: "pending" | "active" | "completed" | "stopped";
  readonly priority: Priority;
  readonly milestoneCount: number;
  readonly completedMilestones: number;
  readonly currentMilestone: string | null;
}

export interface PlanListResponse {
  readonly plans: PlanResponse[];
}
