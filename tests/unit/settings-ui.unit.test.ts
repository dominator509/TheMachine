// Settings UI unit tests — validation, permission denial, secret-safe form flow.

import { describe, it, expect } from "vitest";
import {
  validateEndpoint,
  validateTransportType,
  validateModelNames,
  validateTimeout,
  validateEntryPoint,
  redactSecret,
  buildFormField,
  buildProviderSettingsDisplay,
  buildMCPSettingsDisplay,
  buildPluginSettingsDisplay,
  buildPermissionDenialDisplay,
  deriveProviderPermission,
  deriveMCPPermission,
  derivePluginPermission,
  formatFormField,
  formatProviderSettings,
  formatMCPSettings,
  formatPluginSettings,
  formatPermissionDenial,
} from "../../apps/desktop/src/settingsUI.js";

// ── Endpoint Validation ────────────────────────────────────────────────────

describe("validateEndpoint", () => {
  it("accepts valid https URL", () => {
    expect(validateEndpoint("endpoint", "https://api.openai.com/v1")).toEqual([]);
  });

  it("accepts valid http URL with port", () => {
    expect(validateEndpoint("endpoint", "http://localhost:8080")).toEqual([]);
  });

  it("rejects missing value when required", () => {
    const errors = validateEndpoint("endpoint", "", true);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("required");
  });

  it("allows empty value when not required", () => {
    expect(validateEndpoint("endpoint", "", false)).toEqual([]);
  });

  it("rejects non-URL string", () => {
    const errors = validateEndpoint("endpoint", "not-a-url");
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors.some((e) => e.message.includes("valid URL"))).toBe(true);
  });

  it("rejects URL with invalid port", () => {
    const errors = validateEndpoint("endpoint", "https://api.example.com:99999");
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Transport Type Validation ──────────────────────────────────────────────

describe("validateTransportType", () => {
  it("accepts stdio", () => {
    expect(validateTransportType("transport", "stdio")).toEqual([]);
  });

  it("accepts sse", () => {
    expect(validateTransportType("transport", "sse")).toEqual([]);
  });

  it("accepts websocket", () => {
    expect(validateTransportType("transport", "websocket")).toEqual([]);
  });

  it("rejects invalid transport", () => {
    const errors = validateTransportType("transport", "tcp");
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("stdio");
  });
});

// ── Model Names Validation ─────────────────────────────────────────────────

describe("validateModelNames", () => {
  it("accepts valid model names", () => {
    expect(validateModelNames(["gpt-4", "claude-3-opus"])).toEqual([]);
  });

  it("rejects empty list", () => {
    const errors = validateModelNames([]);
    expect(errors.some((e) => e.message.includes("At least one model"))).toBe(true);
  });

  it("rejects model names with spaces", () => {
    const errors = validateModelNames(["bad model"]);
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Timeout Validation ─────────────────────────────────────────────────────

describe("validateTimeout", () => {
  it("accepts valid timeout", () => {
    expect(validateTimeout(30000)).toEqual([]);
  });

  it("rejects timeout below 1000", () => {
    const errors = validateTimeout(500);
    expect(errors.some((e) => e.message.includes("at least 1000"))).toBe(true);
  });

  it("rejects timeout above 300000", () => {
    const errors = validateTimeout(600000);
    expect(errors.some((e) => e.message.includes("not exceed 300000"))).toBe(true);
  });

  it("rejects NaN", () => {
    const errors = validateTimeout(NaN);
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Entry Point Validation ─────────────────────────────────────────────────

describe("validateEntryPoint", () => {
  it("accepts valid .ts entry point", () => {
    expect(validateEntryPoint("plugins/my-plugin/index.ts")).toEqual([]);
  });

  it("accepts valid .js entry point", () => {
    expect(validateEntryPoint("dist/plugin.js")).toEqual([]);
  });

  it("rejects missing entry when required", () => {
    const errors = validateEntryPoint("", true);
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects entry without script extension", () => {
    const errors = validateEntryPoint("my-plugin/index");
    expect(errors.some((e) => e.message.includes("Entry point must"))).toBe(true);
  });
});

// ── Secret Redaction ───────────────────────────────────────────────────────

describe("redactSecret", () => {
  it("redacts long API key showing last 4 chars", () => {
    const result = redactSecret("sk-abc123def456xyz");
    expect(result).toContain("xyz");
    expect(result.startsWith("*")).toBe(true);
    expect(result.length).toBe("sk-abc123def456xyz".length);
  });

  it("returns short value unchanged", () => {
    expect(redactSecret("abc")).toBe("abc");
  });

  it("handles empty string", () => {
    expect(redactSecret("")).toBe("");
  });

  it("redacts exactly 6-char value leaving last 4 visible", () => {
    // "abcdef" length 6 — masked length = 2 -> "**cd" + "ef" = "**cdef"? No.
    // masked = Math.max(6 - 4, 0) = 2 —> "**"
    // visibleEnd = "cdef" —> "**cdef"
    const result = redactSecret("abcdef");
    expect(result).toBe("**cdef");
  });

  it("produces consistent masking length", () => {
    const result = redactSecret("sk-abc...nopq");
    const maskedCount = result.split("").filter((c) => c === "*").length;
    const visibleChars = result.replace(/\*/g, "");
    expect(visibleChars).toBe("nopq");
    expect(maskedCount).toBe(9);
  });
});

// ── Form Field Building ────────────────────────────────────────────────────

describe("buildFormField", () => {
  it("redacts secret fields by default", () => {
    const field = buildFormField("key", "API Key", "sk-secret-value", true, true);
    expect(field.redacted).toBe(true);
    expect(field.value).not.toContain("sk-secret-value");
    expect(field.value).toContain("lue");
  });

  it("does not redact non-secret fields", () => {
    const field = buildFormField("name", "Name", "gpt-4", true, false);
    expect(field.redacted).toBe(false);
    expect(field.value).toBe("gpt-4");
  });

  it("includes validation errors", () => {
    const field = buildFormField("url", "URL", "", true, false, ["URL is required."]);
    expect(field.validationErrors).toEqual(["URL is required."]);
  });
});

// ── Build Provider Settings Display ────────────────────────────────────────

describe("buildProviderSettingsDisplay", () => {
  const provider = {
    id: "p-1" as any,
    name: "OpenAI",
    tier: "cloud" as any,
    endpoint: "https://api.openai.com/v1",
    models: ["gpt-4", "gpt-4o"],
    timeoutMs: 30000,
    healthy: true,
  };

  it("builds display with redacted endpoint", () => {
    const display = buildProviderSettingsDisplay(provider);
    expect(display.name).toBe("OpenAI");
    expect(display.endpoint.redacted).toBe(true);
    expect(display.endpoint.value).not.toContain("api.openai.com");
    expect(display.models).toEqual(["gpt-4", "gpt-4o"]);
    expect(display.healthy).toBe(true);
  });

  it("marks hasRedactedFields as true", () => {
    const display = buildProviderSettingsDisplay(provider);
    expect(display.hasRedactedFields).toBe(true);
  });
});

// ── Build MCP Settings Display ─────────────────────────────────────────────

describe("buildMCPSettingsDisplay", () => {
  const stdioServer = {
    id: "m-1" as any,
    name: "Local FS",
    transport: "stdio" as const,
    endpoint: "/usr/bin/mcp-fs",
    tools: ["read", "write"],
    toolCount: 2,
    healthy: true,
  };

  const sseServer = {
    id: "m-2" as any,
    name: "Remote API",
    transport: "sse" as const,
    endpoint: "https://mcp.example.com/events",
    tools: ["search"],
    toolCount: 1,
    healthy: true,
  };

  it("does not redact stdio endpoint", () => {
    const display = buildMCPSettingsDisplay(stdioServer);
    expect(display.endpoint.redacted).toBe(false);
    expect(display.endpoint.value).toBe("/usr/bin/mcp-fs");
  });

  it("redacts SSE endpoint", () => {
    const display = buildMCPSettingsDisplay(sseServer);
    expect(display.endpoint.redacted).toBe(true);
    expect(display.endpoint.value).not.toContain("mcp.example.com");
  });

  it("shows tool list and count", () => {
    const display = buildMCPSettingsDisplay(stdioServer);
    expect(display.tools).toEqual(["read", "write"]);
    expect(display.toolCount).toBe(2);
  });
});

// ── Build Plugin Settings Display ──────────────────────────────────────────

describe("buildPluginSettingsDisplay", () => {
  const plugin = {
    id: "pl-1" as any,
    name: "My Plugin",
    version: "1.2.3" as any,
    entryPoint: "plugins/my-plugin/index.ts",
    permissionCount: 3,
    enabled: true,
  };

  it("builds display with all fields", () => {
    const display = buildPluginSettingsDisplay(plugin);
    expect(display.name).toBe("My Plugin");
    expect(display.version).toBe("1.2.3");
    expect(display.entryPoint).toBe("plugins/my-plugin/index.ts");
    expect(display.permissionCount).toBe(3);
    expect(display.enabled).toBe(true);
  });
});

// ── Permission Denial ──────────────────────────────────────────────────────

describe("buildPermissionDenialDisplay", () => {
  it("creates denial for provider", () => {
    const denial = buildPermissionDenialDisplay(
      "provider",
      "OpenAI",
      "Custom reason",
      "Custom action",
    );
    expect(denial.type).toBe("provider");
    expect(denial.name).toBe("OpenAI");
    expect(denial.reason).toBe("Custom reason");
    expect(denial.suggestedAction).toBe("Custom action");
  });

  it("uses defaults when omitted", () => {
    const denial = buildPermissionDenialDisplay("mcp", "Local FS");
    expect(denial.reason).toContain("Permission denied");
    expect(denial.suggestedAction).toContain("Review and approve");
  });
});

describe("deriveProviderPermission", () => {
  it("returns null for healthy provider", () => {
    const provider = {
      id: "p-1" as any,
      name: "OpenAI",
      tier: "cloud" as any,
      endpoint: "https://api.openai.com/v1",
      models: ["gpt-4"],
      timeoutMs: 30000,
      healthy: true,
    };
    expect(deriveProviderPermission(provider)).toBeNull();
  });

  it("returns denial for unhealthy provider", () => {
    const provider = {
      id: "p-2" as any,
      name: "Broken AI",
      tier: "cloud" as any,
      endpoint: "https://broken.example.com",
      models: [],
      timeoutMs: 30000,
      healthy: false,
    };
    const denial = deriveProviderPermission(provider);
    expect(denial).not.toBeNull();
    expect(denial!.type).toBe("provider");
    expect(denial!.name).toBe("Broken AI");
  });
});

describe("deriveMCPPermission", () => {
  it("returns null for healthy MCP server", () => {
    const server = {
      id: "m-1" as any,
      name: "Local FS",
      transport: "stdio" as const,
      endpoint: "/usr/bin/mcp-fs",
      tools: [],
      toolCount: 0,
      healthy: true,
    };
    expect(deriveMCPPermission(server)).toBeNull();
  });

  it("returns denial for unhealthy MCP server", () => {
    const server = {
      id: "m-2" as any,
      name: "Broken MCP",
      transport: "sse" as const,
      endpoint: "https://broken.example.com",
      tools: [],
      toolCount: 0,
      healthy: false,
    };
    const denial = deriveMCPPermission(server);
    expect(denial).not.toBeNull();
    expect(denial!.type).toBe("mcp");
  });
});

describe("derivePluginPermission", () => {
  it("returns null for enabled plugin", () => {
    const plugin = {
      id: "pl-1" as any,
      name: "My Plugin",
      version: "1.0.0" as any,
      entryPoint: "index.ts",
      permissionCount: 1,
      enabled: true,
    };
    expect(derivePluginPermission(plugin)).toBeNull();
  });

  it("returns denial for disabled plugin", () => {
    const plugin = {
      id: "pl-2" as any,
      name: "Disabled Plugin",
      version: "1.0.0" as any,
      entryPoint: "index.ts",
      permissionCount: 3,
      enabled: false,
    };
    const denial = derivePluginPermission(plugin);
    expect(denial).not.toBeNull();
    expect(denial!.type).toBe("plugin");
    expect(denial!.name).toBe("Disabled Plugin");
  });
});

// ── Format Output ──────────────────────────────────────────────────────────

describe("formatFormField", () => {
  it("includes label and value", () => {
    const field = {
      name: "key",
      label: "API Key",
      value: "***key",
      redacted: true,
      required: true,
      validationErrors: [],
    };
    const output = formatFormField(field);
    expect(output).toContain("API Key");
    expect(output).toContain("***key");
    expect(output).toContain("redacted");
  });

  it("includes validation errors when present", () => {
    const field = {
      name: "url",
      label: "URL",
      value: "",
      redacted: false,
      required: true,
      validationErrors: ["URL is required."],
    };
    const output = formatFormField(field);
    expect(output).toContain("URL is required");
  });
});

describe("formatProviderSettings", () => {
  it("returns formatted provider settings", () => {
    const display = {
      id: "p-1",
      name: "OpenAI",
      tier: "cloud",
      endpoint: {
        name: "endpoint",
        label: "API Endpoint",
        value: "***/v1",
        redacted: true,
        required: true,
        validationErrors: [],
      },
      models: ["gpt-4"],
      timeoutMs: 30000,
      healthy: true,
      hasRedactedFields: true,
    };
    const output = formatProviderSettings(display);
    expect(output).toContain("OpenAI");
    expect(output).toContain("cloud");
    expect(output).toContain("OK");
  });
});

describe("formatMCPSettings", () => {
  it("returns formatted MCP settings", () => {
    const display = {
      id: "m-1",
      name: "Local FS",
      transport: "stdio",
      endpoint: {
        name: "endpoint",
        label: "Server Endpoint",
        value: "/usr/bin/mcp-fs",
        redacted: false,
        required: true,
        validationErrors: [],
      },
      tools: ["read", "write"],
      toolCount: 2,
      healthy: true,
    };
    const output = formatMCPSettings(display);
    expect(output).toContain("Local FS");
    expect(output).toContain("stdio");
    expect(output).toContain("read");
    expect(output).toContain("OK");
  });
});

describe("formatPluginSettings", () => {
  it("returns formatted plugin settings", () => {
    const display = {
      id: "pl-1",
      name: "My Plugin",
      version: "1.2.3",
      entryPoint: "index.ts",
      permissionCount: 3,
      enabled: true,
    };
    const output = formatPluginSettings(display);
    expect(output).toContain("My Plugin");
    expect(output).toContain("1.2.3");
    expect(output).toContain("Enabled");
  });
});

describe("formatPermissionDenial", () => {
  it("returns formatted denial", () => {
    const denial = {
      type: "mcp" as const,
      name: "Local FS",
      reason: "Not healthy",
      suggestedAction: "Check logs",
    };
    const output = formatPermissionDenial(denial);
    expect(output).toContain("[DENIED]");
    expect(output).toContain("MCP");
    expect(output).toContain("Local FS");
    expect(output).toContain("Not healthy");
    expect(output).toContain("Check logs");
  });
});
