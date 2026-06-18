# Prompt: Debug Validation Failure

Read `AGENTS.md`, `COMMANDS.md`, `.agent/PLANS.md`, and the active ExecPlan.

Inputs:

- Failing command: `[FAILING_COMMAND]`
- Error output: `[ERROR_OUTPUT]`

Rules: do not rewrite unrelated code; capture exact failing command and exact error; form one hypothesis; make smallest targeted fix; rerun narrow command; after two same-root failures run narrower diagnostic; after three same-root failures stop current approach, record failed hypotheses in Surprises & Discoveries, choose a simpler safe path if inside scope, and continue unless STOP applies.
