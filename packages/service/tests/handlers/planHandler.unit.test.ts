import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createPlanHandler } from "../../src/handlers/planHandler";

describe("PlanHandler", () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  function createExecPlanFixture(): string {
    const directory = mkdtempSync(join(tmpdir(), "the-machine-plan-handler-"));
    temporaryDirectories.push(directory);
    const filePath = join(directory, "EP-001.md");
    writeFileSync(
      filePath,
      [
        "# EP-001 Test Plan",
        "",
        "### M0: Test milestone",
        "",
        "- Goal: Exercise the PlanHandler parser.",
        "- Validation command: `pnpm run test:unit`",
        "- Expected result: Unit tests pass.",
        "- Recovery instruction: Inspect the failing unit test.",
        "",
      ].join("\n"),
      "utf-8",
    );
    return filePath;
  }

  it("loads and lists plans", () => {
    const handler = createPlanHandler();
    const filePath = createExecPlanFixture();
    expect(handler.list().plans).toHaveLength(0);

    const plan = handler.load(filePath);
    expect(plan.id).toBe(filePath);
    expect(handler.list().plans).toHaveLength(1);

    // loading same plan returns existing
    const samePlan = handler.load(filePath);
    expect(samePlan).toBe(plan);
  });

  it("gets plan by id or path", () => {
    const handler = createPlanHandler();
    const filePath = createExecPlanFixture();
    handler.load(filePath);

    const plan1 = handler.get({ planId: filePath as any });
    expect(plan1?.id).toBe(filePath);

    const plan2 = handler.get({ filePath });
    expect(plan2?.id).toBe(filePath);
  });

  it("returns null if get is missing both fields", () => {
    const handler = createPlanHandler();
    expect(handler.get({})).toBeNull();
  });
});
