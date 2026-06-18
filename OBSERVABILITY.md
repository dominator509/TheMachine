# OBSERVABILITY.md

## Implemented Overview

Observability is implemented in `@the-machine/observability` (`packages/observability/`) with four modules: structured logging with redaction, runtime events, health checks, and diagnostic export.

## Logging Strategy

Structured JSON-line logs via stdout/stderr with automatic redaction of sensitive fields.

## Structured Log Fields

| Field               | Type                               | Description                   |
| ------------------- | ---------------------------------- | ----------------------------- |
| `timestamp`         | ISO string                         | When the entry was created    |
| `level`             | `"debug"\|"info"\|"warn"\|"error"` | Severity                      |
| `event`             | string                             | Event name                    |
| `run_id`            | string (optional)                  | Active run identifier         |
| `workspace_id`      | string (optional)                  | Workspace identifier          |
| `repository_id`     | string (optional)                  | Repository identifier         |
| `execplan_path`     | string (optional)                  | ExecPlan file path            |
| `milestone_id`      | string (optional)                  | Milestone identifier          |
| `command`           | string (optional)                  | Command string                |
| `duration_ms`       | number (optional)                  | Duration in milliseconds      |
| `status`            | string (optional)                  | Status value                  |
| `error_code`        | string (optional)                  | Error code                    |
| `provider_id`       | string (optional)                  | Provider identifier           |
| `mcp_server_id`     | string (optional)                  | MCP server identifier         |
| `plugin_id`         | string (optional)                  | Plugin identifier             |
| `redaction_applied` | boolean                            | Whether redaction was applied |

## Redaction Rules

Sensitive fields (`command`, `status`, `event`) are redacted via `@the-machine/security` before output. Logged strings matching known secret patterns (API keys, tokens, passwords, private keys, authorization headers, secret env vars, MCP credentials, plugin secrets) are masked in the output. The `redaction_applied` field indicates whether any redaction occurred on the entry.

## Runtime Events (In-Memory)

Six event types are recorded by the in-memory `EventRecorder`:

- **run** — Agent run lifecycle (started, completed, failed, stopped)
- **milestone** — Milestone lifecycle (started, completed, failed, skipped)
- **command** — Command execution with exit code and duration
- **provider** — Provider (LLM) call with model, duration, success
- **mcp** — MCP tool invocation with duration and success
- **plugin** — Plugin action with duration and success

EventRecorder supports: `record()`, `query(filter)`, `types()`, `clear()`, `count()`.
Events are in-memory only — SQLite persistence is deferred to a future ExecPlan.

## Health Checks

`performHealthChecks()` checks seven subsystems:

| Subsystem | Optional        | Default  |
| --------- | --------------- | -------- |
| core      | No              | ok       |
| service   | No              | ok       |
| storage   | Yes (no logDir) | disabled |
| commands  | No              | ok       |
| providers | Yes (count=0)   | disabled |
| mcp       | Yes (count=0)   | disabled |
| plugins   | Yes (count=0)   | disabled |

Aggregate status: `"ok"` (all ok), `"degraded"` (some degraded), `"down"` (any error).
Optional dependencies report `"disabled"` instead of failing.

## Diagnostic Export

`createDiagnosticBundle()` and `exportDiagnosticBundle()` produce a redacted JSON bundle with sections:

- **system** — nodeVersion, platformArch, osInfo
- **version** — platform, version, uptimeMs, generatedAt
- **profiles** — providerCount, mcpServerCount, pluginCount
- **extra** — optional extra data passed by caller

All sections are redacted via `@the-machine/security` recursive record redaction. The `redactionApplied` flag indicates whether any sensitive data was found and masked. Non-sensitive data passes through unredacted.

## Traces (Future)

Optional nested spans (Run -> Milestone -> Provider/MCP/plugin/command/validation) are not yet implemented. Trace IDs not yet wired into logs/events.

## Uptime Checks (Future)

No remote uptime checks in local v1. Startup health is required.

## Dashboards (Future)

GUI dashboard for active run, validation results, provider/MCP/plugin health, retry budget, STOP history, and readiness status is not yet implemented.

## Alerts (Future)

Local alerts via GUI banner, CLI nonzero exit, run event, and persisted incident flag are not yet implemented.

## Service-Level Indicators (Future)

SLIs for CLI startup success, service health, repository discovery duration, validation command success rate, run completion rate, STOP rate, and crash-free run rate are aspirational and not yet instrumented.

## Service-Level Objectives (Future)

Initial SLO targets (health under 500 ms, small repo discovery under 5 s, no critical security findings at release) are documented but not enforced by automated gates.

## Debugging Production Issues

Export redacted diagnostics (`CLI diagnostics`), identify run ID from event history, review STOP/retry events in the event store, inspect command output. Reproduce in staging if possible. Add regression test or runbook update.

## Observability Acceptance Criteria

- [x] Structured logs with redaction
- [x] Redaction tests pass
- [x] Health checks (7 subsystems)
- [x] Run events (6 types, in-memory)
- [x] Command results recorded as events
- [x] Provider/MCP/plugin events
- [x] Diagnostic export with redaction
- [ ] Recent failures visible in GUI/CLI (deferred)
- [ ] Event persistence to SQLite (deferred)
