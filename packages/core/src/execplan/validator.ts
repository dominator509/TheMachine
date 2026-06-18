// ExecPlan section parser and validator.
// No infrastructure imports.

import type { ExecPlan, ExecPlanStatus, Milestone } from "../domain/index.js";

/**
 * Required sections per PLANS.md standard.
 */
export const REQUIRED_SECTIONS = [
  "Purpose / Big Picture",
  "Scope",
  "Non-goals",
  "Context and Orientation",
  "Files to Read First",
  "Files to Change",
  "Interfaces and Contracts",
  "Milestones",
  "Concrete Steps",
  "Validation and Acceptance",
  "Idempotence and Recovery",
  "Progress",
  "Surprises & Discoveries",
  "Decision Log",
  "Outcomes & Retrospective",
] as const;

/** Section presence check result. */
export interface SectionCheck {
  readonly section: string;
  readonly present: boolean;
}

/** Overall validation result for an ExecPlan. */
export interface ExecPlanValidation {
  readonly valid: boolean;
  readonly planId: string;
  readonly sectionChecks: SectionCheck[];
  readonly missingSections: string[];
  readonly oneActivePlanViolation: boolean;
  readonly milestoneChecks: MilestoneCheck[];
}

/** Requirement check for a single milestone. */
export interface MilestoneCheck {
  readonly id: string;
  readonly hasGoal: boolean;
  readonly hasValidationCommand: boolean;
  readonly hasExpectedResult: boolean;
  readonly hasRecoveryInstruction: boolean;
  readonly valid: boolean;
}

/** Checks that an ExecPlan has all required sections. */
export function validateRequiredSections(
  plan: ExecPlan,
  presentSectionLabels: string[],
): SectionCheck[] {
  const lowerPresent = presentSectionLabels.map((s) => s.toLowerCase());
  return REQUIRED_SECTIONS.map((section) => ({
    section,
    present: lowerPresent.includes(section.toLowerCase()),
  }));
}

/** Returns the names of missing required sections. */
export function findMissingSections(checks: SectionCheck[]): string[] {
  return checks.filter((c) => !c.present).map((c) => c.section);
}

/** Validates that at most one ExecPlan among a set has "active" status. */
export function validateOneActivePlan(
  plans: readonly { id: string; status: ExecPlanStatus }[],
): boolean {
  const activeCount = plans.filter((p) => p.status === "active").length;
  return activeCount <= 1;
}

/** Validates all milestones have required fields. */
export function validateMilestones(milestones: Milestone[]): MilestoneCheck[] {
  return milestones.map((m) => {
    const hasGoal = m.goal.length > 0;
    const hasValidationCommand = m.validationCommand.length > 0;
    const hasExpectedResult = m.expectedResult.length > 0;
    const hasRecoveryInstruction = m.recoveryInstruction.length > 0;
    return {
      id: m.id,
      hasGoal,
      hasValidationCommand,
      hasExpectedResult,
      hasRecoveryInstruction,
      valid: hasGoal && hasValidationCommand && hasExpectedResult && hasRecoveryInstruction,
    };
  });
}

/** Runs full validation on an ExecPlan with context from sibling plans. */
export function validateExecPlan(
  plan: ExecPlan,
  presentSectionLabels: string[],
  allPlans: readonly { id: string; status: ExecPlanStatus }[],
): ExecPlanValidation {
  const sectionChecks = validateRequiredSections(plan, presentSectionLabels);
  const missingSections = findMissingSections(sectionChecks);
  const oneActivePlanViolation = !validateOneActivePlan(allPlans);
  const milestoneChecks = validateMilestones(plan.milestones);

  return {
    valid:
      missingSections.length === 0 &&
      !oneActivePlanViolation &&
      milestoneChecks.every((m) => m.valid),
    planId: plan.id,
    sectionChecks,
    missingSections,
    oneActivePlanViolation,
    milestoneChecks,
  };
}
