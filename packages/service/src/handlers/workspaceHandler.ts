import type {
  WorkspaceRequest,
  WorkspaceResponse,
  WorkspaceListResponse,
} from "../contracts/workspace.js";
import type { EntityId, ActivityStatus } from "@the-machine/core";

export interface WorkspaceHandler {
  get(req: WorkspaceRequest): WorkspaceResponse;
  list(): WorkspaceListResponse;
}

export function createWorkspaceHandler(): WorkspaceHandler {
  // In-memory state until runtime provides persistence.
  const state = new Map<
    string,
    { path: string; status: ActivityStatus; activePlan: EntityId | null }
  >();

  return {
    get(req: WorkspaceRequest): WorkspaceResponse {
      const path = req.path ?? process.cwd();
      const existing = state.get(path);
      if (existing) {
        return {
          id: path as EntityId,
          path: existing.path,
          status: existing.status,
          activeExecPlanId: existing.activePlan,
        };
      }
      const entry = {
        path,
        status: "pending" as ActivityStatus,
        activePlan: null as EntityId | null,
      };
      state.set(path, entry);
      return { id: path as EntityId, path, status: entry.status, activeExecPlanId: null };
    },

    list(): WorkspaceListResponse {
      const workspaces = Array.from(state.entries()).map(([path, entry]) => ({
        id: path as EntityId,
        path: entry.path,
        status: entry.status,
        activeExecPlanId: entry.activePlan,
      }));
      return { workspaces };
    },
  };
}
