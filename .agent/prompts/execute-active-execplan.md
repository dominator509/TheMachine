# Prompt: Execute Active ExecPlan

Read `AGENTS.md`, `COMMANDS.md`, `.agent/PLANS.md`, and `[EXECPLAN_PATH]`.

Optional user request context: `[OPTIONAL_USER_REQUEST]`

Implement `[EXECPLAN_PATH]` to completion.

Rules: do not ask for next steps; do not implement from `ROADMAP.md`; do not broaden scope; complete milestones in order; validate after each milestone; update Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective; use only commands from `COMMANDS.md`; stop only under STOP conditions in `AGENTS.md`; apply anti-fixation retry budget; run final validation and `git diff --name-only`; report changed files, commands, results, decisions, risks, and acceptance status.
