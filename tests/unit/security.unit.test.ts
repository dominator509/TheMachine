// Unit tests for security package — redaction and secret references.
import { describe, it, expect } from "vitest";
import {
  redactSecret,
  redactText,
  containsSecret,
  listSecretLabels,
  validateSecretReference,
  formatSecretReference,
  createInMemorySecretStore,
  createFakeSecureStorage,
  createPermissionRegistry,
} from "@the-machine/security";

// ── Redaction ──────────────────────────────────────────────────────────────

describe("redactSecret", () => {
  it("should mask middle of a long value", () => {
    const result = redactSecret("test-secret-123def456ghi789jkl");
    expect(result).toContain("test");
    expect(result).toContain("jkl");
    expect(result).not.toContain("abc123def456ghi789");
  });

  it("should use custom mask character", () => {
    const result = redactSecret("password123", { maskChar: "#", visibleStart: 2, visibleEnd: 2 });
    expect(result).toBe("pa#######23");
  });

  it("should fully mask short values", () => {
    const result = redactSecret("abc", { visibleStart: 2, visibleEnd: 2 });
    expect(result).toBe("***");
    expect(result).not.toContain("abc");
  });

  it("should keep visible start and end chars", () => {
    const result = redactSecret("abcdefghijklmnop", { visibleStart: 2, visibleEnd: 3 });
    expect(result).toBe("ab***********nop");
  });
});

describe("redactText", () => {
  it("should redact OpenAI-style API keys", () => {
    const text = "My key is sk-test123def456ghi789jklmno and it's secret.";
    const result = redactText(text);
    expect(result.matchedPatterns).toContain("OPENAI_KEY");
    expect(result.redacted).toContain("[REDACTED_OPENAI_KEY(");
    expect(result.redacted).not.toContain("sk-test123def456ghi789jklmno");
  });

  it("should redact bearer tokens", () => {
    const text = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
    const result = redactText(text);
    expect(result.matchedPatterns).toContain("BEARER_TOKEN");
    expect(result.redacted).toContain("[REDACTED_BEARER_TOKEN(");
  });

  it("should redact private key blocks", () => {
    const text = `-----BEGIN RSA ${"PRIVATE KEY"}-----\nMIIEpAIBAAKCAQEA\n-----END RSA ${"PRIVATE KEY"}-----`;
    const result = redactText(text);
    expect(result.matchedPatterns).toContain("PRIVATE_KEY");
    expect(result.redacted).toContain("[REDACTED_PRIVATE_KEY(");
  });

  it("should redact password assignments", () => {
    const text = "DB_PASSWORD=super_secret_1234";
    const result = redactText(text);
    expect(result.matchedPatterns.length).toBeGreaterThanOrEqual(1);
    expect(result.redacted).not.toContain("super_secret_1234");
  });

  it("should return original and empty patterns when no secret found", () => {
    const text = "Hello, this is a normal text without secrets.";
    const result = redactText(text);
    expect(result.redacted).toBe(text);
    expect(result.matchedPatterns).toEqual([]);
  });

  it("should detect multiple secret types in one text", () => {
    const text = `sk-test123def456ghi789jklmnopqrstuvwxyz\nghp_test123def456ghi789jklmnopqrs1234567890abcd`;
    const result = redactText(text);
    expect(result.matchedPatterns.length).toBeGreaterThanOrEqual(2);
  });
});

describe("containsSecret", () => {
  it("should return true for text with API keys", () => {
    expect(containsSecret("sk-test123def456ghi789jklmno")).toBe(true);
  });

  it("should return false for normal text", () => {
    expect(containsSecret("Hello world")).toBe(false);
  });
});

describe("listSecretLabels", () => {
  it("should return known patterns", () => {
    const labels = listSecretLabels();
    expect(labels).toContain("OPENAI_KEY");
    expect(labels).toContain("PRIVATE_KEY");
    expect(labels.length).toBeGreaterThanOrEqual(8);
  });
});

// ── Secret References ──────────────────────────────────────────────────────

describe("validateSecretReference", () => {
  it("should accept valid secret references", () => {
    expect(validateSecretReference({ key: "my-key", provider: "openai" })).toBe(true);
  });

  it("should reject null", () => {
    expect(validateSecretReference(null)).toBe(false);
  });

  it("should reject missing key", () => {
    expect(validateSecretReference({ provider: "openai" })).toBe(false);
  });

  it("should reject missing provider", () => {
    expect(validateSecretReference({ key: "my-key" })).toBe(false);
  });

  it("should reject empty key", () => {
    expect(validateSecretReference({ key: "", provider: "openai" })).toBe(false);
  });
});

describe("formatSecretReference", () => {
  it("should format as provider:key", () => {
    expect(formatSecretReference({ key: "api-key", provider: "openai" })).toBe("openai:api-key");
  });
});

// ── In-Memory Secret Store ─────────────────────────────────────────────────

describe("createInMemorySecretStore", () => {
  it("should store and resolve secrets", () => {
    const store = createInMemorySecretStore();
    const ref = { key: "api-key", provider: "openai" };
    store.store(ref, "sk-secret-value");
    expect(store.resolve(ref)).toBe("sk-secret-value");
  });

  it("should return undefined for unknown references", () => {
    const store = createInMemorySecretStore();
    expect(store.resolve({ key: "unknown", provider: "test" })).toBeUndefined();
  });

  it("should delete secrets", () => {
    const store = createInMemorySecretStore();
    const ref = { key: "temp", provider: "test" };
    store.store(ref, "value");
    expect(store.delete(ref)).toBe(true);
    expect(store.resolve(ref)).toBeUndefined();
  });

  it("should return false when deleting non-existent secret", () => {
    const store = createInMemorySecretStore();
    expect(store.delete({ key: "nothing", provider: "test" })).toBe(false);
  });

  it("should list all stored references", () => {
    const store = createInMemorySecretStore();
    store.store({ key: "k1", provider: "p1" }, "v1");
    store.store({ key: "k2", provider: "p2" }, "v2");
    const list = store.list();
    expect(list).toHaveLength(2);
    expect(list.map((r) => r.key)).toContain("k1");
    expect(list.map((r) => r.provider)).toContain("p2");
  });
});

// ── Secure Storage Adapter ────────────────────────────────────────────────────

describe("createFakeSecureStorage", () => {
  it("should store and retrieve values", () => {
    const storage = createFakeSecureStorage();
    storage.set("api-key", "***");
    expect(storage.get("api-key")).toBe("***");
  });

  it("should return undefined for missing keys", () => {
    const storage = createFakeSecureStorage();
    expect(storage.get("nonexistent")).toBeUndefined();
  });

  it("should delete stored values", () => {
    const storage = createFakeSecureStorage();
    storage.set("temp", "value");
    expect(storage.delete("temp")).toBe(true);
    expect(storage.get("temp")).toBeUndefined();
  });

  it("should return false when deleting missing key", () => {
    const storage = createFakeSecureStorage();
    expect(storage.delete("nothing")).toBe(false);
  });

  it("should list all stored keys", () => {
    const storage = createFakeSecureStorage({ namespace: "test-ns" });
    storage.set("k1", "v1");
    storage.set("k2", "v2");
    const list = storage.list();
    expect(list).toHaveLength(2);
    expect(list).toContain("k1");
    expect(list).toContain("k2");
  });

  it("should namespace keys independently", () => {
    const a = createFakeSecureStorage({ namespace: "ns1" });
    const b = createFakeSecureStorage({ namespace: "ns2" });
    a.set("shared-key", "value-a");
    b.set("shared-key", "value-b");
    expect(a.get("shared-key")).toBe("value-a");
    expect(b.get("shared-key")).toBe("value-b");
  });

  it("should report healthy", () => {
    const storage = createFakeSecureStorage();
    expect(storage.health().available).toBe(true);
  });
});

// ── Permission Engine ─────────────────────────────────────────────────────────

describe("createPermissionRegistry", () => {
  it("should deny by default", () => {
    const reg = createPermissionRegistry();
    const result = reg.check({ resource: "provider", action: "invoke" });
    expect(result.allowed).toBe(false);
  });

  it("should allow explicitly granted permissions", () => {
    const reg = createPermissionRegistry();
    reg.grant({ resource: "provider", action: "invoke", allowed: true, requireApproval: false });
    const result = reg.check({ resource: "provider", action: "invoke" });
    expect(result.allowed).toBe(true);
  });

  it("should deny explicitly revoked permissions", () => {
    const reg = createPermissionRegistry();
    reg.grant({ resource: "mcp_tool", action: "read_file", allowed: true, requireApproval: false });
    reg.revoke("mcp_tool", "read_file");
    const result = reg.check({ resource: "mcp_tool", action: "read_file" });
    expect(result.allowed).toBe(false);
  });

  it("should require approval when configured", () => {
    const reg = createPermissionRegistry();
    reg.grant({ resource: "plugin", action: "install", allowed: true, requireApproval: true });
    const result = reg.check({ resource: "plugin", action: "install" });
    expect(result.allowed).toBe(true);
    expect(result.requireApproval).toBe(true);
  });

  it("should audit denied checks by default", () => {
    const reg = createPermissionRegistry();
    reg.check({ resource: "command", action: "rm" });
    expect(reg.auditLog()).toHaveLength(1);
    expect(reg.auditLog()[0]?.severity).toBe("warning");
  });

  it("should audit all checks when auditAll is set", () => {
    const reg = createPermissionRegistry({ auditAll: true });
    reg.grant({ resource: "provider", action: "invoke", allowed: true, requireApproval: false });
    reg.check({ resource: "provider", action: "invoke" });
    expect(reg.auditLog()).toHaveLength(1);
    expect(reg.auditLog()[0]?.severity).toBe("info");
  });

  it("should list all granted permissions", () => {
    const reg = createPermissionRegistry();
    reg.grant({ resource: "provider", action: "invoke", allowed: true, requireApproval: false });
    reg.grant({ resource: "filesystem", action: "read", allowed: true, requireApproval: false });
    expect(reg.list()).toHaveLength(2);
  });

  it("should provide denial reason", () => {
    const reg = createPermissionRegistry();
    const result = reg.check({ resource: "network", action: "connect" });
    expect(result.reason).toContain("deny-by-default");
  });
});
