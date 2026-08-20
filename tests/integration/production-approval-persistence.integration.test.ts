import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ServiceStore,
  acceptedReleaseDecision,
  createProductionApprovalHandler,
} from "@the-machine/service";
import type { EntityId } from "@the-machine/core";
import type { ProductionApproval } from "@the-machine/service";

const cleanup: string[] = [];

afterEach(() => {
  while (cleanup.length > 0) {
    const target = cleanup.pop();
    if (target) rmSync(target, { recursive: true, force: true });
  }
});

function approval(): ProductionApproval {
  const accepted = acceptedReleaseDecision("Accepted after candidate-bound automated evidence.");
  return {
    workspaceId: "approval-workspace" as EntityId,
    providerConfiguration: accepted,
    mcpConfiguration: accepted,
    pluginSandbox: accepted,
    sharedUIScope: accepted,
    releaseDeployment: accepted,
    approvedBy: "release-operator",
    approvedAt: new Date(0).toISOString(),
    detail: "Persistence fixture; not a real production approval.",
  };
}

describe("production approval persistence", () => {
  it("survives a complete service-store restart", () => {
    const directory = mkdtempSync(join(tmpdir(), "machine-approval-persistence-"));
    cleanup.push(directory);
    const databasePath = join(directory, "machine.sqlite");

    const firstStore = new ServiceStore(databasePath);
    createProductionApprovalHandler(null, firstStore).record(approval());
    firstStore.close();

    const secondStore = new ServiceStore(databasePath);
    const restored = createProductionApprovalHandler(null, secondStore).get();
    expect(restored.accepted).toBe(true);
    expect(restored.approval).toEqual(approval());
    secondStore.close();
  });

  it("persists a clear operation so an older approval cannot resurface", () => {
    const directory = mkdtempSync(join(tmpdir(), "machine-approval-clear-"));
    cleanup.push(directory);
    const databasePath = join(directory, "machine.sqlite");

    const firstStore = new ServiceStore(databasePath);
    const firstHandler = createProductionApprovalHandler(null, firstStore);
    firstHandler.record(approval());
    expect(firstHandler.clear().accepted).toBe(false);
    firstStore.close();

    const secondStore = new ServiceStore(databasePath);
    const restored = createProductionApprovalHandler(null, secondStore).get();
    expect(restored.approval).toBeNull();
    expect(restored.accepted).toBe(false);
    secondStore.close();
  });

  it("fails closed when persisted approval JSON is corrupt", () => {
    const directory = mkdtempSync(join(tmpdir(), "machine-approval-corrupt-"));
    cleanup.push(directory);
    const databasePath = join(directory, "machine.sqlite");
    const store = new ServiceStore(databasePath);
    store.ensureWorkspace("approval-workspace" as EntityId, directory);
    store.conn.db
      .prepare(
        `INSERT INTO production_approvals
          (workspace_id, approval_json, approved_by, approved_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run("approval-workspace", "{not-json", "operator", new Date(0).toISOString());

    const handler = createProductionApprovalHandler(null, store);
    expect(() => handler.get()).toThrow();
    store.close();
  });
});
