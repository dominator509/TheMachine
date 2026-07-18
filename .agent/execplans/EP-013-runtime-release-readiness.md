# EP-013-runtime-release-readiness: Runtime Release Readiness Decisions

## 1. Purpose / Big Picture

Complete runtime readiness for provider, MCP, plugin, and shared-UI release decisions by replacing hard-coded pending readiness with state-derived release-decision checks.

## 2. Scope

In scope: runtime readiness contracts, provider/MCP/plugin handlers, service client wiring, shared UI registry readiness, tests, readiness docs, and this ExecPlan.

## 3. Non-goals

No live provider credentials, live MCP servers, production deployment, third-party plugin sandbox implementation, destructive data migration, force push, or broad formatting rewrite.

## 4. Context and Orientation

EP-011 and EP-012 left runtime readiness degraded for provider/MCP/plugin/shared-UI release decisions. The current `createReadinessHandler()` hard-codes those subsystems as pending, so readiness cannot ever prove release decisions complete even when local operators intentionally register accepted release-state decisions.

## 5. Files to Read First

- `AGENTS.md`
- `COMMANDS.md`
- `.agent/PLANS.md`
- `packages/service/src/handlers/readinessHandler.ts`
- `packages/service/src/handlers/providerHandler.ts`
- `packages/service/src/handlers/mcpHandler.ts`
- `packages/service/src/handlers/pluginHandler.ts`
- `packages/service/src/client/factory.ts`
- `packages/service/src/contracts/readiness.ts`
- `packages/service/src/contracts/provider.ts`
- `packages/service/src/contracts/mcp.ts`
- `packages/service/src/contracts/plugin.ts`
- `packages/ui-components/src/index.ts`
- `tests/integration/service.integration.test.ts`

## 6. Files to Change

Expected changed files: this ExecPlan, `.gitignore`, service readiness/provider/MCP/plugin handlers and contracts, service client factory, UI component registry if needed, focused tests, readiness docs.

Forbidden changes: `.serena/`, production data, secrets, release artifacts, broad formatting rewrites, unrelated roadmap edits.

## 7. Interfaces and Contracts

Preserve existing handler methods and response fields. Add backward-compatible release decision fields and helper methods. Readiness must continue to support subsystem filtering and the 12-subsystem response shape.

## 8. Milestones

### M0: Preflight and current-state audit

- Goal: Confirm current readiness baseline and create EP-013.
- Files to read: authority files and readiness-related handlers/contracts.
- Files to change: this ExecPlan, `.gitignore`.
- Exact edits expected: Create EP-013 and make it Git-visible.
- Validation command: `scripts\preflight.cmd`
- Expected result: `preflight: ok`
- Recovery instruction: If Windows wrapper fails, run documented package-script equivalents.

### M1: Release decision model

- Goal: Add explicit release-decision state for provider/MCP/plugin/shared-UI readiness.
- Files to read: provider/MCP/plugin/readiness contracts and handlers, UI registry.
- Files to change: focused contracts/handlers/UI registry/tests.
- Exact edits expected: Provider/MCP/plugin registrations can carry accepted release-decision fields; UI registry can report whether shared UI surface is complete enough for release.
- Validation command: `pnpm run typecheck`
- Expected result: typecheck passes.
- Recovery instruction: Keep additions backward-compatible and avoid live external dependencies.

### M2: Runtime readiness derivation

- Goal: Readiness derives provider/MCP/plugin/shared-UI gates from real handler/UI state.
- Files to read: readiness handler, client factory, service tests.
- Files to change: readiness handler/factory/tests/docs.
- Exact edits expected: Default readiness remains degraded without release decisions; registering accepted decisions can make the four target gates completed and overall ready when all other gates pass.
- Validation command: `pnpm run test:unit && pnpm run test:integration`
- Expected result: unit and integration tests pass.
- Recovery instruction: If readiness behavior regresses CLI smoke, add/adjust focused assertions.

### M3: Final validation and documentation

- Goal: Verify runtime readiness behavior and document remaining production boundaries.
- Files to read: validation output and diff.
- Files to change: readiness docs and this ExecPlan.
- Exact edits expected: Docs no longer describe target decisions as unresolved once runtime can represent accepted decisions; remaining no-live-credential boundary is explicit.
- Validation command: `pnpm run lint && pnpm run typecheck && pnpm run test:unit && pnpm run test:integration && pnpm run build && pnpm run build:release && node tools/smoke/smoke-test.mjs && node tools/readiness/production-readiness-check.mjs && git diff --name-only`
- Expected result: all commands pass except any documented broad format baseline outside this plan.
- Recovery instruction: Fix narrow failures; do not mass-format unrelated files.

## 9. Concrete Steps

1. Create and preflight EP-013.
2. Add release decision state to provider/MCP/plugin/UI surfaces.
3. Wire readiness to state-derived gates.
4. Add tests proving default degraded and accepted-decision ready paths.
5. Update readiness docs and run validation.

## 10. Validation and Acceptance

Acceptance criteria:

- Provider, MCP, plugin, and shared-UI readiness are no longer hard-coded pending.
- Default runtime readiness remains honest when decisions are missing.
- Runtime can represent accepted release decisions locally without live credentials.
- Tests prove both missing-decision degraded and accepted-decision ready states.
- Docs distinguish local release-decision acceptance from production deployment.

## 11. Idempotence and Recovery

All tests use in-memory or temp state. No live providers, live MCP servers, or production deployment are required. Reruns must not persist secrets or production data.

## 12. Progress

- [x] M0: Preflight and current-state audit. 2026-06-24 — `scripts\preflight.cmd` passed and current readiness handlers were inspected.
- [x] M1: Release decision model. 2026-06-24 — Added provider/MCP/plugin/shared-UI release decision state and `pnpm run typecheck` passed (21/21 turbo tasks).
- [x] M2: Runtime readiness derivation. 2026-06-24 — Readiness now derives provider/MCP/plugin/shared-UI gates from handler/UI state; `pnpm run test:unit` passed (354/354) and `pnpm run test:integration` passed (132/132).
- [x] M3: Final validation and documentation. 2026-06-24 — Readiness docs updated and final validation passed: lint, typecheck, unit, integration, build, release build, smoke, production readiness checker, and diff review.

## 13. Surprises & Discoveries

- The working tree already contained EP-012 audit/remediation changes before EP-013 began. EP-013 changed the targeted readiness decision surface and docs without reverting or absorbing unrelated prior edits.
- `git diff --name-only` lists only tracked files; untracked ExecPlan/test/contract files were reviewed separately through `git status -sb`.

## 14. Decision Log

| Date | Decision | Reason | Files Affected |
| ---- | -------- | ------ | -------------- |
| 2026-06-24 | Created EP-013 for runtime release-decision readiness. | The active goal requires completing provider/MCP/plugin/shared-UI runtime readiness decisions, and repo rules require a bounded ExecPlan. | .agent/execplans/EP-013-runtime-release-readiness.md, .gitignore |
| 2026-06-24 | Added explicit release-decision state instead of treating missing live credentials as readiness failure. | The goal is to complete runtime readiness decisions locally; live providers/MCP servers remain out of scope, but operators need a verifiable way to accept or reject release posture. | packages/service/src/contracts, packages/service/src/handlers, packages/ui-components/src/index.ts |
| 2026-06-24 | Wired readiness to provider/MCP/plugin/UI handler state through `createDefaultClient`. | Runtime readiness should reflect current service state, not independent hard-coded gates. | packages/service/src/client/factory.ts, packages/service/src/handlers/readinessHandler.ts |
| 2026-06-24 | Kept plugin sandboxing as an open production posture decision. | EP-013 adds runtime release-decision wiring but does not implement true third-party plugin process isolation. | PRODUCTION_READINESS.md, READINESS.md, FUNCTIONALITY_AUDIT_BRIEFING.md |

## 15. Outcomes & Retrospective

- EP-013 is complete. Provider, MCP, plugin, and shared-UI readiness are now state-derived instead of hard-coded pending.
- Missing release decisions remain honest by default: readiness stays degraded/pending when providers, MCP servers, plugins, or UI surface acceptance are not registered.
- Accepted release decisions can be represented and validated locally without live provider credentials, live MCP servers, production deployment, or destructive data operations.
- Remaining production risks are release-channel decisions: third-party plugin sandboxing, live integration acceptance, shared UI scope acceptance, and final user approval before launch.
