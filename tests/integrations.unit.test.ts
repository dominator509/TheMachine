// Unit tests for integration validators and readiness gates.
import { describe, it, expect } from "vitest";
import {
  validateProviderConfig,
  validateMCPConfig,
  validatePluginManifest,
  createReadinessGate,
  evaluateReadiness,
  isGateReady,
} from "@the-machine/core";
import type { ProviderConfig, MCPConfig, PluginManifest } from "@the-machine/core";

// ─── Provider Validator ───────────────────────────────────────────────

const validProvider: ProviderConfig = {
  id: "p1" as any,
  name: "Test Provider",
  tier: "cloud",
  endpoint: "https://api.example.com",
  models: ["gpt-4"],
  timeoutMs: 30000,
  healthCheckCommand: "curl -f https://api.example.com/health",
};

describe("validateProviderConfig", () => {
  it("should pass a valid provider config", () => {
    const result = validateProviderConfig(validProvider);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("should fail when id is empty", () => {
    const result = validateProviderConfig({ ...validProvider, id: "" as any });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Provider id is required");
  });

  it("should fail when tier is invalid", () => {
    const result = validateProviderConfig({ ...validProvider, tier: "invalid" as any });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Provider tier must be 'cloud', 'local', or 'hybrid'");
  });

  it("should fail when endpoint is empty", () => {
    const result = validateProviderConfig({ ...validProvider, endpoint: "" });
    expect(result.valid).toBe(false);
  });

  it("should fail when models array is empty", () => {
    const result = validateProviderConfig({ ...validProvider, models: [] });
    expect(result.valid).toBe(false);
  });

  it("should fail when timeout is zero or negative", () => {
    const result = validateProviderConfig({ ...validProvider, timeoutMs: 0 });
    expect(result.valid).toBe(false);
  });

  it("should fail when health check command is missing", () => {
    const result = validateProviderConfig({ ...validProvider, healthCheckCommand: "" });
    expect(result.valid).toBe(false);
  });
});

// ─── MCP Validator ────────────────────────────────────────────────────

const validMCP: MCPConfig = {
  id: "mcp1" as any,
  name: "Test MCP Server",
  transport: "stdio",
  endpoint: "/usr/bin/mcp-server",
  tools: ["read", "write"],
  permissions: [{ toolName: "read", allowed: true, requireApproval: false }],
  healthCheckCommand: "mcp-server --health",
};

describe("validateMCPConfig", () => {
  it("should pass a valid MCP config", () => {
    const result = validateMCPConfig(validMCP);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("should fail when id is empty", () => {
    const result = validateMCPConfig({ ...validMCP, id: "" as any });
    expect(result.valid).toBe(false);
  });

  it("should fail when transport is invalid", () => {
    const result = validateMCPConfig({ ...validMCP, transport: "http" as any });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("MCP transport must be 'stdio', 'sse', or 'websocket'");
  });

  it("should fail when tools array is empty", () => {
    const result = validateMCPConfig({ ...validMCP, tools: [] });
    expect(result.valid).toBe(false);
  });

  it("should fail when health check command is missing", () => {
    const result = validateMCPConfig({ ...validMCP, healthCheckCommand: "" });
    expect(result.valid).toBe(false);
  });
});

// ─── Plugin Validator ─────────────────────────────────────────────────

const validPlugin: PluginManifest = {
  id: "plug1" as any,
  name: "Test Plugin",
  version: "1.0.0" as any,
  entryPoint: "./dist/plugin.js",
  permissions: [{ resource: "filesystem:read", actions: ["read"], allowed: true }],
};

describe("validatePluginManifest", () => {
  it("should pass a valid plugin manifest", () => {
    const result = validatePluginManifest(validPlugin);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("should fail when id is empty", () => {
    const result = validatePluginManifest({ ...validPlugin, id: "" as any });
    expect(result.valid).toBe(false);
  });

  it("should fail when entry point is missing", () => {
    const result = validatePluginManifest({ ...validPlugin, entryPoint: "" });
    expect(result.valid).toBe(false);
  });

  it("should fail when permissions have no resource", () => {
    const result = validatePluginManifest({
      ...validPlugin,
      permissions: [{ resource: "", actions: ["read"], allowed: true }],
    });
    expect(result.valid).toBe(false);
  });

  it("should fail when permissions have no actions array", () => {
    const result = validatePluginManifest({
      ...validPlugin,
      permissions: [{ resource: "test", actions: null as any, allowed: true }],
    });
    expect(result.valid).toBe(false);
  });
});

// ─── Readiness Gates ──────────────────────────────────────────────────

describe("createReadinessGate", () => {
  it("should create a completed gate when all checks pass", () => {
    const gate = createReadinessGate("storage", [
      { name: "db-connect", passed: true, detail: "Connected" },
    ]);
    expect(gate.status).toBe("completed");
  });

  it("should create a failed gate when any check fails", () => {
    const gate = createReadinessGate("provider", [
      { name: "api-health", passed: false, detail: "Timeout" },
    ]);
    expect(gate.status).toBe("failed");
  });

  it("should create a pending gate when no checks", () => {
    const gate = createReadinessGate("empty", []);
    expect(gate.status).toBe("pending");
  });
});

describe("evaluateReadiness", () => {
  it("should be ready when all gates pass", () => {
    const gates = [
      createReadinessGate("storage", [{ name: "db-connect", passed: true, detail: "ok" }]),
      createReadinessGate("provider", [{ name: "api-health", passed: true, detail: "ok" }]),
    ];
    const result = evaluateReadiness(gates);
    expect(result.ready).toBe(true);
    expect(result.failedGates).toEqual([]);
  });

  it("should not be ready when any gate fails", () => {
    const gates = [
      createReadinessGate("storage", [{ name: "db-connect", passed: true, detail: "ok" }]),
      createReadinessGate("provider", [{ name: "api-health", passed: false, detail: "Timeout" }]),
    ];
    const result = evaluateReadiness(gates);
    expect(result.ready).toBe(false);
    expect(result.failedGates).toContain("provider");
  });

  it("should not be ready when any gate is pending", () => {
    const gates = [createReadinessGate("storage", [])];
    const result = evaluateReadiness(gates);
    expect(result.ready).toBe(false);
  });
});

describe("isGateReady", () => {
  it("should return true for completed gate", () => {
    const gate = createReadinessGate("test", [{ name: "check", passed: true, detail: "ok" }]);
    expect(isGateReady(gate)).toBe(true);
  });

  it("should return false for failed gate", () => {
    const gate = createReadinessGate("test", [{ name: "check", passed: false, detail: "fail" }]);
    expect(isGateReady(gate)).toBe(false);
  });

  it("should return false for pending gate", () => {
    const gate = createReadinessGate("test", []);
    expect(isGateReady(gate)).toBe(false);
  });
});
