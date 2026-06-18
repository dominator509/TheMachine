// Unit tests for observability health checks — subsystem checks and aggregate reporting.
import { describe, it, expect } from "vitest";
import {
  performHealthChecks,
  type HealthCheckResult,
  type HealthSummary,
} from "@the-machine/observability";

describe("performHealthChecks", () => {
  const startTime = Date.now();

  it("should report ok when all subsystems are healthy", () => {
    const summary = performHealthChecks({
      platform: "The Machine",
      version: "0.1.0",
      startTime,
      providerCount: 2,
      mcpServerCount: 1,
      pluginCount: 3,
    });

    expect(summary.status).toBe("ok");
    expect(summary.platform).toBe("The Machine");
    expect(summary.version).toBe("0.1.0");
    expect(summary.uptimeMs).toBeGreaterThanOrEqual(0);
    expect(summary.results.length).toBeGreaterThanOrEqual(6);
  });

  it("should include core and service results", () => {
    const summary = performHealthChecks({ platform: "TM", version: "1.0", startTime });

    const core = summary.results.find((r) => r.subsystem === "core");
    expect(core).toBeDefined();
    expect(core!.status).toBe("ok");

    const svc = summary.results.find((r) => r.subsystem === "service");
    expect(svc).toBeDefined();
    expect(svc!.status).toBe("ok");
  });

  it("should report storage disabled when no logDir", () => {
    const summary = performHealthChecks({ platform: "TM", version: "1.0", startTime });

    const storage = summary.results.find((r) => r.subsystem === "storage");
    expect(storage).toBeDefined();
    expect(storage!.status).toBe("disabled");
  });

  it("should report ok for storage when logDir is provided", () => {
    const summary = performHealthChecks({
      platform: "TM",
      version: "1.0",
      startTime,
      logDir: "/tmp/test-log-dir",
    });

    const storage = summary.results.find((r) => r.subsystem === "storage");
    expect(storage).toBeDefined();
    expect(storage!.status).toBe("ok");
  });

  it("should report commands as ok", () => {
    const summary = performHealthChecks({ platform: "TM", version: "1.0", startTime });

    const cmd = summary.results.find((r) => r.subsystem === "commands");
    expect(cmd).toBeDefined();
    expect(cmd!.status).toBe("ok");
  });

  it("should report providers/MCP/plugins as disabled when count is 0", () => {
    const summary = performHealthChecks({ platform: "TM", version: "1.0", startTime });

    const providers = summary.results.find((r) => r.subsystem === "providers");
    expect(providers).toBeDefined();
    expect(providers!.status).toBe("disabled");

    const mcp = summary.results.find((r) => r.subsystem === "mcp");
    expect(mcp).toBeDefined();
    expect(mcp!.status).toBe("disabled");

    const plugins = summary.results.find((r) => r.subsystem === "plugins");
    expect(plugins).toBeDefined();
    expect(plugins!.status).toBe("disabled");
  });

  it("should report providers/MCP/plugins as ok when configured", () => {
    const summary = performHealthChecks({
      platform: "TM",
      version: "1.0",
      startTime,
      providerCount: 1,
      mcpServerCount: 2,
      pluginCount: 3,
    });

    const providers = summary.results.find((r) => r.subsystem === "providers");
    expect(providers!.status).toBe("ok");

    const mcp = summary.results.find((r) => r.subsystem === "mcp");
    expect(mcp!.status).toBe("ok");

    const plugins = summary.results.find((r) => r.subsystem === "plugins");
    expect(plugins!.status).toBe("ok");
  });

  it("should populate checks map with boolean values", () => {
    const summary = performHealthChecks({ platform: "TM", version: "1.0", startTime });

    expect(summary.checks.core).toBe(true);
    expect(summary.checks.service).toBe(true);
    expect(summary.checks.commands).toBe(true);
    // storage, providers, mcp, plugins are disabled — not errors, so checks should be false
    expect(summary.checks.storage).toBe(false);
    expect(summary.checks.providers).toBe(false);
    expect(summary.checks.mcp).toBe(false);
    expect(summary.checks.plugins).toBe(false);
  });

  it("should produce a serializable summary", () => {
    const summary = performHealthChecks({ platform: "TM", version: "1.0", startTime });
    const json = JSON.stringify(summary);
    expect(json).toContain('"status"');
    expect(json).toContain('"platform"');
    expect(json).toContain('"version"');
    expect(json).toContain('"uptimeMs"');
    expect(json).toContain('"checks"');
    expect(json).toContain('"results"');
  });
});
