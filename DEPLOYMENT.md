# DEPLOYMENT.md

## Deployment Environments

Local dev, local test, local staging release-candidate install, and production user-installed PC app. No hosted deployment is in scope for v1.

## Deployment Architecture

Desktop bundle, CLI binary/package, embedded or launched local service, SQLite database, secure local provider credentials (stored as references, not raw secrets per SPEC-008), MCP registry, plugin directory.

## Build Artifacts

Release artifacts are unsigned local bundles produced by `pnpm run build:release`:

- `release/machine.js` — CLI release bundle
- `release/desktop.js` — desktop release bundle

Artifacts include checksums, release notes draft, and a smoke test report. SBOM generation is deferred until tooling is available (non-goal for v1).

## Release Flow

1. Complete release ExecPlan.
2. Run `./scripts/verify.sh` — all gates must pass or pre-production gaps must be documented.
3. Run `./scripts/production-readiness-check.sh` — readiness release docs gate must pass.
4. Build artifacts with `pnpm run build:release`.
5. Install in staging environment.
6. Run smoke tests with `./scripts/smoke-test.sh` — must return `smoke test: ok`.
7. Review release checklist in `RELEASE.md`.
8. Tag release with `git tag -a "v<VERSION>"`.
9. Publish only with explicit user approval — coding agents must STOP before publishing.
10. Monitor support reports and diagnostic bundles post-release.

## Deployment Steps (Local Staging)

```sh
./scripts/verify.sh
./scripts/production-readiness-check.sh
pnpm run build:release
./scripts/smoke-test.sh
```

## Migration Steps

1. Backup database before any migration.
2. Run migration in staging environment first.
3. Verify data integrity with smoke tests.
4. Document rollback path before executing migration (see `ROLLBACK.md`).
5. STOP before any destructive production migration unless explicitly approved by user.

Data rules per SPEC-008: all state changes must be persisted for restartability. Use `pnpm run db:migrate` for schema changes. Secret references only — never raw secrets.

## Post-Deploy Smoke Tests

- CLI help and version output.
- Service health endpoint returns `health: ok`.
- Desktop workspace selector opens (manual verification where CI absent).
- Read-only repository discovery succeeds.
- Disabled providers do not produce errors.
- Logs and diagnostics contain no secrets (redacted per SPEC-008 observability rules).

## Required Approvals

Explicit user approval required for:

- Publishing release artifacts to any distribution channel.
- Production deployment beyond local user-installed app.
- Irreversible database migration.
- Destructive data operation (delete, overwrite, reset).
- Remote service access or paid provider setup.
- Any action that bypasses SPEC-008 security rules (loopback-only, deny-by-default, allowlisted commands).

## Deployment STOP Conditions

Stop immediately and do not proceed when any of the following apply:

- Signing or distribution credentials are missing (STOP — no production signing without credentials).
- Artifact cannot be verified against its checksum.
- Smoke test fails after retry budget (three same-root attempts per AGENTS.md anti-fixation rules).
- Migration cannot be backed up or rolled back.
- Critical security issue exists (per SPEC-008 security rules — fail closed).
- User has not explicitly approved the deployment.
- Error state per SPEC-008 taxonomy is encountered without a recovery path (invalid input, missing file, missing command, missing secret, permission denied, validation failed).

## Production Verification

After deployment, confirm:

- Installed artifact version matches the tagged release.
- Smoke test passes.
- No startup errors in service logs.
- Migration status is current (if applicable).
- Rollback package is available (previous release bundle retained).
- Known risks are documented in release notes.

## Error Recovery Guidance

All deployment errors must follow SPEC-008 error taxonomy:

- **Invalid input**: Validate inputs at trust boundaries before proceeding.
- **Missing required file/command**: Document in COMMANDS.md and re-run preflight.
- **Missing secret**: STOP — do not proceed without credentials.
- **Permission denied**: Verify filesystem and command permissions.
- **Validation failed**: Apply anti-fixation retry budget (AGENTS.md rule 7), then STOP if unresolved.
- **STOP condition**: Do not bypass — record decision and escalate.
- **Persistence/integration failure**: Restore from backup and document root cause.
