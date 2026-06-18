# EXECUTION_RULES.md

## Anti-Drift Rules (AGENTS.md §5)

- Implement one active ExecPlan only.
- Do not jump between plans.
- Do not implement from the roadmap.
- Do not broaden scope.
- Do not perform broad refactors, styling rewrites, dependency swaps, file reorganizations, or unrelated cleanup unless explicitly required.
- Only change files listed in the ExecPlan unless the Decision Log justifies an additional file.
- Compare `git diff --name-only` to expected changed files before final response.
- Keep non-goals excluded.

## Anti-Hallucination Rules (AGENTS.md §6)

- Do not invent package APIs.
- Do not invent command names.
- Do not invent environment variables.
- Do not invent database tables.
- Do not invent routes.
- Do not invent config keys.
- Do not invent CLI flags.
- Confirm names by reading repository files.
- Use commands from `COMMANDS.md`.
- If a command is missing, update `COMMANDS.md` first with evidence from repository files.
- Record assumptions in the ExecPlan Decision Log and `ASSUMPTIONS.md` when they affect future work.

## Anti-Fixation Rules (AGENTS.md §7)

1. First same-root failure: read the exact error, identify likely cause, make the smallest targeted fix, rerun the narrowest command.
2. Second same-root failure: create or run a narrower diagnostic and avoid broad rewrites.
3. Third same-root failure: stop the current approach, record failed hypotheses in Surprises & Discoveries, choose a simpler safe path if inside scope.

Never patch blindly around the same error indefinitely.

## Retry Budget

| Attempt | Action                   |
| ------- | ------------------------ |
| 1       | Smallest targeted fix    |
| 2       | Narrow diagnostic search |
| 3       | STOP — abandon approach  |

## Scope Enforcement

- Expected files are defined in the active ExecPlan.
- Any changed file not in the expected set is an unexpected change.
- Unexpected changes may be justified in the Decision Log.
- Unjustified unexpected changes mean the milestone is not compliant.
