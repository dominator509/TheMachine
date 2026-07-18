# REPO_BRIEF.md

Compact context for Serena, Codex, and Obsidian. Link this file instead of copying large repo content into notes.

## Purpose

The Machine is a local-first agentic development platform. It turns a repository plus blueprint/ExecPlan pack into bounded, test-backed, restartable implementation workflows for coding agents.

## Stack

- TypeScript monorepo with PNPM workspaces and Turbo.
- Node.js 20+ runtime; current package manager is `pnpm@11.6.0`.
- Vitest for unit/integration tests, Playwright for e2e tests, ESLint and Prettier for quality gates.
- SQLite-backed local persistence through `packages/storage`.
- Tauri v2 desktop shell under `apps/desktop`; CLI under `apps/cli`.

## Entrypoints

- CLI: `apps/cli/src/index.ts`.
- Desktop shell/UI helpers: `apps/desktop/src/`.
- Service/client boundary: `packages/service/src/index.ts`, `packages/service/src/client/`.
- Runtime orchestration: `packages/agent-runtime/src/`.
- ExecPlan parsing/running persistence: `packages/service/src/persistence/store.ts`.
- Provider adapters: `packages/providers/src/`.
- MCP registry/transport: `packages/mcp/src/`.
- Plugin SDK and sandboxing: `packages/plugin-sdk/src/`.

## Commands

Use repo-root commands from `COMMANDS.md`.

- Preflight: `scripts\preflight.cmd` on Windows, `./scripts/preflight.sh` on POSIX.
- Dev: `pnpm run dev`.
- Lint: `pnpm run lint`.
- Typecheck: `pnpm run typecheck`.
- Unit: `pnpm run test:unit`.
- Integration: `pnpm run test:integration`.
- E2E: `pnpm run test:e2e`.
- Build: `pnpm run build`.
- Release build: `pnpm run build:release`.
- Smoke: `node tools/smoke/smoke-test.mjs`.
- Production readiness: `node tools/readiness/production-readiness-check.mjs`.

## Important Directories

- `.agent/execplans/`: active and completed ExecPlans; follow one active plan only.
- `apps/cli`, `apps/desktop`: user-facing command and desktop surfaces.
- `packages/core`: domain types, validators, readiness primitives.
- `packages/service`: typed service contracts, handlers, client factory, GUI server helpers.
- `packages/storage`: SQLite connection, migrations, repositories, backup/restore.
- `packages/providers`, `packages/mcp`, `packages/plugin-sdk`: external integration boundaries.
- `packages/security`, `packages/observability`: permission, secret, logging, diagnostics, events.
- `tests/`: unit, integration, e2e coverage.
- `tools/`: DB, release, smoke, readiness, and security helper scripts.

## Data, Secrets, And External Services

- Local DB defaults to `.machine/the-machine.db`; override with `MACHINE_DB_PATH`.
- Provider keys such as `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` are optional and must never be committed.
- Provider, MCP, plugin, filesystem, and command execution are security boundaries.
- Tests use temp DBs and mocked/local transports by default; live credentials are not required for normal validation.

## Do Not Touch Lightly

- Do not weaken `AGENTS.md`, `COMMANDS.md`, STOP conditions, or ExecPlan workflow rules.
- Do not edit `ARCHITECTURE.md`, `BUILD_ROADMAP.md`, or `ROADMAP.md` unless explicitly authorized by repo governance.
- Do not commit build outputs, release artifacts, caches, local DB files, logs, secrets, `.env*`, `.machine/`, or `test-results/`.
- Do not deploy, sign, publish, force-push, run destructive migrations, or rewrite history without explicit approval.
- Preserve `.obsidian/` workspace state and `.serena/` local state unless the task is specifically about those tools.

## Current Unknowns / TODOs

- Release signing/distribution is not performed by default local validation.
- `pnpm run format:check` may report broad baseline drift; do not mass-format unrelated files inside scoped plans.
- Live provider and MCP smoke checks are operator-owned and optional unless a task explicitly requires them.
