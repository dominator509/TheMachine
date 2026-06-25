import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createHealthHandler,
  createWorkspaceHandler,
  createRepoHandler,
  createPlanHandler,
  createRunHandler,
  createValidationHandler,
  createProviderHandler,
  createMCPHandler,
  createPluginHandler,
  createReadinessHandler,
  acceptedReleaseDecision,
  ServiceStore,
} from "@the-machine/service";
import type { EntityId, ProviderTier, SemVer } from "@the-machine/core";
import { createUI } from "@the-machine/ui-components";

describe("service handlers integration", () => {
  it("health handler returns ok", () => {
    const handler = createHealthHandler("The Machine", "0.1.0", Date.now());
    const res = handler.check({});
    expect(res.status).toBe("ok");
    expect(res.platform).toBe("The Machine");
    expect(res.checks.core).toBe(true);
  });

  it("health handler accepts detail flag", () => {
    const handler = createHealthHandler("Test", "1.0.0", Date.now());
    const res = handler.check({ detail: true });
    expect(res.status).toBe("ok");
    expect(res.uptimeMs).toBeGreaterThanOrEqual(0);
  });

  it("workspace handler returns pending for new path", () => {
    const handler = createWorkspaceHandler();
    const res = handler.get({ path: "/tmp/test-ws" });
    expect(res.status).toBe("pending");
    expect(res.path).toBe("/tmp/test-ws");
  });

  it("workspace handler lists workspaces", () => {
    const handler = createWorkspaceHandler();
    handler.get({ path: "/ws/a" });
    handler.get({ path: "/ws/b" });
    const list = handler.list();
    expect(list.workspaces).toHaveLength(2);
  });

  it("repo handler discovers profile", () => {
    const handler = createRepoHandler();
    const res = handler.discover({ workspaceId: "ws-1" as EntityId, rootPath: "/repo" });
    expect(res.packageManager).toBe("pnpm");
    expect(res.hasGit).toBe(true);
  });

  it("plan handler loads and retrieves", () => {
    const handler = createPlanHandler();
    const loaded = handler.load("/plans/ep-1.md");
    expect(loaded.status).toBe("pending");
    const got = handler.get({ planId: "/plans/ep-1.md" as EntityId });
    expect(got).not.toBeNull();
    expect(got!.id).toBe("/plans/ep-1.md");
  });

  it("plan handler returns null for unknown", () => {
    const handler = createPlanHandler();
    const got = handler.get({ planId: "nonexistent" as EntityId });
    expect(got).toBeNull();
  });

  it("plan handler lists loaded plans", () => {
    const handler = createPlanHandler();
    handler.load("/plans/a.md");
    handler.load("/plans/b.md");
    const list = handler.list();
    expect(list.plans).toHaveLength(2);
  });

  it("run handler starts and retrieves", () => {
    const handler = createRunHandler();
    const run = handler.start({ workspaceId: "ws-1" as EntityId, planId: "ep-1" as EntityId });
    expect(run.status).toBe("active");
    expect(run.execPlanId).toBe("ep-1");
    const got = handler.get(run.id);
    expect(got).not.toBeNull();
  });

  it("run handler lists runs", () => {
    const handler = createRunHandler();
    handler.start({ workspaceId: "ws-1" as EntityId, planId: "ep-1" as EntityId });
    handler.start({ workspaceId: "ws-1" as EntityId, planId: "ep-2" as EntityId });
    const list = handler.list();
    expect(list.runs).toHaveLength(2);
  });

  it("validation handler records and lists", () => {
    const handler = createValidationHandler();
    const res = handler.record(
      { runId: "run-1" as EntityId, command: "test" },
      true,
      0,
      "all good",
      "info",
    );
    expect(res.passed).toBe(true);
    const list = handler.list("run-1" as EntityId);
    expect(list.validations).toHaveLength(1);
  });

  it("provider handler registers and lists", () => {
    const handler = createProviderHandler();
    handler.register(
      "p-1" as EntityId,
      "local-llm",
      "local" as ProviderTier,
      "http://localhost:8080",
      ["model-x"],
      30000,
    );
    const list = handler.list();
    expect(list.providers).toHaveLength(1);
    expect(list.providers[0]?.name).toBe("local-llm");
    const accepted = handler.acceptRelease(
      "p-1" as EntityId,
      acceptedReleaseDecision("Mocked local provider accepted for release."),
    );
    expect(accepted?.releaseDecision?.status).toBe("accepted");
  });

  it("MCP handler registers and lists", () => {
    const handler = createMCPHandler();
    handler.register("mcp-1" as EntityId, "fs-tools", "stdio", "/tmp/mcp.sock", [
      "read-file",
      "write-file",
    ]);
    const list = handler.list();
    expect(list.servers).toHaveLength(1);
    expect(list.servers[0]?.toolCount).toBe(2);
    const accepted = handler.acceptRelease(
      "mcp-1" as EntityId,
      acceptedReleaseDecision("Fixture stdio MCP accepted for release."),
    );
    expect(accepted?.releaseDecision?.status).toBe("accepted");
  });

  it("plugin handler registers and lists", () => {
    const handler = createPluginHandler();
    handler.register("pl-1" as EntityId, "test-plugin", "1.0.0" as SemVer, "plugin.mjs", 3);
    const list = handler.list();
    expect(list.plugins).toHaveLength(1);
    expect(list.plugins[0]?.enabled).toBe(true);
    const accepted = handler.acceptRelease(
      "pl-1" as EntityId,
      acceptedReleaseDecision("Trusted first-party plugin posture accepted for release."),
    );
    expect(accepted?.releaseDecision?.status).toBe("accepted");
  });

  it("readiness handler reports degraded when release decisions are missing", () => {
    const handler = createReadinessHandler();
    const res = handler.check({ workspaceId: "ws-1" as EntityId });
    expect(res.overall).toBe("degraded");
    expect(res.gates).toHaveLength(12);
    expect(res.gates.find((gate) => gate.subsystem === "providers")?.status).toBe("pending");
    expect(res.gates.find((gate) => gate.subsystem === "mcp")?.status).toBe("pending");
    expect(res.gates.find((gate) => gate.subsystem === "plugin-sdk")?.status).toBe("pending");
    expect(res.gates.find((gate) => gate.subsystem === "ui-components")?.status).toBe("pending");
  });

  it("readiness handler reports ready when release decisions are accepted", () => {
    const provider = createProviderHandler();
    const mcp = createMCPHandler();
    const plugin = createPluginHandler();
    const decision = acceptedReleaseDecision("Accepted for local release readiness.");

    provider.register(
      "p-1" as EntityId,
      "local-llm",
      "local" as ProviderTier,
      "http://localhost:8080",
      ["model-x"],
      30000,
      decision,
    );
    mcp.register("mcp-1" as EntityId, "fs-tools", "stdio", "/tmp/mcp.sock", ["read-file"], decision);
    plugin.register("pl-1" as EntityId, "test-plugin", "1.0.0" as SemVer, "plugin.mjs", 3, decision);
    const ui = createUI({ status: "accepted", detail: "Shared UI registry accepted." });

    const handler = createReadinessHandler({ providers: provider, mcp, plugins: plugin, ui });
    const res = handler.check({ workspaceId: "ws-1" as EntityId });

    expect(res.overall).toBe("ready");
    expect(res.gates.find((gate) => gate.subsystem === "providers")?.status).toBe("completed");
    expect(res.gates.find((gate) => gate.subsystem === "mcp")?.status).toBe("completed");
    expect(res.gates.find((gate) => gate.subsystem === "plugin-sdk")?.status).toBe("completed");
    expect(res.gates.find((gate) => gate.subsystem === "ui-components")?.status).toBe("completed");
  });

  it("readiness handler filters by subsystem", () => {
    const handler = createReadinessHandler();
    const res = handler.check({ workspaceId: "ws-1" as EntityId, subsystem: "core" });
    expect(res.gates).toHaveLength(1);
    expect(res.gates[0]?.subsystem).toBe("core");
  });

  it("loads a real ExecPlan into SQLite and runs the first milestone validation", () => {
    const dir = mkdtempSync(join(tmpdir(), "machine-service-"));
    const dbPath = join(dir, "machine.sqlite");
    const planPath = join(dir, "EP-test.md");
    writeFileSync(
      planPath,
      `# EP-test: Fixture Plan

## 8. Milestones

### M0: First

- Goal: Prove the runner can execute a validation command.
- Validation command: \`node -e "console.log('ok')"\`
- Expected result: ok
- Recovery instruction: Stop on failure.

## 12. Progress

- [ ] M0: First.
`,
      "utf-8",
    );

    const store = new ServiceStore(dbPath);
    const planHandler = createPlanHandler(store);
    const runHandler = createRunHandler(store);
    const validationHandler = createValidationHandler(store);

    const plan = planHandler.load(planPath);
    expect(plan.title).toBe("EP-test: Fixture Plan");
    expect(plan.milestoneCount).toBe(1);
    expect(plan.currentMilestone).toBe("M0");

    const run = runHandler.start({ workspaceId: "default" as EntityId, planId: plan.id });
    expect(run.status).toBe("completed");
    expect(run.commandCount).toBe(1);
    expect(run.validationCount).toBe(1);

    const validations = validationHandler.list(run.id);
    expect(validations.validations).toHaveLength(1);
    expect(validations.validations[0]?.passed).toBe(true);
    expect(planHandler.get({ planId: plan.id })?.completedMilestones).toBe(1);
    store.close();
  });
});
