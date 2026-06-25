# PRODUCTION_READINESS.md

## Definition of Production Readiness

The Machine is production-ready only when functional behavior, tests, security, privacy, performance, accessibility, observability, deployment, rollback, data, documentation, and support requirements are implemented, validated, documented, and explicitly approved for release.

## Current Status

EP-011 closed the critical local functionality blockers found in `FUNCTIONALITY_AUDIT_BRIEFING.md`. Built CLI startup, Windows readiness checks, smoke prerequisites, release bundle format, ExecPlan parsing/persistence, provider HTTP adapters, MCP stdio invocation, DB migration tools, and 12-subsystem readiness reporting now have local validation coverage.

This is not a production launch approval. Runtime readiness now has local, state-derived release-decision checks for provider, MCP, plugin, and shared UI component areas. Those areas remain pending/degraded by default until an operator registers and accepts the release posture for the target channel.

## Readiness Gates

| Gate | Status | Current evidence |
| ---- | ------ | ---------------- |
| Functional readiness | Partial | CLI, service, persisted ExecPlan run, providers, MCP stdio, DB tools, readiness paths, package entrypoints, and runtime release-decision gates are locally validated. Live provider credentials, live MCP servers, third-party plugins, and shared UI component scope remain release-channel decisions. |
| Test readiness | Passing locally | `pnpm run typecheck`, `pnpm run test:unit`, `pnpm run test:integration`, release build, smoke, and production readiness checks passed during EP-011/EP-013. |
| Security readiness | Partial | Secret redaction and permission tests exist; MCP permissions are enforced. Third-party plugin execution is not a true sandbox and must remain trusted-first-party unless a later ExecPlan adds isolation. |
| Privacy readiness | Partial | No remote telemetry by default. Prompt/code logging and diagnostic export must remain redacted before release. |
| Performance readiness | Not release-certified | Local flows run in tests, but no quantified production SLI/SLO gate exists. |
| Accessibility readiness | Partial | CLI remains usable without GUI. GUI accessibility requires release-channel validation before a GUI launch. |
| Observability readiness | Partial | Event recorder and diagnostics exist; persistent runtime event strategy should be reviewed before production launch. |
| Deployment readiness | Partial | Release artifacts build locally. No deployment, signing, publishing, or distribution channel was performed in EP-011. |
| Rollback readiness | Partial | Application rollback docs exist. Database migrations are forward-only; rollback tooling now stops safely rather than performing destructive rollback. |
| Data readiness | Partial | SQLite migrations and backup/restore tests exist. Destructive migration approval remains a STOP condition. |
| Documentation readiness | In progress | EP-011 updates stale readiness and architecture claims. |
| Support readiness | Partial | Troubleshooting docs exist, but production support ownership and incident process need release approval. |

## Final Launch Gate

Before tagging, publishing, deploying, or calling this production-ready:

- All repo-approved validation gates must pass from a clean checkout after documented install/build steps.
- Runtime readiness must either be `ready` or have accepted, documented degraded/pending subsystems.
- Live provider, MCP, plugin, and shared UI release decisions must be documented or accepted as degraded for the target channel.
- Plugin support must be explicitly scoped to trusted first-party plugins or backed by a true sandbox.
- Rollback and backup procedures must be accepted for the target release channel.
- The user must approve release/deployment.

## Checklist

- [ ] Functional readiness accepted for the target release channel.
- [x] Local typecheck/unit/integration validation.
- [x] Full EP-013 validation sequence completed for runtime release-decision readiness.
- [ ] Security readiness accepted, including plugin execution posture.
- [ ] Privacy readiness accepted.
- [ ] Performance readiness accepted.
- [ ] Accessibility readiness accepted for any shipped GUI surface.
- [ ] Observability readiness accepted.
- [ ] Deployment readiness accepted.
- [ ] Rollback readiness accepted.
- [ ] Data readiness accepted.
- [ ] Documentation readiness accepted.
- [ ] Final launch approval from user.
