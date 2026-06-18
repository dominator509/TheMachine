# EP-002-core-domain: Core Domain

## 1. Purpose / Big Picture

Implement pure domain model and anti-failure business logic.

## 2. Scope

In scope: work required to complete this plan only, with milestone validation and documented decisions. Linked specs: SPEC-001, SPEC-006.

## 3. Non-goals

No database, network, GUI, shell command execution, or provider SDK code. Do not broaden scope, refactor unrelated code, change unrelated files, or ask for next steps unless a STOP condition applies.

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

Expected changed files: packages/core/\*\*, tests, this ExecPlan.

Forbidden changes: unrelated source files, unrelated docs, production data, secrets, broad formatting rewrites, and any file outside this plan unless justified in the Decision Log.

## 7. Interfaces and Contracts

Commands must come from `COMMANDS.md`. Public APIs, package exports, routes, CLI commands, schemas, migrations, and environment variables must be verified from repository files or created in this plan with tests.

## 8. Milestones

### M0: Preflight

- Goal: Ensure foundation exists.
- Files to read: package manifests
- Files to change: none
- Exact edits expected: Run preflight.
- Validation command: `./scripts/preflight.sh`
- Expected result: `preflight: ok`
- Recovery instruction: STOP if EP-001 not complete.

### M1: Domain entities

- Goal: Add core entities and types.
- Files to read: SPEC-001
- Files to change: packages/core/src/domain/\*\*
- Exact edits expected: Define Workspace, ExecPlan, Milestone, Run, Command, Validation, Provider, MCP, Plugin, Readiness types.
- Validation command: `./scripts/typecheck.sh`
- Expected result: `typecheck: ok`
- Recovery instruction: Simplify types before adding abstractions.

### M2: ExecPlan validation

- Goal: Validate required sections and one-active-plan invariant.
- Files to read: .agent/PLANS.md, AGENTS.md
- Files to change: packages/core/src/execplan/\*\*, tests
- Exact edits expected: Section parser/validator and tests.
- Validation command: `./scripts/test-unit.sh`
- Expected result: `unit tests: ok`
- Recovery instruction: Use minimal markdown parser if dependency unnecessary.

### M3: Anti-failure controller

- Goal: Implement retry budget, STOP, scope/diff rules.
- Files to read: AGENTS.md
- Files to change: .agent/EXECUTION_RULES.md, packages/core/src/control/\*\*
- Exact edits expected: Pure functions/state machine.
- Validation command: `./scripts/test-unit.sh`
- Expected result: `unit tests: ok`
- Recovery instruction: Split complex logic into smaller pure functions.

### M4: Profiles and readiness

- Goal: Model provider/MCP/plugin profiles and readiness gates.
- Files to read: SPEC-005, SPEC-008
- Files to change: packages/core/src/integrations/**, packages/core/src/readiness/**
- Exact edits expected: Validated models without secret values.
- Validation command: `./scripts/test-unit.sh`
- Expected result: `unit tests: ok`
- Recovery instruction: Use SecretReference instead of secret values.

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
- [x] M1: Domain entities complete.
- [x] M2: ExecPlan validation complete.
- [x] M3: Anti-failure controller complete.
- [x] M4: Profiles and readiness complete.
- [x] Final validation complete.
- [x] Final diff review complete.

## 13. Surprises & Discoveries

- CLI `createExecPlan` call needed updating to match new 3-arg signature. Fixed with proper branded type assertions.
- Prettier formatting needed across all new files after creation.
- ESLint caught template literal number usage (`restrict-template-expressions`) — fixed with explicit `String()`.
- `StopCondition` name conflict between domain and control modules — resolved by selective exports in core index.
- The `Missing` field was added to `ScopeCheck` to properly detect when expected files aren't changed.

## 14. Decision Log

| Date       | Decision                                  | Reason                                                                            | Files Affected                                                  |
| ---------- | ----------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 2026-06-16 | Initial plan generated for The Machine.   | Project requires bounded, restartable implementation by lower-tier coding agents. | This ExecPlan                                                   |
| 2026-06-16 | Domain entities in separate files.        | Clean separation per entity group.                                                | packages/core/src/domain/\*                                     |
| 2026-06-16 | ExecPlan validator as pure functions.     | Keeps core free of infrastructure imports.                                        | packages/core/src/execplan/\*                                   |
| 2026-06-16 | Anti-failure controller as state machine. | Retry budget, STOP conditions, and scope enforcement as pure state transitions.   | packages/core/src/control/\*                                    |
| 2026-06-16 | Integration validators + readiness gates. | Validated models per SPEC-005/SPEC-008 without secret values.                     | packages/core/src/integrations/_, packages/core/src/readiness/_ |
| 2026-06-16 | CLI updated for new createExecPlan sig.   | API changed from 1-arg to 3-arg; minimal fix to keep CLI building.                | apps/cli/src/index.ts                                           |
| 2026-06-16 | Selective exports avoid name conflict.    | `StopCondition` exported from both domain and control; explicit re-exports used.  | packages/core/src/index.ts                                      |
| 2026-06-16 | Added `missing` to ScopeCheck.            | Scope enforcement must detect when expected files aren't changed.                 | packages/core/src/control/scope.ts                              |

## 15. Outcomes & Retrospective

EP-002-core-domain complete. All milestones M0–M4 implemented and validated.

## What was built

- **M0: Preflight** — Foundation confirmed (`preflight: ok`).
- **M1: Domain entities** — Workspace, ExecPlan, Milestone, AgentRun, CommandRun, ValidationResult, ProviderConfig, MCPConfig, PluginManifest, ReadinessGate, SecretReference, IntegrationProfile types + pure constructors.
- **M2: ExecPlan validation** — Section parser/validator, one-active-plan invariant, milestone field validation. 17 unit tests.
- **M3: Anti-failure controller** — RetryBudget state machine (3-strike rule), StopCondition evaluator (7 conditions), ScopeEnforcer (expected vs actual file check). 20 unit tests.
- **M4: Profiles and readiness** — Provider, MCP, Plugin validators. Readiness gate create/evaluate. 26 unit tests.

## Validation results

| Check              | Result     |
| ------------------ | ---------- |
| preflight          | ok         |
| lint (12 packages) | ok         |
| format check       | ok         |
| typecheck          | ok         |
| unit tests (65)    | all passed |
| integration tests  | ok         |
| e2e tests          | ok         |
| build              | ok         |
| security check     | ok         |
| dependency audit   | ok         |
| smoke test         | ok         |

## Changed files

- `packages/core/src/domain/*.ts` — 5 files (types, workspace, execplan, run, integrations + barrel)
- `packages/core/src/execplan/*.ts` — 2 files (validator + barrel)
- `packages/core/src/control/*.ts` — 4 files (retryBudget, stopConditions, scope + barrel)
- `packages/core/src/integrations/*.ts` — 4 files (providerValidator, mcpValidator, pluginValidator + barrel)
- `packages/core/src/readiness/*.ts` — 2 files (gates + barrel)
- `packages/core/src/index.ts` — updated with all new re-exports
- `apps/cli/src/index.ts` — fixed for new `createExecPlan` signature
- `.agent/EXECUTION_RULES.md` — created with anti-drift/hallucination/fixation rules
- `.agent/execplans/EP-002-core-domain.md` — progress and outcomes updated
- `tests/*.unit.test.ts` — 3 files (65 tests total)

## Decisions

- Branded types (`EntityId`, `Label`, `Priority`) used for domain safety without runtime cost.
- Pure functions throughout core — no infrastructure imports.
- Selective re-exports in core index.ts to avoid naming collisions.
- ScopeCheck includes `missing` field to detect when expected files aren't touched.

## Risks

- Branded types require `as` assertions at boundary crossing (strings→entities); internal domain code is type-safe.
- esbuild CVE (GHSA-gv7w-rqvm-qjhr) via vitest dependency — pre-existing, documented, non-blocking.
- No persistence layer yet — all state is in-memory; EP-003 will add SQLite storage.
- CLI uses type assertions for branded types — this is expected at infrastructure boundaries.

## Non-goals still excluded

- No database, network, GUI, shell execution, or provider SDK code.
- No broad refactors or file reorganizations.
