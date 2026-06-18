# CONTRIBUTING.md

## Setup

Read `AGENTS.md`, `COMMANDS.md`, and active ExecPlan. Run `./scripts/preflight.sh` and `./scripts/install.sh`.

## Branch Rules

Use one short-lived branch per ExecPlan. Do not mix unrelated plans, rewrite user changes, or force-push without explicit approval.

## Coding Standards

Use TypeScript strict mode. Keep domain in `packages/core`, provider code in `packages/providers`, MCP in `packages/mcp`, plugin contracts in `packages/plugin-sdk`, persistence in `packages/storage`. GUI/CLI must call service/runtime.

## Test Requirements

Add/update tests for behavior changes, validate after milestones, run full verification when required, add regression tests for bugs.

## Documentation Requirements

Update docs for commands, architecture, env vars, security, data model, deployment, release, rollback, user behavior, and tests.

## Commit Guidance

Use ExecPlan ID and milestone ID. Example: `EP-002 M2: add retry budget domain state machine`.

## Pull Request Checklist

- [ ] Active ExecPlan referenced.
- [ ] Scope matches plan.
- [ ] Non-goals excluded.
- [ ] Tests added/updated.
- [ ] Validation passes.
- [ ] Docs/decisions updated.
- [ ] No secrets.
- [ ] Diff reviewed.

## Code Review Checklist

Boundaries preserved, no provider lock-in, GUI/CLI use service, commands documented, migrations safe, errors typed, logs redact secrets, tests match behavior, accessibility/security considered.

## Agent-Specific Contribution Rules

Agents must implement one active ExecPlan, continue unless STOP applies, validate milestones, update plan, apply retry budget, record decisions, review diff, and produce final report. Agents must not ask for next steps, implement from roadmap, invent APIs/commands, broaden scope, hide failures, or commit secrets.
