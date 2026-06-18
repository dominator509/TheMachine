# OPERATIONS.md

## Local Operations

Operate through GUI, CLI, local service, SQLite, provider profiles, MCP registry, and plugin directory. Routine tasks include repository discovery, ExecPlan execution, validation review, provider/MCP/plugin setup, report export, and database backup.

## Staging Operations

Install release candidate in clean profile/VM, run smoke tests, run readiness check, verify rollback package, verify logs and health.

## Production Operations

Production is user-installed PC app. Keep provider keys secure, review permission prompts, keep rollback installer, export redacted diagnostics for support.

## Health Checks

The Machine's health subsystem (`@the-machine/observability` — `performHealthChecks()`) checks:

- **Core** — process running
- **Service** — in-process service responsive
- **Storage** — log directory accessible (disabled if not configured)
- **Commands** — command wrappers registered
- **Providers** — provider profiles (disabled if none configured)
- **MCP** — MCP server registrations (disabled if none configured)
- **Plugins** — plugin registrations (disabled if none configured)

Aggregate status: `ok` (all healthy), `degraded` (some non-critical checks degraded), `down` (any critical check failed). Optional dependencies report `"disabled"` instead of failing.

Run `CLI health` for a quick status, or `CLI readiness` for the full production-readiness report.

## Event System

The in-memory EventRecorder captures six event types: run, milestone, command, provider, MCP, and plugin events. Events can be queried by type, run_id, status, or time range. Event persistence to SQLite is deferred to a future ExecPlan.

## Diagnostic Export

Export a redacted diagnostic bundle with `CLI diagnostics`. The bundle includes system info (Node version, platform), version info (platform, version, uptime), profile counts (providers, MCP servers, plugins), and optional extra data. All sensitive data is redacted automatically via `@the-machine/security` before output.

## Common Failure Modes

| Failure                    | Detection                        | Recovery                                   |
| -------------------------- | -------------------------------- | ------------------------------------------ |
| Provider key missing       | Provider health reports disabled | Configure provider or disable it.          |
| MCP unavailable            | MCP health reports disabled      | Start server or disable profile.           |
| Plugin denied              | Audit event                      | Grant explicit permission only if trusted. |
| Database locked            | Health error                     | Stop duplicate process.                    |
| Validation command missing | Script error                     | Update `COMMANDS.md` from evidence.        |
| Agent fixates              | Retry budget event               | Choose simpler path or STOP.               |
| Readiness check fails      | `CLI readiness` nonzero exit     | Inspect output, fix failing checks.        |

## Troubleshooting

Run preflight, inspect logs (structured JSON lines via `@the-machine/observability`), check runtime events via EventRecorder, verify provider/MCP/plugin profile health, export diagnostics (`CLI diagnostics`), rerun narrow failing command, apply retry budget, record STOP if needed.

## Database Backup/Restore

Backup before migration and release candidate staging. Store backups outside repo. Verify restore on test DB. Do not overwrite user DB without explicit permission.

## Scheduled Jobs

No background scheduled jobs required in v1. Optional local cleanup/rotation/integrity checks may be added by future ExecPlan.

## Incident Triage

Identify severity, preserve logs/run IDs (export diagnostics first), stop destructive actions, disable risky integration if involved, roll back if release-caused, create incident report, add regression test/runbook update.

## Escalation Rules

Escalate for data loss risk, security exposure, paid provider cost risk, production deployment decision, missing secret/account, legal/compliance judgment.

## Maintenance Windows

User-chosen time for upgrades, migrations, backup/restore, plugin install, provider reconfiguration.

## Operational Safety Rules

Never delete user data, expose local service remotely, deploy production, or retry destructive actions without permission. Prefer read-only diagnostics.
