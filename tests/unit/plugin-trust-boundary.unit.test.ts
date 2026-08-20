import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createSandboxedExecutor } from "@the-machine/plugin-sdk";

function pluginFixture() {
  const directory = mkdtempSync(join(tmpdir(), "machine-plugin-trust-"));
  const entryPoint = join(directory, "plugin.mjs");
  writeFileSync(entryPoint, "export function onExecute(){ return 'ran'; }\n", "utf-8");
  return { directory, entryPoint };
}

describe("plugin trust boundary", () => {
  it("disables third-party execution by default", async () => {
    const fixture = pluginFixture();
    try {
      const executor = createSandboxedExecutor();
      const result = await executor.executeOnExecute(
        {
          manifest: {
            id: "third-party" as never,
            name: "Third Party",
            version: "1.0.0" as never,
            entryPoint: fixture.entryPoint,
            permissions: [],
          },
          hooks: {},
          enabled: true,
        },
        { pluginId: "third-party", pluginDir: fixture.directory, config: {} },
        {},
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("third-party plugin execution is disabled");
    } finally {
      rmSync(fixture.directory, { recursive: true, force: true });
    }
  });
});
