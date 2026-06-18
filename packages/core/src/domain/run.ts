// AgentRun, Command, and Validation entities.
// No infrastructure imports.

import type { EntityId, ActivityStatus, Severity, Timestamp } from "./types.js";

/** One run of an agent or runtime pass. */
export interface AgentRun {
  readonly id: EntityId;
  readonly execPlanId: EntityId;
  readonly milestoneId: EntityId | null;
  readonly status: ActivityStatus;
  readonly commands: CommandRun[];
  readonly validations: ValidationResult[];
}

/** A single command executed during a run. */
export interface CommandRun {
  readonly command: string;
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly timestamp: Timestamp;
}

/** Result of running a validation command. */
export interface ValidationResult {
  readonly command: string;
  readonly passed: boolean;
  readonly exitCode: number | null;
  readonly output: string;
  readonly severity: Severity;
}

/** Creates a new AgentRun. */
export function createAgentRun(id: EntityId, execPlanId: EntityId): AgentRun {
  return {
    id,
    execPlanId,
    milestoneId: null,
    status: "pending",
    commands: [],
    validations: [],
  };
}

/** Records a command in the run. */
export function recordCommand(run: AgentRun, cmd: CommandRun): AgentRun {
  return { ...run, commands: [...run.commands, cmd] };
}

/** Records a validation result in the run. */
export function recordValidation(run: AgentRun, validation: ValidationResult): AgentRun {
  return { ...run, validations: [...run.validations, validation] };
}
