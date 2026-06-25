import { describe, it, expect } from "vitest";
import { createServiceClient } from "@the-machine/service";
import type {
  HealthHandler,
  WorkspaceHandler,
  RepoHandler,
  PlanHandler,
  RunHandler,
  ValidationHandler,
  ProviderHandler,
  MCPHandler,
  PluginHandler,
  ProductionApprovalHandler,
  ReadinessHandler,
} from "@the-machine/service";

describe("ServiceClient", () => {
  it("composes all handler interfaces", () => {
    const mockHealth: HealthHandler = {
      check: () => ({
        status: "ok",
        platform: "test",
        version: "0.1.0",
        uptimeMs: 0,
        checks: { core: true },
      }),
    };

    const mockWorkspace: WorkspaceHandler = {
      get: () => ({
        id: "ws-1",
        path: "/repo",
        status: "active",
        activeExecPlanId: null,
      }),
      list: () => ({ workspaces: [] }),
    };

    const mockRepo: RepoHandler = {
      discover: () => ({
        workspaceId: "ws-1",
        rootPath: "/repo",
        packageManager: "pnpm",
        nodeVersion: "20.0.0",
        hasPackageJson: true,
        hasGit: true,
        branch: "main",
      }),
    };

    const mockPlan: PlanHandler = {
      get: () => null,
      list: () => ({ plans: [] }),
      load: (filePath: string) => ({
        id: filePath,
        title: "Loaded Plan",
        status: "pending",
        priority: 5,
        milestoneCount: 0,
        completedMilestones: 0,
        currentMilestone: null,
      }),
    };

    const mockRun: RunHandler = {
      start: () => ({
        id: "run-1",
        execPlanId: "ep-1",
        milestoneId: null,
        status: "active",
        commandCount: 0,
        validationCount: 0,
      }),
      get: () => null,
      list: () => ({ runs: [] }),
    };

    const mockValidation: ValidationHandler = {
      record: () => ({
        runId: "run-1",
        command: "test",
        passed: true,
        exitCode: 0,
        output: "ok",
        severity: "info",
      }),
      list: () => ({ validations: [] }),
    };

    const mockProvider: ProviderHandler = {
      get: () => null,
      list: () => ({ providers: [] }),
      register: (id, name, tier, endpoint, models, timeoutMs) => ({
        id,
        name,
        tier,
        endpoint,
        models,
        timeoutMs,
        healthy: true,
      }),
      acceptRelease: () => null,
    };

    const mockMCP: MCPHandler = {
      get: () => null,
      list: () => ({ servers: [] }),
      register: (id, name, transport, endpoint, tools) => ({
        id,
        name,
        transport,
        endpoint,
        tools,
        toolCount: tools.length,
        healthy: true,
      }),
      acceptRelease: () => null,
    };

    const mockPlugin: PluginHandler = {
      get: () => null,
      list: () => ({ plugins: [] }),
      register: (id, name, version, entryPoint, permissionCount) => ({
        id,
        name,
        version,
        entryPoint,
        permissionCount,
        enabled: true,
      }),
      acceptRelease: () => null,
    };

    const mockApproval: ProductionApprovalHandler = {
      get: () => ({ approval: null, accepted: false, missing: [] }),
      record: () => ({ approval: null, accepted: true, missing: [] }),
      clear: () => ({ approval: null, accepted: false, missing: [] }),
    };

    const mockReadiness: ReadinessHandler = {
      check: () => ({
        workspaceId: "ws-1",
        overall: "ready",
        gates: [],
      }),
    };

    const client = createServiceClient({
      health: mockHealth,
      workspace: mockWorkspace,
      repo: mockRepo,
      plan: mockPlan,
      run: mockRun,
      validation: mockValidation,
      provider: mockProvider,
      mcp: mockMCP,
      plugin: mockPlugin,
      approval: mockApproval,
      readiness: mockReadiness,
    });

    // Verify every handler domain is accessible
    expect(client.health.check({}).status).toBe("ok");
    expect(client.workspace.get({}).path).toBe("/repo");
    expect(client.repo.discover({ workspaceId: "ws-1" }).packageManager).toBe("pnpm");
    expect(client.plan.load("ep-test").status).toBe("pending");
    expect(client.run.start({ workspaceId: "ws-1", planId: "ep-1" }).status).toBe("active");
    expect(
      client.validation.record({ runId: "run-1", command: "test" }, true, 0, "ok", "info").passed,
    ).toBe(true);
    expect(
      client.provider.register("p-1", "t1", "local", "http://localhost", ["m1"], 5000).healthy,
    ).toBe(true);
    expect(client.mcp.register("m-1", "svc", "stdio", "/tmp/sock", ["tool-a"]).toolCount).toBe(1);
    expect(client.plugin.register("pl-1", "plug", "1.0.0", "entry.mjs", 2).enabled).toBe(true);
    expect(client.approval.get().accepted).toBe(false);
    expect(client.readiness.check({ workspaceId: "ws-1" }).overall).toBe("ready");
  });

  it("returned client shape is frozen composition", () => {
    const mockHealth: HealthHandler = {
      check: () => ({
        status: "ok",
        platform: "test",
        version: "0.1.0",
        uptimeMs: 0,
        checks: {},
      }),
    };

    const client = createServiceClient({
      health: mockHealth,
      workspace: {
        get: () => ({ id: "", path: "", status: "pending", activeExecPlanId: null }),
        list: () => ({ workspaces: [] }),
      },
      repo: {
        discover: () => ({
          workspaceId: "",
          rootPath: "",
          packageManager: "pnpm",
          nodeVersion: "20.0.0",
          hasPackageJson: false,
          hasGit: false,
          branch: null,
        }),
      },
      plan: {
        get: () => null,
        list: () => ({ plans: [] }),
        load: () => ({
          id: "",
          title: "",
          status: "pending",
          priority: 5,
          milestoneCount: 0,
          completedMilestones: 0,
          currentMilestone: null,
        }),
      },
      run: {
        start: () => ({
          id: "",
          execPlanId: "",
          milestoneId: null,
          status: "pending",
          commandCount: 0,
          validationCount: 0,
        }),
        get: () => null,
        list: () => ({ runs: [] }),
      },
      validation: {
        record: () => ({
          runId: "",
          command: "",
          passed: true,
          exitCode: 0,
          output: "",
          severity: "info",
        }),
        list: () => ({ validations: [] }),
      },
      provider: {
        get: () => null,
        list: () => ({ providers: [] }),
        register: () => ({
          id: "",
          name: "",
          tier: "local",
          endpoint: "",
          models: [],
          timeoutMs: 5000,
          healthy: true,
        }),
        acceptRelease: () => null,
      },
      mcp: {
        get: () => null,
        list: () => ({ servers: [] }),
        register: () => ({
          id: "",
          name: "",
          transport: "stdio",
          endpoint: "",
          tools: [],
          toolCount: 0,
          healthy: true,
        }),
        acceptRelease: () => null,
      },
      plugin: {
        get: () => null,
        list: () => ({ plugins: [] }),
        register: () => ({
          id: "",
          name: "",
          version: "0.0.0",
          entryPoint: "",
          permissionCount: 0,
          enabled: true,
        }),
        acceptRelease: () => null,
      },
      approval: {
        get: () => ({ approval: null, accepted: false, missing: [] }),
        record: () => ({ approval: null, accepted: true, missing: [] }),
        clear: () => ({ approval: null, accepted: false, missing: [] }),
      },
      readiness: { check: () => ({ workspaceId: "", overall: "ready", gates: [] }) },
    });

    expect(client.health).toBe(mockHealth);
    expect(Object.keys(client).sort()).toEqual([
      "approval",
      "health",
      "mcp",
      "plan",
      "plugin",
      "provider",
      "readiness",
      "repo",
      "run",
      "validation",
      "workspace",
    ]);
  });
});
