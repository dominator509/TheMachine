# ExecPlan Standard

An ExecPlan is a self-contained implementation document for one feature or system change. A new agent with no prior conversation must be able to continue from the ExecPlan alone.

## Required Sections

1. Purpose / Big Picture
2. Scope
3. Non-goals
4. Context and Orientation
5. Files to Read First
6. Files to Change
7. Interfaces and Contracts
8. Milestones
9. Concrete Steps
10. Validation and Acceptance
11. Idempotence and Recovery
12. Progress
13. Surprises & Discoveries
14. Decision Log
15. Outcomes & Retrospective

## Execution Rules

Execute one active ExecPlan only. Do not implement from `ROADMAP.md`. Complete milestones in order. Validate after every milestone. Update Progress after every milestone. Continue by default. Stop only for STOP conditions in `AGENTS.md`.

## Milestone Rules

Every milestone must include goal, files to read, files to change, exact edits expected, validation command, expected result, and recovery instruction.

## Validation Rules

Use commands from `COMMANDS.md`. Do not invent commands. Record command results. Apply anti-fixation retry budget. A validation command that cannot run after recovery attempts is a STOP condition.

## Acceptance Rules

Completion requires passing acceptance criteria, required commands, final diff review, expected changed files only or justified extras, and documented risks.

## Idempotence Rules

Rerunning a milestone must not corrupt state. Use migrations for schema changes, temp dirs for tests, avoid destructive actions, and stop before irreversible operations.

## Recovery Rules

First same-root failure: inspect and smallest fix. Second: narrower diagnostic. Third: stop current approach, record failed hypotheses, choose simpler safe path.

## Progress Update Rules

Use checkboxes. Mark complete only after validation passes or documented STOP.

## Decision Log Rules

Record assumption, decision, reason, alternatives, files affected, and date.

## Completion Rules

All milestones complete, validation passes, Progress/Discoveries/Decision Log/Outcomes updated, and final response can report changed files and commands.
