// Settings UI — provider, MCP, and plugin configuration display.
// Validation, permission denial, and secret-safe form flow.
// Pure data transformations — no side effects, no secrets stored.

import type { ProviderResponse, MCPResponse, PluginResponse } from "@the-machine/service";

// ── Display Types ──────────────────────────────────────────────────────────

export interface SettingsFormField {
  readonly name: string;
  readonly label: string;
  readonly value: string;
  readonly redacted: boolean;
  readonly required: boolean;
  readonly validationErrors: readonly string[];
}

export interface ProviderSettingsDisplay {
  readonly id: string;
  readonly name: string;
  readonly tier: string;
  readonly endpoint: SettingsFormField;
  readonly models: readonly string[];
  readonly timeoutMs: number;
  readonly healthy: boolean;
  readonly hasRedactedFields: boolean;
}

export interface MCPSettingsDisplay {
  readonly id: string;
  readonly name: string;
  readonly transport: string;
  readonly endpoint: SettingsFormField;
  readonly tools: readonly string[];
  readonly toolCount: number;
  readonly healthy: boolean;
}

export interface PluginSettingsDisplay {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly entryPoint: string;
  readonly permissionCount: number;
  readonly enabled: boolean;
}

export interface PermissionDenialDisplay {
  readonly type: "provider" | "mcp" | "plugin";
  readonly name: string;
  readonly reason: string;
  readonly suggestedAction: string;
}

export interface SettingsValidationError {
  readonly field: string;
  readonly message: string;
}

// ── Validation ─────────────────────────────────────────────────────────────

const URL_REGEX = /^https?:\/\/.+/;
const MODEL_REGEX = /^[a-zA-Z0-9_.\-/:]+$/;
const ENDPOINT_PORT_REGEX = /^https?:\/\/[a-zA-Z0-9.-]+(:\d{1,5})?(\/.*)?$/;
const ENTRY_POINT_REGEX = /^[a-zA-Z0-9_./-]+\.(ts|js|mjs|mts)$/;

/**
 * Validate a provider endpoint URL. Returns errors if invalid.
 */
export function validateEndpoint(
  field: string,
  value: string,
  required = true,
): SettingsValidationError[] {
  const errors: SettingsValidationError[] = [];

  if (!value || value.trim().length === 0) {
    if (required) {
      errors.push({ field, message: `${field} is required.` });
    }
    return errors;
  }

  if (!URL_REGEX.test(value)) {
    errors.push({
      field,
      message: `${field} must be a valid URL starting with http:// or https://.`,
    });
  }

  if (!ENDPOINT_PORT_REGEX.test(value)) {
    errors.push({
      field,
      message: `${field} contains invalid characters or port format.`,
    });
  }

  // Check port range if present
  const portMatch = /:(\d{1,5})(?:\/|$)/.exec(value);
  if (portMatch) {
    const port = parseInt(portMatch[1] ?? "", 10);
    if (!Number.isNaN(port) && port > 65535) {
      errors.push({
        field,
        message: `${field} port ${String(port)} exceeds maximum 65535.`,
      });
    }
  }

  return errors;
}

/**
 * Validate MCP transport type. Returns errors if invalid.
 */
export function validateTransportType(field: string, value: string): SettingsValidationError[] {
  const errors: SettingsValidationError[] = [];
  const valid = ["stdio", "sse", "websocket"];

  if (!valid.includes(value)) {
    errors.push({
      field,
      message: `${field} must be one of: ${valid.join(", ")}.`,
    });
  }

  return errors;
}

/**
 * Validate model names list. Returns errors for any invalid names.
 */
export function validateModelNames(models: readonly string[]): SettingsValidationError[] {
  const errors: SettingsValidationError[] = [];

  for (let i = 0; i < models.length; i++) {
    const name = models[i];
    if (name && !MODEL_REGEX.test(name)) {
      errors.push({
        field: `models[${String(i)}]`,
        message: `Model name "${name}" contains invalid characters.`,
      });
    }
  }

  if (models.length === 0) {
    errors.push({
      field: "models",
      message: "At least one model name is required.",
    });
  }

  return errors;
}

/**
 * Validate timeout value. Returns errors if outside valid range.
 */
export function validateTimeout(timeoutMs: number): SettingsValidationError[] {
  const errors: SettingsValidationError[] = [];

  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) {
    errors.push({
      field: "timeoutMs",
      message: "Timeout must be at least 1000 ms.",
    });
  }

  if (timeoutMs > 300000) {
    errors.push({
      field: "timeoutMs",
      message: "Timeout must not exceed 300000 ms (5 minutes).",
    });
  }

  return errors;
}

/**
 * Validate plugin entry point path. Returns errors if invalid.
 */
export function validateEntryPoint(value: string, required = true): SettingsValidationError[] {
  const errors: SettingsValidationError[] = [];

  if (!value || value.trim().length === 0) {
    if (required) {
      errors.push({ field: "entryPoint", message: "Entry point is required." });
    }
    return errors;
  }

  if (!ENTRY_POINT_REGEX.test(value)) {
    errors.push({
      field: "entryPoint",
      message: "Entry point must be a valid script path ending in .ts, .js, .mjs, or .mts.",
    });
  }

  return errors;
}

// ── Secret-Safe Redaction ──────────────────────────────────────────────────

const MASK_CHAR = "*";
const MIN_VISIBLE = 4;
const MIN_REDACT_LENGTH = 6;

/**
 * Redact a sensitive value, showing only the last few characters.
 * Returns the original value unchanged if it is too short to redact meaningfully.
 */
export function redactSecret(value: string): string {
  if (!value || value.length < MIN_REDACT_LENGTH) return value;
  const visibleEnd = value.slice(-MIN_VISIBLE);
  const masked = MASK_CHAR.repeat(Math.max(value.length - MIN_VISIBLE, 0));
  return `${masked}${visibleEnd}`;
}

/**
 * Build a safe form field display, optionally redacting the value.
 */
export function buildFormField(
  name: string,
  label: string,
  value: string,
  required = true,
  isSecret = true,
  errors: readonly string[] = [],
): SettingsFormField {
  return {
    name,
    label,
    value: isSecret ? redactSecret(value) : value,
    redacted: isSecret,
    required,
    validationErrors: errors,
  };
}

// ── Build Settings Display ─────────────────────────────────────────────────

/**
 * Build a provider settings display with secret-safe redaction of the endpoint.
 */
export function buildProviderSettingsDisplay(provider: ProviderResponse): ProviderSettingsDisplay {
  const endpointField = buildFormField("endpoint", "API Endpoint", provider.endpoint, true, true);

  return {
    id: provider.id,
    name: provider.name,
    tier: provider.tier,
    endpoint: endpointField,
    models: [...provider.models],
    timeoutMs: provider.timeoutMs,
    healthy: provider.healthy,
    hasRedactedFields: true,
  };
}

/**
 * Build an MCP server settings display with secret-safe redaction of the endpoint.
 */
export function buildMCPSettingsDisplay(server: MCPResponse): MCPSettingsDisplay {
  const isSecretEndpoint = server.transport !== "stdio";

  const endpointField = buildFormField(
    "endpoint",
    "Server Endpoint",
    server.endpoint,
    true,
    isSecretEndpoint,
  );

  return {
    id: server.id,
    name: server.name,
    transport: server.transport,
    endpoint: endpointField,
    tools: [...server.tools],
    toolCount: server.toolCount,
    healthy: server.healthy,
  };
}

/**
 * Build a plugin settings display.
 */
export function buildPluginSettingsDisplay(plugin: PluginResponse): PluginSettingsDisplay {
  return {
    id: plugin.id,
    name: plugin.name,
    version: plugin.version,
    entryPoint: plugin.entryPoint,
    permissionCount: plugin.permissionCount,
    enabled: plugin.enabled,
  };
}

// ── Permission Denial ──────────────────────────────────────────────────────

/**
 * Build a permission denial display for an entity that was denied access.
 */
export function buildPermissionDenialDisplay(
  type: "provider" | "mcp" | "plugin",
  name: string,
  reason = "Permission denied by security policy.",
  suggestedAction = "Review and approve in workspace settings.",
): PermissionDenialDisplay {
  return { type, name, reason, suggestedAction };
}

/**
 * Derive permission denial from provider health state.
 * A healthy provider is permitted; an unhealthy one may indicate a permission issue.
 */
export function deriveProviderPermission(
  provider: ProviderResponse,
): PermissionDenialDisplay | null {
  if (!provider.healthy) {
    return buildPermissionDenialDisplay(
      "provider",
      provider.name,
      `Provider "${provider.name}" is unhealthy or unreachable.`,
      "Check the endpoint URL and ensure the API key is configured correctly.",
    );
  }
  return null;
}

/**
 * Derive permission denial from MCP server health state.
 */
export function deriveMCPPermission(server: MCPResponse): PermissionDenialDisplay | null {
  if (!server.healthy) {
    return buildPermissionDenialDisplay(
      "mcp",
      server.name,
      `MCP server "${server.name}" is unhealthy. Tools may not be available.`,
      "Verify the transport endpoint and restart the MCP server if needed.",
    );
  }
  return null;
}

/**
 * Derive permission denial from plugin enabled state.
 */
export function derivePluginPermission(plugin: PluginResponse): PermissionDenialDisplay | null {
  if (!plugin.enabled) {
    return buildPermissionDenialDisplay(
      "plugin",
      plugin.name,
      `Plugin "${plugin.name}" is disabled.`,
      "Enable the plugin in workspace settings and grant required permissions.",
    );
  }
  return null;
}

// ── Format for Terminal/Text Output ────────────────────────────────────────

/**
 * Format a form field for display, showing redaction state.
 */
export function formatFormField(field: SettingsFormField): string {
  const required = field.required ? " (required)" : "";
  const redactedLabel = field.redacted ? " [redacted]" : "";
  const val = field.redacted ? field.value : field.value;
  const errors =
    field.validationErrors.length > 0 ? `\n    Errors: ${field.validationErrors.join("; ")}` : "";
  return `  ${field.label}: ${val}${redactedLabel}${required}${errors}`;
}

/**
 * Format a provider settings display for terminal output.
 */
export function formatProviderSettings(display: ProviderSettingsDisplay): string {
  const lines: string[] = [];
  lines.push(`Provider: ${display.name} (${display.tier})`);
  lines.push(formatFormField(display.endpoint));
  lines.push(`  Models: ${display.models.join(", ")}`);
  lines.push(`  Timeout: ${String(display.timeoutMs)} ms`);
  lines.push(`  Health: ${display.healthy ? "OK" : "UNHEALTHY"}`);
  return lines.join("\n");
}

/**
 * Format an MCP server settings display for terminal output.
 */
export function formatMCPSettings(display: MCPSettingsDisplay): string {
  const lines: string[] = [];
  lines.push(`MCP Server: ${display.name}`);
  lines.push(`  Transport: ${display.transport}`);
  lines.push(formatFormField(display.endpoint));
  lines.push(`  Tools (${String(display.toolCount)}): ${display.tools.join(", ")}`);
  lines.push(`  Health: ${display.healthy ? "OK" : "UNHEALTHY"}`);
  return lines.join("\n");
}

/**
 * Format a plugin settings display for terminal output.
 */
export function formatPluginSettings(display: PluginSettingsDisplay): string {
  const lines: string[] = [];
  lines.push(`Plugin: ${display.name} v${display.version}`);
  lines.push(`  Entry Point: ${display.entryPoint}`);
  lines.push(`  Permissions: ${String(display.permissionCount)}`);
  lines.push(`  Status: ${display.enabled ? "Enabled" : "Disabled"}`);
  return lines.join("\n");
}

/**
 * Format a permission denial display for terminal output.
 */
export function formatPermissionDenial(denial: PermissionDenialDisplay): string {
  const lines: string[] = [];
  lines.push(`[DENIED] ${denial.type.toUpperCase()}: ${denial.name}`);
  lines.push(`  Reason: ${denial.reason}`);
  lines.push(`  Suggested: ${denial.suggestedAction}`);
  return lines.join("\n");
}
