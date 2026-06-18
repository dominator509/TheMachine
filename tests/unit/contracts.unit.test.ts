import { describe, it, expect } from "vitest";
import type {
  HealthRequest,
  HealthResponse,
  WorkspaceRequest,
  WorkspaceResponse,
  WorkspaceListResponse,
  RepoRequest,
  RepoResponse,
  PlanRequest,
  PlanResponse,
  PlanListResponse,
  RunRequest,
  RunResponse,
  RunListResponse,
  ValidationRequest,
  ValidationResponse,
  ValidationListResponse,
  ProviderRequest,
  ProviderResponse,
  ProviderListResponse,
  MCPRequest,
  MCPResponse,
  MCPListResponse,
  PluginRequest,
  PluginResponse,
  PluginListResponse,
  ReadinessRequest,
  ReadinessResponse,
} from "@the-machine/service";

describe("service contracts", () => {
  it("health request shape is optional detail", () => {
    const req: HealthRequest = {};
    const verbose: HealthRequest = { detail: true };
    expect(req).toBeDefined();
    expect(verbose.detail).toBe(true);
  });

  it("health response shape is structural", () => {
    const res: HealthResponse = {
      status: "ok",
      platform: "The Machine",
      version: "0.1.0",
      uptimeMs: 12345,
      checks: { core: true, storage: true },
    };
    expect(res.status).toBe("ok");
    expect(res.checks.core).toBe(true);
  });

  it("workspace request has optional path", () => {
    const req: WorkspaceRequest = {};
    const explicit: WorkspaceRequest = { path: "/tmp/test" };
    expect(explicit.path).toBe("/tmp/test");
  });

  it("workspace list response contains array", () => {
    const list: WorkspaceListResponse = { workspaces: [] };
    expect(list.workspaces).toHaveLength(0);
  });

  it("repo response captures profile", () => {
    const res: RepoResponse = {
      workspaceId: "ws-1",
      rootPath: "/repo",
      packageManager: "pnpm",
      nodeVersion: "20.0.0",
      hasPackageJson: true,
      hasGit: true,
      branch: "main",
    };
    expect(res.packageManager).toBe("pnpm");
    expect(res.branch).toBe("main");
  });

  it("plan response tracks execution status", () => {
    const res: PlanResponse = {
      id: "ep-1",
      title: "Test Plan",
      status: "active",
      priority: 3,
      milestoneCount: 5,
      completedMilestones: 2,
      currentMilestone: "M2",
    };
    expect(res.completedMilestones).toBe(2);
    expect(res.currentMilestone).toBe("M2");
  });

  it("plan list response is an array", () => {
    const list: PlanListResponse = { plans: [] };
    expect(list.plans).toHaveLength(0);
  });

  it("run response has command and validation counts", () => {
    const res: RunResponse = {
      id: "run-1",
      execPlanId: "ep-1",
      milestoneId: "M1",
      status: "active",
      commandCount: 3,
      validationCount: 1,
    };
    expect(res.commandCount).toBe(3);
    expect(res.validationCount).toBe(1);
  });

  it("validation response captures result", () => {
    const res: ValidationResponse = {
      runId: "run-1",
      command: "test",
      passed: true,
      exitCode: 0,
      output: "ok",
      severity: "info",
    };
    expect(res.passed).toBe(true);
    expect(res.severity).toBe("info");
  });

  it("provider response lists models", () => {
    const res: ProviderResponse = {
      id: "p-1",
      name: "test-provider",
      tier: "local",
      endpoint: "http://localhost:8080",
      models: ["model-a", "model-b"],
      timeoutMs: 30000,
      healthy: true,
    };
    expect(res.models).toContain("model-a");
    expect(res.healthy).toBe(true);
  });

  it("MCP response tracks tools", () => {
    const res: MCPResponse = {
      id: "mcp-1",
      name: "test-mcp",
      transport: "stdio",
      endpoint: "/tmp/mcp.sock",
      tools: ["tool-a"],
      toolCount: 1,
      healthy: true,
    };
    expect(res.toolCount).toBe(1);
    expect(res.transport).toBe("stdio");
  });

  it("plugin response has permission count", () => {
    const res: PluginResponse = {
      id: "pl-1",
      name: "test-plugin",
      version: "1.0.0",
      entryPoint: "plugin.mjs",
      permissionCount: 3,
      enabled: true,
    };
    expect(res.permissionCount).toBe(3);
    expect(res.enabled).toBe(true);
  });

  it("readiness response has gate summaries", () => {
    const res: ReadinessResponse = {
      workspaceId: "ws-1",
      overall: "ready",
      gates: [{ subsystem: "core", status: "completed", passedChecks: 2, totalChecks: 2 }],
    };
    expect(res.overall).toBe("ready");
    expect(res.gates[0]?.passedChecks).toBe(2);
  });
});
