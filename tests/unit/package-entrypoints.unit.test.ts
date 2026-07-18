import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRuntime } from "@the-machine/agent-runtime";
import { createService, ServiceStore } from "@the-machine/service";
import { createUI } from "@the-machine/ui-components";

describe("package entrypoints", () => {
  it("creates a runtime with a command registry", () => {
    const runtime = createRuntime();

    expect(runtime.commands.list()).toEqual([]);
    expect(runtime.commands.isAllowed("missing")).toBe(false);
  });

  it("creates a service client from the package entrypoint", () => {
    const dir = mkdtempSync(join(tmpdir(), "machine-service-entrypoint-"));
    const store = new ServiceStore(join(dir, "the-machine.db"));

    try {
      const service = createService({ store });
      expect(service.health.check({}).status).toBe("ok");
      expect(service.readiness.check({ workspaceId: "default" }).gates).toHaveLength(12);
    } finally {
      store.close();
    }
  });

  it("creates a deterministic UI component registry", () => {
    const ui = createUI();

    expect(ui.releaseDecision.status).toBe("pending");
    expect(ui.isReleaseReady()).toBe(false);
    expect(ui.listComponents().map((component) => component.id)).toEqual([
      "plan-status",
      "settings",
      "readiness",
    ]);
    expect(ui.getComponent("readiness")?.label).toBe("Readiness");
    expect(ui.getComponent("missing")).toBeNull();
  });

  it("accepts shared UI release readiness explicitly", () => {
    const ui = createUI({ status: "accepted", detail: "Accepted for release." });

    expect(ui.releaseDecision.status).toBe("accepted");
    expect(ui.isReleaseReady()).toBe(true);
  });
});
