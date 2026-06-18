# ARCHITECTURE.md

## Purpose

This document defines The Machine's intended architecture, boundaries, import rules, runtime flow, persistence rules, external integration boundaries, and invariants.

## System Overview

The Machine is a local-first agentic development platform with a Windows 10+ desktop GUI, cross-platform CLI, local service/runtime, SQLite persistence, provider adapters, MCP adapters, plugin SDK, security layer, and observability layer. It executes repository-local blueprint files and one active ExecPlan at a time.

## Current State (Discovered — EP-000 M4)

The repository is a **pure blueprint pack** — no source code exists yet. The current structure is limited to documentation, agent orchestration files, and shell scripts:

```
/
  AGENTS.md, ARCHITECTURE.md, ASSUMPTIONS.md, COMMANDS.md
  COMM_BUFFER.md, CONTRIBUTING.md, DECISIONS.md, DEPLOYMENT.md
  ENVIRONMENT.md, OBSERVABILITY.md, OPERATIONS.md, PRODUCTION_READINESS.md
  PROJECT_BRIEF.md, RELEASE.md, ROADMAP.md, ROLLBACK.md, SECURITY.md, TESTING.md
  .gitignore
  .agent/
    checklists/       # 9 checklists (agent-readiness through validation)
    execplans/        # 11 ExecPlans (EP-000 through EP-010)
    prompts/          # 4 agent prompt templates
    scripts/          # Agent-side helper scripts
    specs/            # 9 specs (SPEC-000 through SPEC-008)
    templates/        # 5 document templates
  scripts/            # 14 shell scripts (preflight, build, test, etc.)
  docs/               # Empty — reserved for future generated documentation
```

Missing from intended structure (to be created in EP-001+):

- `apps/desktop`, `apps/cli` — no GUI or CLI yet
- `packages/core`, `packages/agent-runtime`, `packages/service`, `packages/providers`, `packages/mcp`, `packages/storage`, `packages/plugin-sdk`, `packages/security`, `packages/observability`, `packages/ui-components` — no packages yet
- `tools/db`, `tools/security`, `tools/smoke`, `tools/readiness` — no tools yet
- `tests/fixtures`, `tests/integration`, `tests/e2e` — no tests yet
- `package.json`, `pnpm-workspace.yaml`, `tsconfig.json` — no package manager or build config yet

This is a **greenfield repository**. All source code, infrastructure, and application-level config must be scaffolded in EP-001 onward.

## Intended Repository Map

```text
/
  apps/
    desktop/              # Tauri 2 + React/Vite GUI
    cli/                  # TypeScript CLI
  packages/
    core/                 # Domain model and state machines
    agent-runtime/        # ExecPlan runner and anti-failure controller
    service/              # Local API/IPC boundary
    providers/            # OpenAI/Anthropic/local provider adapters
    mcp/                  # MCP registry and invocation adapter
    storage/              # SQLite schema, migrations, repositories
    plugin-sdk/           # Plugin manifest and host APIs
    security/             # Secrets, permissions, redaction
    observability/        # Logs, metrics, traces, health checks
    ui-components/        # Shared React components
  tools/
    db/ security/ smoke/ readiness/
  tests/
    fixtures/ integration/ e2e/
  scripts/
  .agent/
```

## Layer Responsibilities

- `packages/core`: pure business logic, entities, validators, state machines. No filesystem, network, DB, GUI, CLI, provider SDK, or MCP transport imports.
- `packages/storage`: SQLite connection, migrations, repositories, backups. May import `core`, `security`, and `observability`; must not import GUI or providers.
- `packages/providers`: LLM adapter implementations. Must not write storage directly or log secrets.
- `packages/mcp`: MCP server registry, tool permission checks, tool invocation normalization, audit events.
- `packages/plugin-sdk`: plugin manifest schemas, permissions, lifecycle, and host APIs.
- `packages/agent-runtime`: orchestrates plans, commands, providers, MCP, plugins, storage, security, and observability.
- `packages/service`: loopback local service or IPC API for GUI and CLI.
- `apps/cli`: terminal UX, non-interactive JSON mode, nonzero exits on failure.
- `apps/desktop`: GUI only; calls service/IPC and never bypasses runtime/storage/security.

## Dependency Rules

Allowed direction:

```text
apps/* -> packages/service -> packages/agent-runtime
packages/agent-runtime -> core/storage/providers/mcp/plugin-sdk/security/observability
storage/providers/mcp/plugin-sdk -> core/security/observability
core -> no infrastructure packages
```

Concrete rules:

- `core` must not import any infrastructure package.
- GUI and CLI must not call storage, providers, MCP, or plugins directly.
- Provider-specific code stays in `packages/providers`.
- MCP transport code stays in `packages/mcp`.
- SQLite schema changes require migrations in `packages/storage/migrations`.
- Test utilities must not be imported by production code.

## Import Rules

Use package exports, not deep cross-package imports. Shared schemas live in `packages/core` or an approved schema package. Do not import from another package's `src/internal`.

## Runtime Flow

User opens GUI or CLI, service loads workspace, runtime enforces one active ExecPlan, runtime reads blueprint files and command registry, runtime executes next incomplete milestone, commands run through `scripts/`, events and validation results persist, provider/MCP/plugin actions are permissioned and audited, retry budget applies on failure, STOP conditions halt with evidence, completion triggers final verification and readiness gates.

## Data Flow

User input -> GUI/CLI validation -> service schema -> runtime command/plan execution -> provider/MCP/plugin/command boundaries -> normalized events -> SQLite repositories -> GUI/CLI reports.

## State Management Rules

Runtime state lives in SQLite and event streams. Active ExecPlan progress persists after every milestone. Crashed runs resume from the first incomplete milestone. Chat history is never state.

## Persistence Boundaries

SQLite is v1 persistence. Destructive migrations require STOP and explicit permission. Backups must be tested before production readiness.

## External Integration Boundaries

External integrations are LLM providers, local model endpoints, MCP servers, Git, package managers, plugins, and optional distribution services. Every integration requires health check, timeout, error taxonomy, redaction, and tests.

## Security Boundaries

Security-sensitive boundaries include provider API keys, local model endpoints, MCP tools, plugins, shell commands, filesystem access, repository content sent to models, and local service binding. Defaults: loopback only, deny plugin/MCP permissions, redact logs.

## Validation Boundaries

Validate CLI args, GUI forms, service requests, domain constructors, persistence writes, provider config, MCP config, plugin manifests, command names, and environment variables.

## Error Handling Boundaries

Domain emits typed error codes. Service translates to API/IPC errors. GUI/CLI show user-safe recovery messages. Provider/MCP/plugin errors are normalized before persistence.

## Observability Boundaries

Record structured events for runs, milestones, commands, validations, provider calls, MCP calls, plugin actions, STOP conditions, retry budget progression, and readiness gates.

## Architectural Invariants

- One active ExecPlan at a time.
- No roadmap-only implementation.
- No hidden conversation context.
- Commands come from `COMMANDS.md`.
- Core domain has no infrastructure side effects.
- GUI and CLI do not bypass service/runtime.
- Secrets never enter logs unredacted.
- Every feature has tests and acceptance criteria.
- STOP conditions override autonomy.

## Forbidden Changes

Do not hard-code one provider into domain logic, make GUI the only interface, require cloud hosting for core flows, execute unrestricted plugins, add GUI-to-DB access, bypass command wrappers, store secrets in repo files, or perform broad refactors outside an ExecPlan.

## How to Add a New Feature

Update or create a spec, create a small ExecPlan, list expected files, implement through the proper layer, validate with commands from `COMMANDS.md`, update docs/decisions, and review final diff.

## How to Add a New Dependency

Inspect existing dependencies, prove need, verify package name/license/API, add to smallest package, update lockfile, add tests, record decision.

## How to Modify Data Schema

Update SPEC-002, add migration, add migration/repository tests, update backup docs, run integration tests, STOP before destructive migration.

## How to Add a New Integration

Define contract in a spec, implement in `providers`, `mcp`, or `plugin-sdk`, add health check/timeouts/error mapping/security tests/observability, update environment and security docs.

## Architecture Review Checklist

- Boundaries preserved?
- No provider lock-in?
- GUI/CLI use service?
- Commands documented?
- Migrations safe?
- Secrets redacted?
- Plugin/MCP permissions explicit?
- Tests and docs updated?

## Current Implementation State (v0.1.0)

The Machine is implemented as a TypeScript monorepo managed by pnpm workspaces with full typecheck, test, build, and release tooling.

### Packages (10 packages, 176 source files)

- **core** — Domain primitives: ExecPlan lifecycle, stop conditions (33 typed), retry budget, readiness gates, validation. Zero infrastructure imports.
- **storage** — SQLite persistence via better-sqlite3, migrations, repositories.
- **service** — Orchestration layer bridging CLI/desktop to runtime, workspace management.
- **providers** — LLM provider adapters (local, anthropic, openai) with factory pattern.
- **mcp** — MCP server type definitions and registry.
- **plugin-sdk** — Plugin type exports (stub — full loader pending PR Remediation Sprint).
- **security** — Permission engine (deny-by-default), secrets redaction, allowlisted command registry.
- **observability** — Structured event recording for runs, milestones, commands, and readiness gates.
- **agent-runtime** — Allowlisted shell command registry with execution wrapper and timeout enforcement.
- **ui-components** — React component library for desktop GUI.

### Apps (2 apps, 10 source files)

- **cli** — Full CLI application with 17 commands (help, version, health, workspace, repo, plan/plans, validation, providers, mcp, plugins, readiness, diagnostics).
- **desktop** — React/Tauri desktop application package (GUI frontend implementation active).

### Infrastructure

- **tools/** — Preflight, security check, readiness validation, release build scripts.
- **tests/** — 375 tests across 22 files (unit, integration, E2E with Playwright).
- **release/** — Bundled artifacts: machine.js (19.4KB CLI), desktop.js (17.7KB GUI).
- **scripts/** — Shell verification scripts (verify.sh, production-readiness-check.sh).

### Known Gaps (PR Remediation Sprint)

- **H-1**: plugin-sdk is a 4-line stub — needs full loader, registration, and lifecycle.
- **H-2**: Concurrency state machine not yet implemented (planned: mutex-based agent execution coordination with IDLE→ACQUIRING→ACQUIRED→RELEASING state machine, configurable max-concurrency cap, FIFO work queue, deadlock timeout).
- **H-3**: This architecture document now reflects current state (resolved).
- **M-section**: Desktop app lacks Tauri/Electron config (CLI-only for v0.1.0).
- **M-section**: Readiness checker evaluates 3 of 12 subsystems.
