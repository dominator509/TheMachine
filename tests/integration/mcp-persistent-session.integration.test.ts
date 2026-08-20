import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createMCPRegistry } from "@the-machine/mcp";
import type { EntityId } from "@the-machine/core";

function persistentServerFixture(): { directory: string; script: string } {
  const directory = mkdtempSync(join(tmpdir(), "machine-mcp-persistent-"));
  const script = join(directory, "server.mjs");
  writeFileSync(
    script,
    `import { createInterface } from "node:readline";
const lines = createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const request = JSON.parse(line);
  if (request.method === "initialize") {
    process.stdout.write(JSON.stringify({
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "persistent-fixture", version: "1.0.0" },
      },
    }) + "\\n");
    return;
  }
  if (request.method === "tools/call") {
    process.stdout.write(JSON.stringify({
      jsonrpc: "2.0",
      id: request.id,
      result: { content: [{ type: "text", text: request.params.arguments.message }] },
    }) + "\\n");
  }
});
setInterval(() => {}, 1000);
`,
    "utf8",
  );
  return { directory, script };
}

describe("MCP persistent stdio session", () => {
  it("initializes and calls a tool without waiting for the server to exit", () => {
    const fixture = persistentServerFixture();
    try {
      const registry = createMCPRegistry();
      registry.register({
        id: "persistent" as EntityId,
        name: "Persistent MCP fixture",
        transport: "stdio",
        endpoint: process.execPath,
        args: [fixture.script],
        timeoutMs: 5_000,
        tools: [
          {
            name: "echo",
            description: "Echo a value",
            inputSchema: { type: "object" },
          },
        ],
        permissions: [{ toolName: "echo", allowed: true, requireApproval: true }],
      });

      const result = registry.invoke(
        "persistent" as EntityId,
        "echo",
        { message: "verified" },
        { approved: true, approvalId: "approval-1" },
      );
      expect(result.success).toBe(true);
      expect(JSON.parse(result.output)).toEqual({
        content: [{ type: "text", text: "verified" }],
      });
    } finally {
      rmSync(fixture.directory, { recursive: true, force: true });
    }
  });

  it("rejects shell executables during registration", () => {
    const registry = createMCPRegistry();
    expect(() =>
      registry.register({
        id: "shell" as EntityId,
        name: "Unsafe shell",
        transport: "stdio",
        endpoint: process.platform === "win32" ? "cmd.exe" : "sh",
        tools: [],
        permissions: [],
      }),
    ).toThrow(/shell executable/i);
  });
});
