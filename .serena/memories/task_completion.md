# Task Completion

- Required repo workflow for coding tasks: read `AGENTS.md`, `COMMANDS.md`, `.agent/PLANS.md`, active ExecPlan, and the ExecPlan's Files to Read First before edits.
- Minimum completion evidence follows active ExecPlan validation commands; typical final local gate set: preflight, lint, typecheck, unit, integration, build, release build, smoke, production readiness.
- Extra release-confidence gates when production readiness is implicated: e2e, security check, dependency audit, and final CLI smoke.
- Always run `git diff --name-only` and compare changed files to ExecPlan expected files; also inspect `git status --short --untracked-files=all` for ignored/untracked setup drift.
- Update ExecPlan Progress, Surprises & Discoveries, Decision Log, Outcomes & Retrospective before final response.
- Report exact commands/results and any known baseline failures. Current known baseline: `pnpm run format:check` can fail broadly across pre-existing repo formatting drift; do not mass-format unrelated files in scoped work.
- Never claim deployed/signed/published unless the specific deployment/signing/publishing command was run with explicit approval.