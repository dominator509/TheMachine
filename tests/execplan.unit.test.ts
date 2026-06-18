// Unit tests for ExecPlan validation.
import { describe, it, expect } from "vitest";
import {
  REQUIRED_SECTIONS,
  validateRequiredSections,
  findMissingSections,
  validateOneActivePlan,
  validateMilestones,
  validateExecPlan,
} from "@the-machine/core";
import type { Milestone, SectionCheck } from "@the-machine/core";

const dummyPlan = {
  id: "EP-001" as any,
  title: "Test Plan",
  status: "pending" as const,
  priority: 3 as any,
  milestones: [
    {
      id: "M0" as any,
      label: "Preflight" as any,
      goal: "Ensure foundation exists",
      status: "pending" as any,
      filesToRead: [] as string[],
      filesToChange: [] as string[],
      validationCommand: "./scripts/preflight.sh",
      expectedResult: "preflight: ok",
      recoveryInstruction: "STOP if EP-001 not complete",
    } satisfies Milestone,
    {
      id: "M1" as any,
      label: "Domain entities" as any,
      goal: "Define core types",
      status: "pending" as any,
      filesToRead: [] as string[],
      filesToChange: [] as string[],
      validationCommand: "./scripts/typecheck.sh",
      expectedResult: "typecheck: ok",
      recoveryInstruction: "Simplify types",
    } satisfies Milestone,
  ],
  progress: { completed: [], current: null, pending: [] },
  decisionLog: [],
};

describe("REQUIRED_SECTIONS", () => {
  it("should list all 15 sections from PLANS.md", () => {
    expect(REQUIRED_SECTIONS.length).toBe(15);
  });
});

describe("validateRequiredSections", () => {
  it("should mark all sections present when all are provided", () => {
    const allLabels = REQUIRED_SECTIONS.map((s: string) => s);
    const checks = validateRequiredSections(dummyPlan, allLabels);
    expect(checks.every((c: SectionCheck) => c.present)).toBe(true);
  });

  it("should mark missing sections", () => {
    const checks = validateRequiredSections(dummyPlan, ["Scope", "Progress"]);
    const missing = checks.filter((c: SectionCheck) => !c.present);
    expect(missing.length).toBe(REQUIRED_SECTIONS.length - 2);
  });

  it("should handle case-insensitive matching", () => {
    const checks = validateRequiredSections(dummyPlan, ["purpose / big picture"]);
    expect(checks[0]!.present).toBe(true);
  });
});

describe("findMissingSections", () => {
  it("should return empty array when all present", () => {
    const checks: SectionCheck[] = REQUIRED_SECTIONS.map((s: string) => ({
      section: s,
      present: true,
    }));
    expect(findMissingSections(checks)).toEqual([]);
  });

  it("should return only missing sections", () => {
    const checks: SectionCheck[] = [
      { section: "Scope", present: true },
      { section: "Progress", present: false },
    ];
    expect(findMissingSections(checks)).toEqual(["Progress"]);
  });
});

describe("validateOneActivePlan", () => {
  it("should pass when zero active plans", () => {
    expect(
      validateOneActivePlan([
        { id: "1", status: "pending" as const },
        { id: "2", status: "completed" as const },
      ]),
    ).toBe(true);
  });

  it("should pass when exactly one active plan", () => {
    expect(
      validateOneActivePlan([
        { id: "1", status: "active" as const },
        { id: "2", status: "pending" as const },
      ]),
    ).toBe(true);
  });

  it("should fail when multiple active plans", () => {
    expect(
      validateOneActivePlan([
        { id: "1", status: "active" as const },
        { id: "2", status: "active" as const },
      ]),
    ).toBe(false);
  });
});

describe("validateMilestones", () => {
  it("should validate all milestones with complete fields", () => {
    const checks = validateMilestones(dummyPlan.milestones);
    expect(checks.every((c) => c.valid)).toBe(true);
  });

  it("should fail milestones with missing goal", () => {
    const bad: Milestone[] = [{ ...dummyPlan.milestones[0]!, goal: "" }];
    const checks = validateMilestones(bad);
    expect(checks[0]!.valid).toBe(false);
    expect(checks[0]!.hasGoal).toBe(false);
  });

  it("should fail milestones with missing validation command", () => {
    const bad: Milestone[] = [{ ...dummyPlan.milestones[0]!, validationCommand: "" }];
    const checks = validateMilestones(bad);
    expect(checks[0]!.valid).toBe(false);
  });

  it("should fail milestones with missing expected result", () => {
    const bad: Milestone[] = [{ ...dummyPlan.milestones[0]!, expectedResult: "" }];
    const checks = validateMilestones(bad);
    expect(checks[0]!.valid).toBe(false);
  });

  it("should fail milestones with missing recovery instruction", () => {
    const bad: Milestone[] = [{ ...dummyPlan.milestones[0]!, recoveryInstruction: "" }];
    const checks = validateMilestones(bad);
    expect(checks[0]!.valid).toBe(false);
  });
});

describe("validateExecPlan", () => {
  it("should return valid for a well-formed plan", () => {
    const allLabels = REQUIRED_SECTIONS.map((s: string) => s);
    const result = validateExecPlan(dummyPlan, allLabels, [
      { id: "EP-001", status: "active" as const },
      { id: "EP-002", status: "pending" as const },
    ]);
    expect(result.valid).toBe(true);
    expect(result.missingSections).toEqual([]);
    expect(result.oneActivePlanViolation).toBe(false);
  });

  it("should detect missing sections", () => {
    const result = validateExecPlan(
      dummyPlan,
      ["Scope"],
      [{ id: "EP-001", status: "pending" as const }],
    );
    expect(result.valid).toBe(false);
    expect(result.missingSections.length).toBeGreaterThan(0);
  });

  it("should detect one-active-plan violation", () => {
    const allLabels = REQUIRED_SECTIONS.map((s: string) => s);
    const result = validateExecPlan(dummyPlan, allLabels, [
      { id: "EP-001", status: "active" as const },
      { id: "EP-002", status: "active" as const },
    ]);
    expect(result.valid).toBe(false);
    expect(result.oneActivePlanViolation).toBe(true);
  });
});
