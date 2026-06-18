# SPEC-002-data-model: Data Model

## Status

Draft for implementation.

## Owner

Architecture/Product.

## Linked Roadmap Phase

Phase 2: Data and persistence

## Linked ExecPlans

EP-003, EP-007, EP-010

## User-Visible Goal

The Machine remembers workspaces, repositories, ExecPlan progress, command results, settings, decisions, and readiness results across restarts.

## Non-Goals

- Do not implement unrelated features.
- Do not require hidden conversation context.
- Do not bypass the active ExecPlan.
- Do not introduce production deployment without approval.

## Terms

- Workspace: local The Machine state scope.
- RepositoryProfile: discovered repository metadata.
- BlueprintPack: repository-local docs, specs, ExecPlans, scripts, and checklists.
- ExecPlan: one self-contained implementation plan.
- AgentRun: one run of an agent or runtime pass.
- STOP condition: explicit halt from `AGENTS.md`.

## Required Behavior

- Behavior must be test-shaped and observable.
- Inputs must be validated at trust boundaries.
- Outputs must be typed or schema-validated.
- Errors must use the taxonomy in SPEC-006.
- State changes must be persisted when needed for restartability.
- Commands must come from `COMMANDS.md`.
- Security-sensitive actions must fail closed.

## Inputs

- Repository path.
- Active ExecPlan path.
- User command or GUI action.
- Provider/MCP/plugin configuration where applicable.
- Validation command result where applicable.

## Outputs

- Updated local state.
- User-visible status or report.
- Redacted logs/events.
- Validation results.
- Clear errors with recovery guidance.

## Error States

- Invalid input.
- Missing required file.
- Missing required command.
- Missing secret when required.
- Permission denied.
- Validation failed.
- STOP condition.
- Persistence or integration failure.

## Data Rules

- Use local persistence for restartable state.
- Store secret references, not raw secrets.
- Use migrations for schema changes.
- Do not store full prompts/code by default unless explicitly configured.

## Security Rules

- Loopback-only local service by default.
- MCP/plugin permissions deny by default.
- Commands are allowlisted.
- Logs and diagnostics are redacted.
- Destructive actions require STOP and explicit permission.

## Accessibility Rules if Applicable

- GUI critical flows must be keyboard accessible.
- CLI must support non-interactive output.
- Errors must be text-visible and not color-only.

## Performance Rules if Applicable

- Health checks should complete within 500 ms in local staging.
- Small repository discovery target is under 5 seconds.
- Long-running runs emit progress at least every 10 seconds.

## Observability Rules if Applicable

- Emit structured events for user actions, runs, milestones, validation, errors, STOP conditions, permissions, and integration calls.

## Required Tests

- Unit tests for domain/validation behavior.
- Integration tests for persistence/service/integration behavior.
- Contract tests for API/CLI/provider/MCP/plugin surfaces.
- E2E or acceptance tests for user-visible behavior.
- Security tests for any trust boundary.

## Acceptance Criteria

- Required behavior is implemented.
- Required tests pass.
- Errors are typed and user-safe.
- Security and data rules are enforced.
- Docs and ExecPlan outcomes are updated.
