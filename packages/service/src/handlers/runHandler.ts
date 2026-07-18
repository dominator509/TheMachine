import type { RunRequest, RunResponse, RunListResponse } from "../contracts/run.js";
import type { EntityId } from "@the-machine/core";
import type { ServiceStore } from "../persistence/store.js";

export interface RunHandler {
  start(req: RunRequest): RunResponse;
  get(runId: EntityId): RunResponse | null;
  list(): RunListResponse;
}

export function createRunHandler(store?: ServiceStore): RunHandler {
  const runs = new Map<string, RunResponse>();

  return {
    start(req: RunRequest): RunResponse {
      if (store) {
        return store.startRun(req.planId, req.milestoneId);
      }
      const id = `${req.planId}-${String(Date.now())}` as EntityId;
      const run: RunResponse = {
        id,
        execPlanId: req.planId,
        milestoneId: req.milestoneId ?? null,
        status: "active",
        commandCount: 0,
        validationCount: 0,
      };
      runs.set(id, run);
      return run;
    },

    get(runId: EntityId): RunResponse | null {
      if (store) return store.getRun(runId);
      return runs.get(runId) ?? null;
    },

    list(): RunListResponse {
      if (store) return { runs: store.listRuns() };
      return { runs: Array.from(runs.values()) };
    },
  };
}
