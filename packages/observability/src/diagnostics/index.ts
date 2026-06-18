// Diagnostic bundle export — collects logs, events, version, config, and system info.
// All sensitive data is redacted via @the-machine/security before output.

import { redactText } from "@the-machine/security";

// ── Types ───────────────────────────────────────────────────────────────────

export interface DiagnosticConfig {
  readonly platform: string;
  readonly version: string;
  readonly startTime: number;
  readonly nodeVersion: string;
  readonly platformArch: string;
  readonly osInfo: string;
  readonly providerCount?: number;
  readonly mcpServerCount?: number;
  readonly pluginCount?: number;
}

export interface DiagnosticBundleSection {
  readonly label: string;
  readonly data: Record<string, unknown>;
  readonly redacted: boolean;
}

export interface DiagnosticBundle {
  readonly generatedAt: string;
  readonly platform: string;
  readonly version: string;
  readonly uptimeMs: number;
  readonly nodeVersion: string;
  readonly platformArch: string;
  readonly osInfo: string;
  readonly redactionApplied: boolean;
  readonly sections: DiagnosticBundleSection[];
}

// ── Redaction helpers ────────────────────────────────────────────────────────

const SENSITIVE_KEYS = new Set<string>([
  "api_key",
  "apiKey",
  "apikey",
  "token",
  "secret",
  "password",
  "credential",
  "authorization",
  "auth_header",
  "private_key",
  "privateKey",
  "mcp_credential",
  "plugin_secret",
]);

function shouldRedactValue(key: string): boolean {
  return SENSITIVE_KEYS.has(key);
}

function redactRecord(
  record: Record<string, unknown>,
  depth = 0,
): { redacted: Record<string, unknown>; applied: boolean } {
  if (depth > 5) return { redacted: record, applied: false };
  let applied = false;
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (shouldRedactValue(key) && typeof value === "string") {
      const r = redactText(value);
      if (r.matchedPatterns.length > 0) {
        applied = true;
        result[key] = r.redacted;
      } else {
        // Even if no known pattern matched, mask the value entirely
        applied = true;
        result[key] = "[REDACTED]";
      }
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const nested = redactRecord(value as Record<string, unknown>, depth + 1);
      if (nested.applied) applied = true;
      result[key] = nested.redacted;
    } else if (Array.isArray(value)) {
      result[key] = value.map((item: unknown): unknown => {
        if (item !== null && typeof item === "object") {
          const nested = redactRecord(item as Record<string, unknown>, depth + 1);
          if (nested.applied) applied = true;
          return nested.redacted;
        }
        // Redact strings in arrays that look like secrets
        if (typeof item === "string") {
          const r = redactText(item);
          if (r.matchedPatterns.length > 0) {
            applied = true;
            return r.redacted;
          }
        }
        return item;
      });
    } else if (typeof value === "string") {
      // Check plain strings for secret patterns
      const r = redactText(value);
      if (r.matchedPatterns.length > 0) {
        applied = true;
        result[key] = r.redacted;
      } else {
        result[key] = value;
      }
    } else {
      result[key] = value;
    }
  }

  return { redacted: result, applied };
}

// ── Bundle Factory ──────────────────────────────────────────────────────────

export function createDiagnosticBundle(config: DiagnosticConfig): DiagnosticBundle {
  const uptimeMs = Date.now() - config.startTime;

  const sections: DiagnosticBundleSection[] = [];

  // System info section
  const systemSection: DiagnosticBundleSection = {
    label: "system",
    data: {
      nodeVersion: config.nodeVersion,
      platformArch: config.platformArch,
      osInfo: config.osInfo,
    },
    redacted: false,
  };
  sections.push(systemSection);

  // Version info
  const versionSection: DiagnosticBundleSection = {
    label: "version",
    data: {
      platform: config.platform,
      version: config.version,
      uptimeMs,
      generatedAt: new Date().toISOString(),
    },
    redacted: false,
  };
  sections.push(versionSection);

  // Profile counts
  const profileSection: DiagnosticBundleSection = {
    label: "profiles",
    data: {
      providerCount: config.providerCount ?? 0,
      mcpServerCount: config.mcpServerCount ?? 0,
      pluginCount: config.pluginCount ?? 0,
    },
    redacted: false,
  };
  sections.push(profileSection);

  // Redact the full bundle
  let bundleApplied = false;
  const redactedSections: DiagnosticBundleSection[] = sections.map((section) => {
    const { redacted, applied } = redactRecord(section.data);
    if (applied) bundleApplied = true;
    return { ...section, data: redacted, redacted: applied };
  });

  return {
    generatedAt: new Date().toISOString(),
    platform: config.platform,
    version: config.version,
    uptimeMs,
    nodeVersion: config.nodeVersion,
    platformArch: config.platformArch,
    osInfo: config.osInfo,
    redactionApplied: bundleApplied,
    sections: redactedSections,
  };
}

// ── Raw Data Export (primarily for testing / direct use) ────────────────────

export function exportDiagnosticBundle(
  config: DiagnosticConfig,
  extraData?: Record<string, unknown>,
): DiagnosticBundle {
  const bundle = createDiagnosticBundle(config);

  if (extraData && Object.keys(extraData).length > 0) {
    const { redacted, applied } = redactRecord(extraData);
    bundle.sections.push({
      label: "extra",
      data: redacted,
      redacted: applied,
    });
    return {
      ...bundle,
      redactionApplied: applied ? true : bundle.redactionApplied,
      sections: bundle.sections,
    };
  }

  return bundle;
}
