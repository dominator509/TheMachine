// ExecPlan and milestone entities.
// No infrastructure imports.

import type { EntityId, ActivityStatus, Priority, Label, Timestamp } from "./types.js";

/** Status transitions for an ExecPlan. */
export type ExecPlanStatus = "pending" | "active" | "completed" | "stopped";

/** One self-contained implementation plan. */
export interface ExecPlan {
  readonly id: EntityId;
  readonly title: string;
  readonly status: ExecPlanStatus;
  readonly priority: Priority;
  readonly milestones: Milestone[];
  readonly progress: ExecPlanProgress;
  readonly decisionLog: DecisionEntry[];
}

/** One step within an ExecPlan. */
export interface Milestone {
  readonly id: EntityId;
  readonly label: Label;
  readonly goal: string;
  readonly status: ActivityStatus;
  readonly filesToRead: string[];
  readonly filesToChange: string[];
  readonly validationCommand: string;
  readonly expectedResult: string;
  readonly recoveryInstruction: string;
}

/** Checkbox-style progress tracker. */
export interface ExecPlanProgress {
  readonly completed: EntityId[];
  readonly current: EntityId | null;
  readonly pending: EntityId[];
}

/** A recorded decision during plan execution. */
export interface DecisionEntry {
  readonly timestamp: Timestamp;
  readonly decision: string;
  readonly reason: string;
  readonly alternatives: string[];
  readonly filesAffected: string[];
}

/** STOP condition from AGENTS.md. */
export interface StopCondition {
  readonly triggered: boolean;
  readonly rule: string;
  readonly evidence: string;
  readonly blocker: string;
  readonly recommendedDefault: string;
}

/** Creates an ExecPlan with initial pending status. */
export function createExecPlan(id: EntityId, title: string, priority: Priority): ExecPlan {
  return {
    id,
    title,
    status: "pending",
    priority,
    milestones: [],
    progress: { completed: [], current: null, pending: [] },
    decisionLog: [],
  };
}

/** Activates an ExecPlan. */
export function activateExecPlan(plan: ExecPlan): ExecPlan {
  return { ...plan, status: "active" };
}

/** Marks an ExecPlan completed. */
export function completeExecPlan(plan: ExecPlan): ExecPlan {
  return { ...plan, status: "completed" };
}

/** Stops an ExecPlan (non-completion halt). */
export function stopExecPlan(plan: ExecPlan, condition: StopCondition): ExecPlan {
  return {
    ...plan,
    status: "stopped",
    decisionLog: [
      ...plan.decisionLog,
      {
        timestamp: Date.now(),
        decision: "STOP triggered",
        reason: condition.blocker,
        alternatives: [condition.recommendedDefault],
        filesAffected: [],
      },
    ],
  };
}
