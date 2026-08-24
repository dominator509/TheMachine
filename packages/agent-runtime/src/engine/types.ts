export const MACHINE_PLAN_VERSION = 1 as const;
export const RUN_MANIFEST_VERSION = 1 as const;

export type AgenticRunStatus =
  | "pending"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "stopped"
  | "cancelled";

export type TaskRunStatus =
  | "pending"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

export type TaskPhase =
  | "pending"
  | "working"
  | "awaiting_before_approval"
  | "awaiting_after_approval"
  | "validating"
  | "checkpointing"
  | "completed";

export type ApprovalPhase = "before" | "after";
export type ApprovalDecision = "approved" | "rejected";

export interface PlanRepository {
  readonly path: string;
  readonly baseRef?: string;
}

export interface PlanPolicy {
  readonly allowedPaths?: readonly string[];
  readonly deniedPaths?: readonly string[];
  readonly maxChangedFiles?: number;
  readonly maxPatchBytes?: number;
  readonly allowDependencyChanges?: boolean;
  readonly allowBinaryChanges?: boolean;
  readonly keepWorktree?: boolean;
}

export interface ValidationCommand {
  readonly id: string;
  readonly executable: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly timeoutMs?: number;
  readonly expectedExitCode?: number;
  readonly stdoutIncludes?: string;
  readonly stderrExcludes?: string;
  readonly environment?: Readonly<Record<string, string>>;
  readonly passEnvironment?: readonly string[];
}

export interface CliWorkerConfig {
  readonly id: string;
  readonly kind: "cli";
  readonly executable: string;
  readonly args: readonly string[];
  readonly timeoutMs?: number;
  readonly environment?: Readonly<Record<string, string>>;
  readonly passEnvironment?: readonly string[];
  readonly maxOutputBytes?: number;
}

export interface WorkerStrategy {
  readonly primary: string;
  readonly fallbacks?: readonly string[];
}

export interface MachineTask {
  readonly id: string;
  readonly title: string;
  readonly objective: string;
  readonly dependsOn?: readonly string[];
  readonly worker?: string;
  readonly allowedPaths?: readonly string[];
  readonly deniedPaths?: readonly string[];
  readonly validations: readonly ValidationCommand[];
  readonly maxAttempts?: number;
  readonly requireChanges?: boolean;
  readonly approval?: "none" | "before" | "after";
  readonly checkpointMessage?: string;
}

export interface MachinePlan {
  readonly version: typeof MACHINE_PLAN_VERSION;
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly repository: PlanRepository;
  readonly workers?: readonly CliWorkerConfig[];
  readonly workerStrategy: WorkerStrategy;
  readonly policy?: PlanPolicy;
  readonly tasks: readonly MachineTask[];
  readonly kaizen?: {
    readonly enabled?: boolean;
    readonly minimumOccurrences?: number;
  };
}

export interface CompiledMachinePlan {
  readonly plan: MachinePlan;
  readonly digest: string;
  readonly taskOrder: readonly string[];
  readonly sourcePath: string | null;
}

export interface WorkerInput {
  readonly runId: string;
  readonly planId: string;
  readonly task: MachineTask;
  readonly workspacePath: string;
  readonly runDirectory: string;
  readonly attempt: number;
  readonly priorFailures: readonly RunFailure[];
  readonly signal: AbortSignal;
}

export type WorkerEvent =
  | {
      readonly type: "worker.started";
      readonly message: string;
    }
  | {
      readonly type: "worker.message";
      readonly level: "debug" | "info" | "warning" | "error";
      readonly message: string;
    }
  | {
      readonly type: "worker.artifact";
      readonly name: string;
      readonly path: string;
      readonly mediaType: string;
    }
  | {
      readonly type: "worker.completed";
      readonly success: boolean;
      readonly exitCode: number;
      readonly summary: string;
    };

export interface MachineWorker {
  readonly id: string;
  readonly kind: string;
  execute(input: WorkerInput): AsyncIterable<WorkerEvent>;
}

export interface RunFailure {
  readonly category:
    | "worker_unavailable"
    | "worker_failed"
    | "worker_protocol"
    | "validation_failed"
    | "policy_violation"
    | "approval_rejected"
    | "interrupted"
    | "plan_changed"
    | "cancelled"
    | "internal_error";
  readonly message: string;
  readonly retryable: boolean;
  readonly details: Readonly<Record<string, unknown>>;
}

export interface ValidationResult {
  readonly taskId: string;
  readonly validationId: string;
  readonly executable: string;
  readonly args: readonly string[];
  readonly exitCode: number;
  readonly passed: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly timedOut: boolean;
  readonly cancelled: boolean;
  readonly recordedAt: string;
}

export interface PolicyViolation {
  readonly code:
    | "PATH_NOT_ALLOWED"
    | "PATH_DENIED"
    | "TOO_MANY_FILES"
    | "PATCH_TOO_LARGE"
    | "DEPENDENCY_CHANGE_DENIED"
    | "BINARY_CHANGE_DENIED"
    | "NO_CHANGES";
  readonly message: string;
  readonly path: string | null;
}

export interface PolicyDecision {
  readonly taskId: string;
  readonly attempt: number;
  readonly allowed: boolean;
  readonly changedFiles: readonly string[];
  readonly patchBytes: number;
  readonly violations: readonly PolicyViolation[];
  readonly decidedAt: string;
}

export interface TaskAttemptRecord {
  readonly attempt: number;
  readonly workerId: string;
  readonly startedAt: string;
  finishedAt: string | null;
  status: "running" | "completed" | "failed" | "cancelled";
  failure: RunFailure | null;
  changedFiles: string[];
  patchBytes: number;
  validations: ValidationResult[];
}

export interface TaskRunState {
  readonly taskId: string;
  status: TaskRunStatus;
  phase: TaskPhase;
  attempts: TaskAttemptRecord[];
  checkpoint: string | null;
}

export interface RunCheckpoint {
  readonly taskId: string;
  readonly commit: string;
  readonly message: string;
  readonly createdAt: string;
}

export interface ApprovalRecord {
  readonly runId: string;
  readonly taskId: string;
  readonly phase: ApprovalPhase;
  readonly decision: ApprovalDecision;
  readonly actor: string;
  readonly note: string;
  readonly decidedAt: string;
}

export interface RunMetrics {
  startedAt: string;
  finishedAt: string | null;
  durationMs: number;
  taskCount: number;
  completedTaskCount: number;
  attemptCount: number;
  workerFailureCount: number;
  validationFailureCount: number;
  policyViolationCount: number;
  approvalWaitCount: number;
}

export interface RunManifest {
  readonly schemaVersion: typeof RUN_MANIFEST_VERSION;
  readonly runId: string;
  readonly planId: string;
  readonly planDigest: string;
  readonly title: string;
  readonly repositoryPath: string;
  readonly stateRoot: string;
  readonly baseRef: string;
  readonly baseCommit: string;
  readonly branch: string;
  readonly worktreePath: string;
  readonly planSnapshotPath: string;
  readonly taskOrder: readonly string[];
  readonly primaryWorkerId: string;
  status: AgenticRunStatus;
  currentTaskId: string | null;
  taskStates: Record<string, TaskRunState>;
  checkpoints: RunCheckpoint[];
  approvals: ApprovalRecord[];
  policyDecisions: PolicyDecision[];
  failure: RunFailure | null;
  evidencePath: string | null;
  cancellationRequested: boolean;
  nextSequence: number;
  readonly createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  metrics: RunMetrics;
}

export interface RunEvent {
  readonly sequence: number;
  readonly runId: string;
  readonly timestamp: string;
  readonly type: string;
  readonly taskId: string | null;
  readonly workerId: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface RunOutcome {
  readonly runId: string;
  readonly status: AgenticRunStatus;
  readonly manifest: RunManifest;
  readonly evidencePath: string | null;
}

export interface AgenticRuntimeOptions {
  readonly workers?: readonly MachineWorker[];
  readonly stateRoot?: string;
  readonly worktreeRoot?: string;
  readonly keepWorktree?: boolean;
  readonly clock?: () => Date;
  readonly idFactory?: () => string;
}

export interface RunPlanOptions {
  readonly stateRoot?: string;
  readonly worktreeRoot?: string;
  readonly keepWorktree?: boolean;
}
