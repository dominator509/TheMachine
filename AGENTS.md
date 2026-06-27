@C:\Users\domin\.codex\RTK.md

# AGENTS.md

Durable compact repo context lives in `REPO_BRIEF.md`. Read it alongside this file before starting repository-wide, Serena, Obsidian, onboarding, or handoff work.

## 1. Mission

You are a coding agent operating inside this repository. Your mission is to implement The Machine through small, test-backed, restartable ExecPlans without drifting, freezing, or fixating. Continue autonomously through the active ExecPlan unless a STOP condition applies.

Do not ask the user for next steps. Proceed autonomously through the active ExecPlan unless a STOP condition applies.

## 2. Source-of-Truth Priority

When instructions conflict, obey this priority order:

1. Current user instruction.
2. `AGENTS.md`.
3. Active ExecPlan in `.agent/execplans/`.
4. Existing repository code and tests.
5. `ARCHITECTURE.md`.
6. Relevant spec in `.agent/specs/`.
7. `ROADMAP.md`.

`ROADMAP.md` is strategic only. Do not implement directly from it.

## 3. Required Workflow

For every coding task:

1. Read `AGENTS.md`.
2. Read `COMMANDS.md`.
3. Read `.agent/PLANS.md`.
4. Read the active ExecPlan.
5. Read every file listed under the ExecPlan's "Files to Read First".
6. Run the preflight command from `COMMANDS.md`.
7. Complete milestones in order.
8. Validate after each milestone using the milestone's exact validation command.
9. Update the ExecPlan Progress section after each milestone.
10. Record assumptions and decisions in the ExecPlan Decision Log.
11. Continue autonomously until the ExecPlan is complete.
12. Stop only under STOP conditions.
13. Run final validation required by the ExecPlan.
14. Run `git diff --name-only`.
15. Compare changed files to the ExecPlan's expected changed files.
16. Update Outcomes & Retrospective.
17. Produce the required final response.

## 4. STOP Conditions

Stop immediately and report the blocker if any of these apply:

- Missing required secret, credential, paid service, API key, model account, or external account.
- Any action that may destroy, overwrite, migrate, expose, or corrupt user or production data.
- Legal, security, financial, or compliance judgment is needed and not already specified.
- Materially different user-visible behavior choice is required and no spec resolves it.
- Required tests cannot run after documented recovery attempts.
- Production deployment or irreversible migration is required without explicit permission.
- A required command is missing from `COMMANDS.md` and cannot be derived from repository evidence.
- Repository evidence contradicts the active ExecPlan in a way that would cause broad rework.
- A third-party API/package must be used but its API cannot be verified locally or from installed files.
- Current branch contains unrelated user changes that would be overwritten.
- A generated or modified file would include secrets, credentials, private keys, or real production data.

When stopping, provide exact blocker, evidence, smallest decision needed, and recommended default.

## 5. Anti-Drift Rules

- Implement one active ExecPlan only.
- Do not jump between plans.
- Do not implement from the roadmap.
- Do not broaden scope.
- Do not perform broad refactors, styling rewrites, dependency swaps, file reorganizations, or unrelated cleanup unless explicitly required.
- Only change files listed in the ExecPlan unless the Decision Log justifies an additional file.
- Compare `git diff --name-only` to expected changed files before final response.
- Keep non-goals excluded.
- Never change ARCHITECTURE.md, BUILD_ROADMAP.md, or ROADMAP.md directly. These files are write-protected. Only Alfred (Overseer) may modify them after validating proposals from Deziray or Ip Man.

### 5.1 Proposal Feedback Loop — Self-Improving Architecture

Adapted from PANTAW META-KAIZEN-ADVISOR. When an agent discovers a bug, gap, or improvement opportunity, they submit a structured proposal through their COMM_BUFFER.md slot. Alfred validates, governs, and (if passed) queues the proposal for human review in KNOWN_ISSUES.md.

**Proposal Format** — Agents post proposals in their COMM_BUFFER.md slot using this XML block:

```xml
<machine_proposal>
  <proposal_id>PROP-{agent}-{timestamp_10min_bucket}-{random4}</proposal_id>
  <source>audit | obs_aggregate | bench_regression | human</source>
  <target_component>package or subsystem name</target_component>
  <change_type>prompt_refinement | gate_change | code_change | config_change | doc_change</change_type>
  <change_description>ONE specific change, 1-2 sentences</change_description>
  <evidence>
    <primary_failure>What is actually broken</primary_failure>
    <link>Path to test output, audit finding, or error log</link>
    <reasoning>Why this change addresses the failure</reasoning>
  </evidence>
  <expected_impact>
    <risk_level>low | medium | high</risk_level>
    <reversibility>trivial | easy | hard | irreversible</reversibility>
    <regression_risk>How likely this breaks existing behavior</regression_risk>
  </expected_impact>
</machine_proposal>
```

**Proposal Discipline** (PANTAW principles):
- ONE change per proposal. Not three. Not a bundle. One.
- LOCAL change only. Affects one component, one file, one concern.
- EVIDENCE-BACKED. Every proposal must name the specific failure and explain why the change fixes it. "This might help" is rejected.
- HONEST REFUSAL. If the agent cannot identify a concrete, evidence-backed change, they must return `<machine_proposal refusals="true" reason="..." />`. Honest refusal is strongly preferred over speculative proposals.
- REVERSIBLE. Prefer prompt_refinement over gate_change over code_change over structural. Anything marked irreversible faces maximum scrutiny.

**Halt Conditions** (Cold-Start & Circuit Breaker):
- COLD-START: If KNOWN_ISSUES.md has zero entries and no test failures exist, proposals are halted. No data → no signal → no proposal.
- CIRCUIT BREAKER: If three consecutive proposals are rejected by the human, the feedback loop halts. Drift is accelerating — human must reset the baseline.
- DRIFT ACCELERATION: If resolved issues in KNOWN_ISSUES.md grow faster than new issues are found (resolved rate > discovery rate for 2+ audit cycles), the system is destabilizing. Alfred escalates to Dominic.

**Validation Gate** (DRIFT-WARDEN adaptation) — Alfred validates every proposal:
1. Envelope: Required fields present, proposal_id valid, change_type recognized.
2. Invariants: Does not weaken iteration caps, does not bypass ACK protocol, does not remove write-protection, does not add undocumented dependencies.
3. Scope: Affects exactly one component. No cross-cutting proposals without explicit human approval.
4. Evidence: Traceable to a KNOWN_ISSUES entry or test failure. Speculative proposals without evidence are rejected at this gate.
5. Reversibility: Rollback strategy is documented. Irreversible changes require human pre-approval before validation proceeds.

**Promotion Flow:**
```
Agent discovers gap → Posts <machine_proposal> in COMM_BUFFER.md slot → Flips ACK
→ Alfred reads proposal → Validates against 5 gates
→ If PASS: Creates KNOWN_ISSUES.md entry with status=pending_human_review, clears proposal XML, flips NEEDS_ALFRED=FALSE
→ If FAIL: Posts rejection reason to agent's slot, agent revises or abandons
→ Human (Dominic) reviews KNOWN_ISSUES.md Proposal Queue section
→ Human sets status=accepted or status=rejected
→ If accepted: Alfred assigns to Ip Man via COMM_BUFFER.md, Deziray audits after
→ If rejected: Alfred marks closed, logs rejection reason, agent may not re-submit the same proposal without new evidence
```

## 6. Anti-Hallucination Rules

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

## 7. Anti-Fixation Rules

For any failing validation command:

1. First same-root failure: read the exact error, identify likely cause, make the smallest targeted fix, rerun the narrowest command.
2. Second same-root failure: create or run a narrower diagnostic and avoid broad rewrites.
3. Third same-root failure: stop the current approach, record failed hypotheses in Surprises & Discoveries, choose a simpler safe path if inside scope.

Never patch blindly around the same error indefinitely.

## 8. Dependency Rules

- Prefer standard library and existing dependencies.
- Add dependencies only when necessary.
- Verify package name, version, license, and API from repository files or installed metadata.
- Update lockfiles through the package manager.
- Update `COMMANDS.md`, `ENVIRONMENT.md`, and manifests when dependency commands change.
- Record dependency decisions.

## 9. File Creation Rules

- Create only files required by the active ExecPlan.
- Keep generated files deterministic.
- Do not commit build artifacts, caches, logs, coverage output, local DB files, or secrets.
- Do not place application code in `.agent/`.
- Do not place planning files under `src/`.

## 10. Testing Rules

- Add/update tests for every behavior change.
- Unit test pure domain logic.
- Integration test persistence, providers, MCP, CLI, local service, and plugin boundaries.
- E2E/acceptance test GUI/CLI user flows.
- Validate after each milestone.
- Do not mark complete with skipped required tests unless explicitly documented.

## 11. Documentation Update Rules

Update docs when behavior, commands, architecture, environment variables, data schema, security posture, or operational process changes.

## 12. Security Rules

- Never commit secrets, tokens, credentials, private keys, `.env` values, or production data.
- Redact secrets in logs and test output.
- Treat provider credentials, local model endpoints, MCP servers, plugins, command execution, and filesystem access as security boundaries.
- Fail closed when permission checks are unknown.

## 13. Production Data Rules

- Assume user repositories may contain sensitive data.
- Do not delete, rewrite history, force-push, migrate, or upload data without explicit permission.
- Do not log full prompts, code, or file contents when they may contain secrets.

## 14. Definition of Done

An ExecPlan is complete only when all acceptance criteria pass, all required validation commands pass, Progress is updated, Surprises & Discoveries is updated, Decision Log is updated, Outcomes & Retrospective is updated, `git diff --name-only` is reviewed, only expected files changed or extras are justified, risks are documented, and non-goals remain excluded.

## 15. Final Response Requirements

Final response must include ExecPlan completed, changed files, commands run, command results, acceptance criteria status, decisions made, assumptions confirmed/changed, remaining risks, and production-readiness status when applicable.
