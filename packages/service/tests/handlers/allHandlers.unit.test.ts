import { describe, it, expect } from "vitest";
import {
  createHealthHandler,
  createDiagnosticHandler,
  createWorkspaceHandler,
  createRepoHandler,
  createRunHandler,
  createValidationHandler,
  createProviderHandler,
  createMCPHandler,
  createPluginHandler,
  createReadinessHandler
} from "../../src/handlers";

describe("Service Handlers", () => {
  it("health handler", () => {
    const handler = createHealthHandler();
    expect(handler.check({}).status).toBe("ok");
  });

  it("diagnostics handler", () => {
    const handler = createDiagnosticHandler("linux", "1.0", Date.now());
    expect(handler.export({}).platform).toBeDefined();
  });

  it("workspace handler", () => {
    const handler = createWorkspaceHandler();
    const info = handler.get({ path: "/tmp" });
    expect(info.id).toBeDefined();
    expect(info.status).toBeDefined();
  });

  it("repo handler", () => {
    const handler = createRepoHandler();
    expect(handler.discover(".")).toBeDefined();
  });

  it("run handler", () => {
    const handler = createRunHandler();
    expect(handler.list().runs).toHaveLength(0);
    const run = handler.start({ planId: "test-plan" as any });
    expect(run.status).toBe("active");
    expect(handler.get(run.id)).toBeDefined();
  });

  it("validation handler", () => {
    const handler = createValidationHandler();
    const res = handler.record({ runId: "r1" as any, command: "ls" }, true, 0, "", "info");
    expect(res.passed).toBe(true);
    expect(handler.list("r1" as any).validations).toHaveLength(1);
  });

  it("provider handler", () => {
    const handler = createProviderHandler();
    expect(handler.list().providers).toHaveLength(0);
    expect(handler.get({ providerId: "missing" as any })).toBeNull();
  });

  it("mcp handler", () => {
    const handler = createMCPHandler();
    expect(handler.list().servers).toHaveLength(0);
  });

  it("plugin handler", () => {
    const handler = createPluginHandler();
    expect(handler.list().plugins).toHaveLength(0);
  });

  it("readiness handler", () => {
    const handler = createReadinessHandler();
    expect(handler.check({ subsystem: "core" }).overall).toBeDefined();
  });
});
