# EP-011-functionality-remediation: Functionality Remediation

## 1. Purpose / Big Picture

Close the functionality audit gaps recorded in `FUNCTIONALITY_AUDIT_BRIEFING.md` by restoring built CLI/runtime smoke, fixing Windows readiness validation, replacing fake or placeholder production paths with locally verifiable implementations, and correcting readiness documentation.

## 2. Scope

In scope: FA-001 through FA-012 from `FUNCTIONALITY_AUDIT_BRIEFING.md`, implemented through small validated milestones. No live provider credentials, production deployment, destructive migration, paid service, or external account is required.

## 3. Non-goals

No production deployment, signing, force push, destructive database migration, provider account setup, or third-party paid service integration. Do not touch unrelated untracked `.serena/`.

## 4. Context and Orientation

The previous EP-010 readiness record is stale. Current audit evidence shows the built CLI fails at startup, Windows readiness path checks fail, provider and MCP adapters are fake, DB tools are placeholders, runtime readiness is incomplete, and docs overclaim readiness.

## 5. Files to Read First

- `AGENTS.md`
- `COMMANDS.md`
- `.agent/PLANS.md`
- `FUNCTIONALITY_AUDIT_BRIEFING.md`
- `packages/observability/src/emit/index.ts`
- `tools/readiness/production-readiness-check.mjs`
- `tools/smoke/smoke-test.mjs`
- `packages/service/src/handlers/planHandler.ts`
- `packages/service/src/handlers/runHandler.ts`
- `packages/providers/src/**`
- `packages/mcp/src/**`
- `tools/db/**`

## 6. Files to Change

Expected changed files: this ExecPlan, `FUNCTIONALITY_AUDIT_BRIEFING.md`, `COMMANDS.md`, `ENVIRONMENT.md`, package source/tests under `packages/`, `apps/cli` as needed, `tools/`, `scripts/`, root readiness docs, and focused tests.

Forbidden changes: `.serena/`, secrets, production data, destructive migrations, unrelated broad formatting rewrites, `ROADMAP.md` unless explicitly requested.

## 7. Interfaces and Contracts

Preserve CLI command names and service contracts where possible. Provider factory additions must be backward-compatible. MCP registry return shape should remain stable unless tests require a richer detail field. Windows wrappers are additive alternatives to shell scripts.

## 8. Milestones

### M0: Preflight and audit recheck

- Goal: Confirm current blocker state.
- Files to read: files listed above.
- Files to change: this ExecPlan.
- Exact edits expected: Create this ExecPlan and record current validation boundary.
- Validation command: `pnpm run typecheck`
- Expected result: typecheck passes.
- Recovery instruction: If pnpm/Corepack cache is blocked, rerun with approved escalation.

### M1: Runtime and validation blockers

- Goal: Restore built CLI startup, Windows readiness checks, smoke prerequisites, Windows wrappers, and release bundle path safety.
- Files to read: observability emit export, readiness tool, smoke tool, release builder, command docs.
- Files to change: observability export, readiness/smoke/release tools, scripts/docs/tests.
- Exact edits expected: Node-compatible ESM exports, `fileURLToPath` root handling, targeted smoke prerequisite diagnostics, Windows-native command wrappers, ESM release bundle or equivalent import-meta-safe output.
- Validation command: `pnpm run build:release && node tools/smoke/smoke-test.mjs && node tools/readiness/production-readiness-check.mjs`
- Expected result: release build, smoke, and readiness pass.
- Recovery instruction: If smoke fails, inspect the first runtime error and make the smallest startup/tooling fix.

### M2: ExecPlan persistence and runner

- Goal: Replace generic plan/run scaffolding with persisted plan parsing and minimal synchronous milestone validation.
- Files to read: service handlers/contracts, storage schema, agent-runtime command registry.
- Files to change: service handlers/client factory, storage usage, tests.
- Exact edits expected: Parse Markdown ExecPlans, persist workspaces/plans/milestones/runs/commands/validations to SQLite, run requested or next incomplete milestone validation through allowlisted commands.
- Validation command: `pnpm run test:integration`
- Expected result: integration tests pass with temp DB persistence coverage.
- Recovery instruction: If persistence fails, use temp DB diagnostics and avoid destructive operations.

### M3: Provider and MCP real transports

- Goal: Replace fake provider/MCP production behavior with locally testable real transports.
- Files to read: providers, mcp, security permission integration.
- Files to change: provider adapters/factory/tests, MCP registry/transport/tests.
- Exact edits expected: HTTP provider adapters with injectable fetch and redacted errors; stdio JSON-RPC MCP transport with fixture tests; unsupported transports return explicit errors.
- Validation command: `pnpm run test:integration`
- Expected result: integration tests pass without live credentials or external services.
- Recovery instruction: Keep live-network use out of tests; use local mocks/fixtures.

### M4: DB tools and runtime readiness

- Goal: Wire DB tools and expand readiness to all documented subsystems.
- Files to read: storage migrations/tools, readiness handler, readiness docs.
- Files to change: DB tools, readiness handler/tests/docs.
- Exact edits expected: DB setup/migrate/rollback/scaffold operate on temp/local paths safely; readiness reports 12 subsystems with pending/degraded states instead of omission.
- Validation command: `pnpm run test:unit && pnpm run test:integration && node tools/readiness/production-readiness-check.mjs`
- Expected result: tests and readiness pass.
- Recovery instruction: Rollback tool must stop before destructive non-temp operations.

### M5: Documentation and final verification

- Goal: Update docs and audit record to reflect actual state, then verify all gates.
- Files to read: root docs and audit briefing.
- Files to change: root docs, this ExecPlan, audit briefing.
- Exact edits expected: Remove stale readiness overclaims, record closed gaps and remaining risks.
- Validation command: `pnpm run typecheck && pnpm run test:unit && pnpm run test:integration && pnpm run test:e2e && pnpm run build && pnpm run build:release && node tools/smoke/smoke-test.mjs && node tools/readiness/production-readiness-check.mjs && git diff --name-only`
- Expected result: all commands pass and diff contains only expected files.
- Recovery instruction: If final validation fails, fix the narrowest failing gate and rerun that gate before rerunning final sequence.

## 9. Concrete Steps

1. Create EP-011 and read required files.
2. Fix runtime/tooling blockers first.
3. Implement persistence-backed ExecPlan loading and minimal run execution.
4. Implement real locally testable provider and MCP transports.
5. Wire DB tools and expand readiness.
6. Update docs, audit record, progress, decisions, and outcomes.
7. Run final validation and diff review.

## 10. Validation and Acceptance

Acceptance criteria:

- Built CLI starts and smoke passes.
- Windows direct readiness checker resolves repo paths correctly.
- Windows-native validation entrypoints are documented.
- ExecPlan load/run is not generic in-memory-only scaffolding.
- Provider/MCP production paths no longer return fake/mock success.
- DB tools operate on real storage APIs with safe rollback guards.
- Runtime readiness reports all 12 subsystems.
- Docs no longer overclaim production readiness.

## 11. Idempotence and Recovery

All tests must use temp DBs or repo-local ignored state. Reruns must not corrupt state. Destructive rollback against non-temp DB paths must stop unless explicitly approved.

## 12. Progress

- [x] M0: Preflight and audit recheck. 2026-06-23 — `pnpm run typecheck` passed (19/19 turbo tasks).
- [x] M1: Runtime and validation blockers. 2026-06-23 — `pnpm run build:release` passed; `node tools/smoke/smoke-test.mjs` passed 22/22; `node tools/readiness/production-readiness-check.mjs` passed 32/32.
- [x] M2: ExecPlan persistence and runner. 2026-06-23 — `pnpm run test:integration` passed (129/129) with temp DB ExecPlan parse/run persistence coverage.
- [x] M3: Provider and MCP real transports. 2026-06-23 — `pnpm run test:integration` passed (128/128) with mocked HTTP provider transports and stdio JSON-RPC MCP fixture coverage.
- [x] M4: DB tools and runtime readiness. 2026-06-23 — `pnpm run test:unit` passed (350/350), `pnpm run test:integration` passed (131/131), and `node tools/readiness/production-readiness-check.mjs` passed 32/32.
- [x] M5: Documentation and final verification. 2026-06-23 — Docs and audit briefing updated; core functional gates passed. Final full gate has two pre-existing repo-baseline blockers: `pnpm run lint` fails in observability lint and `pnpm run format:check` reports broad formatting drift.

## 13. Surprises & Discoveries

- The readiness CLI can honestly report `overall=degraded` while the production readiness checker still passes its file/build/script checks; these measure different things and should not be collapsed into one release claim.
- The storage migrator currently supports forward-only `up` migrations. Rollback tooling therefore guards destructive intent and reports the applied migration list instead of pretending a reversible down migration exists.
- `.agent/` was globally ignored, so EP-011 needed a narrow `.gitignore` exception to make the required ExecPlan file commit-visible without exposing the full agent runtime directory.
- Final lint and format gates are not yet useful release signals: lint fails on existing observability style debt, and format check reports hundreds of files including unrelated `.serena/`. EP-011 did not mass-rewrite unrelated files.

## 14. Decision Log

| Date | Decision | Reason | Files Affected |
| ---- | -------- | ------ | -------------- |
| 2026-06-23 | Created EP-011 to govern audit remediation. | User requested implementation of the audit remediation plan and repo requires bounded ExecPlans. | This ExecPlan |
| 2026-06-23 | Used `pnpm run typecheck` for M0 validation instead of POSIX preflight. | The audit found WSL/POSIX shell unavailable on this Windows host; EP-011 M1 adds Windows-native wrappers to recover the documented validation workflow. | This ExecPlan |
| 2026-06-23 | Switched release bundles to ESM and updated smoke syntax checks. | ESM preserves `import.meta.url` behavior and fixes the previous CJS release warnings; smoke needed Node syntax checking instead of `new Function` for ESM bundles. | tools/release/build-release.mjs, tools/smoke/smoke-test.mjs |
| 2026-06-23 | Kept service handlers in-memory by default unless a `ServiceStore` is supplied, while `createDefaultClient` uses the repo-local SQLite store. | This preserves isolated handler tests and enables persistent CLI/service behavior without forcing every unit test to open SQLite. | packages/service/src/handlers, packages/service/src/client/factory.ts, packages/service/src/persistence/store.ts |
| 2026-06-23 | Provider and MCP production adapters now use real local transports with injected test fixtures. | This closes fake success paths without requiring live credentials, external accounts, or network services in validation. | packages/providers, packages/mcp, tests/integration |
| 2026-06-23 | DB rollback remains guarded and non-destructive because storage migrations are forward-only. | The repo has no down-migration contract; safe tooling should stop before non-temp destructive rollback rather than imply data can be reverted. | tools/db/rollback.mjs, tests/integration/db-tools.integration.test.ts |
| 2026-06-23 | Runtime readiness now reports all 12 subsystems, with optional provider/MCP/plugin work shown as pending. | This makes current gaps visible without failing local file/build readiness checks that are separately validated by the production readiness tool. | packages/service/src/handlers/readinessHandler.ts, tests/integration/service.integration.test.ts |
| 2026-06-23 | Added a narrow `.gitignore` exception for EP-011. | The repository ignores `.agent/` by default, but the required bounded ExecPlan should be visible for review and commit. | .gitignore, .agent/execplans/EP-011-functionality-remediation.md |

## 15. Outcomes & Retrospective

- Closed FA-001 through FA-008 and FA-010 through FA-012 for local verification scope. FA-009 remains an accepted open risk until plugin execution is either scoped to trusted first-party use or moved into a true sandbox.
- Built CLI, release bundle, smoke, readiness, provider HTTP adapters, MCP stdio invocation, DB tools, and persisted ExecPlan run behavior are now covered by passing local validation.
- Validation passed: `pnpm run typecheck` (20/20), `pnpm run test:unit` (350/350), `pnpm run test:integration` (131/131), `pnpm run test:e2e` (16/16), `pnpm run build` (12/12), `pnpm run build:release`, `node tools/smoke/smoke-test.mjs` (22/22), `node tools/readiness/production-readiness-check.mjs` (32/32), `node tools/security/check-secrets.mjs`, and `pnpm run audit` (1 low vulnerability, no high vulnerabilities).
- Validation blocked: `pnpm run lint` fails in pre-existing observability lint debt; `pnpm run format:check` reports broad formatting drift across 224 files, including unrelated `.serena/`.
- Production-readiness status: local remediation is substantially improved, but production launch is not approved. Runtime readiness remains degraded for optional provider/MCP/plugin configuration, and plugin sandboxing remains open in `KNOWN_ISSUES.md`.
