// Readiness UI unit tests — report view, diagnostics, redacted export, CLI output modes.

import { describe, it, expect } from "vitest";
import {
  buildReadinessReport,
  buildDiagnosticsReport,
  redactExport,
  formatReadinessReport,
  formatDiagnosticsReport,
  formatRedactedExport,
  formatAsJSON,
} from "../../apps/desktop/src/readinessUI.js";

// ── buildReadinessReport ────────────────────────────────────────────────────

describe("buildReadinessReport", () => {
  it("builds display from readiness response", () => {
    const response = {
      workspaceId: "default" as any,
      overall: "ready" as const,
      gates: [
        { subsystem: "core", status: "completed" as const, passedChecks: 3, totalChecks: 3 },
        { subsystem: "storage", status: "completed" as const, passedChecks: 2, totalChecks: 2 },
      ],
    };

    const display = buildReadinessReport(response);
    expect(display.overall).toBe("ready");
    expect(display.gates).toHaveLength(2);
    expect(display.gates[0].subsystem).toBe("Core");
    expect(display.gates[0].status).toBe("Ready");
    expect(display.gates[0].passedChecks).toBe(3);
    expect(display.gates[0].totalChecks).toBe(3);
    expect(display.filtered).toBeUndefined();
  });

  it("title-cases subsystem names", () => {
    const response = {
      workspaceId: "default" as any,
      overall: "ready" as const,
      gates: [
        { subsystem: "service", status: "completed" as const, passedChecks: 2, totalChecks: 2 },
      ],
    };

    const display = buildReadinessReport(response);
    expect(display.gates[0].subsystem).toBe("Service");
  });

  it("reports filtered subsystem when provided", () => {
    const response = {
      workspaceId: "default" as any,
      overall: "ready" as const,
      gates: [{ subsystem: "core", status: "completed" as const, passedChecks: 3, totalChecks: 3 }],
    };

    const display = buildReadinessReport(response, "core");
    expect(display.filtered).toBe("core");
  });

  it("handles degraded status", () => {
    const response = {
      workspaceId: "default" as any,
      overall: "degraded" as const,
      gates: [
        { subsystem: "core", status: "completed" as const, passedChecks: 2, totalChecks: 3 },
        { subsystem: "storage", status: "completed" as const, passedChecks: 0, totalChecks: 2 },
      ],
    };

    const display = buildReadinessReport(response);
    expect(display.overall).toBe("degraded");
    expect(display.gates[0].passedChecks).toBe(2);
    expect(display.gates[0].totalChecks).toBe(3);
  });
});

// ── buildDiagnosticsReport ──────────────────────────────────────────────────

describe("buildDiagnosticsReport", () => {
  it("builds diagnostics display from health data", () => {
    const healthResponse = {
      platform: "The Machine",
      version: "0.1.0",
      uptimeMs: 12345,
      checks: { core: true, storage: true, service: true },
      cwd: "/test/path",
    };

    const display = buildDiagnosticsReport(healthResponse);
    expect(display.platform).toBe("The Machine");
    expect(display.version).toBe("0.1.0");
    expect(display.cwd).toBe("/test/path");
    expect(display.nodeAvailable).toBe(true);
    expect(display.pnpmAvailable).toBe(true);
    expect(display.uptimeMs).toBe(12345);
    expect(display.checks).toEqual({ core: true, storage: true, service: true });
  });

  it("uses process.cwd() when cwd not provided", () => {
    const healthResponse = {
      platform: "Test",
      version: "1.0.0",
      uptimeMs: 0,
      checks: {},
    };

    const display = buildDiagnosticsReport(healthResponse);
    expect(display.cwd).toBe(process.cwd());
  });
});

// ── redactExport ────────────────────────────────────────────────────────────

describe("redactExport", () => {
  it("redacts API key patterns", () => {
    const input = '{"credentials": "sk-abcdefghij0123456789"}';
    const result = redactExport(input);
    expect(result.redactedFields).toContain("openaiApiKey");
    expect(result.data).not.toContain("sk-abcdefghij0123456789");
    expect(result.data).toContain("****");
  });

  it("redacts secret keyword values", () => {
    const input = "secret=my-super-secret-value-12345";
    const result = redactExport(input);
    expect(result.redactedFields.length).toBeGreaterThanOrEqual(1);
    expect(result.data).not.toContain("my-super-secret-value-12345");
  });

  it("preserves short strings that look like patterns", () => {
    const input = "key=abc";
    const result = redactExport(input);
    expect(result.redactedFields).toHaveLength(0);
  });

  it("deduplicates repeated redacted field labels", () => {
    const input = "api_key=abcdefghijklmnop api_key=1234567890abcdef";
    const result = redactExport(input);
    const apiKeyCount = result.redactedFields.filter((f) => f === "apiKey").length;
    expect(apiKeyCount).toBe(1);
  });

  it("produces ISO timestamp in result", () => {
    const result = redactExport("safe data");
    expect(result.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("handles data with no sensitive patterns", () => {
    const input = "Hello, this is safe data without secrets.";
    const result = redactExport(input);
    expect(result.redactedFields).toHaveLength(0);
    expect(result.data).toBe(input);
  });
});

// ── formatReadinessReport ───────────────────────────────────────────────────

describe("formatReadinessReport", () => {
  it("formats readiness display as text", () => {
    const display = {
      overall: "ready",
      gates: [
        { subsystem: "Core", status: "Ready", passedChecks: 3, totalChecks: 3 },
        { subsystem: "Storage", status: "Ready", passedChecks: 2, totalChecks: 2 },
      ],
    };

    const output = formatReadinessReport(display);
    expect(output).toContain("Overall: ready");
    expect(output).toContain("Core: Ready (3/3)");
    expect(output).toContain("Storage: Ready (2/2)");
  });

  it("includes filtered subsystem when present", () => {
    const display = {
      overall: "ready",
      gates: [{ subsystem: "Core", status: "Ready", passedChecks: 3, totalChecks: 3 }],
      filtered: "core",
    };

    const output = formatReadinessReport(display);
    expect(output).toContain("Filtered subsystem: core");
  });

  it("omits filtered line when not present", () => {
    const display = {
      overall: "ready",
      gates: [{ subsystem: "Core", status: "Ready", passedChecks: 3, totalChecks: 3 }],
    };

    const output = formatReadinessReport(display);
    expect(output).not.toContain("Filtered subsystem");
  });
});

// ── formatDiagnosticsReport ─────────────────────────────────────────────────

describe("formatDiagnosticsReport", () => {
  it("formats diagnostics display as text", () => {
    const display = {
      platform: "The Machine",
      version: "0.1.0",
      cwd: "/test",
      nodeAvailable: true,
      pnpmAvailable: true,
      uptimeMs: 5000,
      checks: { core: true, storage: true },
    };

    const output = formatDiagnosticsReport(display);
    expect(output).toContain("Platform: The Machine");
    expect(output).toContain("Version: 0.1.0");
    expect(output).toContain("Node.js: available");
    expect(output).toContain("pnpm: available");
    expect(output).toContain("diagnostics: ok");
    expect(output).toContain("core: PASS");
    expect(output).toContain("storage: PASS");
  });

  it("reports unavailable dependencies", () => {
    const display = {
      platform: "Test",
      version: "1.0.0",
      cwd: "/test",
      nodeAvailable: false,
      pnpmAvailable: false,
      uptimeMs: 0,
      checks: {},
    };

    const output = formatDiagnosticsReport(display);
    expect(output).toContain("Node.js: unavailable");
    expect(output).toContain("pnpm: unavailable");
  });

  it("omits system checks section when empty", () => {
    const display = {
      platform: "Test",
      version: "1.0.0",
      cwd: "/test",
      nodeAvailable: true,
      pnpmAvailable: true,
      uptimeMs: 0,
      checks: {},
    };

    const output = formatDiagnosticsReport(display);
    expect(output).not.toContain("System checks:");
  });
});

// ── formatRedactedExport ────────────────────────────────────────────────────

describe("formatRedactedExport", () => {
  it("wraps data with export header and footer", () => {
    const result = {
      data: "some content",
      redactedFields: ["apiKey"],
      exportedAt: "2026-06-16T00:00:00.000Z",
    };

    const output = formatRedactedExport(result);
    expect(output).toContain("=== Redacted Export ===");
    expect(output).toContain("=== End Export ===");
    expect(output).toContain("some content");
    expect(output).toContain("Redacted: apiKey");
  });

  it("reports no redacted fields when none found", () => {
    const result = {
      data: "safe content",
      redactedFields: [],
      exportedAt: "2026-06-16T00:00:00.000Z",
    };

    const output = formatRedactedExport(result);
    expect(output).toContain("Redacted: none");
  });
});

// ── formatAsJSON ────────────────────────────────────────────────────────────

describe("formatAsJSON", () => {
  it("formats object as pretty-printed JSON", () => {
    const obj = { overall: "ready", gates: [{ subsystem: "core" }] };
    const output = formatAsJSON(obj);
    expect(() => JSON.parse(output)).not.toThrow();
    const parsed = JSON.parse(output);
    expect(parsed.overall).toBe("ready");
    expect(parsed.gates[0].subsystem).toBe("core");
  });

  it("handles empty objects", () => {
    const output = formatAsJSON({});
    expect(output).toBe("{}");
  });
});
