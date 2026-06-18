import type { PlanRequest, PlanResponse, PlanListResponse } from "../contracts/plan.js";
import type { EntityId } from "@the-machine/core";

export interface PlanHandler {
  get(req: PlanRequest): PlanResponse | null;
  list(): PlanListResponse;
  load(filePath: string): PlanResponse;
}

export function createPlanHandler(): PlanHandler {
  const plans = new Map<string, PlanResponse>();

  return {
    get(req: PlanRequest): PlanResponse | null {
      const id = req.planId ?? req.filePath;
      if (!id) return null;
      return plans.get(id) ?? null;
    },

    list(): PlanListResponse {
      return { plans: Array.from(plans.values()) };
    },

    load(filePath: string): PlanResponse {
      const id = filePath as EntityId;
      const existing = plans.get(id);
      if (existing) return existing;
      const plan: PlanResponse = {
        id,
        title: "Loaded Plan",
        status: "pending",
        priority: 5,
        milestoneCount: 0,
        completedMilestones: 0,
        currentMilestone: null,
      };
      plans.set(id, plan);
      return plan;
    },
  };
}
