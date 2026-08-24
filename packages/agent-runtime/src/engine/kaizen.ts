import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { RunStateStore } from "./state.js";
import type { MachinePlan, RunFailure, RunManifest, ValidationCommand } from "./types.js";

export type KaizenProposalStatus =
  | "pending_human_review"
  | "approved"
  | "rejected"
  | "materialized"
  | "validated"
  | "validation_failed";

export interface KaizenSignal {
  readonly key: string;
  readonly category: string;
  readonly occurrences: number;
  readonly weightedScore: number;
  readonly runIds: readonly string[];
  readonly messages: readonly string[];
}

export interface KaizenProposal {
  readonly schemaVersion: 1;
  readonly id: string;
  status: KaizenProposalStatus;
  readonly title: string;
  readonly problem: string;
  readonly hypothesis: string;
  readonly signal: KaizenSignal;
  readonly evidence: readonly {
    readonly runId: string;
    readonly manifestPath: string;
    readonly evidencePath: string | null;
  }[];
  readonly acceptanceCriteria: readonly string[];
  readonly risk: "low" | "medium" | "high";
  readonly planDraft: MachinePlan;
  readonly createdAt: string;
  updatedAt: string;
  decision: {
    readonly actor: string;
    readonly note: string;
    readonly decidedAt: string;
  } | null;
  materializedPlanPath: string | null;
  validationRunId: string | null;
}

export interface KaizenAnalyzeOptions {
  readonly minimumOccurrences?: number;
  readonly maximumRuns?: number;
}

function atomicWriteJson(filePath: string, value: unknown): void {
  mkdirSync(resolve(filePath, ".."), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${String(process.pid)}.${Math.random().toString(36).slice(2)}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf-8",
    mode: 0o600,
  });
  renameSync(temporary, filePath);
}

function severityWeight(category: string): number {
  switch (category) {
    case "policy_violation":
      return 5;
    case "internal_error":
      return 5;
    case "validation_failed":
      return 4;
    case "worker_failed":
    case "worker_protocol":
      return 3;
    case "interrupted":
      return 2;
    default:
      return 1;
  }
}

function riskFor(category: string): KaizenProposal["risk"] {
  if (category === "policy_violation" || category === "internal_error") return "high";
  if (category === "validation_failed" || category === "worker_protocol") return "medium";
  return "low";
}

function signalKey(failure: RunFailure): string {
  const validationId = failure.details["validationId"];
  const workerId = failure.details["workerId"];
  const discriminator =
    typeof validationId === "string"
      ? validationId
      : typeof workerId === "string"
        ? workerId
        : "general";
  return `${failure.category}:${discriminator}`;
}

function collectFailures(manifest: RunManifest): RunFailure[] {
  const failures: RunFailure[] = [];
  if (manifest.failure) failures.push(manifest.failure);
  for (const task of Object.values(manifest.taskStates)) {
    for (const attempt of task.attempts) {
      if (attempt.failure) failures.push(attempt.failure);
      for (const validation of attempt.validations) {
        if (!validation.passed) {
          failures.push({
            category: "validation_failed",
            message: `Validation '${validation.validationId}' failed for task '${task.taskId}'.`,
            retryable: true,
            details: {
              taskId: task.taskId,
              validationId: validation.validationId,
              exitCode: validation.exitCode,
            },
          });
        }
      }
    }
  }
  return failures;
}

function uniqueValidations(plan: MachinePlan): ValidationCommand[] {
  const byId = new Map<string, ValidationCommand>();
  for (const task of plan.tasks) {
    for (const validation of task.validations) {
      if (!byId.has(validation.id)) byId.set(validation.id, validation);
    }
  }
  return Array.from(byId.values()).slice(0, 8);
}

function proposalId(signal: KaizenSignal, now: Date): string {
  const digest = createHash("sha256")
    .update(`${signal.key}:${signal.runIds.join(",")}`)
    .digest("hex")
    .slice(0, 10);
  return `KZ-${now.toISOString().slice(0, 10).replaceAll("-", "")}-${digest}`;
}

function improvementObjective(signal: KaizenSignal): string {
  return [
    `Investigate and reduce recurring failure '${signal.key}'.`,
    `It occurred ${String(signal.occurrences)} time(s) across runs: ${signal.runIds.join(", ")}.`,
    "Use the referenced evidence bundles and manifests to identify the smallest root-cause fix.",
    "Add a regression test that fails before the fix and passes afterward.",
    "Do not weaken safety policy, remove validations, suppress errors, or automatically merge the result.",
  ].join(" ");
}

function draftPlan(id: string, signal: KaizenSignal, sourcePlan: MachinePlan): MachinePlan {
  const validations = uniqueValidations(sourcePlan);
  return {
    version: 1,
    id: `kaizen-${id.toLowerCase()}`,
    title: `Kaizen: ${signal.key}`,
    description: "Human-approved continuous-improvement experiment generated from run evidence.",
    repository: sourcePlan.repository,
    workers: sourcePlan.workers ?? [],
    workerStrategy: sourcePlan.workerStrategy,
    policy: {
      ...(sourcePlan.policy ?? {}),
      maxChangedFiles: Math.min(sourcePlan.policy?.maxChangedFiles ?? 100, 200),
      maxPatchBytes: Math.min(sourcePlan.policy?.maxPatchBytes ?? 1024 * 1024, 2 * 1024 * 1024),
      keepWorktree: true,
    },
    tasks: [
      {
        id: "root-cause-improvement",
        title: `Reduce ${signal.key}`,
        objective: improvementObjective(signal),
        allowedPaths: sourcePlan.policy?.allowedPaths ?? ["**"],
        deniedPaths: sourcePlan.policy?.deniedPaths ?? [".git/**", ".machine/**"],
        validations,
        maxAttempts: 3,
        requireChanges: true,
        approval: "before",
        checkpointMessage: `kaizen: reduce ${signal.key}`,
      },
    ],
    kaizen: {
      enabled: false,
      minimumOccurrences: sourcePlan.kaizen?.minimumOccurrences ?? 2,
    },
  };
}

export class KaizenEngine {
  readonly stateRoot: string;
  private readonly store: RunStateStore;
  private readonly clock: () => Date;

  constructor(stateRoot: string, clock: () => Date = () => new Date()) {
    this.stateRoot = resolve(stateRoot);
    this.store = new RunStateStore(this.stateRoot, clock);
    this.clock = clock;
    mkdirSync(this.proposalsDirectory(), { recursive: true, mode: 0o700 });
    mkdirSync(this.plansDirectory(), { recursive: true, mode: 0o700 });
  }

  proposalsDirectory(): string {
    return join(this.stateRoot, "kaizen", "proposals");
  }

  plansDirectory(): string {
    return join(this.stateRoot, "kaizen", "plans");
  }

  proposalPath(id: string): string {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(id))
      throw new Error(`Invalid proposal ID: ${id}`);
    return join(this.proposalsDirectory(), `${id}.json`);
  }

  get(id: string): KaizenProposal {
    const filePath = this.proposalPath(id);
    if (!existsSync(filePath)) throw new Error(`Kaizen proposal not found: ${id}`);
    return JSON.parse(readFileSync(filePath, "utf-8")) as KaizenProposal;
  }

  list(): KaizenProposal[] {
    return readdirSync(this.proposalsDirectory())
      .filter((name) => name.endsWith(".json"))
      .map(
        (name) =>
          JSON.parse(
            readFileSync(join(this.proposalsDirectory(), name), "utf-8"),
          ) as KaizenProposal,
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  analyze(options: KaizenAnalyzeOptions = {}): KaizenProposal | null {
    const manifests = this.store.listManifests().slice(0, options.maximumRuns ?? 50);
    const aggregation = new Map<
      string,
      { category: string; count: number; score: number; runIds: Set<string>; messages: Set<string> }
    >();

    for (const manifest of manifests) {
      for (const failure of collectFailures(manifest)) {
        const key = signalKey(failure);
        const current = aggregation.get(key) ?? {
          category: failure.category,
          count: 0,
          score: 0,
          runIds: new Set<string>(),
          messages: new Set<string>(),
        };
        current.count += 1;
        current.score += severityWeight(failure.category);
        current.runIds.add(manifest.runId);
        current.messages.add(failure.message);
        aggregation.set(key, current);
      }
    }

    const minimumOccurrences = options.minimumOccurrences ?? 2;
    const selected = Array.from(aggregation.entries())
      .filter(([, value]) => value.count >= minimumOccurrences)
      .sort((left, right) => right[1].score - left[1].score || right[1].count - left[1].count)[0];
    if (!selected) return null;

    const [key, value] = selected;
    const signal: KaizenSignal = {
      key,
      category: value.category,
      occurrences: value.count,
      weightedScore: value.score,
      runIds: Array.from(value.runIds).sort(),
      messages: Array.from(value.messages).slice(0, 10),
    };
    const now = this.clock();
    const id = proposalId(signal, now);
    const existing = this.list().find(
      (proposal) =>
        proposal.signal.key === signal.key &&
        proposal.status !== "rejected" &&
        proposal.status !== "validated" &&
        proposal.status !== "validation_failed",
    );
    if (existing) return existing;

    const sourceManifest = manifests.find((manifest) => signal.runIds.includes(manifest.runId));
    if (!sourceManifest) return null;
    const sourcePlan = this.store.loadPlanSnapshot(sourceManifest.runId);
    const proposal: KaizenProposal = {
      schemaVersion: 1,
      id,
      status: "pending_human_review",
      title: `Reduce recurring ${signal.key}`,
      problem: signal.messages.join(" "),
      hypothesis: `A narrowly scoped root-cause fix with regression coverage will reduce ${signal.key} without weakening policy or validations.`,
      signal,
      evidence: signal.runIds.map((runId) => {
        const manifest = this.store.loadManifest(runId);
        return {
          runId,
          manifestPath: this.store.manifestPath(runId),
          evidencePath: manifest.evidencePath,
        };
      }),
      acceptanceCriteria: [
        `The generated improvement run completes all deterministic validations.`,
        `A regression test directly exercises ${signal.key}.`,
        `No safety policy, validation, or approval requirement is removed to obtain a pass.`,
        `Follow-up runs do not reproduce ${signal.key} in the evaluation window.`,
      ],
      risk: riskFor(signal.category),
      planDraft: draftPlan(id, signal, sourcePlan),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      decision: null,
      materializedPlanPath: null,
      validationRunId: null,
    };
    atomicWriteJson(this.proposalPath(id), proposal);
    return proposal;
  }

  approve(
    id: string,
    actor: string,
    note = "Approved for a bounded improvement experiment.",
  ): KaizenProposal {
    const proposal = this.get(id);
    if (proposal.status !== "pending_human_review") {
      throw new Error(`Proposal '${id}' is not awaiting human review.`);
    }
    const decidedAt = this.clock().toISOString();
    proposal.status = "approved";
    proposal.updatedAt = decidedAt;
    proposal.decision = { actor, note, decidedAt };
    atomicWriteJson(this.proposalPath(id), proposal);
    return proposal;
  }

  reject(id: string, actor: string, note: string): KaizenProposal {
    const proposal = this.get(id);
    if (proposal.status !== "pending_human_review" && proposal.status !== "approved") {
      throw new Error(`Proposal '${id}' cannot be rejected from status '${proposal.status}'.`);
    }
    const decidedAt = this.clock().toISOString();
    proposal.status = "rejected";
    proposal.updatedAt = decidedAt;
    proposal.decision = { actor, note, decidedAt };
    atomicWriteJson(this.proposalPath(id), proposal);
    return proposal;
  }

  materialize(id: string): KaizenProposal {
    const proposal = this.get(id);
    if (proposal.status !== "approved") {
      throw new Error(`Proposal '${id}' requires explicit human approval before materialization.`);
    }
    const planPath = join(this.plansDirectory(), `${id}.machine.json`);
    atomicWriteJson(planPath, proposal.planDraft);
    proposal.status = "materialized";
    proposal.materializedPlanPath = planPath;
    proposal.updatedAt = this.clock().toISOString();
    atomicWriteJson(this.proposalPath(id), proposal);
    return proposal;
  }

  recordValidation(id: string, runId: string): KaizenProposal {
    const proposal = this.get(id);
    if (proposal.status !== "materialized") {
      throw new Error(`Proposal '${id}' has not been materialized.`);
    }
    const run = this.store.loadManifest(runId);
    proposal.validationRunId = runId;
    proposal.status = run.status === "completed" ? "validated" : "validation_failed";
    proposal.updatedAt = this.clock().toISOString();
    atomicWriteJson(this.proposalPath(id), proposal);
    return proposal;
  }
}
