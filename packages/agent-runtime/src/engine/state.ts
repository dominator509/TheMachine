import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { ApprovalRecord, MachinePlan, RunEvent, RunManifest } from "./types.js";

const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
const EVENT_TRANSACTION_VERSION = 1 as const;

export interface RunLease {
  readonly runId: string;
  readonly owner: string;
  readonly acquiredAt: string;
  readonly expiresAt: string;
}

interface EventTransaction {
  readonly schemaVersion: typeof EVENT_TRANSACTION_VERSION;
  readonly event: RunEvent;
  readonly manifest: RunManifest;
}

function parseJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf-8")) as T;
}

function fsyncDirectory(directory: string): void {
  let descriptor: number | null = null;
  try {
    descriptor = openSync(directory, "r");
    fsyncSync(descriptor);
  } catch {
    // Directory fsync is unavailable on some Windows filesystems. File data is still fsynced.
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

function atomicWrite(filePath: string, contents: string): void {
  const directory = dirname(resolve(filePath));
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = `${filePath}.${String(process.pid)}.${Math.random().toString(36).slice(2)}.tmp`;
  const descriptor = openSync(temporaryPath, "wx", 0o600);
  try {
    writeFileSync(descriptor, contents, "utf-8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  renameSync(temporaryPath, filePath);
  fsyncDirectory(directory);
}

function durableAppend(filePath: string, contents: string): void {
  mkdirSync(dirname(resolve(filePath)), { recursive: true, mode: 0o700 });
  const descriptor = openSync(filePath, "a", 0o600);
  try {
    writeFileSync(descriptor, contents, "utf-8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function durableRemove(filePath: string): void {
  if (!existsSync(filePath)) return;
  rmSync(filePath, { force: true });
  fsyncDirectory(dirname(resolve(filePath)));
}

function assertRunId(runId: string): void {
  if (!RUN_ID_PATTERN.test(runId)) throw new Error(`Invalid run ID: ${runId}`);
}

function parseJsonLines<T>(filePath: string, label: string): T[] {
  if (!existsSync(filePath)) return [];
  const values: T[] = [];
  const lines = readFileSync(filePath, "utf-8").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.trim().length === 0) continue;
    try {
      values.push(JSON.parse(line) as T);
    } catch (error) {
      throw new Error(
        `${label} contains invalid JSON at line ${String(index + 1)}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }
  return values;
}

export class RunStateStore {
  readonly stateRoot: string;
  private readonly clock: () => Date;

  constructor(stateRoot: string, clock: () => Date = () => new Date()) {
    this.stateRoot = resolve(stateRoot);
    this.clock = clock;
    mkdirSync(this.runsDirectory(), { recursive: true, mode: 0o700 });
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

  eventTransactionPath(runId: string): string {
    return join(this.runDirectory(runId), "event.transaction.json");
  }

  createRun(manifest: RunManifest, plan: MachinePlan): void {
    const runDirectory = this.runDirectory(manifest.runId);
    if (existsSync(runDirectory)) throw new Error(`Run already exists: ${manifest.runId}`);
    mkdirSync(runDirectory, { recursive: true, mode: 0o700 });
    atomicWrite(this.planSnapshotPath(manifest.runId), `${JSON.stringify(plan, null, 2)}\n`);
    atomicWrite(this.manifestPath(manifest.runId), `${JSON.stringify(manifest, null, 2)}\n`);
    atomicWrite(this.eventsPath(manifest.runId), "");
    atomicWrite(this.approvalsPath(manifest.runId), "");
  }

  saveManifest(manifest: RunManifest): void {
    atomicWrite(this.manifestPath(manifest.runId), `${JSON.stringify(manifest, null, 2)}\n`);
  }

  private rawEvents(runId: string): RunEvent[] {
    const events = parseJsonLines<RunEvent>(this.eventsPath(runId), `Run '${runId}' event log`);
    let expectedSequence = 1;
    for (const event of events) {
      if (event.runId !== runId) {
        throw new Error(`Run '${runId}' event log contains an event for '${event.runId}'.`);
      }
      if (event.sequence !== expectedSequence) {
        throw new Error(
          `Run '${runId}' event sequence is corrupt: expected ${String(expectedSequence)}, received ${String(event.sequence)}.`,
        );
      }
      expectedSequence += 1;
    }
    return events;
  }

  private recoverPendingEventTransaction(runId: string): void {
    const transactionPath = this.eventTransactionPath(runId);
    if (!existsSync(transactionPath)) return;
    const transaction = parseJsonFile<EventTransaction>(transactionPath);
    if (transaction.schemaVersion !== EVENT_TRANSACTION_VERSION) {
      throw new Error(`Unsupported event transaction version for run '${runId}'.`);
    }
    if (transaction.event.runId !== runId || transaction.manifest.runId !== runId) {
      throw new Error(`Event transaction identity mismatch for run '${runId}'.`);
    }

    const events = this.rawEvents(runId);
    const existing = events.find((event) => event.sequence === transaction.event.sequence);
    if (existing && JSON.stringify(existing) !== JSON.stringify(transaction.event)) {
      throw new Error(
        `Run '${runId}' has conflicting event data at sequence ${String(transaction.event.sequence)}.`,
      );
    }
    if (!existing) {
      const expectedSequence = events.length + 1;
      if (transaction.event.sequence !== expectedSequence) {
        throw new Error(
          `Run '${runId}' cannot recover event ${String(transaction.event.sequence)}; expected ${String(expectedSequence)}.`,
        );
      }
      durableAppend(this.eventsPath(runId), `${JSON.stringify(transaction.event)}\n`);
    }

    atomicWrite(this.manifestPath(runId), `${JSON.stringify(transaction.manifest, null, 2)}\n`);
    durableRemove(transactionPath);
  }

  loadManifest(runId: string): RunManifest {
    const filePath = this.manifestPath(runId);
    if (!existsSync(filePath)) throw new Error(`Run not found: ${runId}`);
    this.recoverPendingEventTransaction(runId);
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
    this.recoverPendingEventTransaction(manifest.runId);
    const persisted = parseJsonFile<RunManifest>(this.manifestPath(manifest.runId));
    if (persisted.nextSequence !== manifest.nextSequence) {
      throw new Error(
        `Run '${manifest.runId}' manifest is stale: expected sequence ${String(persisted.nextSequence)}, received ${String(manifest.nextSequence)}.`,
      );
    }

    const recorded: RunEvent = {
      ...event,
      sequence: manifest.nextSequence,
      runId: manifest.runId,
      timestamp: this.clock().toISOString(),
    };
    const nextManifest = structuredClone(manifest);
    nextManifest.nextSequence += 1;
    nextManifest.updatedAt = recorded.timestamp;
    const transaction: EventTransaction = {
      schemaVersion: EVENT_TRANSACTION_VERSION,
      event: recorded,
      manifest: nextManifest,
    };

    atomicWrite(
      this.eventTransactionPath(manifest.runId),
      `${JSON.stringify(transaction, null, 2)}\n`,
    );
    durableAppend(this.eventsPath(manifest.runId), `${JSON.stringify(recorded)}\n`);
    atomicWrite(this.manifestPath(manifest.runId), `${JSON.stringify(nextManifest, null, 2)}\n`);
    durableRemove(this.eventTransactionPath(manifest.runId));
    // appendEvent only advances event metadata. Replacing the whole manifest
    // would invalidate task-state references held by the active orchestrator,
    // causing later completion mutations to land on detached objects.
    manifest.nextSequence = nextManifest.nextSequence;
    manifest.updatedAt = nextManifest.updatedAt;
    return recorded;
  }

  readEvents(runId: string): RunEvent[] {
    this.recoverPendingEventTransaction(runId);
    return this.rawEvents(runId);
  }

  recordApproval(record: ApprovalRecord): void {
    durableAppend(this.approvalsPath(record.runId), `${JSON.stringify(record)}\n`);
  }

  readApprovals(runId: string): ApprovalRecord[] {
    return parseJsonLines<ApprovalRecord>(this.approvalsPath(runId), `Run '${runId}' approval log`);
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
    durableRemove(this.cancellationPath(runId));
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
      durableRemove(filePath);
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
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    fsyncDirectory(this.runDirectory(runId));
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
    if (current.owner === lease.owner) durableRemove(filePath);
  }
}
