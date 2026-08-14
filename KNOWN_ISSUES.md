# KNOWN_ISSUES.md — Canonical Bug & Error Registry

Adapted from PANTAW-ERR structured error logging. All errors, gaps, and deferred findings
are registered here. RELEASE.md "Known Issues" sections are derived from this file.

## Schema

Each entry:

```
### {issue_id} — {severity}

- **Component**: {station/package}
- **Source**: human | audit | obs_aggregate | bench_regression | meta_kaizen
- **Description**: What is broken or missing
- **Evidence**: Links to test failures, audit reports, error logs
- **Status**: open | in_progress | pending_human_review | resolved | rejected
- **Proposed Fix**: If a proposal exists from the feedback loop
- **Resolution**: How it was fixed (populated on resolve)
```

## Active Issues

No active issues are currently registered from EP-014.

### KI-001 — HIGH

- **Component**: plugin-sdk (packages/plugin-sdk/)
- **Source**: audit
- **Description**: Zero test coverage for 5 plugin-sdk source files (539 lines). Loader (103 lines),
  registry (78 lines), executor (107 lines), types (45 lines), index (206 lines) have no
  corresponding test files. Plugin sandboxing and lifecycle hooks are untested.
- **Evidence**: `grep -r "plugin-sdk" tests/` returns zero matches. All 5 src files lack
  corresponding test files.
- **Status**: resolved
- **Proposed Fix**: Ip Man — write 22 unit tests covering registry lifecycle, hooks, error isolation, loader, host API
- **Resolution**: 22 unit tests committed in tests/unit/plugin-sdk.unit.test.ts. All passing.

### KI-002 — HIGH

- **Component**: core (packages/core/src/control/concurrency.ts)
- **Source**: audit
- **Description**: Zero test coverage for concurrency state machine (290 lines). IDLE→ACQUIRING→
  ACQUIRED→RELEASING transitions, FIFO queue, deadlock detection, and max-concurrency cap
  have no test validation. State machine correctness is unverified.
- **Evidence**: `grep -r "concurrency" tests/` returns zero matches. No test for state transitions.
- **Status**: resolved
- **Proposed Fix**: Ip Man — write 21 unit tests for concurrency state machine (IDLE→ACQUIRING→ACQUIRED→RELEASING, FIFO queue, deadlock detection)
- **Resolution**: 21 unit tests committed in tests/unit/concurrency.unit.test.ts. All passing.

### KI-003 — HIGH

- **Component**: plugin-sdk + core (git tracking)
- **Source**: audit
- **Description**: plugin-sdk (5 files) and concurrency.ts are untracked in git. `git status`
  shows `??` for all of them. Ip Man wrote the code but never committed. Code exists on disk
  but is invisible to the release pipeline and CI.
- **Evidence**: `git status packages/plugin-sdk/ packages/core/src/control/concurrency.ts`
  shows untracked status.
- **Status**: resolved
- **Proposed Fix**: Ip Man — git add and commit plugin-sdk (5 files) and concurrency.ts
- **Resolution**: 10 files, 1390 insertions committed. Git hash: 72b12d7.

### KI-004 — MEDIUM

- **Component**: apps/desktop/
- **Source**: audit
- **Description**: Desktop app package has no Tauri or Electron configuration. apps/desktop/
  is a TypeScript CLI package, not the native desktop GUI specified by EP-005.
- **Evidence**: No Tauri config files exist. No Electron main process. `apps/desktop/` only
  exports CLI functionality.
- **Status**: resolved
- **Proposed Fix**: Tauri v2 scaffold in apps/desktop/src-tauri/ (commit 79dfd01)
- **Resolution**: Tauri v2 scaffold created. 6 files: tauri.conf.json, Cargo.toml, main.rs,
  lib.rs, build.rs, package.json with @tauri-apps/api v2. CLI wrapped as run_cli Tauri
  command. Existing TypeScript code reused — not replaced.

### KI-005 — MEDIUM

- **Component**: tools/production-readiness-check.sh
- **Source**: audit
- **Description**: Production readiness checker only evaluates 3 of 12 subsystems (core,
  storage, service). Omits providers, mcp, security, observability, agent-runtime,
  plugin-sdk, cli, desktop, ui-components.
- **Evidence**: Readiness check script only tests core, storage, service packages.
- **Status**: resolved
- **Proposed Fix**: Expand checker to evaluate all 12 subsystems (commit 28cf179)
- **Resolution**: New tools/readiness/production-readiness-check.mjs evaluates all 12
  subsystems plus scripts, tools, and release docs. Summary table with pass/fail per
  subsystem. Original shell script also updated.

### KI-006 — MEDIUM

- **Component**: repo root
- **Source**: audit
- **Description**: No README.md exists at repository root. New users and contributors
  have no entry point documentation.
- **Evidence**: `ls README.md` returns no such file.
- **Status**: resolved
- **Proposed Fix**: Write README.md with overview, quick start, architecture, testing, contributing
- **Resolution**: README.md created with overview, quick start, 12-subsystem architecture
  table, test commands, contributing guidance, and license section.

### KI-007 — LOW

- **Component**: apps/cli/
- **Source**: audit
- **Description**: CLI --help flag returns "Unknown command" before showing help text.
  Flag parsing order bug causes --help to be processed after the unknown-command handler.
- **Evidence**: Running `cli --help` produces error output followed by help text.
- **Status**: resolved
- **Proposed Fix**: Move --help flag check before command dispatch (commit 83b8ee4)
- **Resolution**: --help flag now filtered at line 290 (before nonFlagArgs construction).
  When --help is consumed, command defaults to "help" and the dispatch switch routes
  correctly. No more "Unknown command" error.

### KI-008 — LOW

- **Component**: tools/auto-review.mjs
- **Source**: audit
- **Description**: auto-review.mjs audit tool is referenced in documentation but the
  file doesn't exist.
- **Evidence**: `ls tools/auto-review.mjs` returns no such file.
- **Status**: resolved
- **Proposed Fix**: Create tools/auto-review.mjs (commit f2eaaa0)
- **Resolution**: auto-review.mjs created. 4 sequential gates (typecheck, lint, unit tests,
  integration tests). Stops on first failure. Summary table with pass/fail/exit-code
  per gate. Patterned after PANTAW-BENCH-RUN sequential gate pattern.

### KI-009 — LOW

- **Component**: repo root
- **Source**: audit
- **Description**: Prettier formatting warnings on COMM_BUFFER.md and READINESS.md.
  These files are not covered by the formatting pipeline.
- **Evidence**: Running prettier --check produces warnings for both files.
- **Status**: resolved
- **Proposed Fix**: Run prettier --write on both files
- **Resolution**: Both files pass `prettier --check` (no changes needed). Formatting
  pipeline verified clean.

### KI-010 — MEDIUM

- **Component**: All (proposal feedback loop)
- **Source**: audit
- **Description**: No self-improving proposal feedback loop exists. The PANTAW-inspired
  architecture specified META-KAIZEN-ADVISOR style feedback (errors → OBS → proposal →
  DRIFT-WARDEN → human queue) but the implementation has no proposal generation, no
  validation gate, and no promotion mechanism.
- **Evidence**: Grep for architecture_proposal, META_KAIZEN, feedback loop returns zero
  matches in AGENTS.md and source code.
- **Status**: resolved
- **Proposed Fix**: AGENTS.md §5.1 Proposal Feedback Loop (ratified 2026-06-17)
- **Resolution**: Full feedback loop protocol ratified. AGENTS.md §5.1 contains XML proposal
  schema (7 fields + evidence + impact blocks), 5-layer DRIFT-WARDEN validation gate
  (envelope/invariants/scope/evidence/reversibility), 3 halt conditions (cold-start,
  circuit breaker, drift acceleration), and complete promotion flow (discovery → proposal →
  validation → human queue → accept/reject → implement → audit). KNOWN_ISSUES.md proposal
  queue section ready. One minor gap: proposal XML clearing mechanism underspecified —
  fixable in practice, non-blocking.

## Proposal Queue

Proposals generated by the feedback loop that await human review. Populated by
the AGENTS.md §5.1 protocol.

<!-- proposal entries appear here when generated by agents -->

## Resolved Issues

### KI-011 — MEDIUM

- **Component**: plugin-sdk (packages/plugin-sdk/)
- **Source**: audit
- **Description**: Plugin execution lacked a true third-party sandbox. The previous executor provided interface-level isolation for trusted first-party plugins, but third-party plugin execution was not isolated strongly enough for production enablement.
- **Evidence**: `FUNCTIONALITY_AUDIT_BRIEFING.md` FA-009; pre-EP-014 `packages/plugin-sdk/src/executor.ts` documented that true sandboxing required additional infrastructure.
- **Status**: resolved
- **Proposed Fix**: Implement a true isolation boundary before enabling third-party plugins.
- **Resolution**: EP-014 added subprocess sandbox execution with Node permission restrictions, plugin-directory scoped reads, denied writes by default, scrubbed environment, timeout handling, and focused unit coverage in `tests/unit/plugin-sdk.unit.test.ts`.
