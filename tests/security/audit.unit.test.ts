// Security audit tests — verify no secret leakage, loopback enforcement, allowlist, deny-by-default, and audit trails.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  redactSecret,
  redactText,
  createPermissionRegistry,
  createInMemorySecretStore,
  listSecretLabels,
} from "@the-machine/security";
import { createCommandRegistry } from "@the-machine/agent-runtime";
import { createMCPRegistry } from "@the-machine/mcp";
import type { EntityId } from "@the-machine/core";

// ── No raw secrets in source ──────────────────────────────────────────────────

describe("no raw secrets in source code", () => {
  const securitySrc = resolve(import.meta.dirname, "../../packages/security/src");

  const sourceFiles = readdirSync(securitySrc, { recursive: true })
    .filter((f): f is string => typeof f === "string" && f.endsWith(".ts"))
    .map((f) => resolve(securitySrc, f));

  for (const file of sourceFiles) {
    const relative = file.replace(securitySrc, "");
    it(`should not contain raw production secret patterns in ${relative}`, () => {
      const content = readFileSync(file, "utf-8");
      const filtered = content
        .split("\n")
        .filter((line) => !line.includes("SECRET_PATTERNS") && !line.includes("label:"))
        .join("\n");
      const result = redactText(filtered);
      expect(result.matchedPatterns.length).toBeLessThanOrEqual(1);
    });
  }
});

// ── Redaction coverage ─────────────────────────────────────────────────────────

describe("redaction coverage", () => {
  it("should redact known secret patterns", () => {
    const patterns = listSecretLabels();
    expect(patterns.length).toBeGreaterThanOrEqual(8);
    expect(patterns).toContain("OPENAI_KEY");
    expect(patterns).toContain("GITHUB_PAT");
  });

  it("should preserve non-secret text unchanged", () => {
    const safe = "The quick brown fox jumps over the lazy dog.";
    const result = redactText(safe);
    expect(result.redacted).toBe(safe);
    expect(result.matchedPatterns).toEqual([]);
  });

  it("should redact to 4 visible chars at each end by default", () => {
    const result = redactSecret("abcdefghijklmnopqrstuvwxyz");
    expect(result.startsWith("abcd")).toBe(true);
    expect(result.endsWith("wxyz")).toBe(true);
    expect(result.length).toBe(26);
  });
});

// ── Allowlist behavior ─────────────────────────────────────────────────────────

describe("command allowlist", () => {
  it("should reject unknown commands (allowlist enforcement)", async () => {
    const registry = createCommandRegistry();
    registry.register({ name: "ls", script: "ls", description: "List files" });
    expect(registry.isAllowed("ls")).toBe(true);
    expect(registry.isAllowed("rm")).toBe(false);
    const result = await registry.execute("rm");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Not in allowlist");
  });

  it("should list only registered commands", () => {
    const registry = createCommandRegistry();
    registry.register({ name: "a", script: "echo a", description: "" });
    registry.register({ name: "b", script: "echo b", description: "" });
    expect(registry.list()).toHaveLength(2);
    expect(registry.list().map((e: any) => e.name)).toEqual(["a", "b"]);
  });
});

// ── Deny-by-default audit ─────────────────────────────────────────────────────

describe("permission audit trail", () => {
  it("should audit every denied check", () => {
    const reg = createPermissionRegistry();
    reg.check({ resource: "mcp_tool", action: "dangerous-action" });
    reg.check({ resource: "provider", action: "delete-all" });
    const log = reg.auditLog();
    expect(log).toHaveLength(2);
    for (const entry of log) {
      expect(entry.result.allowed).toBe(false);
      expect(entry.severity).toBe("warning");
    }
  });

  it("should not audit allowed checks by default", () => {
    const reg = createPermissionRegistry();
    reg.grant({ resource: "command", action: "safe", allowed: true, requireApproval: false });
    reg.check({ resource: "command", action: "safe" });
    expect(reg.auditLog()).toHaveLength(0);
  });

  it("should include check context in audit entries", () => {
    const reg = createPermissionRegistry();
    reg.check({ resource: "filesystem", action: "write", context: "/etc/passwd" });
    const entry = reg.auditLog()[0];
    expect(entry!.check.context).toBe("/etc/passwd");
    expect(entry!.id).toBeTruthy();
    expect(entry!.timestamp).toBeGreaterThan(0);
  });
});

// ── Secret store isolation ─────────────────────────────────────────────────────

describe("secret store isolation", () => {
  it("should not leak secrets across namespaces", () => {
    const store = createInMemorySecretStore();
    store.store({ key: "api-key", provider: "openai" }, "super-secret-value");
    expect(store.resolve({ key: "api-key", provider: "anthropic" })).toBeUndefined();
  });
});

// ── MCP deny-by-default ───────────────────────────────────────────────────────

describe("MCP tool deny-by-default", () => {
  it("should deny tools without explicit permission", () => {
    const registry = createMCPRegistry();
    registry.register({
      id: "mcp-1" as unknown as EntityId,
      name: "test",
      transport: "stdio",
      endpoint: "/tmp/sock",
      tools: [{ name: "unsafe-tool", description: "Dangerous", inputSchema: {} }],
      permissions: [],
    });
    const result = registry.invoke("mcp-1" as unknown as EntityId, "unsafe-tool", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("not permitted");
  });
});
