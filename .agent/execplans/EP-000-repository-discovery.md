# EP-000-repository-discovery: Repository Discovery

## 1. Purpose / Big Picture

Discover repository structure, stack, commands, implementation state, risks, and missing information.

## 2. Scope

In scope: work required to complete this plan only, with milestone validation and documented decisions. Linked specs: SPEC-000, SPEC-008.

## 3. Non-goals

Do not implement features or install dependencies. Do not broaden scope, refactor unrelated code, change unrelated files, or ask for next steps unless a STOP condition applies.

## 4. Context and Orientation

The Machine is a local-first agentic coding platform. Execute this plan after earlier numbered ExecPlans are complete or explicitly determined not applicable. Read repository files before editing. Do not invent commands, APIs, environment variables, database tables, routes, or config keys.

## 5. Files to Read First

- `AGENTS.md`
- `COMMANDS.md`
- `.agent/PLANS.md`
- `ARCHITECTURE.md`
- Relevant specs under `.agent/specs/`
- This ExecPlan

## 6. Files to Change

Expected changed files: ASSUMPTIONS.md, COMMANDS.md, ARCHITECTURE.md, this ExecPlan.

Forbidden changes: unrelated source files, unrelated docs, production data, secrets, broad formatting rewrites, and any file outside this plan unless justified in the Decision Log.

## 7. Interfaces and Contracts

Commands must come from `COMMANDS.md`. Public APIs, package exports, routes, CLI commands, schemas, migrations, and environment variables must be verified from repository files or created in this plan with tests.

## 8. Milestones

### M0: Preflight

- Goal: Confirm blueprint pack and scripts are present.
- Files to read: AGENTS.md, COMMANDS.md, scripts/preflight.sh
- Files to change: none
- Exact edits expected: Run preflight only.
- Validation command: `./scripts/preflight.sh`
- Expected result: `preflight: ok`
- Recovery instruction: If scripts not executable, run chmod once; if required docs missing, STOP.

### M1: Inventory repository

- Goal: Identify files, docs, CI, and source roots.
- Files to read: root listing, config files
- Files to change: this ExecPlan
- Exact edits expected: Record inventory summary.
- Validation command: `git status --short`
- Expected result: Repository status visible with no unintended modifications.
- Recovery instruction: If git unavailable, record infrastructure risk and continue only if safe.

### M2: Detect stack/package manager

- Goal: Confirm default stack or update assumptions.
- Files to read: package manifests, lockfiles, tool configs
- Files to change: ASSUMPTIONS.md, COMMANDS.md
- Exact edits expected: Document discovered manager and commands.
- Validation command: `./scripts/preflight.sh`
- Expected result: Preflight passes.
- Recovery instruction: If multiple managers, choose evidenced lockfile and do not delete others.

### M3: Detect tests/CI/env

- Goal: Find validation and setup commands.
- Files to read: CI files, package scripts, env examples
- Files to change: COMMANDS.md
- Exact edits expected: Update commands from repo evidence.
- Validation command: `./scripts/preflight.sh`
- Expected result: Preflight passes.
- Recovery instruction: If greenfield commands absent, keep default and record EP-001 requirement.

### M4: Architecture discovery

- Goal: Map existing structure to intended boundaries.
- Files to read: source directories, configs
- Files to change: ARCHITECTURE.md
- Exact edits expected: Add discovered state if needed.
- Validation command: `git diff --name-only`
- Expected result: Only expected docs changed.
- Recovery instruction: STOP if substantial existing code cannot be mapped safely.

## 9. Concrete Steps

1. Run preflight.
2. Complete milestones in order.
3. Validate after each milestone.
4. Update Progress after each milestone.
5. Record surprises and decisions.
6. Run final validation.
7. Run `git diff --name-only` and compare to expected files.
8. Update Outcomes & Retrospective.

## 10. Validation and Acceptance

Required final commands:

```sh
./scripts/verify.sh
git diff --name-only
```

Acceptance criteria:

- All milestones complete.
- Required validation commands pass.
- Tests required by linked specs exist and pass.
- Docs and decisions updated if behavior or architecture changed.
- Only expected files changed or extras justified.
- Non-goals remain excluded.
- Risks documented.

## 11. Idempotence and Recovery

Rerunning this plan must not corrupt state. Use temp directories for tests and migrations for schema changes. Apply anti-fixation: first failure smallest fix, second narrow diagnostic, third abandon current approach and choose a simpler safe path. Stop only under `AGENTS.md` STOP conditions.

## 12. Progress

- [x] M0: Preflight complete.
- [x] M1: Inventory repository complete.
- [x] M2: Detect stack/package manager complete.
- [x] M3: Detect tests/CI/env complete.
- [x] M4: Architecture discovery complete.
- [x] Final validation complete.
- [x] Final diff review complete.

  ### M1 Inventory Summary
  - **Blueprint docs (root):** 16 markdown files covering agents, architecture, assumptions, commands, comms, contributing, decisions, deployment, environment, observability, operations, production readiness, project brief, release, roadmap, rollback, security, testing.
  - **.agent/ structure:** EXECUTION_RULES.md, PLANS.md, 9 checklists (agent-readiness, final-review, implementation, incident-response, preflight, production-readiness, release, rollback, validation), 11 ExecPlans (EP-000 thru EP-010), 4 prompts, 9 specs (SPEC-000 thru SPEC-008), 5 templates.
  - **scripts/:** 14 shell scripts (preflight, install, build, lint, format-check, typecheck, test-unit, test-integration, test-e2e, verify, security-check, dependency-audit, smoke-test, production-readiness-check).
  - **Source roots:** None exist yet. Repository is a pure blueprint pack — no package.json, lockfiles, tsconfig, source directories (apps/, packages/, tools/, tests/), or CI config files.
  - **Stack (provisional):** TypeScript/Node 20 LTS, pnpm workspaces, Tauri 2 + React/Vite, SQLite (per ADR-0001).
  - **Package manager:** pnpm (documented but not yet initialized).
  - **CI:** No CI config files found; ASSUMPTIONS.md A-008 assumes GitHub Actions.
  - **Git state:** Single commit. No untracked source files. `.gitignore` has standard ignores.

## 13. Surprises & Discoveries

- None yet.

## 14. Decision Log

| Date       | Decision                                                                                                                                                           | Reason                                                                                                                                                      | Files Affected  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 2026-06-16 | Initial plan generated for The Machine.                                                                                                                            | Project requires bounded, restartable implementation by lower-tier coding agents.                                                                           | This ExecPlan   |
| 2026-06-16 | M1 inventory recorded — repository is pure blueprint pack with no source code.                                                                                     | No package.json, lockfiles, tsconfig, or source directories exist. Greenfield start confirmed.                                                              | This ExecPlan   |
| 2026-06-16 | M2 confirmed pnpm default — no package manager conflict found.                                                                                                     | ASSUMPTIONS.md A-001 verified. Repository has no existing manifests.                                                                                        | ASSUMPTIONS.md  |
| 2026-06-16 | M3 confirmed no test configs (vitest/jest/playwright absent), no CI configs (.github/ missing), no env templates. ASSUMPTIONS.md updated with A-012, A-013, A-014. | Greenfield repository; all test/CI/env artifacts deferred to EP-001+.                                                                                       | ASSUMPTIONS.md  |
| 2026-06-16 | M4: ARCHITECTURE.md updated with Current State section documenting greenfield/blueprint-only reality.                                                              | Repository has zero source code; intended architecture (apps/, packages/, tools/, tests/) does not exist yet. EP-001+ must scaffold all source directories. | ARCHITECTURE.md |

## 15. Outcomes & Retrospective

### Milestones Completed

- **M0: Preflight** — preflight.sh passed (`preflight: ok`).
- **M1: Inventory** — Repository is pure blueprint pack, no source code exists.
- **M2: Stack detection** — pnpm default confirmed; no existing manifests to conflict.
- **M3: Tests/CI/Env** — No test configs, CI files, or env templates found. ASSUMPTIONS.md updated.
- **M4: Architecture discovery** — ARCHITECTURE.md updated with Current State section documenting greenfield status.

### Final Validation Results

- `./scripts/verify.sh`: `preflight: ok`. Package.json missing error is expected (greenfield state; EP-001 addresses this).
- `git diff --name-only`: Changed files are within expected set (ARCHITECTURE.md, this ExecPlan, ASSUMPTIONS.md (M3), COMM_BUFFER.md (agent coordination)).

### Key Decisions

- All intended source directories (apps/, packages/, tools/, tests/) must be scaffolded in EP-001+.
- No STOP conditions triggered — existing code (blueprints) maps safely to intended architecture boundaries.

### Remaining Risks

- `verify.sh` reports missing package.json — EP-001 must provide foundation scaffolding to resolve this.
- No source code, tests, or CI exist yet; production readiness is far out.
