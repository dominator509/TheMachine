import { describe, expect, it } from "vitest";
import {
  createMCPHandler,
  createPluginHandler,
  createProviderHandler,
  createReadinessHandler,
} from "@the-machine/service";
import type { EntityId, SemVer } from "@the-machine/core";

describe("readiness evidence hardening", () => {
  it("does not report a subsystem ready merely because source files exist", () => {
    const readiness = createReadinessHandler();
    const result = readiness.check({ workspaceId: "workspace" as EntityId, subsystem: "core" });
    expect(result.overall).toBe("degraded");
    expect(result.gates[0]?.status).toBe("pending");
  });

  it("accepts current, executed, digest-backed evidence", () => {
    const readiness = createReadinessHandler({
      evidence: {
        expectedCandidateSha: "candidate-sha",
        get(subsystem) {
          return {
            subsystem,
            candidateSha: "candidate-sha",
            passed: true,
            checkCount: 3,
            evidenceDigest: "sha256:0123456789abcdef",
            completedAt: new Date(0).toISOString(),
          };
        },
      },
    });
    const result = readiness.check({ workspaceId: "workspace" as EntityId, subsystem: "core" });
    expect(result.overall).toBe("ready");
    expect(result.gates[0]?.status).toBe("completed");
  });

  it("rejects stale evidence from a different candidate", () => {
    const readiness = createReadinessHandler({
      evidence: {
        expectedCandidateSha: "current",
        get(subsystem) {
          return {
            subsystem,
            candidateSha: "old",
            passed: true,
            checkCount: 2,
            evidenceDigest: "sha256:old",
            completedAt: new Date(0).toISOString(),
          };
        },
      },
    });
    const result = readiness.check({ workspaceId: "workspace" as EntityId, subsystem: "core" });
    expect(result.overall).toBe("not_ready");
    expect(result.gates[0]?.status).toBe("failed");
  });

  it("does not treat provider, MCP, or plugin registration as successful execution", () => {
    const providers = createProviderHandler();
    const provider = providers.register(
      "provider" as EntityId,
      "Provider",
      "cloud",
      "https://example.invalid",
      ["model"],
      1_000,
    );
    expect(provider.healthy).toBe(false);

    const mcp = createMCPHandler();
    const server = mcp.register(
      "mcp" as EntityId,
      "MCP",
      "stdio",
      process.execPath,
      ["tool"],
    );
    expect(server.healthy).toBe(false);

    const plugins = createPluginHandler();
    const plugin = plugins.register(
      "plugin" as EntityId,
      "Plugin",
      "1.0.0" as SemVer,
      "plugin.mjs",
      0,
    );
    expect(plugin.enabled).toBe(false);
  });
});
