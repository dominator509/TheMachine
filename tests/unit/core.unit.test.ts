import { describe, it, expect } from "vitest";
import {
  createExecPlan,
  PLATFORM_NAME,
  activateExecPlan,
  completeExecPlan,
  stopExecPlan,
} from "@the-machine/core";

describe("core", () => {
  it("creates a pending exec plan", () => {
    const plan = createExecPlan("test-1");
    expect(plan.id).toBe("test-1");
    expect(plan.status).toBe("pending");
  });

  it("has a platform name", () => {
    expect(PLATFORM_NAME).toBe("The Machine");
  });
});

// ── ExecPlan State Transitions ──────────────────────────────────────────

describe("activateExecPlan", () => {
  it("transitions from pending to active", () => {
    const plan = createExecPlan("ep-1", "Test Plan", 3);
    const active = activateExecPlan(plan);
    expect(active.status).toBe("active");
    expect(active.id).toBe(plan.id);
    expect(active.title).toBe("Test Plan");
  });

  it("does not mutate the original plan", () => {
    const plan = createExecPlan("ep-1", "Test", 3);
    activateExecPlan(plan);
    expect(plan.status).toBe("pending");
  });
});

describe("completeExecPlan", () => {
  it("transitions from active to completed", () => {
    const plan = activateExecPlan(createExecPlan("ep-1", "Test", 3));
    const completed = completeExecPlan(plan);
    expect(completed.status).toBe("completed");
  });

  it("transitions from pending to completed", () => {
    const plan = createExecPlan("ep-1", "Test", 3);
    const completed = completeExecPlan(plan);
    expect(completed.status).toBe("completed");
  });
});

describe("stopExecPlan", () => {
  it("transitions from active to stopped with a stop condition", () => {
    const plan = activateExecPlan(createExecPlan("ep-1", "Test", 3));
    const condition = {
      triggered: true,
      rule: "Missing required credential",
      evidence: "No API key found",
      blocker: "Provide the required credential",
      recommendedDefault: "Add secret and restart",
    };
    const stopped = stopExecPlan(plan, condition);
    expect(stopped.status).toBe("stopped");
    expect(stopped.decisionLog).toHaveLength(1);
    expect(stopped.decisionLog[0].decision).toBe("STOP triggered");
    expect(stopped.decisionLog[0].reason).toBe("Provide the required credential");
  });

  it("appends to existing decision log", () => {
    const plan = createExecPlan("ep-1", "Test", 3);
    const condition = {
      triggered: true,
      rule: "Dirty repo",
      evidence: "Uncommitted changes",
      blocker: "Commit or stash before proceeding",
      recommendedDefault: "Run git stash",
    };
    const stopped = stopExecPlan(plan, condition);
    expect(stopped.decisionLog).toHaveLength(1);
  });
});
