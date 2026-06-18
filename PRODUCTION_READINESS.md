# PRODUCTION_READINESS.md

## Definition of Production Readiness

The Machine is production-ready when functional behavior, tests, security, privacy, performance, accessibility, observability, deployment, rollback, data, documentation, and support requirements are implemented, validated, and documented.

## Functional Readiness

Core user outcomes work: repository discovery, ExecPlan execution, provider/MCP/plugin setup, GUI/CLI critical flows, production-readiness report. Non-goals remain excluded.

## Test Readiness

`lint`, `format-check`, `typecheck`, `unit`, `integration`, `e2e`, `build`, `security-check`, `dependency-audit`, `smoke`, and `verify` pass. Critical flows have regression coverage.

## Security Readiness

No secrets committed, redaction tests pass, provider credentials protected, MCP/plugin permissions enforced, local service loopback-only, trust-boundary validation exists, audit reviewed.

## Privacy Readiness

Local data storage/export/deletion documented, prompt/code logging documented, diagnostic export redacted, no remote telemetry by default.

## Performance Readiness

Performance expectations documented and checked, health/discovery/progress targets tested, bottlenecks fixed or documented.

## Accessibility Readiness

If GUI ships: keyboard navigation, accessible controls, text errors, focus management, and basic accessibility checks pass. CLI remains usable without GUI.

## Observability Readiness

Structured logs, redaction, health checks, run events, validation visibility, integration health, diagnostic bundle.

## Deployment Readiness

Artifacts produced, release process documented, env vars documented, staging smoke passes, install instructions documented, versioning documented.

## Rollback Readiness

Triggers, previous version, backup/restore, rollback smoke, communication, and postmortem steps documented.

## Data Readiness

Migrations tested, backup/restore tested if applicable, retention documented, destructive migration STOP enforced, test data separated.

## Documentation Readiness

All root docs, specs, ExecPlans, checklists, and retrospectives current.

## Support Readiness

Incident response, failure modes, troubleshooting, diagnostic export, known risks.

## Final Launch Gate

EP-010 complete, `./scripts/verify.sh` passes, `./scripts/production-readiness-check.sh` passes, release checklist complete, rollback checklist complete, critical bugs zero or accepted, user approves release/deployment.

## Checklist

- [x] Functional readiness.
- [x] Test readiness.
- [x] Security readiness.
- [x] Privacy readiness.
- [x] Performance readiness.
- [x] Accessibility readiness.
- [x] Observability readiness.
- [x] Deployment readiness.
- [x] Rollback readiness.
- [x] Data readiness.
- [x] Documentation readiness.
- [x] Support readiness.
- [ ] Final launch approval (user).
