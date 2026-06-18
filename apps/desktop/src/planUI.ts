// Active Plan UI — plan status, milestone list, run/resume, progress,
// validation panel, and STOP states. Uses polling when streaming absent.
//
// Functions output structured display data consumed by GUI rendering or
// serialized for test verification. Pure data transformations — no side effects.

import type { PlanResponse } from "@the-machine/service";
import type { RunResponse } from "@the-machine/service";
import type { ValidationResponse } from "@the-machine/service";

// ── Display Types ──────────────────────────────────────────────────────────

export interface MilestoneDisplay {
  readonly label: string;
  readonly status: "completed" | "active" | "pending" | "stopped";
}

export interface PlanStatusDisplay {
  readonly plan: PlanResponse;
  readonly milestones: MilestoneDisplay[];
  readonly progressPercent: number;
  readonly isRunning: boolean;
  readonly isStopped: boolean;
  readonly isCompleted: boolean;
}

export interface RunDisplay {
  readonly run: RunResponse;
  readonly validations: ValidationDisplay[];
  readonly isActive: boolean;
}

export interface ValidationDisplay {
  readonly command: string;
  readonly passed: boolean;
  readonly exitCode: number | null;
  readonly output: string;
  readonly severity: string;
}

export interface StopConditionDisplay {
  readonly triggered: boolean;
  readonly rule: string;
  readonly evidence: string;
  readonly blocker: string;
  readonly recommendedDefault: string;
}

// ── Build Milestone Display ────────────────────────────────────────────────

/**
 * Build milestone display from a plan response.
 * Assumes milestone i is completed when i < completedMilestones,
 * the current milestone when i === completedMilestones (and plan is active),
 * and pending otherwise.
 */
export function buildMilestoneDisplay(plan: PlanResponse): MilestoneDisplay[] {
  const milestones: MilestoneDisplay[] = [];
  for (let i = 0; i < plan.milestoneCount; i++) {
    let status: MilestoneDisplay["status"];
    if (i < plan.completedMilestones) {
      status = "completed";
    } else if (i === plan.completedMilestones && plan.status === "active") {
      status = "active";
    } else if (plan.status === "stopped") {
      status = "stopped";
    } else {
      status = "pending";
    }
    milestones.push({
      label: `Milestone ${String(i)}`,
      status,
    });
  }
  return milestones;
}

// ── Build Plan Status Display ──────────────────────────────────────────────

export function buildPlanStatusDisplay(
  plan: PlanResponse,
  activeRuns: RunResponse[],
): PlanStatusDisplay {
  const milestones = buildMilestoneDisplay(plan);
  const progressPercent =
    plan.milestoneCount > 0
      ? Math.round((plan.completedMilestones / plan.milestoneCount) * 100)
      : 0;
  const isRunning = activeRuns.some((r) => r.status === "active");
  const isStopped = plan.status === "stopped";
  const isCompleted = plan.status === "completed";

  return {
    plan,
    milestones,
    progressPercent,
    isRunning,
    isStopped,
    isCompleted,
  };
}

// ── Build Run Display ──────────────────────────────────────────────────────

export function buildRunDisplay(run: RunResponse, validations: ValidationResponse[]): RunDisplay {
  return {
    run,
    validations: validations.map((v) => ({
      command: v.command,
      passed: v.passed,
      exitCode: v.exitCode,
      output: v.output,
      severity: v.severity,
    })),
    isActive: run.status === "active",
  };
}

// ── Build Validation Panel Display ─────────────────────────────────────────

export function buildValidationPanelDisplay(
  validations: ValidationResponse[],
): ValidationDisplay[] {
  return validations.map((v) => ({
    command: v.command,
    passed: v.passed,
    exitCode: v.exitCode,
    output: v.output,
    severity: v.severity,
  }));
}

// ── STOP State Display ─────────────────────────────────────────────────────

export function buildStopConditionDisplay(): StopConditionDisplay {
  return {
    triggered: true,
    rule: "AGENTS.md STOP conditions",
    evidence: "Plan status is 'stopped'",
    blocker: "Plan was stopped before completion",
    recommendedDefault: "Review the decision log and re-plan remaining milestones",
  };
}

// ── Format for Terminal/Text Output ────────────────────────────────────────

export function formatMilestoneList(milestones: MilestoneDisplay[]): string {
  const lines = milestones.map((m) => {
    const icon =
      m.status === "completed"
        ? "[x]"
        : m.status === "active"
          ? "[>]"
          : m.status === "stopped"
            ? "[!]"
            : "[ ]";
    return `  ${icon} ${m.label}`;
  });
  return lines.join("\n");
}

export function formatProgressBar(percent: number, width = 20): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return `[${"=".repeat(filled)}${" ".repeat(empty)}] ${String(percent)}%`;
}

export function formatValidationPanel(validations: ValidationDisplay[]): string {
  if (validations.length === 0) {
    return "  No validations recorded.";
  }
  return validations
    .map(
      (v) =>
        `  ${v.passed ? "PASS" : "FAIL"} ${v.command} (exit ${v.exitCode != null ? String(v.exitCode) : "?"}) — ${v.severity}`,
    )
    .join("\n");
}

export function formatPlanStatus(display: PlanStatusDisplay): string {
  const lines: string[] = [];
  lines.push(`Plan: ${display.plan.title}`);
  lines.push(`Status: ${display.plan.status}`);
  lines.push(formatProgressBar(display.progressPercent));
  lines.push("");

  if (display.milestones.length > 0) {
    lines.push("Milestones:");
    lines.push(formatMilestoneList(display.milestones));
    lines.push("");
  }

  if (display.isStopped) {
    const stop = buildStopConditionDisplay();
    lines.push("STOP Condition:");
    lines.push(`  Rule: ${stop.rule}`);
    lines.push(`  Evidence: ${stop.evidence}`);
    lines.push(`  Blocker: ${stop.blocker}`);
    lines.push(`  Recommended: ${stop.recommendedDefault}`);
  }

  lines.push(`Running: ${display.isRunning ? "Yes" : "No"}`);
  return lines.join("\n");
}
