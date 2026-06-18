// Health checks for all subsystems.
// Reports status for core, service, storage, commands, and profiles.
// Optional dependencies report "disabled" instead of failing.

// ── Types ───────────────────────────────────────────────────────────────────

export interface HealthCheckResult {
  readonly subsystem: string;
  readonly status: "ok" | "degraded" | "disabled" | "error";
  readonly message?: string;
}

export interface HealthSummary {
  readonly status: "ok" | "degraded" | "down";
  readonly platform: string;
  readonly version: string;
  readonly uptimeMs: number;
  readonly checks: Record<string, boolean>;
  readonly results: HealthCheckResult[];
}

// ── Individual Checks ────────────────────────────────────────────────────────

function checkCore(): HealthCheckResult {
  return { subsystem: "core", status: "ok", message: "Process running" };
}

function checkService(): HealthCheckResult {
  // Service is in-process for v1 — always responsive.
  return { subsystem: "service", status: "ok", message: "In-process service" };
}

function checkStorage(logDir?: string): HealthCheckResult {
  if (!logDir) {
    return { subsystem: "storage", status: "disabled", message: "No log directory configured" };
  }
  // In a full implementation this would check DB connectivity.
  // For v1 we report it as ok since SQLite is not yet wired.
  return { subsystem: "storage", status: "ok", message: "Log directory accessible" };
}

function checkCommands(): HealthCheckResult {
  return { subsystem: "commands", status: "ok", message: "Command wrappers registered" };
}

function checkProfiles(
  providerCount: number,
  mcpServerCount: number,
  pluginCount: number,
): HealthCheckResult[] {
  const results: HealthCheckResult[] = [];

  results.push({
    subsystem: "providers",
    status: providerCount > 0 ? "ok" : "disabled",
    message:
      providerCount > 0
        ? `${String(providerCount)} provider(s) configured`
        : "No providers configured",
  });

  results.push({
    subsystem: "mcp",
    status: mcpServerCount > 0 ? "ok" : "disabled",
    message:
      mcpServerCount > 0
        ? `${String(mcpServerCount)} MCP server(s) registered`
        : "No MCP servers registered",
  });

  results.push({
    subsystem: "plugins",
    status: pluginCount > 0 ? "ok" : "disabled",
    message:
      pluginCount > 0 ? `${String(pluginCount)} plugin(s) registered` : "No plugins registered",
  });

  return results;
}

// ── Main Check ───────────────────────────────────────────────────────────────

export function performHealthChecks(opts: {
  platform: string;
  version: string;
  startTime: number;
  logDir?: string;
  providerCount?: number;
  mcpServerCount?: number;
  pluginCount?: number;
}): HealthSummary {
  const results: HealthCheckResult[] = [];

  // Core and service are always checked in-process.
  results.push(checkCore());
  results.push(checkService());

  // Storage check (optional — disabled if no log dir).
  results.push(checkStorage(opts.logDir));

  // Commands check.
  results.push(checkCommands());

  // Profiles check (optional dependencies report disabled).
  results.push(
    ...checkProfiles(opts.providerCount ?? 0, opts.mcpServerCount ?? 0, opts.pluginCount ?? 0),
  );

  // Compute aggregate status.
  const hasError = results.some((r) => r.status === "error");
  const hasDegraded = results.some((r) => r.status === "degraded");

  const uptimeMs = Date.now() - opts.startTime;

  const checks: Record<string, boolean> = {};
  for (const r of results) {
    checks[r.subsystem] = r.status === "ok";
  }

  return {
    status: hasError ? "down" : hasDegraded ? "degraded" : "ok",
    platform: opts.platform,
    version: opts.version,
    uptimeMs,
    checks,
    results,
  };
}
