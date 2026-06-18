# ROLLBACK.md

## Rollback Triggers

Rollback is initiated when any of the following occur:

- Smoke test failure after retry budget (3 same-root attempts per AGENTS.md anti-fixation rules).
- Data loss or corruption detected.
- Critical security issue per SPEC-008 (fail closed on security).
- Application startup failure or crash loop.
- Migration corruption or block.
- Broken core outcome (CLI, service, desktop workspace).
- User request.
- SPEC-008 error state encountered without recovery path (validation failed, persistence failure, integration failure).

## Rollback Decision Owner

- Release operator or user. Coding agents must not execute production rollback without explicit permission per AGENTS.md STOP conditions.
- For staging/local rollback, the operator may proceed without approval but must document the action.

## Rollback Types

- Application rollback
- Database rollback
- Config rollback
- Feature flag rollback (if applicable)
- Plugin rollback

## Application Rollback

1. **Preserve diagnostics** — Before stopping the app, export redacted diagnostics:

   ```sh
   CLI diagnostics
   ```

   This produces a redacted diagnostic bundle with no secrets per SPEC-008 observability rules.

2. **Stop app** — Kill the running process.

3. **Install previous version** — Deploy the previous release bundle from `release/` (retained from prior release).

4. **Run verification**:

   ```sh
   CLI health      # Must return "health: ok"
   CLI readiness   # Must return "Overall: ready"
   ```

5. **Confirm workspace** — Open the desktop workspace selector; verify read-only repository discovery works.

6. **Record result** — Log version rolled from, version rolled to, and verification status.

## Database Rollback

1. **Stop app** — Prevent writes during rollback.
2. **Locate pre-migration backup** — Backups are stored per SPEC-008 data rules (local persistence, schema migrations).
3. **Archive current DB** — Preserve current state for postmortem analysis.
4. **Restore backup**:
   ```sh
   pnpm run db:migrate:rollback
   ```
5. **Run health and smoke**:
   ```sh
   CLI health
   ./scripts/smoke-test.sh
   ```
6. **Record data impact** — Document any data loss between backup and rollback.
7. **Requires explicit user approval** — Coding agents must STOP before any destructive database operation.

## Config Rollback

1. **Export current config** — Save config snapshot for comparison.
2. **Restore prior config** — Replace config file with previous version.
3. **Verify**:
   ```sh
   CLI health
   ```
4. **Confirm no secrets in logs** — Check diagnostics output after restart (SPEC-008 — redacted logs).
5. **Record config change** — Log what was rolled back and why.

## Feature Flag Rollback

1. **Disable the feature** — Set flag to `false` in config/flag store.
2. **Restart service if required** — Some flags require process restart.
3. **Run smoke tests** — `./scripts/smoke-test.sh`.
4. **Record flag change** — Document flag name, previous value, new value, and reason.

## Verification After Rollback

After any rollback, confirm all of the following:

- [ ] App starts without errors.
- [ ] CLI starts (`CLI help`).
- [ ] Service health passes (`CLI health` returns `health: ok`).
- [ ] Readiness check passes (`CLI readiness` returns `Overall: ready`).
- [ ] Database status valid (if applicable — run `pnpm run db:migrate` to verify current state).
- [ ] Repository discovery works (workspace opens, repos readable).
- [ ] Original error is no longer reproducible.
- [ ] No secrets in logs or diagnostics per SPEC-008 observability rules (structured events, redacted output).
- [ ] SPEC-008 security rules enforced post-rollback (loopback-only, deny-by-default, allowlisted commands).

## Communication

After rollback, report:

- Version rolled _from_ and version rolled _to_.
- Reason for rollback (from rollback triggers above).
- User impact (downtime, data loss, feature unavailability).
- Data impact (records lost, migration reverted).
- Verification results (all checks listed above passed/failed).
- Corrective ExecPlan reference (created to fix root cause).

## Postmortem

For any production-impacting rollback:

1. Create an incident report documenting timeline, trigger, and resolution.
2. Add a regression test that would have caught the issue.
3. Update the runbook and release checklist to prevent recurrence.
4. Record any architecture or process decisions in the Decision Log per AGENTS.md rules.
5. Emit structured event per SPEC-008 observability rules for the rollback action.

## Rollback STOP Conditions

Stop and do not proceed with rollback if:

- Previous release bundle is missing or corrupted (STOP — cannot roll back without a valid artifact).
- Database backup is missing or invalid.
- Rollback would cause greater data loss than the original incident.
- User has explicitly denied the rollback.
- SPEC-008 security rules would be violated by the rollback action.
