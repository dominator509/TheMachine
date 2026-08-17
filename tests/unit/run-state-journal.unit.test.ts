import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  RUN_MANIFEST_VERSION,
  RunStateStore,
  type MachinePlan,
  type RunEvent,
  type RunManifest,
} from "@the-machine/agent-runtime";

const cleanup: string[] = [];

afterEach(() => {
  while (cleanup.length > 0) {
    const target = cleanup.pop();
    if (target) rmSync(target, { recursive: true, force: true });
  }
});

function fixture(): { store: RunStateStore; manifest: RunManifest; plan: MachinePlan } {
  const root = mkdtempSync(join(tmpdir(), "machine-run-journal-"));
  cleanup.push(root);
  const now = new Date(0).toISOString();
  const store = new RunStateStore(root, () => new Date(0));
  const manifest: RunManifest = {
    schemaVersion: RUN_MANIFEST_VERSION,
    runId: "journal-run",
    planId: "journal-plan",
    planDigest: "digest",
    title: "Journal test",
    repositoryPath: root,
    stateRoot: root,
    baseRef: "HEAD",
    baseCommit: "base",
    branch: "machine/journal-run",
    worktreePath: join(root, "worktree"),
    planSnapshotPath: store.planSnapshotPath("journal-run"),
    taskOrder: [],
    primaryWorkerId: "fixture",
    status: "pending",
    currentTaskId: null,
    taskStates: {},
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
      taskCount: 0,
      completedTaskCount: 0,
      attemptCount: 0,
      workerFailureCount: 0,
      validationFailureCount: 0,
      policyViolationCount: 0,
      approvalWaitCount: 0,
    },
  };
  const plan: MachinePlan = {
    version: 1,
    id: "journal-plan",
    title: "Journal plan",
    repository: { path: root },
    workerStrategy: { primary: "fixture" },
    tasks: [],
  };
  store.createRun(manifest, plan);
  return { store, manifest, plan };
}

function event(sequence: number): RunEvent {
  return {
    sequence,
    runId: "journal-run",
    timestamp: new Date(0).toISOString(),
    type: "test.event",
    taskId: null,
    workerId: null,
    payload: { sequence },
  };
}

describe("run-state event journal", () => {
  it("recovers a prepared transaction after an interrupted event commit", () => {
    const { store, manifest } = fixture();
    const recoveredManifest = structuredClone(manifest);
    recoveredManifest.nextSequence = 2;
    writeFileSync(
      store.eventTransactionPath(manifest.runId),
      `${JSON.stringify({ schemaVersion: 1, event: event(1), manifest: recoveredManifest }, null, 2)}\n`,
      "utf-8",
    );

    const loaded = store.loadManifest(manifest.runId);
    expect(loaded.nextSequence).toBe(2);
    expect(store.readEvents(manifest.runId)).toEqual([event(1)]);
    expect(existsSync(store.eventTransactionPath(manifest.runId))).toBe(false);
  });

  it("does not duplicate an event when recovery begins after the event append", () => {
    const { store, manifest } = fixture();
    const recoveredManifest = structuredClone(manifest);
    recoveredManifest.nextSequence = 2;
    writeFileSync(store.eventsPath(manifest.runId), `${JSON.stringify(event(1))}\n`, "utf-8");
    writeFileSync(
      store.eventTransactionPath(manifest.runId),
      `${JSON.stringify({ schemaVersion: 1, event: event(1), manifest: recoveredManifest }, null, 2)}\n`,
      "utf-8",
    );

    expect(store.readEvents(manifest.runId)).toEqual([event(1)]);
    expect(readFileSync(store.eventsPath(manifest.runId), "utf-8").trim().split("\n")).toHaveLength(1);
  });

  it("rejects gaps and conflicting sequence data rather than silently replaying", () => {
    const { store, manifest } = fixture();
    writeFileSync(store.eventsPath(manifest.runId), `${JSON.stringify(event(2))}\n`, "utf-8");
    expect(() => store.readEvents(manifest.runId)).toThrow(/expected 1, received 2/i);
  });

  it("rejects an append made from a stale in-memory manifest", () => {
    const { store, manifest } = fixture();
    const stale = structuredClone(manifest);
    store.appendEvent(manifest, {
      type: "first",
      taskId: null,
      workerId: null,
      payload: {},
    });
    expect(() =>
      store.appendEvent(stale, {
        type: "stale",
        taskId: null,
        workerId: null,
        payload: {},
      }),
    ).toThrow(/manifest is stale/i);
  });
});
