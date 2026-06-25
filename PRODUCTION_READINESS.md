# PRODUCTION_READINESS.md

## Definition of Production Readiness

The Machine is production-ready only when functional behavior, tests, security, privacy, performance, accessibility, observability, deployment, rollback, data, documentation, and support requirements are implemented, validated, documented, and explicitly approved for release.

## Current Status

EP-011 closed the critical local functionality blockers found in `FUNCTIONALITY_AUDIT_BRIEFING.md`. Built CLI startup, Windows readiness checks, smoke prerequisites, release bundle format, ExecPlan parsing/persistence, provider HTTP adapters, MCP stdio invocation, DB migration tools, and 12-subsystem readiness reporting now have local validation coverage.

Runtime readiness now has local, state-derived release-decision checks for provider, MCP, plugin, and shared UI component areas, plus a production approval record that covers provider configuration, MCP configuration, plugin sandbox posture, shared UI scope, and release/deployment approval. Those areas remain pending/degraded by default until the local approval record is accepted for the target channel.

## Readiness Gates

| Gate | Status | Current evidence |
| ---- | ------ | ---------------- |
| Functional readiness | Locally accepted path implemented | CLI, service, persisted ExecPlan run, providers, MCP stdio, DB tools, readiness paths, package entrypoints, runtime release-decision gates, and production approval gating are locally validated. Live provider credentials and live MCP servers remain optional operator-owned smoke checks, not required for local release acceptance. |
| Test readiness | Passing locally | `pnpm run typecheck`, focused unit/integration validation, release build, smoke, and production readiness checks passed during EP-011 through EP-014. |
| Security readiness | Locally accepted path implemented | Secret redaction and permission tests exist; MCP permissions are enforced. Third-party plugin hooks now have a subprocess sandbox path with Node permission restrictions, timeout handling, scrubbed environment, plugin-directory scoped reads, and denied writes by default. |
| Privacy readiness | Partial | No remote telemetry by default. Prompt/code logging and diagnostic export must remain redacted before release. |
| Performance readiness | Not release-certified | Local flows run in tests, but no quantified production SLI/SLO gate exists. |
| Accessibility readiness | Partial | CLI remains usable without GUI. GUI accessibility requires release-channel validation before a GUI launch. |
| Observability readiness | Partial | Event recorder and diagnostics exist; persistent runtime event strategy should be reviewed before production launch. |
| Deployment readiness | Approved locally, not executed | Release artifacts build locally and release/deployment approval can be recorded in the production approval contract. No deployment, signing, publishing, or distribution channel was performed. |
| Rollback readiness | Partial | Application rollback docs exist. Database migrations are forward-only; rollback tooling now stops safely rather than performing destructive rollback. |
| Data readiness | Partial | SQLite migrations and backup/restore tests exist. Destructive migration approval remains a STOP condition. |
| Documentation readiness | In progress | EP-011 updates stale readiness and architecture claims. |
| Support readiness | Partial | Troubleshooting docs exist, but production support ownership and incident process need release approval. |

## Final Launch Gate

Before tagging, publishing, deploying, or calling this production-ready:

- All repo-approved validation gates must pass from a clean checkout after documented install/build steps.
- Runtime readiness must either be `ready` or have accepted, documented degraded/pending subsystems.
- Provider, MCP, plugin sandbox, shared UI, and release/deployment decisions must be recorded through the local production approval path for the target channel.
- Third-party plugin support must use the subprocess sandbox path unless a future plan explicitly accepts a different isolation boundary.
- Rollback and backup procedures must be accepted for the target release channel.
- The user must approve release/deployment.

## Checklist

- [x] Functional readiness acceptance path implemented for the target release channel.
- [x] Local typecheck/unit/integration validation.
- [x] Full EP-013 validation sequence completed for runtime release-decision readiness.
- [x] Security readiness acceptance path implemented, including third-party plugin sandbox posture.
- [ ] Privacy readiness accepted.
- [ ] Performance readiness accepted.
- [ ] Accessibility readiness accepted for any shipped GUI surface.
- [ ] Observability readiness accepted.
- [x] Deployment readiness approval path implemented; deployment not executed.
- [ ] Rollback readiness accepted.
- [ ] Data readiness accepted.
- [ ] Documentation readiness accepted.
- [x] Final release/deployment approval can be recorded locally through `ProductionApproval.releaseDeployment`.
