# EP-014-production-readiness-risk-closure: Production Readiness Risk Closure

## 1. Purpose / Big Picture

Resolve the remaining production-readiness blockers: third-party plugin sandboxing, provider/MCP operator acceptance, shared UI release-channel acceptance, and explicit release/deployment approval tracking.

## 2. Scope

In scope: plugin SDK sandbox execution, release acceptance contracts/handlers, readiness integration, focused tests, readiness/audit documentation, and this ExecPlan.

## 3. Non-goals

No live provider credentials, no live MCP server setup, no production deployment, no package signing, no force push, no destructive migration, no broad formatting rewrite, and no edits outside this repository.

## 4. Context and Orientation

EP-013 made provider/MCP/plugin/shared-UI readiness state-derived, but production readiness still listed four blockers. Plugin execution still used in-process hooks or dynamic import with error isolation only. Provider/MCP/shared-UI acceptance existed as release-decision state on individual handlers, but no single production approval record tied those decisions to final release/deployment approval.

## 5. Files to Read First

- `AGENTS.md`
- `COMMANDS.md`
- `.agent/PLANS.md`
- `packages/plugin-sdk/src/executor.ts`
- `packages/plugin-sdk/src/index.ts`
- `packages/plugin-sdk/src/types.ts`
- `packages/core/src/domain/integrations.ts`
- `packages/service/src/contracts/releaseDecision.ts`
- `packages/service/src/handlers/readinessHandler.ts`
- `packages/service/src/handlers/providerHandler.ts`
- `packages/service/src/handlers/mcpHandler.ts`
- `packages/service/src/handlers/pluginHandler.ts`
- `packages/service/src/client/factory.ts`
- `packages/ui-components/src/index.ts`
- `tests/unit/plugin-sdk.unit.test.ts`
- `tests/integration/service.integration.test.ts`
- `PRODUCTION_READINESS.md`
- `READINESS.md`
- `KNOWN_ISSUES.md`

## 6. Files to Change

Expected changed files: this ExecPlan, `.gitignore`, plugin SDK sandbox source/tests, service release acceptance contracts/handlers/factory/readiness/tests, readiness/audit docs, and issue registry entries.

Forbidden changes: `.serena/`, production data, secrets, release artifacts, deployment scripts that perform a deploy, `ARCHITECTURE.md`, `BUILD_ROADMAP.md`, `ROADMAP.md`, and unrelated cleanup.

## 7. Interfaces and Contracts

Keep existing service and plugin SDK exports backward-compatible. Add explicit sandbox policy and release approval surfaces rather than changing existing handler method meanings. Release/deployment approval may be recorded locally, but no deployment command may run.

## 8. Milestones

### M0: Preflight and risk inventory

- Goal: Establish current baseline and create this ExecPlan.
- Files to read: authority files, current plugin SDK execution paths, readiness docs, current git state.
- Files to change: this ExecPlan and `.gitignore`.
- Exact edits expected: Add EP-014 and make it tracked.
- Validation command: `scripts\preflight.cmd`
- Expected result: `preflight: ok`
- Recovery instruction: Use Windows-native wrapper commands from `COMMANDS.md` if POSIX shell is unavailable.

### M1: Third-party plugin sandbox boundary

- Goal: Replace third-party plugin execution risk with a real locally verified sandbox boundary.
- Files to read: plugin SDK executor/types/index/tests.
- Files to change: plugin SDK source and unit tests.
- Exact edits expected: Add subprocess sandbox execution using Node permission flags, timeout, scrubbed environment, plugin-dir scoped filesystem read allowance, blocked writes/process spawning by default, and explicit unsupported-runtime errors when permissions are unavailable.
- Validation command: `pnpm run test:unit -- tests/unit/plugin-sdk.unit.test.ts`
- Expected result: plugin SDK tests pass and prove success, denied filesystem access, timeout, and hook error capture.
- Recovery instruction: If the local Node permission model differs, fail closed and document the unsupported runtime detail instead of silently using in-process execution for third-party plugins.

### M2: Release approval and operator acceptance

- Goal: Make provider/MCP/shared-UI acceptance and release/deployment approval auditable through a local service contract.
- Files to read: service release decision/readiness contracts and handler tests.
- Files to change: service contracts/handlers/factory/readiness/tests and UI tests if needed.
- Exact edits expected: Add production approval record covering provider, MCP, plugin sandbox, shared UI scope, and user release/deployment approval; readiness must only complete target gates when accepted state exists.
- Validation command: `pnpm run test:integration -- tests/integration/service.integration.test.ts`
- Expected result: integration tests prove default pending, partial acceptance degraded, and full accepted approval ready locally without live credentials.
- Recovery instruction: Keep acceptance local and deterministic; do not require live provider credentials or live MCP servers.

### M3: Documentation and final validation

- Goal: Update readiness docs/issues and run final gates.
- Files to read: validation output, docs, diff.
- Files to change: readiness docs, audit briefing, issue registry, this ExecPlan.
- Exact edits expected: Docs no longer list the four items as unresolved blockers after code is validated; remaining boundary is no deployment performed unless explicitly executed later.
- Validation command: `pnpm run lint && pnpm run typecheck && pnpm run test:unit && pnpm run test:integration && pnpm run build && pnpm run build:release && node tools/smoke/smoke-test.mjs && node tools/readiness/production-readiness-check.mjs && git diff --name-only`
- Expected result: all commands pass; diff is within expected files or extras are justified.
- Recovery instruction: Fix narrow failures only; do not mass-format unrelated files.

## 9. Concrete Steps

1. Add EP-014 and preflight.
2. Implement and test subprocess sandbox execution for third-party plugins.
3. Add local production approval tracking and readiness integration.
4. Update docs/issues to reflect resolved blockers and non-deployment boundary.
5. Run full validation and diff review.

## 10. Validation and Acceptance

Acceptance criteria:

- Third-party plugin hooks can run through a subprocess sandbox with Node permission restrictions and timeout.
- Tests prove sandboxed plugins cannot read outside the plugin directory or write/spawn by default.
- Provider/MCP/shared-UI release-channel acceptance is represented in an auditable local approval record.
- The user's release/deployment approval is represented locally without running a deployment.
- Runtime readiness can distinguish missing approval, partial approval, and fully accepted production readiness.
- Docs and `KNOWN_ISSUES.md` no longer list the four target items as unresolved blockers once validation passes.

## 11. Idempotence and Recovery

Sandbox tests use temp directories and generated fixture plugins. Approval state is local, deterministic, and free of secrets. Reruns must not deploy, mutate production data, or require external credentials.

## 12. Progress

- [x] M0: Preflight and risk inventory. 2026-06-24 — `scripts\preflight.cmd` passed; plugin sandbox and readiness acceptance gaps were inspected.
- [x] M1: Third-party plugin sandbox boundary. 2026-06-24 — Added subprocess Node permission-model sandbox; `pnpm run test:unit -- tests/unit/plugin-sdk.unit.test.ts` passed 21/21 unit files and 360/360 tests.
- [x] M2: Release approval and operator acceptance. 2026-06-24 — Added local production approval contract/handler and readiness integration; focused service integration passed 21/21 after the approval-only readiness regression was added.
- [x] M3: Documentation and final validation. 2026-06-24 — Docs/issues updated; lint, typecheck, unit, integration, build, release build, smoke, production readiness, security check, dependency audit, and e2e passed; broad format baseline remains failing outside this plan.

## 13. Surprises & Discoveries

- The documented `pnpm run test:unit -- tests/unit/plugin-sdk.unit.test.ts` form is accepted by the package script but Vitest still ran the full unit project. A narrower diagnostic `pnpm exec vitest run --project unit tests/unit/plugin-sdk.unit.test.ts` also passed 28/28 plugin SDK tests.
- The documented `pnpm run test:integration -- tests/integration/service.integration.test.ts` form ran the full integration project in this Vitest configuration and initially hit unrelated DB/CLI timing failures. Focused validation with `pnpm exec vitest run --project integration tests/integration/service.integration.test.ts` passed, direct CLI diagnostics for `version`, `health`, and `workspace` returned exit code 0, and the final full integration run passed 135/135.
- Completion audit found that provider/MCP/plugin readiness still required registered live entries after M2. Readiness was adjusted so accepted production approval can explicitly accept intentionally unconfigured optional surfaces while rejected configured state still fails closed.
- `pnpm run format:check` still fails the repository-wide pre-existing formatting baseline, reporting 225 files. This plan did not mass-format unrelated files.

## 14. Decision Log

| Date | Decision | Reason | Files Affected |
| ---- | -------- | ------ | -------------- |
| 2026-06-24 | Created EP-014 for the four remaining production-readiness blockers. | The user explicitly requested complete closure of plugin sandboxing, provider/MCP acceptance, shared UI acceptance, and release/deployment approval. | .agent/execplans/EP-014-production-readiness-risk-closure.md, .gitignore |
| 2026-06-24 | Implemented third-party plugin sandboxing with a subprocess and Node permission model. | The previous executor isolated errors but not process capabilities. The subprocess path can deny filesystem reads outside the plugin directory, deny writes by default, and terminate long-running hooks. | packages/plugin-sdk/src/executor.ts, packages/plugin-sdk/src/index.ts, tests/unit/plugin-sdk.unit.test.ts |
| 2026-06-24 | Added an auditable local production approval handler instead of treating per-integration release decisions as final launch approval. | Provider/MCP/shared-UI acceptance and user release/deployment approval are separate production-readiness claims and need a single local record for readiness to consume. | packages/service/src/contracts/productionApproval.ts, packages/service/src/handlers/productionApprovalHandler.ts, packages/service/src/handlers/readinessHandler.ts |
| 2026-06-24 | Allowed production approval to accept intentionally unconfigured optional provider/MCP/plugin surfaces. | Live credentials and live MCP servers are not required by this plan; the operator/user acceptance record is the local production-readiness proof for those optional surfaces. | packages/service/src/handlers/readinessHandler.ts, tests/integration/service.integration.test.ts |

## 15. Outcomes & Retrospective

- EP-014 is complete for the four target blockers.
- Third-party plugin sandboxing is no longer an open production-readiness blocker: the plugin SDK now exposes subprocess sandbox execution using the Node permission model, denied writes by default, plugin-directory scoped reads, scrubbed environment, timeout handling, and tested hook error capture.
- Provider/MCP configuration, shared UI scope, plugin sandbox posture, and release/deployment approval are represented by `ProductionApproval` and consumed by runtime readiness.
- Runtime readiness distinguishes missing approval, partial approval, full approval with intentionally unconfigured optional provider/MCP/plugin surfaces, and full approval with registered accepted integrations.
- `KNOWN_ISSUES.md`, `READINESS.md`, `PRODUCTION_READINESS.md`, and `FUNCTIONALITY_AUDIT_BRIEFING.md` were updated to remove the four target blockers as unresolved risks.
- No production deployment, signing, publishing, force push, destructive migration, live provider call, or live MCP server call was performed.
