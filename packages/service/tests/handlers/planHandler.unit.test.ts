import { describe, it, expect } from "vitest";
import { createPlanHandler } from "../../src/handlers/planHandler";

describe("PlanHandler", () => {
  it("loads and lists plans", () => {
    const handler = createPlanHandler();
    expect(handler.list().plans).toHaveLength(0);

    const plan = handler.load("EP-001.md");
    expect(plan.id).toBe("EP-001.md");
    expect(handler.list().plans).toHaveLength(1);

    // loading same plan returns existing
    const samePlan = handler.load("EP-001.md");
    expect(samePlan).toBe(plan);
  });

  it("gets plan by id or path", () => {
    const handler = createPlanHandler();
    handler.load("EP-001.md");

    const plan1 = handler.get({ planId: "EP-001.md" as any });
    expect(plan1?.id).toBe("EP-001.md");

    const plan2 = handler.get({ filePath: "EP-001.md" });
    expect(plan2?.id).toBe("EP-001.md");
  });

  it("returns null if get is missing both fields", () => {
    const handler = createPlanHandler();
    expect(handler.get({})).toBeNull();
  });
});
