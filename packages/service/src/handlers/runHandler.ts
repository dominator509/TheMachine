import type { RunRequest, RunResponse, RunListResponse } from "../contracts/run.js";
import type { EntityId } from "@the-machine/core";

export interface RunHandler {
  start(req: RunRequest): RunResponse;
  get(runId: EntityId): RunResponse | null;
  list(): RunListResponse;
}

export function createRunHandler(): RunHandler {
  const runs = new Map<string, RunResponse>();

  return {
    start(req: RunRequest): RunResponse {
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
      return runs.get(runId) ?? null;
    },

    list(): RunListResponse {
      return { runs: Array.from(runs.values()) };
    },
  };
}
