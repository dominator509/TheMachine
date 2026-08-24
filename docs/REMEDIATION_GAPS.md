# Production-Readiness Remediation Gaps

This document is the canonical handoff for findings that cannot honestly be closed by repository inspection or connector-only edits.

## Candidate under remediation

- Repository: `dominator509/TheMachine`
- Original assessed candidate: `c624041282afcdbaa278f9c0df3c781c8d1498d1`
- Remediation branch: `agent/production-readiness-remediation`
- Pull request: `#4`
- Release status: **NO_GO until every release-blocking acceptance criterion below has executed evidence on the exact PR SHA**

A green check generated for an earlier commit, a rebuilt artifact, a fixture worker, or a mocked provider does not satisfy these gates.

## Repository remediations implemented

The branch includes code-level remediation for the evidence-backed findings that were executable or reviewable in the original campaign:

- provider-specific authentication, including Anthropic `x-api-key` handling;
- ignored-file and escaping-symlink containment in run worktrees;
- all-depth bounded diagnostic redaction;
- exact evidence inventories, unexpected-file rejection, optional signatures, and candidate binding;
- transactional event/manifest journals and restart recovery;
- fail-closed readiness based on executed evidence rather than registrations or source-file existence;
- persistent MCP stdio initialization and `tools/call`, durable approval IDs, shell rejection, scoped environment, timeout, and cleanup;
- third-party plugin execution disabled by default, with trusted modes explicitly labeled as non-hostile isolation;
- database backup restore with integrity checks and pre-restore rollback protection;
- separate local GUI viewer and producer capabilities;
- corrected worker preset argument construction and version metadata;
- non-vacuous CLI/runtime/frontend E2E scenarios;
- unified source version identity;
- portable CLI deployment, native installer collection, artifact digests, SBOM data, deterministic archives, clean-room execution, and provenance workflow;
- independent CI jobs so an early formatting failure cannot hide later test outcomes;
- removal of the source-mutating one-shot repair workflow.

These entries describe code changes, not automatically successful tests.

## Blocked gate: GitHub Actions account state

At the time of remediation, every Actions job was rejected before checkout with GitHub's billing/spending-limit message. No repository command ran in those jobs.

### Required action

Restore Actions execution in the repository owner's **Billing and plans** settings, then rerun PR `#4` without changing the candidate.

### Acceptance criteria

- The workflow reaches checkout and records toolchain versions.
- The independent static, unit, integration, E2E, security, benchmark, release-smoke, readiness, and three native jobs all execute.
- The first failure of each job is preserved.
- No retry is used to erase an earlier nondeterministic failure.

## Blocked gate: committed native Cargo lockfile

`apps/desktop/src-tauri/Cargo.lock` must be generated from the exact committed `Cargo.toml` and committed to the PR. It must not be generated silently during a release build.

### Required command

```bash
cargo generate-lockfile --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo metadata --manifest-path apps/desktop/src-tauri/Cargo.toml --locked --format-version 1 > /dev/null
```

Run with the repository's pinned Rust toolchain (`1.97.1`), review the dependency graph, commit only the resulting lockfile, and rerun the native matrix.

### Acceptance criteria

- `cargo test --locked` passes on Linux, Windows, and macOS.
- `cargo clippy --locked --all-targets -- -D warnings` passes on all three platforms.
- Tauri installer bundles are produced on all three platforms.
- Each installer appears in a candidate-bound native manifest with a verified SHA-256 digest.

## Credential-required integration gates

No credentials were invented or added to the repository.

Required live tests include:

- OpenAI-compatible provider authentication, timeout, rate-limit, malformed-response, and redaction behavior;
- direct Anthropic authentication and error behavior;
- version-pinned Codex, Claude Code, Aider, and OpenHands execution against isolated benchmark fixtures;
- any configured live MCP server beyond the credential-free persistent stdio fixture.

### Acceptance criteria

Each live run must record the executable path, exact CLI/provider version, model, arguments, candidate SHA, fixture digest, exit status, timing, usage/cost where available, resulting patch, independent validation, and evidence verification. A fixture worker or mocked HTTP transport is not a substitute.

## Persistent-runner gates

GitHub-hosted ephemeral jobs are insufficient for full-duration reliability evidence.

Required external execution:

- representative performance and workload characterization;
- resource exhaustion boundaries;
- process-tree cancellation and orphan detection;
- crash/restart and state-reconciliation campaigns;
- 24-, 48-, or 72-hour soak/resource-leak campaigns required by the selected release policy;
- recovery time, recovery point, and operational alert verification.

These remain `DEFERRED_LONG_RUNNING` or `EXTERNAL_REQUIRED` until a persistent, authorized runner is supplied. Shortening a soak does not convert it into a pass.

## Human and professional gates

The following cannot be impersonated by an automated agent:

- human UAT for the native desktop installer and core run lifecycle;
- manual keyboard, screen-reader, focus-order, zoom, contrast, and reduced-motion accessibility review;
- platform signing/notarization trust review;
- support runbook/tabletop ownership confirmation;
- any required independent penetration test or professional compliance assessment.

## Promotion rule

PR `#4` must remain draft while any release-blocking gate is failed, blocked, inconclusive, or unexecuted. Promotion requires all of the following against one immutable commit:

1. All required CI and native jobs execute and pass.
2. The exact release archive is assembled once from those outputs.
3. The archive digest, SBOM, manifests, and provenance refer to that commit.
4. The exact archive passes clean-room installation/execution.
5. Credential-required, persistent-runner, human, and external gates are either genuinely completed or the final verdict remains non-GO.
6. A rebuild creates a new artifact identity and requires artifact-dependent gates to run again.
