import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRuntime } from "@the-machine/agent-runtime";
import { createDefaultClient, ServiceStore } from "@the-machine/service";
import { createUI } from "@the-machine/ui-components";

describe("package integration smoke", () => {
  it("wires runtime, service, and UI entrypoints with temp persistence", () => {
    const dir = mkdtempSync(join(tmpdir(), "machine-basic-integration-"));
    const store = new ServiceStore(join(dir, "the-machine.db"));

    try {
      const runtime = createRuntime();
      const service = createDefaultClient({ store });
      const ui = createUI();

      runtime.commands.register({
        name: "echo",
        description: "Echo command",
        script: `${process.execPath} -e "console.log('ok')"`,
      });

      expect(runtime.commands.isAllowed("echo")).toBe(true);
      expect(service.health.check({}).status).toBe("ok");
      expect(service.readiness.check({ workspaceId: "default" }).gates).toHaveLength(12);
      expect(ui.getComponent("plan-status")?.surface).toBe("shared");
    } finally {
      store.close();
    }
  });
});
