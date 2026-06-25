# Functionality Audit Briefing

Date: 2026-06-23

## Executive Summary

The original audit found substantial scaffolded source, tests, and release tooling, but not production readiness. EP-011 has now closed the immediate runtime blockers and replaced the highest-risk fake or placeholder paths with locally verifiable implementations.

Current status: local build, smoke, storage-backed ExecPlan run, provider HTTP adapters with mocked transports, MCP stdio JSON-RPC fixture invocation, DB setup/migration tooling, and readiness checks are implemented and validated. Runtime readiness now derives provider/MCP/plugin/shared-UI gates from local registration state and explicit release decisions. The repository still should not be described as production-launched: real operator configuration, third-party plugin sandboxing decisions, release-channel acceptance, and release approval are still required.

## Validation Evidence

- `pnpm run typecheck` passed after EP-011 changes: 20/20 turbo tasks successful.
- `pnpm run test:unit` passed: 350/350 tests.
- `pnpm run test:integration` passed: 131/131 tests, including temp SQLite DB tools, persisted ExecPlan run, provider HTTP mocks, and MCP stdio fixture coverage.
- EP-013 added local release-decision readiness coverage: `pnpm run test:unit` passed 354/354 and `pnpm run test:integration` passed 132/132 after provider/MCP/plugin/shared-UI readiness became state-derived.
- `pnpm run build:release` passed and emitted ESM release bundles without the previous `import.meta` CJS warning.
- `node tools/smoke/smoke-test.mjs` passed: 22/22 checks.
- `node tools/readiness/production-readiness-check.mjs` passed under Windows direct invocation: 32/32 checks.
- Windows `.cmd` wrappers now exist for preflight, verify, smoke, and production readiness.

## EP-011 Remediation Status

| Finding | Status | EP-011 result |
| ------- | ------ | ------------- |
| FA-001 | Closed | Built CLI ESM import now resolves and smoke executes CLI commands. |
| FA-002 | Closed | Readiness checker uses `fileURLToPath` and passes on Windows. |
| FA-003 | Closed | Windows-native `.cmd` wrappers and docs were added. |
| FA-004 | Closed for local execution | ExecPlans parse from Markdown, persist to SQLite, and `run.start` executes milestone validation synchronously. |
| FA-005 | Closed for local/tested transports | Provider adapters use real HTTP request paths with injected fetch and redacted errors; live credentials remain operator configuration. |
| FA-006 | Closed for stdio | MCP invocation uses stdio JSON-RPC with fixture coverage; unsupported transports return explicit errors. |
| FA-007 | Closed | DB tools call storage migration APIs and create deterministic migration scaffolds. |
| FA-008 | Closed | Runtime readiness reports all 12 documented subsystems and provider/MCP/plugin/shared-UI gates are derived from local state plus explicit release decisions. |
| FA-009 | Open risk | Plugin execution remains trusted first-party/interface isolation only; third-party sandboxing is not enabled. |
| FA-010 | Closed | Release bundles are ESM. |
| FA-011 | Closed | Smoke now fails with targeted prerequisite messages when build/release artifacts are missing. |
| FA-012 | In progress | Docs are being corrected by EP-011 to remove release-readiness overclaims. |

## Production Blockers

### FA-001: Built CLI fails at startup

Severity: Critical

Evidence:
- `node tools/smoke/smoke-test.mjs` fails every CLI command with `ERR_MODULE_NOT_FOUND`.
- The missing module is `C:\dev\TheMachine\packages\observability\dist\emit\emitToGUI`, imported from `packages\observability\dist\emit\index.js`.
- Source file `packages/observability/src/emit/index.ts` exports from `./emitToGUI` without a `.js` extension, and the emitted ESM keeps `export { emitToGUI, emitToGUIAsync } from "./emitToGUI";`.

Impact:
- `apps/cli/dist/index.js` cannot run.
- Smoke, CLI health, diagnostics, readiness, provider listing, MCP listing, plugin listing, plan loading, and repository discovery are all blocked at startup.

Recommended default:
- Fix the ESM import extension in `packages/observability/src/emit/index.ts` and add a smoke or integration test that executes the built CLI entrypoint on Windows.

### FA-002: Production readiness checker has a Windows path-resolution bug

Severity: High

Evidence:
- Direct command `node tools/readiness/production-readiness-check.mjs` reports all package, script, tool, and root doc files missing.
- The checked files exist in the repository.
- `tools/readiness/production-readiness-check.mjs` derives `ROOT` with `new URL("../../", import.meta.url).pathname`, which yields an invalid Windows path shape for `existsSync` checks.

Impact:
- Production readiness can falsely fail on Windows.
- This undermines the final launch gate and makes readiness evidence shell-dependent.

Recommended default:
- Use `fileURLToPath(new URL("../../", import.meta.url))` and add a Windows-path regression test.

### FA-003: Documented preflight command is not runnable in this Windows environment

Severity: High

Evidence:
- `bash ./scripts/preflight.sh` fails because Windows `bash.exe` is WSL and WSL has no installed distributions.
- No `sh.exe` or Git Bash was found on PATH.
- `COMMANDS.md` requires shell scripts such as `./scripts/preflight.sh`, `./scripts/verify.sh`, and `./scripts/smoke-test.sh`.

Impact:
- A clean Windows user cannot run the documented validation workflow without extra shell setup.
- This conflicts with the project goal of Windows 10+ desktop/CLI support.

Recommended default:
- Add Windows-native wrapper scripts or document Git Bash/WSL as an explicit prerequisite in `ENVIRONMENT.md` and `COMMANDS.md`.

## Functional Code Gaps

### FA-004: ExecPlan load/run behavior is mostly in-memory scaffolding

Severity: High

Evidence:
- `packages/service/src/handlers/planHandler.ts` returns a generic `Loaded Plan` with `milestoneCount: 0` instead of parsing the plan file.
- `packages/service/src/handlers/runHandler.ts` creates an in-memory active run using `Date.now()` and does not execute milestones or commands.

Impact:
- The core product promise, "run small, bounded ExecPlans through autonomous coding-agent passes," is not implemented in the service path.

Recommended default:
- Implement real ExecPlan parsing, active-plan persistence, milestone state, command execution through the allowlist, validation recording, and STOP-condition handling.

### FA-005: Provider adapters return fake completions

Severity: High

Evidence:
- `packages/providers/src/adapters/openai.ts` is marked "fake transport" and returns `[OpenAI fake response ...]`.
- `packages/providers/src/adapters/anthropic.ts` is marked "fake transport" and returns `[Anthropic fake response ...]`.
- `packages/providers/src/adapters/local.ts` is marked "fake transport" and returns `[Local model fake response ...]`.
- Integration tests assert the fake strings.

Impact:
- OpenAI-compatible, Anthropic-compatible, and local model configuration cannot be considered production functional.

Recommended default:
- Implement real HTTP transports with timeout, redaction, health checks, and opt-in credential handling, keeping fake adapters as test fixtures only.

### FA-006: MCP invocation is mocked

Severity: High

Evidence:
- `packages/mcp/src/registry.ts` is marked "permissioned mock with fake transport."
- Successful invocations return `[MOCK MCP] ... invoked` instead of calling an MCP server.

Impact:
- MCP setup, invocation, permissioning, and audit are not production-functional beyond registry semantics.

Recommended default:
- Add a real MCP transport layer and keep the current mock as a unit-test adapter.

### FA-007: Database CLI tools are placeholders

Severity: Medium

Evidence:
- `tools/db/setup.mjs` says "Database setup placeholder."
- `tools/db/migrate.mjs` says "Run migrations placeholder."
- `tools/db/rollback.mjs` says "Rollback migrations placeholder."
- `tools/db/create-migration.mjs` only prints `Migration scaffold for: <name> (placeholder)`.

Impact:
- Documented database setup, migration, rollback, and migration creation commands do not operate on the implemented storage migration layer.

Recommended default:
- Wire the tools to `packages/storage` connection/migrator APIs and use temp DBs for validation.

### FA-008: Runtime readiness only covers three subsystems

Severity: Medium

Evidence:
- `packages/service/src/handlers/readinessHandler.ts` hard-codes only `core`, `storage`, and `service`.
- The root README and readiness checker describe 12 subsystems.

Impact:
- User-facing readiness can report `ready` while providers, MCP, plugins, observability, CLI, desktop, agent-runtime, security, and ui-components are not assessed.

Recommended default:
- Align service readiness with the 12-subsystem readiness model and include degraded/disabled states where appropriate.

### FA-009: Plugin execution is not a true sandbox

Severity: Medium

Evidence:
- `packages/plugin-sdk/src/executor.ts` notes that true sandboxing requires additional infrastructure and currently provides interface-level isolation for trusted first-party plugins.

Impact:
- Production plugin safety is weaker than the project security boundary implies.

Recommended default:
- Either scope plugin support to trusted first-party plugins in docs/readiness, or implement real isolation before enabling third-party plugins.

## Tooling And Release Gaps

### FA-010: Release bundling emits import.meta warnings

Severity: Medium

Evidence:
- `pnpm run build:release` warns that `import.meta` is not available with CJS output for `packages/service/dist/gui/themes/loader.js` and `packages/service/dist/gui/pipelineServer.js`.

Impact:
- The release bundle may break GUI theme loading or pipeline server paths at runtime.

Recommended default:
- Bundle as ESM or adjust those modules to avoid `import.meta` in CJS release output.

### FA-011: Smoke test depends on generated artifacts but does not build them

Severity: Medium

Evidence:
- Before `pnpm run build`, smoke fails because `apps/cli/dist/index.js` is missing.
- Before `pnpm run build:release`, smoke fails release artifact checks for `release/machine.js` and `release/desktop.js`.

Impact:
- Smoke results depend on prior local build state, making clean-checkout validation fragile.

Recommended default:
- Make smoke prerequisites explicit, or have `scripts/smoke-test.sh` fail with a targeted "run build/release build first" diagnostic.

## Documentation And Governance Gaps

### FA-012: Architecture and readiness docs are stale or contradictory

Severity: Medium

Evidence:
- `ARCHITECTURE.md` still contains an EP-000 "pure blueprint pack" current state while the repository now has `apps/`, `packages/`, tests, and tools.
- The same file later has "Current Implementation State (v0.1.0)" and "Known Gaps" entries that conflict with `KNOWN_ISSUES.md` resolved statuses.
- `PRODUCTION_READINESS.md` checks every production-readiness category except final launch approval as complete, but this audit found CLI startup and readiness-tool blockers.

Impact:
- Source-of-truth docs can mislead agents into overclaiming readiness.

Recommended default:
- Update architecture/readiness docs after the runtime smoke blocker is fixed, and make unresolved gaps match `KNOWN_ISSUES.md`.

## Positive Signals

- TypeScript compilation passes after dependency installation.
- Unit tests pass: 350/350.
- Workspace build passes: 12/12.
- Release build emits artifacts.
- Security staged-file scan passes.
- Storage package contains real SQLite connection, migrations, repositories, and backup/restore test coverage.

## Launch Recommendation

Do not treat this repository as production-launched yet. The immediate runtime blockers are closed, and local validation is substantially stronger, but final launch still requires explicit user approval, accepted live-integration configuration, and a decision on whether plugin support remains trusted-first-party or receives a true isolation boundary.
