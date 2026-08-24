import { test, expect } from "@playwright/test";
import {
  buildMilestoneDisplay,
  buildPlanStatusDisplay,
  formatPlanStatus,
} from "../../apps/desktop/src/planUI.js";

test("plan UI milestone list formats correctly", () => {
  const plan = {
    id: "ep-005" as any,
    title: "EP-005 User Interface",
    status: "active" as const,
    priority: 5 as any,
    milestoneCount: 6,
    completedMilestones: 3,
    currentMilestone: "M3",
  };

  const display = buildPlanStatusDisplay(plan, []);
  expect(display.progressPercent).toBe(50);
  expect(display.milestones).toHaveLength(6);
  expect(display.milestones[0].status).toBe("completed");
  expect(display.milestones[3].status).toBe("active");
  expect(display.milestones[5].status).toBe("pending");

  const output = formatPlanStatus(display);
  expect(output).toContain("EP-005 User Interface");
  expect(output).toContain("50%");
});

test("plan UI detects stopped state", () => {
  const plan = {
    id: "ep-001" as any,
    title: "Stopped Foundation",
    status: "stopped" as const,
    priority: 1 as any,
    milestoneCount: 5,
    completedMilestones: 2,
    currentMilestone: null,
  };

  const display = buildPlanStatusDisplay(plan, []);
  expect(display.isStopped).toBe(true);
  expect(display.isCompleted).toBe(false);

  const output = formatPlanStatus(display);
  expect(output).toContain("STOP Condition");
});

test("plan UI detects running state", () => {
  const plan = {
    id: "ep-005" as any,
    title: "Running Plan",
    status: "active" as const,
    priority: 5 as any,
    milestoneCount: 4,
    completedMilestones: 1,
    currentMilestone: "M1",
  };

  const activeRun = {
    id: "r-1" as any,
    execPlanId: "ep-005" as any,
    milestoneId: null,
    status: "active" as const,
    commandCount: 3,
    validationCount: 1,
  };

  const display = buildPlanStatusDisplay(plan, [activeRun]);
  expect(display.isRunning).toBe(true);

  const output = formatPlanStatus(display);
  expect(output).toContain("Running: Yes");
});

// ── Settings UI E2E Tests ─────────────────────────────────────────────────

import {
  buildProviderSettingsDisplay,
  buildMCPSettingsDisplay,
  buildPluginSettingsDisplay,
  redactSecret,
  validateEndpoint,
  deriveProviderPermission,
  buildPermissionDenialDisplay,
  formatProviderSettings,
  formatPermissionDenial,
} from "../../apps/desktop/src/settingsUI.js";

test("settings UI redacts provider endpoint", () => {
  const provider = {
    id: "p-1" as any,
    name: "OpenAI",
    tier: "cloud" as any,
    endpoint: "https://api.openai.com/v1",
    models: ["gpt-4"],
    timeoutMs: 30000,
    healthy: true,
  };

  const display = buildProviderSettingsDisplay(provider);
  expect(display.name).toBe("OpenAI");
  expect(display.endpoint.value).not.toContain("api.openai.com");
  expect(display.endpoint.redacted).toBe(true);
});

test("settings UI validates endpoint URL", () => {
  const errors = validateEndpoint("endpoint", "not-a-url");
  expect(errors.length).toBeGreaterThanOrEqual(1);
});

test("settings UI derives permission denial", () => {
  const provider = {
    id: "p-1" as any,
    name: "OpenAI",
    tier: "cloud" as any,
    endpoint: "https://api.openai.com/v1",
    models: ["gpt-4"],
    timeoutMs: 30000,
    healthy: false,
  };

  const denial = deriveProviderPermission(provider);
  expect(denial).not.toBeNull();
  expect(denial!.type).toBe("provider");
});

test("settings UI formats provider settings for display", () => {
  const provider = {
    id: "p-1" as any,
    name: "OpenAI",
    tier: "cloud" as any,
    endpoint: "https://api.openai.com/v1",
    models: ["gpt-4"],
    timeoutMs: 30000,
    healthy: true,
  };

  const display = buildProviderSettingsDisplay(provider);
  const output = formatProviderSettings(display);
  expect(output).toContain("OpenAI");
  expect(output).toContain("cloud");
  expect(output).toContain("OK");
});

test("settings UI redacts API key", () => {
  const key = "sk-abc...nopq";
  const redacted = redactSecret(key);
  expect(redacted).not.toContain("abc...");
  expect(redacted).toContain("pq");
  expect(redacted.length).toBe(key.length);
});

// ── Readiness UI E2E Tests ────────────────────────────────────────────────

import {
  buildReadinessReport,
  formatReadinessReport,
  buildDiagnosticsReport,
  formatDiagnosticsReport,
  formatRedactedExport,
  redactExport,
} from "../../apps/desktop/src/readinessUI.js";

test("readiness UI builds report from response", () => {
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
});

test("readiness UI handles degraded state", () => {
  const response = {
    workspaceId: "default" as any,
    overall: "degraded" as const,
    gates: [{ subsystem: "core", status: "completed" as const, passedChecks: 2, totalChecks: 3 }],
  };
  const display = buildReadinessReport(response);
  expect(display.overall).toBe("degraded");
  expect(display.gates[0].passedChecks).toBe(2);
  expect(display.gates[0].totalChecks).toBe(3);
});

test("readiness UI formats report with gates", () => {
  const display = {
    overall: "ready",
    gates: [{ subsystem: "Core", status: "Ready", passedChecks: 3, totalChecks: 3 }],
  };
  const output = formatReadinessReport(display);
  expect(output).toContain("Overall: ready");
  expect(output).toContain("Core: Ready (3/3)");
});

test("readiness UI builds diagnostics report", () => {
  const health = {
    platform: "The Machine",
    version: "0.1.0",
    uptimeMs: 12345,
    checks: { core: true, storage: true },
    cwd: "/test/path",
  };
  const display = buildDiagnosticsReport(health);
  expect(display.platform).toBe("The Machine");
  expect(display.nodeAvailable).toBe(true);
  expect(display.pnpmAvailable).toBe(true);
});

test("readiness UI formats diagnostics with PASS/FAIL", () => {
  const display = {
    platform: "The Machine",
    version: "0.1.0",
    cwd: "/test",
    nodeAvailable: true,
    pnpmAvailable: true,
    uptimeMs: 5000,
    checks: { core: true, storage: false },
  };
  const output = formatDiagnosticsReport(display);
  expect(output).toContain("core: PASS");
  expect(output).toContain("storage: FAIL");
});

test("redact export redacts API keys and timestamps", () => {
  const result = redactExport("sk-test123def456ghi789jklmnopqrs");
  expect(result.redactedFields).toContain("openaiApiKey");
  expect(result.data).not.toContain("sk-test123def456ghi789jklmnopqrs");
  expect(result.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
});

test("redact export preserves safe data", () => {
  const result = redactExport("Hello, this is safe.");
  expect(result.redactedFields).toHaveLength(0);
  expect(result.data).toBe("Hello, this is safe.");
});

test("format redacted export wraps with header and footer", () => {
  const result = {
    data: "some content",
    redactedFields: ["apiKey"],
    exportedAt: "2026-06-16T00:00:00.000Z",
  };
  const output = formatRedactedExport(result);
  expect(output).toContain("=== Redacted Export ===");
  expect(output).toContain("=== End Export ===");
  expect(output).toContain("Redacted: apiKey");
});
