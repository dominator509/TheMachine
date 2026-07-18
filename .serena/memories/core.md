# Core

- Repo root: `C:\dev\TheMachine`; local-first agentic development platform built around bounded ExecPlans.
- Durable repo context: `REPO_BRIEF.md`; authority workflow: `AGENTS.md` -> `COMMANDS.md` -> `.agent/PLANS.md` -> active `.agent/execplans/*`.
- Source-of-truth guardrails: one active ExecPlan, exact validation commands, progress/decision/outcome ledger, STOP on secrets/destructive deploy/migration/unclear production decisions.
- Write-protected by governance unless explicitly authorized: `ARCHITECTURE.md`, `BUILD_ROADMAP.md`, `ROADMAP.md`.
- Repo-local state and generated zones stay uncommitted: `.machine/`, `release/`, `dist/`, `build/`, `.turbo/`, `test-results/`, coverage, logs, `.env*`.
- Read module memories when touching code: service/storage/runtime in `mem:backend/core`; CLI/desktop/UI in `mem:frontend/core`; providers/MCP/plugin/security in `mem:integrations/core`.
- Serena config is repo-local in `.serena/project.yml`; project uses LSP backend and ignores generated/cache/local-state paths only.