import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createMCPRegistry } from "@the-machine/mcp";
import { createCommandRegistry } from "@the-machine/agent-runtime";
import type { EntityId } from "@the-machine/core";

function createMCPFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "machine-mcp-"));
  const script = join(dir, "fixture.mjs");
  writeFileSync(
    script,
    `let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  const req = JSON.parse(input);
  if (req.method === "explode") {
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: req.id, error: { message: "boom" } }));
    return;
  }
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: { tool: req.method, params: req.params } }));
});`,
    "utf-8",
  );
  return `"${process.execPath}" "${script}"`;
}

describe("MCP registry", () => {
  it("registers and lists servers", () => {
    const registry = createMCPRegistry();
    registry.register({
      id: "mcp-1" as EntityId,
      name: "file-tools",
      transport: "stdio",
      endpoint: "/tmp/mcp.sock",
      tools: [{ name: "read-file", description: "Read a file", inputSchema: {} }],
      permissions: [{ toolName: "read-file", allowed: true, requireApproval: false }],
    });
    expect(registry.list()).toHaveLength(1);
  });

  it("get returns server by id", () => {
    const registry = createMCPRegistry();
    registry.register({
      id: "mcp-1" as EntityId,
      name: "file-tools",
      transport: "stdio",
      endpoint: "/tmp/mcp.sock",
      tools: [],
      permissions: [],
    });
    const got = registry.get("mcp-1" as EntityId);
    expect(got).not.toBeNull();
    expect(got!.name).toBe("file-tools");
  });

  it("get returns null for unknown", () => {
    const registry = createMCPRegistry();
    expect(registry.get("unknown" as EntityId)).toBeNull();
  });

  it("unregister removes server", () => {
    const registry = createMCPRegistry();
    registry.register({
      id: "mcp-1" as EntityId,
      name: "test",
      transport: "stdio",
      endpoint: "/tmp/sock",
      tools: [],
      permissions: [],
    });
    expect(registry.unregister("mcp-1" as EntityId)).toBe(true);
    expect(registry.list()).toHaveLength(0);
  });

  it("invoke succeeds for permitted tool", async () => {
    const registry = createMCPRegistry();
    const endpoint = createMCPFixture();
    registry.register({
      id: "mcp-1" as EntityId,
      name: "file-tools",
      transport: "stdio",
      endpoint,
      tools: [{ name: "read-file", description: "Read a file", inputSchema: {} }],
      permissions: [{ toolName: "read-file", allowed: true, requireApproval: false }],
    });
    const result = await registry.invoke("mcp-1" as EntityId, "read-file", {
      path: "/tmp/test.txt",
    });
    expect(result.success).toBe(true);
    expect(result.output).toContain("read-file");
    expect(result.output).toContain("/tmp/test.txt");
  });

  it("invoke fails for unknown server", async () => {
    const registry = createMCPRegistry();
    const result = await registry.invoke("unknown" as EntityId, "tool", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("invoke fails for unknown tool", async () => {
    const registry = createMCPRegistry();
    registry.register({
      id: "mcp-1" as EntityId,
      name: "test",
      transport: "stdio",
      endpoint: "/tmp/sock",
      tools: [],
      permissions: [],
    });
    const result = await registry.invoke("mcp-1" as EntityId, "nonexistent", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown tool");
  });

  it("invoke fails for unpermitted tool", async () => {
    const registry = createMCPRegistry();
    registry.register({
      id: "mcp-1" as EntityId,
      name: "file-tools",
      transport: "stdio",
      endpoint: "/tmp/mcp.sock",
      tools: [{ name: "write-file", description: "Write a file", inputSchema: {} }],
      permissions: [{ toolName: "write-file", allowed: false, requireApproval: true }],
    });
    const result = await registry.invoke("mcp-1" as EntityId, "write-file", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("not permitted");
  });

  it("invoke returns explicit error for unsupported transports", async () => {
    const registry = createMCPRegistry();
    registry.register({
      id: "mcp-1" as EntityId,
      name: "web-tools",
      transport: "websocket",
      endpoint: "ws://localhost:1234",
      tools: [{ name: "read", description: "Read", inputSchema: {} }],
      permissions: [{ toolName: "read", allowed: true, requireApproval: false }],
    });
    const result = await registry.invoke("mcp-1" as EntityId, "read", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("not supported");
  });
});

describe("command registry", () => {
  it("registers and lists commands", () => {
    const registry = createCommandRegistry();
    registry.register({ name: "preflight", script: "echo ok", description: "Preflight check" });
    expect(registry.list()).toHaveLength(1);
  });

  it("isAllowed returns true for registered commands", () => {
    const registry = createCommandRegistry();
    registry.register({ name: "test", script: "echo ok", description: "" });
    expect(registry.isAllowed("test")).toBe(true);
  });

  it("isAllowed returns false for unknown commands", () => {
    const registry = createCommandRegistry();
    expect(registry.isAllowed("unknown-cmd")).toBe(false);
  });

  it("execute rejects unknown commands", async () => {
    const registry = createCommandRegistry();
    const result = await registry.execute("unknown-cmd");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Unknown command");
    expect(result.stderr).toContain("Not in allowlist");
  });

  it("execute runs registered command", async () => {
    const registry = createCommandRegistry();
    registry.register({ name: "greet", script: "echo Hello", description: "Say hello" });
    const result = await registry.execute("greet");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Hello");
  });

  it("get returns entry for known command", () => {
    const registry = createCommandRegistry();
    registry.register({ name: "test", script: "true", description: "A test" });
    const entry = registry.get("test");
    expect(entry).not.toBeNull();
    expect(entry!.description).toBe("A test");
  });

  it("get returns null for unknown command", () => {
    const registry = createCommandRegistry();
    expect(registry.get("nonexistent")).toBeNull();
  });
});
