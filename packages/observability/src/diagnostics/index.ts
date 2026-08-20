// Diagnostic bundle export — collects logs, events, version, config, and system info.
// All sensitive data is redacted via @the-machine/security before output.

import { redactText } from "@the-machine/security";

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

const MAX_DEPTH = 20;
const MAX_NODES = 10_000;
const MAX_ARRAY_ITEMS = 1_000;
const MAX_OBJECT_KEYS = 1_000;
const MAX_STRING_LENGTH = 65_536;
const SENSITIVE_KEY_PATTERN =
  /(?:api.?key|token|secret|password|credential|authorization|auth.?header|private.?key|seed.?phrase|mcp.?credential|plugin.?secret)/i;

interface RedactionState {
  nodes: number;
  applied: boolean;
  readonly seen: WeakSet<object>;
}

function redactString(value: string, state: RedactionState): string {
  const bounded =
    value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}[TRUNCATED:STRING]`
      : value;
  if (bounded !== value) state.applied = true;
  const result = redactText(bounded);
  if (result.matchedPatterns.length > 0) state.applied = true;
  return result.redacted;
}

function redactValue(
  value: unknown,
  state: RedactionState,
  depth: number,
  key: string | null,
): unknown {
  if (key !== null && SENSITIVE_KEY_PATTERN.test(key)) {
    state.applied = true;
    return "[REDACTED]";
  }
  if (typeof value === "string") return redactString(value, state);
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) {
    state.applied = true;
    return "[TRUNCATED:DEPTH]";
  }
  state.nodes += 1;
  if (state.nodes > MAX_NODES) {
    state.applied = true;
    return "[TRUNCATED:NODES]";
  }
  if (state.seen.has(value)) {
    state.applied = true;
    return "[CIRCULAR]";
  }
  state.seen.add(value);

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => redactValue(item, state, depth + 1, null));
    if (value.length > MAX_ARRAY_ITEMS) {
      items.push(`[TRUNCATED:${String(value.length - MAX_ARRAY_ITEMS)}_ITEMS]`);
      state.applied = true;
    }
    return items;
  }

  const result: Record<string, unknown> = {};
  const entries = Object.entries(value as Record<string, unknown>);
  for (const [entryKey, entryValue] of entries.slice(0, MAX_OBJECT_KEYS)) {
    result[entryKey] = redactValue(entryValue, state, depth + 1, entryKey);
  }
  if (entries.length > MAX_OBJECT_KEYS) {
    result["__truncatedKeys"] = entries.length - MAX_OBJECT_KEYS;
    state.applied = true;
  }
  return result;
}

function redactRecord(record: Record<string, unknown>): {
  redacted: Record<string, unknown>;
  applied: boolean;
} {
  const state: RedactionState = { nodes: 0, applied: false, seen: new WeakSet<object>() };
  const redacted = redactValue(record, state, 0, null);
  return {
    redacted:
      redacted !== null && typeof redacted === "object" && !Array.isArray(redacted)
        ? (redacted as Record<string, unknown>)
        : { value: redacted },
    applied: state.applied,
  };
}

export function createDiagnosticBundle(config: DiagnosticConfig): DiagnosticBundle {
  const uptimeMs = Date.now() - config.startTime;
  const sections: DiagnosticBundleSection[] = [
    {
      label: "system",
      data: {
        nodeVersion: config.nodeVersion,
        platformArch: config.platformArch,
        osInfo: config.osInfo,
      },
      redacted: false,
    },
    {
      label: "version",
      data: {
        platform: config.platform,
        version: config.version,
        uptimeMs,
        generatedAt: new Date().toISOString(),
      },
      redacted: false,
    },
    {
      label: "profiles",
      data: {
        providerCount: config.providerCount ?? 0,
        mcpServerCount: config.mcpServerCount ?? 0,
        pluginCount: config.pluginCount ?? 0,
      },
      redacted: false,
    },
  ];

  let bundleApplied = false;
  const redactedSections = sections.map((section) => {
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

export function exportDiagnosticBundle(
  config: DiagnosticConfig,
  extraData?: Record<string, unknown>,
): DiagnosticBundle {
  const bundle = createDiagnosticBundle(config);
  if (!extraData || Object.keys(extraData).length === 0) return bundle;

  const { redacted, applied } = redactRecord(extraData);
  const sections = [
    ...bundle.sections,
    {
      label: "extra",
      data: redacted,
      redacted: applied,
    },
  ];
  return {
    ...bundle,
    redactionApplied: applied || bundle.redactionApplied,
    sections,
  };
}
