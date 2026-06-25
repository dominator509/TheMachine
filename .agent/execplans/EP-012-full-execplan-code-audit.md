# EP-012-full-execplan-code-audit: Full ExecPlan Code Audit

## 1. Purpose / Big Picture

Audit all ExecPlans in this repository against the implemented code, tests, scripts, and docs. Identify concrete wiring or functionality gaps, fix locally-scoped code gaps when evidence supports the fix, and record any remaining non-code or broad-baseline blockers honestly.

## 2. Scope

In scope: EP-000 through EP-011, repository source code, tests, scripts, root docs, package manifests, and readiness/security/tooling checks.

Out of scope: production deployment, live provider credentials, live MCP servers, third-party plugin sandbox infrastructure beyond local evidence, destructive database rollback, force push, broad formatting rewrites, unrelated `.serena/` changes, or changing strategic roadmap content.

## 3. Non-goals

Do not implement roadmap-only features. Do not mass-format the repository. Do not alter production data. Do not hide known risks by weakening validation. Do not touch repositories outside `C:\dev\TheMachine`.

## 4. Context and Orientation

EP-011 closed major runtime and fake-transport gaps but left three known risks: observability lint debt, broad formatting drift, and third-party plugin sandboxing. This audit checks whether earlier ExecPlans and current implementation claims match the actual repo.

## 5. Files to Read First

- `AGENTS.md`
- `COMMANDS.md`
- `.agent/PLANS.md`
- `.agent/execplans/*.md`
- `ARCHITECTURE.md`
- `PRODUCTION_READINESS.md`
- `READINESS.md`
- `KNOWN_ISSUES.md`
- `package.json`
- `pnpm-workspace.yaml`
- `packages/*/package.json`
- `apps/*/package.json`
- `tests/**`
- `tools/**`
- `scripts/**`

## 6. Files to Change

Expected changed files: this ExecPlan, `.gitignore` if needed to keep this ExecPlan visible, focused package/source/tests/scripts/docs needed to close evidence-backed gaps.

Forbidden changes: `.serena/`, production data, build artifacts, release artifacts, local DB files, secret files, broad formatting-only rewrites, `ROADMAP.md` unless a current user instruction explicitly requires it.

## 7. Interfaces and Contracts

Preserve existing public CLI commands, package exports, service contracts, provider factory compatibility, MCP registry shape, storage schema safety, and documented validation commands.

## 8. Milestones

### M0: Preflight and plan inventory

- Goal: Confirm repo state and enumerate all ExecPlans.
- Files to read: authority files and ExecPlan inventory.
- Files to change: this ExecPlan and `.gitignore` exception if required.
- Exact edits expected: Create EP-012 and record initial repo status.
- Validation command: `scripts\preflight.cmd`
- Expected result: Windows preflight passes or fails with exact evidence.
- Recovery instruction: If the wrapper is missing or fails due shell environment, use the equivalent package commands already documented in `COMMANDS.md`.

### M1: ExecPlan-to-code audit

- Goal: Compare all ExecPlan claims and acceptance criteria with current source/tests/scripts/docs.
- Files to read: all ExecPlans plus source, tests, scripts, package manifests, readiness docs.
- Files to change: this ExecPlan; focused files only if concrete gaps are found.
- Exact edits expected: Record concrete findings and fix small evidence-backed implementation mismatches.
- Validation command: `pnpm run typecheck`
- Expected result: typecheck passes.
- Recovery instruction: If typecheck fails, inspect the exact package and apply the smallest scoped fix.

### M2: Functional gate audit

- Goal: Run relevant functional gates to catch repo-wide wiring gaps.
- Files to read: failing command output and touched code.
- Files to change: focused source/tests/scripts only for concrete failures.
- Exact edits expected: Fix any failing functional wiring that is in scope.
- Validation command: `pnpm run test:unit && pnpm run test:integration && pnpm run build`
- Expected result: unit, integration, and build pass.
- Recovery instruction: If a failure repeats twice with the same root cause, narrow to the smallest package/test command before editing again.

### M3: Release/readiness/security audit

- Goal: Validate smoke, readiness, security, dependency audit, and known final blockers.
- Files to read: readiness/security/audit output and docs.
- Files to change: focused code/docs/tests only for concrete gaps.
- Exact edits expected: Fix local release/readiness/security gaps; record non-code blockers separately.
- Validation command: `pnpm run build:release && node tools/smoke/smoke-test.mjs && node tools/readiness/production-readiness-check.mjs && node tools/security/check-secrets.mjs && pnpm run audit`
- Expected result: commands pass or accepted audit output is documented.
- Recovery instruction: Do not require live credentials or deployment; keep checks local.

### M4: Final gap report and diff review

- Goal: Update outcomes with all findings, fixes, blockers, and production-readiness status.
- Files to read: `git diff --name-only`, `git status --short`, validation logs.
- Files to change: this ExecPlan, docs only if needed.
- Exact edits expected: Outcomes, decisions, progress, and remaining risks updated.
- Validation command: `git diff --name-only`
- Expected result: diff contains only expected files and any extras are justified.
- Recovery instruction: If unrelated files appear, leave user changes untouched and document them.

## 9. Concrete Steps

1. Create EP-012 and make it visible to Git.
2. Run Windows preflight or documented equivalent.
3. Inventory all ExecPlans and current package/test/tool surfaces.
4. Search for placeholders, mocks, TODOs, stale claims, and unresolved known issues.
5. Run functional and release validation gates.
6. Fix evidence-backed code gaps within scope.
7. Update EP-012 progress, decisions, outcomes, and final status.

## 10. Validation and Acceptance

Acceptance criteria:

- All ExecPlans are inventoried.
- Current code is checked against claimed package, tool, CLI, storage, provider, MCP, plugin, observability, readiness, and release behavior.
- Evidence-backed local code gaps are fixed.
- Known remaining risks are documented instead of overclaimed.
- Validation commands and results are recorded.
- Final diff is reviewed.

## 11. Idempotence and Recovery

All checks must be rerunnable. Tests must use temp or ignored local state. No destructive migration, production deployment, force push, or secret exposure is allowed.

## 12. Progress

- [x] M0: Preflight and plan inventory. 2026-06-23 — `scripts\preflight.cmd` passed and EP-000 through EP-011 were inventoried.
- [x] M1: ExecPlan-to-code audit. 2026-06-23 — placeholder entrypoints were fixed and `pnpm run typecheck` passed (20/20 turbo tasks).
- [x] M2: Functional gate audit. 2026-06-23 — `pnpm run test:unit` passed (353/353), `pnpm run test:integration` passed (131/131), and `pnpm run build` passed.
- [x] M3: Release/readiness/security audit. 2026-06-23 — release build, smoke (22/22), production readiness checker (32/32), staged-file secret scan, dependency audit, e2e (16/16), and lint (12/12 packages) passed. `pnpm run format:check` still fails broad baseline formatting drift across 223 files.
- [x] M4: Final gap report and diff review. 2026-06-23 — `git diff --name-only` reviewed; changes are limited to EP-012, focused source/test/doc/tooling files, and `.gitignore` visibility for the new ExecPlan.

## 13. Surprises & Discoveries

- Source scan found three package entrypoint placeholders: `createRuntime`, `createService`, and `createUI`. The first two had backing implementation that could be wired directly; `ui-components` needed an honest minimal registry plus degraded readiness until actual shared components exist.
- The root `audit` package script used POSIX `|| true`; on Windows it failed by trying to execute `true`. Removing the fallback made the command match `COMMANDS.md` and still pass the high-severity audit gate.
- Lint was not merely historical debt: service, CLI, provider, and observability strict-lint issues were fixable without behavior changes and now pass across all 12 packages.
- Format check remains a repository-wide baseline issue and includes `.serena/project.yml`; EP-012 did not mass-format unrelated files.

## 14. Decision Log

| Date | Decision | Reason | Files Affected |
| ---- | -------- | ------ | -------------- |
| 2026-06-23 | Created EP-012 for the full ExecPlan code audit. | User requested an all-ExecPlans repository audit and remediation pass; repo rules require bounded ExecPlans. | .agent/execplans/EP-012-full-execplan-code-audit.md, .gitignore |
| 2026-06-23 | Replaced entrypoint placeholders with typed factory surfaces and downgraded UI component readiness. | The code exported no-op package factories while docs/readiness claimed implemented package surfaces; the fix wires existing runtime/service code and avoids overclaiming the UI package. | packages/agent-runtime/src/index.ts, packages/service/src/index.ts, packages/ui-components/src/index.ts, packages/service/src/handlers/readinessHandler.ts, tests/unit/package-entrypoints.unit.test.ts |
| 2026-06-23 | Fixed Windows dependency audit script by removing POSIX `|| true`. | `pnpm run audit` should be cross-platform and fail only for high-severity audit results, not because `true` is unavailable on Windows. | package.json |
| 2026-06-23 | Fixed strict lint failures instead of documenting them as permanent debt. | The failures were local type/style issues in service, CLI, provider, and observability code and could be corrected without broad refactors. | apps/cli/src/index.ts, packages/providers/src/http.ts, packages/service/src/gui/pipelineServer.ts, packages/service/src/gui/themes/loader.ts, packages/service/src/persistence/store.ts, packages/observability/src |

## 15. Outcomes & Retrospective

- Audited EP-000 through EP-011 and current implementation surfaces against code, tests, scripts, package manifests, readiness docs, and validation gates.
- Fixed concrete gaps:
  - `createRuntime()` now returns a runtime with the command registry.
  - `createService()` now returns a fully wired service client.
  - `createUI()` now exposes a deterministic shared UI registry instead of a no-op placeholder.
  - Runtime readiness now marks `ui-components` pending rather than complete.
  - The empty integration placeholder test now verifies runtime/service/UI entrypoint wiring with temp SQLite.
  - `pnpm run audit` is Windows-compatible.
  - Strict lint failures in service, CLI, providers, and observability are fixed.
- Validation passed:
  - `scripts\preflight.cmd`
  - `pnpm run typecheck` (20/20 turbo tasks)
  - `pnpm run lint` (12/12 packages)
  - `pnpm run test:unit` (353/353)
  - `pnpm run test:integration` (131/131)
  - `pnpm run test:e2e` (16/16)
  - `pnpm run build` (12/12)
  - `pnpm run build:release`
  - `node tools/smoke/smoke-test.mjs` (22/22)
  - `node tools/readiness/production-readiness-check.mjs` (32/32)
  - `node tools/security/check-secrets.mjs` (staged-file scan)
  - `pnpm run audit` (1 low vulnerability, no high vulnerabilities)
- Remaining blocker:
  - `pnpm run format:check` fails broad repository formatting drift across 223 files, including unrelated `.serena/project.yml`. This is not fixed in EP-012 to avoid a sweeping formatting-only rewrite.
- Production-readiness status:
  - Local code and wiring validation are substantially stronger and lint now passes.
  - Production launch is still not approved.
  - Runtime readiness remains degraded for provider/MCP/plugin/shared-UI completion and configuration decisions.
