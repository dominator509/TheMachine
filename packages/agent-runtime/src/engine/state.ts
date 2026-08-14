import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import type { ApprovalRecord, MachinePlan, RunEvent, RunManifest } from "./types.js";

const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;

export interface RunLease {
  readonly runId: string;
  readonly owner: string;
  readonly acquiredAt: string;
  readonly expiresAt: string;
}

function parseJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf-8")) as T;
}

function atomicWrite(filePath: string, contents: string): void {
  mkdirSync(resolve(filePath, ".."), { recursive: true });
  const temporaryPath = `${filePath}.${String(process.pid)}.${Math.random().toString(36).slice(2)}.tmp`;
  writeFileSync(temporaryPath, contents, { encoding: "utf-8", mode: 0o600 });
  renameSync(temporaryPath, filePath);
}

function assertRunId(runId: string): void {
  if (!RUN_ID_PATTERN.test(runId)) throw new Error(`Invalid run ID: ${runId}`);
}

export class RunStateStore {
  readonly stateRoot: string;
  private readonly clock: () => Date;

  constructor(stateRoot: string, clock: () => Date = () => new Date()) {
    this.stateRoot = resolve(stateRoot);
    this.clock = clock;
    mkdirSync(this.runsDirectory(), { recursive: true });
  }

  runsDirectory(): string {
    return join(this.stateRoot, "runs");
  }

  runDirectory(runId: string): string {
    assertRunId(runId);
    return join(this.runsDirectory(), runId);
  }

  manifestPath(runId: string): string {
    return join(this.runDirectory(runId), "manifest.json");
  }

  planSnapshotPath(runId: string): string {
    return join(this.runDirectory(runId), "plan.snapshot.json");
  }

  eventsPath(runId: string): string {
    return join(this.runDirectory(runId), "events.jsonl");
  }

  approvalsPath(runId: string): string {
    return join(this.runDirectory(runId), "approvals.jsonl");
  }

  cancellationPath(runId: string): string {
    return join(this.runDirectory(runId), "cancellation.requested");
  }

  leasePath(runId: string): string {
    return join(this.runDirectory(runId), "lease.json");
  }

  createRun(manifest: RunManifest, plan: MachinePlan): void {
    const runDirectory = this.runDirectory(manifest.runId);
    if (existsSync(runDirectory)) throw new Error(`Run already exists: ${manifest.runId}`);
    mkdirSync(runDirectory, { recursive: true, mode: 0o700 });
    atomicWrite(this.planSnapshotPath(manifest.runId), `${JSON.stringify(plan, null, 2)}\n`);
    atomicWrite(this.manifestPath(manifest.runId), `${JSON.stringify(manifest, null, 2)}\n`);
    writeFileSync(this.eventsPath(manifest.runId), "", { encoding: "utf-8", mode: 0o600 });
    writeFileSync(this.approvalsPath(manifest.runId), "", { encoding: "utf-8", mode: 0o600 });
  }

  saveManifest(manifest: RunManifest): void {
    atomicWrite(this.manifestPath(manifest.runId), `${JSON.stringify(manifest, null, 2)}\n`);
  }

  loadManifest(runId: string): RunManifest {
    const filePath = this.manifestPath(runId);
    if (!existsSync(filePath)) throw new Error(`Run not found: ${runId}`);
    return parseJsonFile<RunManifest>(filePath);
  }

  loadPlanSnapshot(runId: string): MachinePlan {
    const filePath = this.planSnapshotPath(runId);
    if (!existsSync(filePath)) throw new Error(`Plan snapshot not found for run: ${runId}`);
    return parseJsonFile<MachinePlan>(filePath);
  }

  appendEvent(
    manifest: RunManifest,
    event: Omit<RunEvent, "sequence" | "runId" | "timestamp">,
  ): RunEvent {
    const recorded: RunEvent = {
      ...event,
      sequence: manifest.nextSequence,
      runId: manifest.runId,
      timestamp: this.clock().toISOString(),
    };
    appendFileSync(this.eventsPath(manifest.runId), `${JSON.stringify(recorded)}\n`, {
      encoding: "utf-8",
      mode: 0o600,
    });
    manifest.nextSequence += 1;
    manifest.updatedAt = recorded.timestamp;
    this.saveManifest(manifest);
    return recorded;
  }

  readEvents(runId: string): RunEvent[] {
    const filePath = this.eventsPath(runId);
    if (!existsSync(filePath)) return [];
    return readFileSync(filePath, "utf-8")
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as RunEvent);
  }

  recordApproval(record: ApprovalRecord): void {
    appendFileSync(this.approvalsPath(record.runId), `${JSON.stringify(record)}\n`, {
      encoding: "utf-8",
      mode: 0o600,
    });
  }

  readApprovals(runId: string): ApprovalRecord[] {
    const filePath = this.approvalsPath(runId);
    if (!existsSync(filePath)) return [];
    return readFileSync(filePath, "utf-8")
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as ApprovalRecord);
  }

  latestApproval(
    runId: string,
    taskId: string,
    phase: ApprovalRecord["phase"],
  ): ApprovalRecord | null {
    const matches = this.readApprovals(runId).filter(
      (approval) => approval.taskId === taskId && approval.phase === phase,
    );
    return matches.at(-1) ?? null;
  }

  requestCancellation(runId: string, actor: string, reason: string): void {
    const requestedAt = this.clock().toISOString();
    atomicWrite(
      this.cancellationPath(runId),
      `${JSON.stringify({ runId, actor, reason, requestedAt }, null, 2)}\n`,
    );
  }

  isCancellationRequested(runId: string): boolean {
    return existsSync(this.cancellationPath(runId));
  }

  clearCancellation(runId: string): void {
    rmSync(this.cancellationPath(runId), { force: true });
  }

  listManifests(): RunManifest[] {
    if (!existsSync(this.runsDirectory())) return [];
    return readdirSync(this.runsDirectory(), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && RUN_ID_PATTERN.test(entry.name))
      .map((entry) => {
        try {
          return this.loadManifest(entry.name);
        } catch {
          return null;
        }
      })
      .filter((manifest): manifest is RunManifest => manifest !== null)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  acquireLease(runId: string, owner: string, ttlMs = 30_000): RunLease {
    const filePath = this.leasePath(runId);
    const now = this.clock();
    if (existsSync(filePath)) {
      const existing = parseJsonFile<RunLease>(filePath);
      if (Date.parse(existing.expiresAt) > now.getTime() && existing.owner !== owner) {
        throw new Error(
          `Run '${runId}' is leased by '${existing.owner}' until ${existing.expiresAt}.`,
        );
      }
      rmSync(filePath, { force: true });
    }

    const lease: RunLease = {
      runId,
      owner,
      acquiredAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    };
    mkdirSync(this.runDirectory(runId), { recursive: true, mode: 0o700 });
    const descriptor = openSync(filePath, "wx", 0o600);
    try {
      writeFileSync(descriptor, `${JSON.stringify(lease, null, 2)}\n`, "utf-8");
    } finally {
      closeSync(descriptor);
    }
    return lease;
  }

  renewLease(lease: RunLease, ttlMs = 30_000): RunLease {
    const current = parseJsonFile<RunLease>(this.leasePath(lease.runId));
    if (current.owner !== lease.owner) {
      throw new Error(`Cannot renew run lease owned by '${current.owner}'.`);
    }
    const now = this.clock();
    const renewed: RunLease = {
      ...current,
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    };
    atomicWrite(this.leasePath(lease.runId), `${JSON.stringify(renewed, null, 2)}\n`);
    return renewed;
  }

  releaseLease(lease: RunLease): void {
    const filePath = this.leasePath(lease.runId);
    if (!existsSync(filePath)) return;
    const current = parseJsonFile<RunLease>(filePath);
    if (current.owner === lease.owner) rmSync(filePath, { force: true });
  }
}
