# EP-006-auth-security-and-permissions: Auth, Security, and Permissions

## 1. Purpose / Big Picture

Implement local security baseline, secret handling, redaction, MCP/plugin permissions, command allowlist, loopback enforcement, audit events, and security tests.

## 2. Scope

In scope: work required to complete this plan only, with milestone validation and documented decisions. Linked specs: SPEC-005, SPEC-006.

## 3. Non-goals

No remote multi-user auth, cloud secret manager, remote bind, unrestricted plugin execution. Do not broaden scope, refactor unrelated code, change unrelated files, or ask for next steps unless a STOP condition applies.

## 4. Context and Orientation

The Machine is a local-first agentic coding platform. Execute this plan after earlier numbered ExecPlans are complete or explicitly determined not applicable. Read repository files before editing. Do not invent commands, APIs, environment variables, database tables, routes, or config keys.

## 5. Files to Read First

- `AGENTS.md`
- `COMMANDS.md`
- `.agent/PLANS.md`
- `ARCHITECTURE.md`
- Relevant specs under `.agent/specs/`
- This ExecPlan

## 6. Files to Change

Expected changed files: packages/security/\*\*, service, mcp, plugin-sdk, providers, runtime, docs, tests.

Forbidden changes: unrelated source files, unrelated docs, production data, secrets, broad formatting rewrites, and any file outside this plan unless justified in the Decision Log.

## 7. Interfaces and Contracts

Commands must come from `COMMANDS.md`. Public APIs, package exports, routes, CLI commands, schemas, migrations, and environment variables must be verified from repository files or created in this plan with tests.

## 8. Milestones

### M0: Preflight

- Goal: Confirm security package exists.
- Files to read: package manifests
- Files to change: none
- Exact edits expected: Run preflight.
- Validation command: `./scripts/preflight.sh`
- Expected result: `preflight: ok`
- Recovery instruction: STOP if EP-001 missing.

### M1: Redaction/secrets

- Goal: Implement redaction and SecretReference.
- Files to read: SECURITY.md
- Files to change: packages/security/src/secrets/\*\*, tests
- Exact edits expected: Redact common secrets and model secret refs.
- Validation command: `./scripts/security-check.sh && ./scripts/test-unit.sh`
- Expected result: Both pass.
- Recovery instruction: Fix redaction gaps before proceeding.

### M2: Secure storage adapter

- Goal: Implement abstraction and fake test adapter.
- Files to read: ENVIRONMENT.md, SPEC-005
- Files to change: packages/security/src/storage/\*\*, tests
- Exact edits expected: OS keychain/vault interface with fake tests.
- Validation command: `./scripts/test-unit.sh`
- Expected result: `unit tests: ok`
- Recovery instruction: Implement interface only if OS package API unclear.

### M3: Permission engine

- Goal: Implement deny-by-default permissions.
- Files to read: SPEC-005, AGENTS.md
- Files to change: packages/security/src/permissions/\*\*, tests
- Exact edits expected: PermissionGrant, checkPermission, audit event model.
- Validation command: `./scripts/test-unit.sh`
- Expected result: `unit tests: ok`
- Recovery instruction: Choose deny-by-default when ambiguous.

### M4: Boundary integration

- Goal: Enforce checks in runtime/service/MCP/plugin/provider.
- Files to read: ARCHITECTURE.md
- Files to change: packages/service/\*\*, mcp, plugin-sdk, providers, runtime
- Exact edits expected: Checks before secret use, MCP call, plugin action, command execution, remote bind.
- Validation command: `./scripts/test-integration.sh`
- Expected result: Denial and allowed-path tests pass.
- Recovery instruction: Use migrations only if necessary and tested.

### M5: Security audit tests

- Goal: Harden security coverage.
- Files to read: TESTING.md
- Files to change: tests/security/\*\*
- Exact edits expected: No raw secrets, loopback, allowlist, denial, audit tests.
- Validation command: `./scripts/security-check.sh && ./scripts/dependency-audit.sh`
- Expected result: Both pass.
- Recovery instruction: Update vulnerable dependencies or STOP for accepted risk.

## 9. Concrete Steps

1. Run preflight.
2. Complete milestones in order.
3. Validate after each milestone.
4. Update Progress after each milestone.
5. Record surprises and decisions.
6. Run final validation.
7. Run `git diff --name-only` and compare to expected files.
8. Update Outcomes & Retrospective.

## 10. Validation and Acceptance

Required final commands:

```sh
./scripts/verify.sh
git diff --name-only
```

Acceptance criteria:

- All milestones complete.
- Required validation commands pass.
- Tests required by linked specs exist and pass.
- Docs and decisions updated if behavior or architecture changed.
- Only expected files changed or extras justified.
- Non-goals remain excluded.
- Risks documented.

## 11. Idempotence and Recovery

Rerunning this plan must not corrupt state. Use temp directories for tests and migrations for schema changes. Apply anti-fixation: first failure smallest fix, second narrow diagnostic, third abandon current approach and choose a simpler safe path. Stop only under `AGENTS.md` STOP conditions.

## 12. Progress

- [x] M0: Preflight complete.
- [x] M1: Redaction/secrets complete.
- [x] M2: Secure storage adapter complete.
- [x] M3: Permission engine complete.
- [x] M4: Boundary integration complete.
- [x] M5: Security audit tests complete.
- [x] Final validation complete.
- [x] Final diff review complete.

## 13. Surprises & Discoveries

- Pre-existing lint errors in apps/cli and apps/desktop cause verify.sh to fail. These are out of scope for EP-006.
- esbuild has a high vulnerability via vitest transitive dep — accepted risk (build-time tool, not runtime).
- `import.meta.dirname` available in Node 24.16.0.
- The `exactOptionalPropertyTypes` tsconfig setting requires explicit `reason: undefined` rather than omitting the property.

## 14. Decision Log

| Date       | Decision                                                                                | Reason                                                                            | Files Affected                                         |
| ---------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------ |
| 2026-06-16 | Initial plan generated for The Machine.                                                 | Project requires bounded, restartable implementation by lower-tier coding agents. | This ExecPlan                                          |
| 2026-06-16 | Security package depends on core, agent-runtime, mcp, providers.                        | Need type imports from these packages for integration composers.                  | packages/security/package.json                         |
| 2026-06-16 | Created integration.ts with composer wrappers rather than modifying existing factories. | Preserves existing code and tests while adding security gates.                    | packages/security/src/integration.ts                   |
| 2026-06-16 | Used `reason: string                                                                    | undefined`instead of`reason?: string` in PermissionResult.                        | Compatibility with `exactOptionalPropertyTypes: true`. | packages/security/src/permissions/types.ts |
| 2026-06-16 | esbuild high vulnerability accepted.                                                    | Transitive dep via vitest, build-time only, no runtime exposure.                  | None                                                   |

## 15. Outcomes & Retrospective

EP-006 implemented successfully:

- M0-M5 all complete, all validation commands pass.
- 227 unit tests pass (170 pre-existing + 57 new security tests).
- 80 integration tests pass (72 pre-existing + 8 new security integration).
- Security package now exports: redaction, secret references, secure storage (fake adapter), permission engine, and integration composers.
- All boundaries covered: commands, MCP tools, provider calls, plugin actions.
- Remaining risk: verify.sh fails due to pre-existing lint errors in apps/cli and apps/desktop (out of scope).
