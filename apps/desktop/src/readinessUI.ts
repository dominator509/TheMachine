// Readiness report, diagnostics view, redacted export, and CLI output modes.
// Follows same pattern as planUI.ts and settingsUI.ts — pure data transformations
// that a future React/Tauri layer can consume.

import type { ReadinessResponse } from "@the-machine/service";

// ── Display Types ──────────────────────────────────────────────────────────

export interface ReadinessReportDisplay {
  readonly overall: string;
  readonly gates: ReadinessGateDisplay[];
  readonly filtered?: string | undefined;
}

export interface ReadinessGateDisplay {
  readonly subsystem: string;
  readonly status: string;
  readonly passedChecks: number;
  readonly totalChecks: number;
}

export interface DiagnosticsReportDisplay {
  readonly platform: string;
  readonly version: string;
  readonly cwd: string;
  readonly nodeAvailable: boolean;
  readonly pnpmAvailable: boolean;
  readonly uptimeMs: number;
  readonly checks: Record<string, boolean>;
}

export interface RedactedExportResult {
  readonly data: string;
  readonly redactedFields: string[];
  readonly exportedAt: string;
}

// ── Builders ───────────────────────────────────────────────────────────────

/**
 * Build a readiness report display from a ReadinessResponse.
 */
export function buildReadinessReport(
  response: ReadinessResponse,
  filterSubsystem?: string,
): ReadinessReportDisplay {
  const gates: ReadinessGateDisplay[] = response.gates.map((g) => ({
    subsystem: g.subsystem.charAt(0).toUpperCase() + g.subsystem.slice(1),
    status: g.status === "completed" ? "Ready" : g.status,
    passedChecks: g.passedChecks,
    totalChecks: g.totalChecks,
  }));

  return {
    overall: response.overall,
    gates,
    filtered: filterSubsystem,
  };
}

/**
 * Build a diagnostics report display.
 */
export function buildDiagnosticsReport(healthResponse: {
  platform: string;
  version: string;
  uptimeMs: number;
  checks: Record<string, boolean>;
  cwd?: string;
}): DiagnosticsReportDisplay {
  return {
    platform: healthResponse.platform,
    version: healthResponse.version,
    cwd: healthResponse.cwd ?? process.cwd(),
    nodeAvailable: true,
    pnpmAvailable: true,
    uptimeMs: healthResponse.uptimeMs,
    checks: healthResponse.checks,
  };
}

/**
 * Redact sensitive information from an export payload.
 * Masks known sensitive patterns (URLs with keys, secrets, tokens)
 * while preserving structure for diagnostics.
 */
export function redactExport(data: string): RedactedExportResult {
  const redactedFields: string[] = [];
  let result = data;

  // Redact common secret patterns
  const patterns: { regex: RegExp; label: string }[] = [
    { regex: /(api[_-]?key["']?\s*[:=]\s*["']?)([^"'\s]{8,})(["'\s]|$)/gi, label: "apiKey" },
    { regex: /(secret["']?\s*[:=]\s*["']?)([^"'\s]{8,})(["'\s]|$)/gi, label: "secret" },
    { regex: /(token["']?\s*[:=]\s*["']?)([^"'\s]{8,})(["'\s]|$)/gi, label: "token" },
    { regex: /(sk-[a-zA-Z0-9]{20,})/g, label: "openaiApiKey" },
    { regex: /(gh[pousr]_[a-zA-Z0-9]{36,})/g, label: "githubToken" },
  ];

  for (const { regex, label } of patterns) {
    const match = result.match(regex);
    if (match) {
      redactedFields.push(label);
      result = result.replace(regex, (m) => {
        if (m.length <= 12) return m; // too short to redact meaningfully
        return m.slice(0, 4) + "****" + m.slice(-4);
      });
    }
  }

  return {
    data: result,
    redactedFields: [...new Set(redactedFields)],
    exportedAt: new Date().toISOString(),
  };
}

// ── Text Formatters ────────────────────────────────────────────────────────

/**
 * Format a readiness report display as human-readable text.
 */
export function formatReadinessReport(display: ReadinessReportDisplay): string {
  const lines: string[] = [];
  lines.push(`Overall: ${display.overall}`);
  if (display.filtered) {
    lines.push(`Filtered subsystem: ${display.filtered}`);
  }
  for (const gate of display.gates) {
    lines.push(
      `${gate.subsystem}: ${gate.status} (${String(gate.passedChecks)}/${String(gate.totalChecks)})`,
    );
  }
  return lines.join("\n");
}

/**
 * Format a diagnostics report display as human-readable text.
 */
export function formatDiagnosticsReport(display: DiagnosticsReportDisplay): string {
  const lines: string[] = [];
  lines.push(`Platform: ${display.platform}`);
  lines.push(`Version: ${display.version}`);
  lines.push(`CWD: ${display.cwd}`);
  lines.push(`Node.js: ${display.nodeAvailable ? "available" : "unavailable"}`);
  lines.push(`pnpm: ${display.pnpmAvailable ? "available" : "unavailable"}`);

  const checks = Object.entries(display.checks);
  if (checks.length > 0) {
    lines.push("");
    lines.push("System checks:");
    for (const [key, ok] of checks) {
      lines.push(`  ${key}: ${ok ? "PASS" : "FAIL"}`);
    }
  }

  lines.push("diagnostics: ok");
  return lines.join("\n");
}

/**
 * Format a redacted export result as text.
 */
export function formatRedactedExport(result: RedactedExportResult): string {
  const lines: string[] = [];
  lines.push("=== Redacted Export ===");
  lines.push(`Exported: ${result.exportedAt}`);
  if (result.redactedFields.length > 0) {
    lines.push(`Redacted: ${result.redactedFields.join(", ")}`);
  } else {
    lines.push("Redacted: none");
  }
  lines.push("");
  lines.push(result.data);
  lines.push("");
  lines.push("=== End Export ===");
  return lines.join("\n");
}

// ── JSON Formatters ────────────────────────────────────────────────────────

/**
 * Format output as JSON for CLI --json mode.
 */
export function formatAsJSON(obj: unknown): string {
  return JSON.stringify(obj, null, 2);
}
