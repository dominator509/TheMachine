import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ServiceStore,
  acceptedReleaseDecision,
  createHealthHandler,
  createMCPHandler,
  createPlanHandler,
  createPluginHandler,
  createProductionApprovalHandler,
  createProviderHandler,
  createReadinessHandler,
  createRepoHandler,
  createRunHandler,
  createValidationHandler,
  createWorkspaceHandler,
} from "@the-machine/service";
import { createUI } from "@the-machine/ui-components";
import type { EntityId, ProviderTier, SemVer } from "@the-machine/core";
import type {
  ProductionApproval,
  ReadinessEvidenceSource,
} from "@the-machine/service";

const cleanup: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  while (cleanup.length > 0) {
    const target = cleanup.pop();
    if (target) rmSync(target, { recursive: true, force: true });
  }
});

function acceptedApproval(workspaceId: EntityId): ProductionApproval {
  const decision = acceptedReleaseDecision("Accepted for isolated test release evidence.");
  return {
    workspaceId,
    providerConfiguration: decision,
    mcpConfiguration: decision,
    pluginSandbox: decision,
    sharedUIScope: decision,
    releaseDeployment: decision,
    approvedBy: "test-operator",
    approvedAt: new Date(0).toISOString(),
    detail: "Fixture approval tied to executed evidence.",
  };
}

function executedEvidence(candidateSha = "candidate"): ReadinessEvidenceSource {
  return {
    expectedCandidateSha: candidateSha,
    get(subsystem) {
      return {
        subsystem,
        candidateSha,
        passed: true,
        checkCount: 2,
        evidenceDigest: `sha256:${subsystem}`,
        completedAt: new Date(0).toISOString(),
      };
    },
  };
}

function planFixture(validationCommand = `node -e "console.log('ok')"`): {
  directory: string;
  database: string;
  planPath: string;
} {
  const directory = mkdtempSync(join(tmpdir(), "machine-service-integration-"));
  cleanup.push(directory);
  const database = join(directory, "machine.sqlite");
  const planPath = join(directory, "EP-test.md");
  writeFileSync(
    planPath,
    `# EP-test: Fixture Plan

### M0: First

- Goal: Exercise the explicitly gated legacy compatibility path.
- Validation command: \`${validationCommand}\`
- Expected result: ok
- Recovery instruction: Stop on failure.

- [ ] M0: First.
`,
    "utf-8",
  );
  return { directory, database, planPath };
}

describe("service handler integration", () => {
  it("provides honest basic health, workspace, and repository discovery", () => {
    const health = createHealthHandler("The Machine", "0.3.0-alpha.1", Date.now()).check({
      detail: true,
    });
    expect(health.status).toBe("ok");
    expect(health.version).toBe("0.3.0-alpha.1");

    const workspaces = createWorkspaceHandler();
    expect(workspaces.get({ path: "/tmp/test-workspace" }).status).toBe("pending");
    expect(workspaces.list().workspaces).toHaveLength(1);

    const repository = createRepoHandler().discover({
      workspaceId: "workspace" as EntityId,
      rootPath: process.cwd(),
    });
    expect(repository.rootPath).toBe(process.cwd());
    expect(repository.hasGit).toBe(true);
  });

  it("keeps registered integrations unverified until execution evidence is recorded", () => {
    const providers = createProviderHandler();
    const provider = providers.register(
      "provider" as EntityId,
      "local-provider",
      "local" as ProviderTier,
      "http://127.0.0.1:8080",
      ["model"],
      30_000,
    );
    expect(provider.healthy).toBe(false);
    expect(
      providers.recordHealth("provider" as EntityId, true, "probe:200:model-list")?.healthy,
    ).toBe(true);

    const mcp = createMCPHandler();
    const server = mcp.register(
      "mcp" as EntityId,
      "stdio-tools",
      "stdio",
      process.execPath,
      ["read-file"],
    );
    expect(server.healthy).toBe(false);
    expect(mcp.recordHealth("mcp" as EntityId, true, "initialize+tools/list")?.healthy).toBe(true);

    const plugins = createPluginHandler();
    const plugin = plugins.register(
      "plugin" as EntityId,
      "trusted-plugin",
      "1.0.0" as SemVer,
      "plugin.mjs",
      0,
    );
    expect(plugin.enabled).toBe(false);
    expect(
      plugins.recordActivation("plugin" as EntityId, true, "trusted-subprocess hook passed")
        ?.enabled,
    ).toBe(true);
  });

  it("does not let operator acceptance substitute for missing execution evidence", () => {
    const approval = createProductionApprovalHandler();
    approval.record(acceptedApproval("workspace" as EntityId));
    const readiness = createReadinessHandler({
      providers: createProviderHandler(),
      mcp: createMCPHandler(),
      plugins: createPluginHandler(),
      ui: createUI(),
      approval,
    }).check({ workspaceId: "workspace" as EntityId });
    expect(readiness.overall).toBe("degraded");
    expect(readiness.gates.every((gate) => gate.status !== "completed")).toBe(true);
  });

  it("reports ready only when candidate evidence, live probes, activation, and approvals agree", () => {
    const decision = acceptedReleaseDecision("Accepted after fixture execution.");
    const providers = createProviderHandler();
    providers.register(
      "provider" as EntityId,
      "provider",
      "local" as ProviderTier,
      "http://127.0.0.1:8080",
      ["model"],
      30_000,
      decision,
    );
    providers.recordHealth("provider" as EntityId, true, "HTTP probe and completion fixture passed");

    const mcp = createMCPHandler();
    mcp.register(
      "mcp" as EntityId,
      "mcp",
      "stdio",
      process.execPath,
      ["read-file"],
      decision,
    );
    mcp.recordHealth("mcp" as EntityId, true, "initialize and tools/call fixture passed");

    const plugins = createPluginHandler();
    plugins.register(
      "plugin" as EntityId,
      "plugin",
      "1.0.0" as SemVer,
      "plugin.mjs",
      0,
      decision,
    );
    plugins.recordActivation(
      "plugin" as EntityId,
      true,
      "trusted-subprocess policy suite passed",
    );

    const approval = createProductionApprovalHandler();
    approval.record(acceptedApproval("workspace" as EntityId));
    const readiness = createReadinessHandler({
      providers,
      mcp,
      plugins,
      ui: createUI(decision),
      approval,
      evidence: executedEvidence(),
    }).check({ workspaceId: "workspace" as EntityId });

    expect(readiness.overall).toBe("ready");
    expect(readiness.gates).toHaveLength(12);
    expect(readiness.gates.every((gate) => gate.status === "completed")).toBe(true);
  });

  it("loads a Markdown compatibility plan but refuses to execute it by default", () => {
    const fixture = planFixture();
    const store = new ServiceStore(fixture.database);
    try {
      const plan = createPlanHandler(store).load(fixture.planPath);
      const run = createRunHandler(store).start({
        workspaceId: "default" as EntityId,
        planId: plan.id,
      });
      expect(run.status).toBe("stopped");
      expect(run.commandCount).toBe(0);
      const validations = createValidationHandler(store).list(run.id).validations;
      expect(validations).toHaveLength(1);
      expect(validations[0]?.passed).toBe(false);
      expect(validations[0]?.output).toContain("Legacy Markdown command execution is disabled");
    } finally {
      store.close();
    }
  });

  it("executes the legacy path only under the explicit compatibility flag", () => {
    vi.stubEnv("MACHINE_ALLOW_LEGACY_PLAN_EXECUTION", "1");
    const fixture = planFixture();
    const store = new ServiceStore(fixture.database);
    try {
      const planHandler = createPlanHandler(store);
      const plan = planHandler.load(fixture.planPath);
      const run = createRunHandler(store).start({
        workspaceId: "default" as EntityId,
        planId: plan.id,
      });
      expect(run.status).toBe("completed");
      expect(run.commandCount).toBe(1);
      expect(createValidationHandler(store).list(run.id).validations[0]?.passed).toBe(true);
      expect(planHandler.get({ planId: plan.id })?.completedMilestones).toBe(1);
    } finally {
      store.close();
    }
  });
});
