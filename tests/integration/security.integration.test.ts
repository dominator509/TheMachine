// Integration tests for security boundary enforcement.
import { describe, it, expect } from "vitest";
import { createMCPRegistry } from "@the-machine/mcp";
import {
  createPermissionRegistry,
  createSecureCommandRegistry,
  createSecureMCPRegistry,
  secureProviderAdapter,
  createSecurePluginHost,
} from "@the-machine/security";
import { createOpenAIAdapter } from "@the-machine/providers";
import type { EntityId } from "@the-machine/core";

describe("secure command registry", () => {
  it("should deny unpermitted commands", async () => {
    const permissions = createPermissionRegistry();
    const registry = createSecureCommandRegistry(permissions);
    registry.register({ name: "allowed", script: "echo ok", description: "" });

    const result = await registry.execute("allowed");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Permission denied");
  });

  it("should allow explicitly permitted commands", async () => {
    const permissions = createPermissionRegistry();
    permissions.grant({
      resource: "command",
      action: "allowed",
      allowed: true,
      requireApproval: false,
    });
    const registry = createSecureCommandRegistry(permissions);
    registry.register({ name: "allowed", script: "echo ok", description: "" });

    const result = await registry.execute("allowed");
    expect(result.exitCode).toBe(0);
  });
});

describe("secure MCP registry", () => {
  it("should deny unpermitted tools", () => {
    const permissions = createPermissionRegistry();
    const inner = createMCPRegistry();
    inner.register({
      id: "mcp-1" as unknown as EntityId,
      name: "file-tools",
      transport: "stdio",
      endpoint: "/tmp/mcp.sock",
      tools: [{ name: "read-file", description: "Read a file", inputSchema: {} }],
      permissions: [{ toolName: "read-file", allowed: true, requireApproval: false }],
    });

    const registry = createSecureMCPRegistry(inner, permissions);
    const result = registry.invoke("mcp-1" as unknown as EntityId, "read-file", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("Permission denied");
  });

  it("should allow explicitly permitted MCP tools", () => {
    const permissions = createPermissionRegistry();
    permissions.grant({
      resource: "mcp_tool",
      action: "read-file",
      allowed: true,
      requireApproval: false,
    });
    const inner = createMCPRegistry();
    inner.register({
      id: "mcp-1" as unknown as EntityId,
      name: "file-tools",
      transport: "stdio",
      endpoint: "/tmp/mcp.sock",
      tools: [{ name: "read-file", description: "Read a file", inputSchema: {} }],
      permissions: [{ toolName: "read-file", allowed: true, requireApproval: false }],
    });

    const registry = createSecureMCPRegistry(inner, permissions);
    const result = registry.invoke("mcp-1" as unknown as EntityId, "read-file", {});
    expect(result.success).toBe(true);
  });
});

describe("secure provider wrapper", () => {
  it("should deny unpermitted provider completions", async () => {
    const permissions = createPermissionRegistry();
    const adapter = createOpenAIAdapter(
      "p-1" as unknown as EntityId,
      "test-ai",
      "http://localhost:8080",
      "gpt-4",
    );
    const secured = secureProviderAdapter(adapter, permissions);

    const result = await secured.complete({
      model: "gpt-4",
      messages: [{ role: "user", content: "Hello" }],
    });
    expect(result.finishReason).toBe("error");
  });

  it("should allow explicitly permitted provider completions", async () => {
    const permissions = createPermissionRegistry();
    permissions.grant({
      resource: "provider",
      action: "invoke:test-ai",
      allowed: true,
      requireApproval: false,
    });
    const adapter = createOpenAIAdapter(
      "p-1" as unknown as EntityId,
      "test-ai",
      "http://localhost:8080",
      "gpt-4",
    );
    const secured = secureProviderAdapter(adapter, permissions);

    const result = await secured.complete({
      model: "gpt-4",
      messages: [{ role: "user", content: "Hello" }],
    });
    expect(result.finishReason).toBe("stop");
  });
});

describe("secure plugin host", () => {
  it("should deny unpermitted plugin actions", () => {
    const permissions = createPermissionRegistry();
    const host = createSecurePluginHost(permissions);
    const result = host.checkAction("my-plugin", "install");
    expect(result.allowed).toBe(false);
  });

  it("should allow explicitly permitted plugin actions", () => {
    const permissions = createPermissionRegistry();
    permissions.grant({
      resource: "plugin",
      action: "my-plugin:install",
      allowed: true,
      requireApproval: false,
    });
    const host = createSecurePluginHost(permissions);
    const result = host.checkAction("my-plugin", "install");
    expect(result.allowed).toBe(true);
  });
});
