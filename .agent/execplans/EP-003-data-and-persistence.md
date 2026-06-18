# EP-003-data-and-persistence: Data and Persistence

## 1. Purpose / Big Picture

Implement SQLite persistence, migrations, repositories, validation, test data, and backup/restore.

## 2. Scope

In scope: work required to complete this plan only, with milestone validation and documented decisions. Linked specs: SPEC-002, SPEC-006.

## 3. Non-goals

No cloud sync, raw secret storage, GUI, provider calls. Do not broaden scope, refactor unrelated code, change unrelated files, or ask for next steps unless a STOP condition applies.

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

Expected changed files: packages/storage/**, tools/db/**, tests, docs, this ExecPlan.

Forbidden changes: unrelated source files, unrelated docs, production data, secrets, broad formatting rewrites, and any file outside this plan unless justified in the Decision Log.

## 7. Interfaces and Contracts

Commands must come from `COMMANDS.md`. Public APIs, package exports, routes, CLI commands, schemas, migrations, and environment variables must be verified from repository files or created in this plan with tests.

## 8. Milestones

### M0: Preflight

- Goal: Confirm core exists.
- Files to read: packages/core, packages/storage
- Files to change: none
- Exact edits expected: Run preflight.
- Validation command: `./scripts/preflight.sh`
- Expected result: `preflight: ok`
- Recovery instruction: STOP if EP-002 missing.

### M1: Connection/migrations

- Goal: Create SQLite connection and migration runner.
- Files to read: SPEC-002
- Files to change: packages/storage/src/db/\*\*, migrations
- Exact edits expected: Connection factory, migrations table, first migration.
- Validation command: `./scripts/test-integration.sh`
- Expected result: Integration tests pass or fail only for known missing repos.
- Recovery instruction: Add smallest SQLite dependency with Decision Log if needed.

### M2: Initial schema

- Goal: Add required tables and constraints.
- Files to read: SPEC-002
- Files to change: migrations, schema tests
- Exact edits expected: Create tables and one-active-plan constraint.
- Validation command: `./scripts/test-integration.sh`
- Expected result: Migration applies to empty temp DB.
- Recovery instruction: Fix migration, do not bypass tests.

### M3: Repositories

- Goal: Implement CRUD/query repos.
- Files to read: core domain exports
- Files to change: packages/storage/src/repositories/\*\*, tests
- Exact edits expected: Workspace, run, command, validation, provider, MCP, plugin, event repos.
- Validation command: `./scripts/test-integration.sh`
- Expected result: Repository tests pass.
- Recovery instruction: Implement minimal required methods if surface too broad.

### M4: Secret safety

- Goal: Reject raw secret persistence.
- Files to read: SECURITY.md
- Files to change: storage validators, tests
- Exact edits expected: SecretReference-only policy and tests.
- Validation command: `./scripts/security-check.sh && ./scripts/test-integration.sh`
- Expected result: Both pass.
- Recovery instruction: Narrow validator with explicit allowed secret-reference types.

### M5: Backup/restore

- Goal: Add backup and restore utilities.
- Files to read: OPERATIONS.md, ROLLBACK.md
- Files to change: packages/storage/src/backup/**, tools/db/**
- Exact edits expected: Backup metadata and temp-DB restore test.
- Validation command: `./scripts/test-integration.sh`
- Expected result: Backup/restore test passes.
- Recovery instruction: Never restore over real DB without approval.

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
- [x] M1: Connection/migrations complete.
- [x] M2: Initial schema complete.
- [x] M3: Repositories complete.
- [x] M4: Secret safety complete.
- [x] M5: Backup/restore complete.
- [x] Final validation complete.
- [x] Final diff review complete.

## 13. Surprises & Discoveries

- better-sqlite3 native compilation requires node-gyp and build tools (gcc, g++, python3, make). Prebuilt binaries are not available for Node 24 on this platform.
- pnpm `--ignore-scripts` flag removes native compiled binaries on reinstall. Must use `pnpm install` with proper `allowBuilds` config or rebuild after.
- better-sqlite3's `.backup()` method is async (returns Promise).
- better-sqlite3 does not have a `.restore()` method — restore is done by opening the backup file directly.
- In-memory databases cannot be opened in readonly mode.
- WAL mode pragma is not returned by better-sqlite3 for in-memory databases on all platforms.
- The `INSERT OR REPLACE` statement swallows UNIQUE constraint violations — use `INSERT` for constraint enforcement.

## 14. Decision Log

| Date       | Decision                                | Reason                                                                            | Files Affected                               |
| ---------- | --------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------- |
| 2026-06-16 | Initial plan generated for The Machine. | Project requires bounded, restartable implementation by lower-tier coding agents. | This ExecPlan                                |
| 2026-06-16 | Use better-sqlite3 for SQLite.          | Synchronous API, well-maintained, SQLite backup support, good TypeScript types.   | packages/storage/package.json                |
| 2026-06-16 | WAL mode + foreign_keys ON by default.  | Better concurrent read performance and referential integrity for local-first app. | packages/storage/src/db/connection.ts        |
| 2026-06-16 | Generic repository pattern.             | Domain entities share CRUD pattern; single generic repo avoids N repos per type.  | packages/storage/src/repositories/generic.ts |
| 2026-06-16 | Partial update only modified columns.   | Avoids setting non-key columns to null on partial updates.                        | packages/storage/src/repositories/generic.ts |
| 2026-06-16 | Readonly connections skip pragmas.      | Opening a readonly database cannot set WAL or foreign_keys pragmas.               | packages/storage/src/db/connection.ts        |

## 15. Outcomes & Retrospective

EP-003 successfully implemented SQLite persistence for The Machine:

**Created:**

- `packages/storage/src/db/`: Connection factory (in-memory + file-based, readonly support), migration runner with idempotent apply
- `packages/storage/src/migrations/`: M001_initial_schema — 11 tables (workspaces, execplans, milestones, agent_runs, commands, validations, decisions, integrations, integration_permissions, events) plus the \_migrations tracking table
- `packages/storage/src/repositories/`: Generic repository with CRUD operations supporting partial updates
- `packages/storage/src/validators/`: SecretReference validation — rejects raw secret strings, raw value/secret fields, missing key/provider
- `packages/storage/src/backup/`: Backup with metadata, backup file info, backup file opening for verification

**Tests:** 33 integration tests + 65 unit tests = 98 total, all passing.

**Key metrics:**

- SQLite connection with WAL mode and foreign keys
- One-active-plan constraint via partial unique index
- Migration idempotence verified
- Foreign key enforcement verified
- SecretReference-only persistence policy with comprehensive validation
- Backup with metadata and file-based restore verification

**Remaining risks:**

- better-sqlite3 native compilation requires build tools; not reproducible on all platforms without them
- Backup/restore is file-based; no in-memory restore API — backup file must be opened directly
- No destructive migration support yet (additive only)
- No DB health checks integrated into the service layer (future EP)
- Pnpm `--ignore-scripts` removes native binaries — must ensure `pnpm install` runs with build scripts allowed
