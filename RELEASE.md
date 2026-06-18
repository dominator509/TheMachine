# RELEASE.md

## Release Types

Dev build, release candidate, production release, hotfix.

## Versioning

Use semantic versioning specified by EP-009: MAJOR for breaking changes, MINOR for backward-compatible features, PATCH for fixes/security. Pre-release examples: `0.1.0-alpha.1`, `0.1.0-rc.1`.

## Changelog

Each release entry must include: Added, Changed, Fixed, Security, Known Issues, Upgrade Notes, Rollback Notes.

## Branch Strategy

- `main` is releasable at all times.
- Feature work on short-lived ExecPlan branches.
- Release candidates tagged as `v<VERSION>-rc.<N>`.
- Hotfix branches start from the affected release tag and merge back to `main`.

## Release Candidate Criteria

A release candidate must meet all of the following before proceeding:

- All planned ExecPlans for the milestone are complete.
- `./scripts/verify.sh` passes, or pre-production failures are documented with SPEC-008 error taxonomy.
- `./scripts/production-readiness-check.sh` passes (readiness release docs gate, build gate, test gate, security gate).
- No critical security findings (SPEC-008 — fail closed on security issues).
- Release notes drafted with known risks documented.
- Rollback path identified and tested (see `ROLLBACK.md`).
- Acceptance criteria per SPEC-008: required behavior implemented, tests pass, errors typed and user-safe, security and data rules enforced.

## Release Candidate Workflow

### Automated (GitHub Actions)

Trigger the **Release Candidate** workflow from the GitHub Actions tab (`workflow_dispatch`).

- Input `version`: the semantic version (e.g., `0.2.0-rc.1`).
- Input `dry_run`: defaults to `true` — builds artifacts and runs smoke tests without tagging or publishing.
- Set `dry_run` to `false` only when ready to tag the release candidate and only after explicit user approval.

Workflow steps:

1. Run full verification (`./scripts/verify.sh`).
2. Build release artifacts (`pnpm run build:release`).
3. Run smoke tests (`./scripts/smoke-test.sh`).
4. Upload artifacts as build outputs.
5. If `dry_run=false`: tag release, create GitHub Release (draft).

### Manual (local — use when CI provider is absent)

```sh
# 1. Verify the main branch is clean
git checkout main
git pull

# 2. Full verification
./scripts/verify.sh

# 3. Build release artifacts
pnpm run build:release

# 4. Smoke test
./scripts/smoke-test.sh

# 5. Tag the release candidate (requires approval)
git tag -a "v<VERSION>" -m "Release candidate v<VERSION>"
git push origin "v<VERSION>"
```

Artifacts are written to `release/` (gitignored). No publish step runs automatically. Explicit user approval is required for publishing. Coding agents must STOP before any publish action per AGENTS.md STOP conditions.

## Release Checklist

- [ ] Version updated in root `package.json` and downstream manifests.
- [ ] Changelog updated with all changes.
- [ ] Dependency audit reviewed (`./scripts/dependency-audit.sh`).
- [ ] Full verification passed (`./scripts/verify.sh`).
- [ ] Production readiness passed (`./scripts/production-readiness-check.sh`).
- [ ] Artifacts built (`pnpm run build:release`).
- [ ] Checksums generated for all artifacts.
- [ ] Staging install tested (smoke tests pass).
- [ ] Smoke tests passed (`./scripts/smoke-test.sh`).
- [ ] Rollback package available (previous release retained).
- [ ] Known risks documented in release notes.
- [ ] User approval obtained before tagging and publishing.

## Approvals

Explicit user approval is required for:

- Production release tagging.
- Production deployment.
- Irreversible database migration.
- Destructive data operation.
- Any action that would bypass SPEC-008 security rules (loopback-only service, deny-by-default permissions, allowlisted commands only).

## Release Notes

Each release must include:

- Version and date.
- Install, upgrade, and rollback steps.
- Known risks and limitations.
- Environment variable changes (if any).
- Security notes (CVEs, permission changes, redaction improvements).
- Link to full changelog.

## Post-Release Monitoring

After release:

- Review incoming issues and diagnostic bundles.
- Track known issues against the release tag.
- Start a hotfix ExecPlan for any critical regression.
- Verify no secrets appear in logs or diagnostics (SPEC-008 observability — structured redacted events).

## Error Recovery Guide

If any step in the release process fails, follow SPEC-008 error taxonomy:

| Error                     | Action                                                    |
| ------------------------- | --------------------------------------------------------- |
| Validation failure        | Apply anti-fixation retry budget (3 attempts), then STOP. |
| Missing secret/credential | STOP — do not proceed. Record missing item.               |
| Build failure             | Inspect build output, fix, re-run from build step.        |
| Smoke failure             | Rollback to previous release (see ROLLBACK.md).           |
| Permission denied         | Verify script permissions with `chmod +x scripts/*.sh`.   |
| User approval missing     | STOP — do not proceed without explicit approval.          |

## Release STOP Conditions

Stop immediately if:

- Release checklist items are incomplete.
- Verification or readiness check fails after retry budget.
- Critical security issue is identified.
- Rollback path is not verified.
- User has not explicitly approved the release.
- SPEC-008 acceptance criteria are not met.
