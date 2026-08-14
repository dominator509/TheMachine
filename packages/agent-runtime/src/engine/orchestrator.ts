import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import {
  commitCheckpoint,
  createRunWorktree,
  defaultWorktreeRoot,
  getRepositoryRoot,
  removeRunWorktree,
  resetWorktree,
  stageAndInspect,
  type RunWorktree,
} from "./git.js";
import { writeEvidenceBundle, verifyEvidenceBundle } from "./evidence.js";
import { KaizenEngine } from "./kaizen.js";
import { compileMachinePlan, loadMachinePlan } from "./plan.js";
import { evaluatePatchPolicy } from "./policy.js";
import { RunStateStore, type RunLease } from "./state.js";
import { runTaskValidations } from "./validation.js";
import { registerPlanWorkers, WorkerRegistry } from "./workers.js";
import type {
  AgenticRuntimeOptions,
  ApprovalPhase,
  ApprovalRecord,
  CompiledMachinePlan,
  MachinePlan,
  MachineTask,
  MachineWorker,
  RunFailure,
  RunManifest,
  RunOutcome,
  RunPlanOptions,
  TaskAttemptRecord,
  TaskRunState,
  WorkerEvent,
} from "./types.js";

const TERMINAL_RUN_STATUSES = new Set(["completed", "failed", "stopped", "cancelled"]);
const LEASE_TTL_MS = 30_000;

function unique<T>(values: readonly T[]): T[] {
  return Array.from(new Set(values));
}

function defaultRunId(): string {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  return `run-${timestamp}-${randomUUID().slice(0, 8)}`;
}

function failure(
  category: RunFailure["category"],
  message: string,
  retryable: boolean,
  details: Readonly<Record<string, unknown>> = {},
): RunFailure {
  return { category, message, retryable, details };
}

function taskWorkerIds(plan: MachinePlan, task: MachineTask): string[] {
  return unique([
    ...(task.worker ? [task.worker] : []),
    plan.workerStrategy.primary,
    ...(plan.workerStrategy.fallbacks ?? []),
  ]);
}

function completedOutcome(manifest: RunManifest): RunOutcome {
  return {
    runId: manifest.runId,
    status: manifest.status,
    manifest,
    evidencePath: manifest.evidencePath,
  };
}

function isCompiled(value: MachinePlan | CompiledMachinePlan): value is CompiledMachinePlan {
  return "plan" in value && "digest" in value && "taskOrder" in value;
}

function latestFailure(state: TaskRunState): RunFailure[] {
  return state.attempts
    .map((attempt) => attempt.failure)
    .filter((item): item is RunFailure => item !== null);
}

export class AgenticRuntime {
  private readonly workers: WorkerRegistry;
  private readonly configuredStateRoot: string | null;
  private readonly configuredWorktreeRoot: string | null;
  private readonly configuredKeepWorktree: boolean;
  private readonly clock: () => Date;
  private readonly idFactory: () => string;

  constructor(options: AgenticRuntimeOptions = {}) {
    this.workers = new WorkerRegistry(options.workers ?? []);
    this.configuredStateRoot = options.stateRoot ? resolve(options.stateRoot) : null;
    this.configuredWorktreeRoot = options.worktreeRoot ? resolve(options.worktreeRoot) : null;
    this.configuredKeepWorktree = options.keepWorktree ?? true;
    this.clock = options.clock ?? (() => new Date());
    this.idFactory = options.idFactory ?? defaultRunId;
  }

  registerWorker(worker: MachineWorker): void {
    this.workers.register(worker);
  }

  unregisterWorker(workerId: string): boolean {
    return this.workers.unregister(workerId);
  }

  listWorkers(): MachineWorker[] {
    return this.workers.list();
  }

  async runPlanFile(filePath: string, options: RunPlanOptions = {}): Promise<RunOutcome> {
    return await this.run(loadMachinePlan(filePath), options);
  }

  async run(
    input: MachinePlan | CompiledMachinePlan,
    options: RunPlanOptions = {},
  ): Promise<RunOutcome> {
    const compiled = isCompiled(input) ? input : compileMachinePlan(input);
    const repositoryPath = getRepositoryRoot(compiled.plan.repository.path);
    const stateRoot = resolve(
      options.stateRoot ?? this.configuredStateRoot ?? join(repositoryPath, ".machine"),
    );
    const store = new RunStateStore(stateRoot, this.clock);
    const runId = this.idFactory();
    const baseRef = compiled.plan.repository.baseRef ?? "HEAD";
    const worktreeRoot = resolve(
      options.worktreeRoot ??
        this.configuredWorktreeRoot ??
        defaultWorktreeRoot(repositoryPath),
    );
    const worktree = createRunWorktree(repositoryPath, runId, baseRef, worktreeRoot);
    const now = this.clock().toISOString();
    const taskStates: Record<string, TaskRunState> = {};
    for (const taskId of compiled.taskOrder) {
      taskStates[taskId] = {
        taskId,
        status: "pending",
        phase: "pending",
        attempts: [],
        checkpoint: null,
      };
    }
    const manifest: RunManifest = {
      schemaVersion: 1,
      runId,
      planId: compiled.plan.id,
      planDigest: compiled.digest,
      title: compiled.plan.title,
      repositoryPath,
      stateRoot,
      baseRef,
      baseCommit: worktree.baseCommit,
      branch: worktree.branch,
      worktreePath: worktree.worktreePath,
      planSnapshotPath: store.planSnapshotPath(runId),
      taskOrder: compiled.taskOrder,
      primaryWorkerId: compiled.plan.workerStrategy.primary,
      status: "pending",
      currentTaskId: null,
      taskStates,
      checkpoints: [],
      approvals: [],
      policyDecisions: [],
      failure: null,
      evidencePath: null,
      cancellationRequested: false,
      nextSequence: 1,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      metrics: {
        startedAt: now,
        finishedAt: null,
        durationMs: 0,
        taskCount: compiled.taskOrder.length,
        completedTaskCount: 0,
        attemptCount: 0,
        workerFailureCount: 0,
        validationFailureCount: 0,
        policyViolationCount: 0,
        approvalWaitCount: 0,
      },
    };
    store.createRun(manifest, compiled.plan);
    store.appendEvent(manifest, {
      type: "run.created",
      taskId: null,
      workerId: null,
      payload: {
        planId: compiled.plan.id,
        planDigest: compiled.digest,
        repositoryPath,
        baseCommit: worktree.baseCommit,
        branch: worktree.branch,
      },
    });
    return await this.execute(compiled, store, manifest, worktree, options);
  }

  async resume(
    runId: string,
    repositoryPath = process.cwd(),
    options: RunPlanOptions = {},
  ): Promise<RunOutcome> {
    const root = getRepositoryRoot(repositoryPath);
    const stateRoot = resolve(options.stateRoot ?? this.configuredStateRoot ?? join(root, ".machine"));
    const store = new RunStateStore(stateRoot, this.clock);
    const manifest = store.loadManifest(runId);
    if (TERMINAL_RUN_STATUSES.has(manifest.status)) return completedOutcome(manifest);

    const plan = store.loadPlanSnapshot(runId);
    const compiled = compileMachinePlan(plan, manifest.planSnapshotPath);
    if (compiled.digest !== manifest.planDigest) {
      manifest.status = "stopped";
      manifest.failure = failure(
        "plan_changed",
        "The immutable plan snapshot digest no longer matches the run manifest.",
        false,
        { expected: manifest.planDigest, actual: compiled.digest },
      );
      store.appendEvent(manifest, {
        type: "run.stopped",
        taskId: manifest.currentTaskId,
        workerId: null,
        payload: manifest.failure.details,
      });
      return this.finalize(compiled, store, manifest, options, null);
    }

    const worktreeRoot = resolve(
      options.worktreeRoot ??
        this.configuredWorktreeRoot ??
        dirname(manifest.worktreePath),
    );
    const worktree = createRunWorktree(
      manifest.repositoryPath,
      manifest.runId,
      manifest.branch,
      worktreeRoot,
    );
    await this.recoverInterruptedTask(store, manifest);
    return await this.execute(compiled, store, manifest, worktree, options);
  }

  status(runId: string, repositoryPath = process.cwd(), stateRoot?: string): RunManifest {
    const root = getRepositoryRoot(repositoryPath);
    const store = new RunStateStore(
      resolve(stateRoot ?? this.configuredStateRoot ?? join(root, ".machine")),
      this.clock,
    );
    return store.loadManifest(runId);
  }

  listRuns(repositoryPath = process.cwd(), stateRoot?: string): RunManifest[] {
    const root = getRepositoryRoot(repositoryPath);
    const store = new RunStateStore(
      resolve(stateRoot ?? this.configuredStateRoot ?? join(root, ".machine")),
      this.clock,
    );
    return store.listManifests();
  }

  cancel(
    runId: string,
    actor: string,
    reason: string,
    repositoryPath = process.cwd(),
    stateRoot?: string,
  ): RunManifest {
    const root = getRepositoryRoot(repositoryPath);
    const store = new RunStateStore(
      resolve(stateRoot ?? this.configuredStateRoot ?? join(root, ".machine")),
      this.clock,
    );
    const manifest = store.loadManifest(runId);
    if (!TERMINAL_RUN_STATUSES.has(manifest.status)) {
      store.requestCancellation(runId, actor, reason);
      manifest.cancellationRequested = true;
      store.appendEvent(manifest, {
        type: "run.cancellation_requested",
        taskId: manifest.currentTaskId,
        workerId: null,
        payload: { actor, reason },
      });
    }
    return manifest;
  }

  approve(
    runId: string,
    taskId: string,
    phase: ApprovalPhase,
    actor: string,
    note: string,
    repositoryPath = process.cwd(),
    stateRoot?: string,
  ): RunManifest {
    return this.recordApproval(
      runId,
      taskId,
      phase,
      "approved",
      actor,
      note,
      repositoryPath,
      stateRoot,
    );
  }

  reject(
    runId: string,
    taskId: string,
    phase: ApprovalPhase,
    actor: string,
    note: string,
    repositoryPath = process.cwd(),
    stateRoot?: string,
  ): RunManifest {
    return this.recordApproval(
      runId,
      taskId,
      phase,
      "rejected",
      actor,
      note,
      repositoryPath,
      stateRoot,
    );
  }

  kaizen(repositoryPath = process.cwd(), stateRoot?: string): KaizenEngine {
    const root = getRepositoryRoot(repositoryPath);
    return new KaizenEngine(
      resolve(stateRoot ?? this.configuredStateRoot ?? join(root, ".machine")),
      this.clock,
    );
  }

  verifyEvidence(directory: string): ReturnType<typeof verifyEvidenceBundle> {
    return verifyEvidenceBundle(resolve(directory));
  }

  private recordApproval(
    runId: string,
    taskId: string,
    phase: ApprovalPhase,
    decision: ApprovalRecord["decision"],
    actor: string,
    note: string,
    repositoryPath: string,
    stateRoot?: string,
  ): RunManifest {
    const root = getRepositoryRoot(repositoryPath);
    const store = new RunStateStore(
      resolve(stateRoot ?? this.configuredStateRoot ?? join(root, ".machine")),
      this.clock,
    );
    const manifest = store.loadManifest(runId);
    if (!manifest.taskStates[taskId]) throw new Error(`Task '${taskId}' is not part of run '${runId}'.`);
    const record: ApprovalRecord = {
      runId,
      taskId,
      phase,
      decision,
      actor,
      note,
      decidedAt: this.clock().toISOString(),
    };
    store.recordApproval(record);
    manifest.approvals.push(record);
    store.appendEvent(manifest, {
      type: `approval.${decision}`,
      taskId,
      workerId: null,
      payload: { phase, actor, note },
    });
    return manifest;
  }

  private async execute(
    compiled: CompiledMachinePlan,
    store: RunStateStore,
    manifest: RunManifest,
    worktree: RunWorktree,
    options: RunPlanOptions,
  ): Promise<RunOutcome> {
    const owner = `${basename(process.execPath)}:${String(process.pid)}:${randomUUID()}`;
    let lease = store.acquireLease(manifest.runId, owner, LEASE_TTL_MS);
    const leaseTimer = setInterval(() => {
      try {
        lease = store.renewLease(lease, LEASE_TTL_MS);
      } catch {
        // The active operation will fail closed when it next persists state.
      }
    }, LEASE_TTL_MS / 3);
    leaseTimer.unref();

    try {
      manifest.status = "running";
      manifest.failure = null;
      store.appendEvent(manifest, {
        type: "run.started",
        taskId: manifest.currentTaskId,
        workerId: null,
        payload: { resumed: manifest.nextSequence > 2 },
      });
      const runWorkers = registerPlanWorkers(compiled.plan, this.workers);

      for (const taskId of compiled.taskOrder) {
        const task = compiled.plan.tasks.find((candidate) => candidate.id === taskId);
        const state = manifest.taskStates[taskId];
        if (!task || !state) {
          manifest.failure = failure(
            "internal_error",
            `Compiled task '${taskId}' is missing from the run state.`,
            false,
          );
          manifest.status = "failed";
          break;
        }
        if (state.status === "completed") continue;
        if (this.cancellationRequested(store, manifest)) {
          this.markCancelled(store, manifest, state);
          break;
        }

        manifest.currentTaskId = taskId;
        const dependencyFailure = (task.dependsOn ?? []).find(
          (dependency) => manifest.taskStates[dependency]?.status !== "completed",
        );
        if (dependencyFailure) {
          manifest.failure = failure(
            "internal_error",
            `Task '${taskId}' cannot run because dependency '${dependencyFailure}' is incomplete.`,
            false,
          );
          manifest.status = "failed";
          break;
        }

        const beforeResult = this.approvalDecision(store, manifest, task, "before");
        if (beforeResult === "waiting") return completedOutcome(manifest);
        if (beforeResult === "rejected") {
          manifest.failure = failure(
            "approval_rejected",
            `Human approval was rejected before task '${task.id}'.`,
            false,
            { taskId: task.id, phase: "before" },
          );
          manifest.status = "stopped";
          state.status = "failed";
          break;
        }

        if (state.phase === "awaiting_after_approval") {
          const afterResult = this.approvalDecision(store, manifest, task, "after");
          if (afterResult === "waiting") return completedOutcome(manifest);
          if (afterResult === "rejected") {
            resetWorktree(manifest.worktreePath);
            const attempt = state.attempts.at(-1);
            if (attempt) {
              attempt.status = "failed";
              attempt.finishedAt = this.clock().toISOString();
              attempt.failure = failure(
                "approval_rejected",
                `Human approval was rejected after worker changes for task '${task.id}'.`,
                false,
                { taskId: task.id, phase: "after" },
              );
            }
            manifest.failure = attempt?.failure ?? failure(
              "approval_rejected",
              `Human approval was rejected for task '${task.id}'.`,
              false,
            );
            manifest.status = "stopped";
            state.status = "failed";
            break;
          }
          const preparedAttempt = state.attempts.at(-1);
          if (!preparedAttempt) {
            manifest.failure = failure(
              "internal_error",
              `Task '${task.id}' is awaiting post-change approval without an attempt.`,
              false,
            );
            manifest.status = "failed";
            break;
          }
          const completed = await this.validateAndCheckpoint(
            compiled,
            store,
            manifest,
            task,
            state,
            preparedAttempt,
          );
          if (completed) continue;
          if (manifest.status === "cancelled") break;
        }

        const completed = await this.executeTask(
          compiled,
          store,
          manifest,
          task,
          state,
          runWorkers,
        );
        if (!completed) {
          if (manifest.status === "awaiting_approval") return completedOutcome(manifest);
          break;
        }
      }

      if (
        manifest.status === "running" &&
        manifest.taskOrder.every((taskId) => manifest.taskStates[taskId]?.status === "completed")
      ) {
        manifest.status = "completed";
        manifest.currentTaskId = null;
        store.appendEvent(manifest, {
          type: "run.completed",
          taskId: null,
          workerId: null,
          payload: { checkpoints: manifest.checkpoints.length },
        });
      }
      return this.finalize(compiled, store, manifest, options, worktree);
    } catch (error) {
      manifest.status = "failed";
      manifest.failure = failure(
        "internal_error",
        error instanceof Error ? error.message : String(error),
        false,
      );
      store.appendEvent(manifest, {
        type: "run.failed",
        taskId: manifest.currentTaskId,
        workerId: null,
        payload: {
          category: manifest.failure.category,
          message: manifest.failure.message,
        },
      });
      return this.finalize(compiled, store, manifest, options, worktree);
    } finally {
      clearInterval(leaseTimer);
      store.releaseLease(lease);
    }
  }

  private async executeTask(
    compiled: CompiledMachinePlan,
    store: RunStateStore,
    manifest: RunManifest,
    task: MachineTask,
    state: TaskRunState,
    workers: WorkerRegistry,
  ): Promise<boolean> {
    const workerIds = taskWorkerIds(compiled.plan, task);
    const maxAttempts = task.maxAttempts ?? 3;

    while (state.attempts.length < maxAttempts) {
      if (this.cancellationRequested(store, manifest)) {
        this.markCancelled(store, manifest, state);
        return false;
      }
      resetWorktree(manifest.worktreePath);
      const attemptNumber = state.attempts.length + 1;
      const workerId = workerIds[(attemptNumber - 1) % Math.max(workerIds.length, 1)] ?? "";
      const attempt: TaskAttemptRecord = {
        attempt: attemptNumber,
        workerId,
        startedAt: this.clock().toISOString(),
        finishedAt: null,
        status: "running",
        failure: null,
        changedFiles: [],
        patchBytes: 0,
        validations: [],
      };
      state.attempts.push(attempt);
      state.status = "running";
      state.phase = "working";
      manifest.metrics.attemptCount += 1;
      store.appendEvent(manifest, {
        type: "task.attempt_started",
        taskId: task.id,
        workerId,
        payload: { attempt: attemptNumber, maxAttempts },
      });

      const worker = workers.get(workerId);
      if (!worker) {
        await this.failAttempt(
          store,
          manifest,
          state,
          attempt,
          failure(
            "worker_unavailable",
            `Worker '${workerId}' is not registered.`,
            true,
            { workerId, taskId: task.id },
          ),
        );
        continue;
      }

      const workerFailure = await this.runWorker(store, manifest, task, state, attempt, worker);
      if (workerFailure) {
        await this.failAttempt(store, manifest, state, attempt, workerFailure);
        if (!workerFailure.retryable) break;
        continue;
      }

      const staged = stageAndInspect(manifest.worktreePath);
      attempt.changedFiles = [...staged.changedFiles];
      attempt.patchBytes = staged.patchBytes;
      const decision = evaluatePatchPolicy({
        task,
        planPolicy: compiled.plan.policy,
        attempt: attemptNumber,
        patch: staged,
        decidedAt: this.clock().toISOString(),
      });
      manifest.policyDecisions.push(decision);
      store.appendEvent(manifest, {
        type: "policy.decided",
        taskId: task.id,
        workerId,
        payload: {
          allowed: decision.allowed,
          changedFiles: decision.changedFiles,
          patchBytes: decision.patchBytes,
          violations: decision.violations,
        },
      });
      if (!decision.allowed) {
        manifest.metrics.policyViolationCount += decision.violations.length;
        const policyFailure = failure(
          "policy_violation",
          decision.violations.map((violation) => violation.message).join(" "),
          true,
          { taskId: task.id, workerId, violations: decision.violations },
        );
        await this.failAttempt(store, manifest, state, attempt, policyFailure);
        continue;
      }

      if ((task.approval ?? "none") === "after") {
        const afterResult = this.approvalDecision(store, manifest, task, "after");
        if (afterResult === "waiting") {
          state.phase = "awaiting_after_approval";
          state.status = "awaiting_approval";
          return false;
        }
        if (afterResult === "rejected") {
          const rejected = failure(
            "approval_rejected",
            `Human approval was rejected after task '${task.id}' changed the repository.`,
            false,
            { taskId: task.id, workerId, phase: "after" },
          );
          await this.failAttempt(store, manifest, state, attempt, rejected);
          manifest.status = "stopped";
          manifest.failure = rejected;
          return false;
        }
      }

      const completed = await this.validateAndCheckpoint(
        compiled,
        store,
        manifest,
        task,
        state,
        attempt,
      );
      if (completed) return true;
      if (manifest.status === "cancelled") return false;
      if (attempt.failure && !attempt.failure.retryable) break;
    }

    state.status = "failed";
    state.phase = "pending";
    manifest.status = "failed";
    manifest.failure =
      state.attempts.at(-1)?.failure ??
      failure(
        "worker_failed",
        `Task '${task.id}' exhausted ${String(maxAttempts)} attempt(s).`,
        false,
        { taskId: task.id },
      );
    store.appendEvent(manifest, {
      type: "task.failed",
      taskId: task.id,
      workerId: state.attempts.at(-1)?.workerId ?? null,
      payload: {
        category: manifest.failure.category,
        message: manifest.failure.message,
        attempts: state.attempts.length,
      },
    });
    return false;
  }

  private async runWorker(
    store: RunStateStore,
    manifest: RunManifest,
    task: MachineTask,
    state: TaskRunState,
    attempt: TaskAttemptRecord,
    worker: MachineWorker,
  ): Promise<RunFailure | null> {
    const controller = new AbortController();
    const cancellationTimer = setInterval(() => {
      if (store.isCancellationRequested(manifest.runId)) controller.abort();
    }, 250);
    cancellationTimer.unref();
    let terminalEvent: Extract<WorkerEvent, { type: "worker.completed" }> | null = null;

    try {
      for await (const event of worker.execute({
        runId: manifest.runId,
        planId: manifest.planId,
        task,
        workspacePath: manifest.worktreePath,
        runDirectory: store.runDirectory(manifest.runId),
        attempt: attempt.attempt,
        priorFailures: latestFailure(state),
        signal: controller.signal,
      })) {
        store.appendEvent(manifest, {
          type: event.type,
          taskId: task.id,
          workerId: worker.id,
          payload: { ...event },
        });
        if (event.type === "worker.completed") terminalEvent = event;
        if (store.isCancellationRequested(manifest.runId)) controller.abort();
      }
    } catch (error) {
      return failure(
        "worker_failed",
        error instanceof Error ? error.message : String(error),
        true,
        { workerId: worker.id, taskId: task.id },
      );
    } finally {
      clearInterval(cancellationTimer);
    }

    if (controller.signal.aborted || store.isCancellationRequested(manifest.runId)) {
      return failure(
        "cancelled",
        `Run was cancelled while worker '${worker.id}' was active.`,
        false,
        { workerId: worker.id, taskId: task.id },
      );
    }
    if (!terminalEvent) {
      return failure(
        "worker_protocol",
        `Worker '${worker.id}' ended without a worker.completed event.`,
        true,
        { workerId: worker.id, taskId: task.id },
      );
    }
    if (!terminalEvent.success) {
      manifest.metrics.workerFailureCount += 1;
      return failure(
        "worker_failed",
        terminalEvent.summary,
        true,
        { workerId: worker.id, taskId: task.id, exitCode: terminalEvent.exitCode },
      );
    }
    return null;
  }

  private async validateAndCheckpoint(
    compiled: CompiledMachinePlan,
    store: RunStateStore,
    manifest: RunManifest,
    task: MachineTask,
    state: TaskRunState,
    attempt: TaskAttemptRecord,
  ): Promise<boolean> {
    if (this.cancellationRequested(store, manifest)) {
      this.markCancelled(store, manifest, state);
      attempt.status = "cancelled";
      attempt.finishedAt = this.clock().toISOString();
      attempt.failure = failure("cancelled", "Run cancelled before validation.", false);
      resetWorktree(manifest.worktreePath);
      return false;
    }

    state.phase = "validating";
    store.appendEvent(manifest, {
      type: "validation.started",
      taskId: task.id,
      workerId: attempt.workerId,
      payload: { validations: task.validations.map((validation) => validation.id) },
    });
    const controller = new AbortController();
    const cancellationTimer = setInterval(() => {
      if (store.isCancellationRequested(manifest.runId)) controller.abort();
    }, 250);
    cancellationTimer.unref();
    try {
      attempt.validations = await runTaskValidations({
        task,
        worktreePath: manifest.worktreePath,
        signal: controller.signal,
        clock: this.clock,
      });
    } finally {
      clearInterval(cancellationTimer);
    }

    for (const validation of attempt.validations) {
      store.appendEvent(manifest, {
        type: validation.passed ? "validation.passed" : "validation.failed",
        taskId: task.id,
        workerId: attempt.workerId,
        payload: {
          validationId: validation.validationId,
          exitCode: validation.exitCode,
          durationMs: validation.durationMs,
          timedOut: validation.timedOut,
          cancelled: validation.cancelled,
        },
      });
    }

    const failedValidation = attempt.validations.find((validation) => !validation.passed);
    if (
      failedValidation ||
      attempt.validations.length !== task.validations.length ||
      controller.signal.aborted
    ) {
      manifest.metrics.validationFailureCount += 1;
      const validationFailure = controller.signal.aborted
        ? failure("cancelled", "Run cancelled during validation.", false, { taskId: task.id })
        : failure(
            "validation_failed",
            failedValidation
              ? `Validation '${failedValidation.validationId}' failed with exit code ${String(failedValidation.exitCode)}.`
              : "Not all deterministic validations completed.",
            true,
            {
              taskId: task.id,
              workerId: attempt.workerId,
              validationId: failedValidation?.validationId ?? null,
              exitCode: failedValidation?.exitCode ?? null,
            },
          );
      await this.failAttempt(store, manifest, state, attempt, validationFailure);
      if (controller.signal.aborted) this.markCancelled(store, manifest, state);
      return false;
    }

    const finalPatch = stageAndInspect(manifest.worktreePath);
    const finalDecision = evaluatePatchPolicy({
      task,
      planPolicy: compiled.plan.policy,
      attempt: attempt.attempt,
      patch: finalPatch,
      decidedAt: this.clock().toISOString(),
    });
    manifest.policyDecisions.push(finalDecision);
    if (!finalDecision.allowed) {
      manifest.metrics.policyViolationCount += finalDecision.violations.length;
      await this.failAttempt(
        store,
        manifest,
        state,
        attempt,
        failure(
          "policy_violation",
          `Validation introduced or exposed a disallowed change: ${finalDecision.violations.map((item) => item.message).join(" ")}`,
          true,
          { taskId: task.id, violations: finalDecision.violations },
        ),
      );
      return false;
    }

    state.phase = "checkpointing";
    const message = task.checkpointMessage ?? `machine(${manifest.runId}): ${task.title}`;
    const commit = commitCheckpoint(manifest.worktreePath, message);
    const completedAt = this.clock().toISOString();
    attempt.status = "completed";
    attempt.finishedAt = completedAt;
    attempt.failure = null;
    attempt.changedFiles = [...finalPatch.changedFiles];
    attempt.patchBytes = finalPatch.patchBytes;
    state.status = "completed";
    state.phase = "completed";
    state.checkpoint = commit;
    manifest.checkpoints.push({ taskId: task.id, commit, message, createdAt: completedAt });
    manifest.metrics.completedTaskCount += 1;
    store.appendEvent(manifest, {
      type: "task.completed",
      taskId: task.id,
      workerId: attempt.workerId,
      payload: {
        checkpoint: commit,
        changedFiles: finalPatch.changedFiles,
        attempt: attempt.attempt,
      },
    });
    return true;
  }

  private async failAttempt(
    store: RunStateStore,
    manifest: RunManifest,
    state: TaskRunState,
    attempt: TaskAttemptRecord,
    attemptFailure: RunFailure,
  ): Promise<void> {
    attempt.status = attemptFailure.category === "cancelled" ? "cancelled" : "failed";
    attempt.finishedAt = this.clock().toISOString();
    attempt.failure = attemptFailure;
    state.status = attemptFailure.category === "cancelled" ? "cancelled" : "running";
    state.phase = "pending";
    if (existsSync(manifest.worktreePath)) resetWorktree(manifest.worktreePath);
    store.appendEvent(manifest, {
      type: "task.attempt_failed",
      taskId: state.taskId,
      workerId: attempt.workerId,
      payload: {
        attempt: attempt.attempt,
        category: attemptFailure.category,
        message: attemptFailure.message,
        retryable: attemptFailure.retryable,
      },
    });
  }

  private approvalDecision(
    store: RunStateStore,
    manifest: RunManifest,
    task: MachineTask,
    phase: ApprovalPhase,
  ): "approved" | "rejected" | "waiting" | "not_required" {
    if ((task.approval ?? "none") !== phase) return "not_required";
    const record = store.latestApproval(manifest.runId, task.id, phase);
    if (record?.decision === "approved") return "approved";
    if (record?.decision === "rejected") return "rejected";

    const state = manifest.taskStates[task.id];
    if (state && state.status !== "awaiting_approval") manifest.metrics.approvalWaitCount += 1;
    if (state) {
      state.status = "awaiting_approval";
      state.phase = phase === "before" ? "awaiting_before_approval" : "awaiting_after_approval";
    }
    manifest.status = "awaiting_approval";
    store.appendEvent(manifest, {
      type: "approval.requested",
      taskId: task.id,
      workerId: state?.attempts.at(-1)?.workerId ?? null,
      payload: { phase },
    });
    return "waiting";
  }

  private cancellationRequested(store: RunStateStore, manifest: RunManifest): boolean {
    const requested = manifest.cancellationRequested || store.isCancellationRequested(manifest.runId);
    if (requested) manifest.cancellationRequested = true;
    return requested;
  }

  private markCancelled(
    store: RunStateStore,
    manifest: RunManifest,
    state?: TaskRunState,
  ): void {
    manifest.status = "cancelled";
    manifest.failure = failure("cancelled", "Run cancelled by operator request.", false);
    if (state) {
      state.status = "cancelled";
      state.phase = "pending";
    }
    store.appendEvent(manifest, {
      type: "run.cancelled",
      taskId: manifest.currentTaskId,
      workerId: state?.attempts.at(-1)?.workerId ?? null,
      payload: {},
    });
  }

  private async recoverInterruptedTask(
    store: RunStateStore,
    manifest: RunManifest,
  ): Promise<void> {
    const currentTaskId = manifest.currentTaskId;
    if (!currentTaskId) return;
    const state = manifest.taskStates[currentTaskId];
    if (!state || state.phase === "awaiting_after_approval" || state.phase === "awaiting_before_approval") return;
    if (state.phase === "working" || state.phase === "validating" || state.phase === "checkpointing") {
      if (existsSync(manifest.worktreePath)) resetWorktree(manifest.worktreePath);
      const attempt = state.attempts.at(-1);
      if (attempt?.status === "running") {
        attempt.status = "failed";
        attempt.finishedAt = this.clock().toISOString();
        attempt.failure = failure(
          "interrupted",
          `Run process ended during phase '${state.phase}'. The attempt was rolled back to the last checkpoint.`,
          true,
          { taskId: currentTaskId, phase: state.phase },
        );
      }
      state.status = "pending";
      state.phase = "pending";
      manifest.status = "pending";
      store.appendEvent(manifest, {
        type: "run.recovered",
        taskId: currentTaskId,
        workerId: attempt?.workerId ?? null,
        payload: { rolledBack: true },
      });
    }
  }

  private finalize(
    compiled: CompiledMachinePlan,
    store: RunStateStore,
    manifest: RunManifest,
    options: RunPlanOptions,
    worktree: RunWorktree | null,
  ): RunOutcome {
    if (!TERMINAL_RUN_STATUSES.has(manifest.status)) {
      store.saveManifest(manifest);
      return completedOutcome(manifest);
    }

    const finishedAt = this.clock();
    manifest.completedAt = finishedAt.toISOString();
    manifest.updatedAt = finishedAt.toISOString();
    manifest.metrics.finishedAt = finishedAt.toISOString();
    manifest.metrics.durationMs = Math.max(
      0,
      finishedAt.getTime() - Date.parse(manifest.metrics.startedAt),
    );
    manifest.evidencePath = join(store.runDirectory(manifest.runId), "evidence");
    store.saveManifest(manifest);

    if (compiled.plan.kaizen?.enabled ?? false) {
      try {
        const proposal = new KaizenEngine(store.stateRoot, this.clock).analyze({
          minimumOccurrences: compiled.plan.kaizen?.minimumOccurrences ?? 2,
        });
        if (proposal) {
          store.appendEvent(manifest, {
            type: "kaizen.proposal_generated",
            taskId: null,
            workerId: null,
            payload: { proposalId: proposal.id, status: proposal.status, signal: proposal.signal.key },
          });
        }
      } catch (error) {
        store.appendEvent(manifest, {
          type: "kaizen.analysis_failed",
          taskId: null,
          workerId: null,
          payload: { message: error instanceof Error ? error.message : String(error) },
        });
      }
    }

    const evidence = writeEvidenceBundle({ store, manifest, plan: compiled.plan });
    manifest.evidencePath = evidence.directory;
    store.saveManifest(manifest);

    const keepWorktree =
      options.keepWorktree ??
      compiled.plan.policy?.keepWorktree ??
      this.configuredKeepWorktree;
    if (!keepWorktree && manifest.status === "completed" && worktree) {
      removeRunWorktree(worktree);
    }
    return completedOutcome(manifest);
  }
}

export function createAgenticRuntime(options: AgenticRuntimeOptions = {}): AgenticRuntime {
  return new AgenticRuntime(options);
}
