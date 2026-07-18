import type { PlanRequest, PlanResponse, PlanListResponse } from "../contracts/plan.js";
import type { EntityId } from "@the-machine/core";
import { parseExecPlanMarkdown, type ServiceStore } from "../persistence/store.js";

export interface PlanHandler {
  get(req: PlanRequest): PlanResponse | null;
  list(): PlanListResponse;
  load(filePath: string): PlanResponse;
}

export function createPlanHandler(store?: ServiceStore): PlanHandler {
  const plans = new Map<string, PlanResponse>();

  return {
    get(req: PlanRequest): PlanResponse | null {
      const id = req.planId ?? req.filePath;
      if (!id) return null;
      if (store) return store.getPlan(id as EntityId);
      return plans.get(id) ?? null;
    },

    list(): PlanListResponse {
      if (store) return { plans: store.listPlans() };
      return { plans: Array.from(plans.values()) };
    },

    load(filePath: string): PlanResponse {
      if (store) return store.loadPlan(filePath);
      const id = filePath as EntityId;
      const existing = plans.get(id);
      if (existing) return existing;
      const parsed = parseExecPlanMarkdown(filePath);
      const completedMilestones = parsed.milestones.filter((m) => m.status === "completed").length;
      const currentMilestone = parsed.milestones.find((m) => m.status !== "completed")?.label ?? null;
      const plan: PlanResponse = {
        id,
        title: parsed.title,
        status: parsed.status,
        priority: parsed.priority,
        milestoneCount: parsed.milestones.length,
        completedMilestones,
        currentMilestone,
      };
      plans.set(id, plan);
      return plan;
    },
  };
}
