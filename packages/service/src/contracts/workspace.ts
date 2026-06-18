// Workspace schemas.

import type { EntityId, ActivityStatus } from "@the-machine/core";

export interface WorkspaceRequest {
  readonly path?: string;
}

export interface WorkspaceResponse {
  readonly id: EntityId;
  readonly path: string;
  readonly status: ActivityStatus;
  readonly activeExecPlanId: EntityId | null;
}

export interface WorkspaceListResponse {
  readonly workspaces: WorkspaceResponse[];
}
