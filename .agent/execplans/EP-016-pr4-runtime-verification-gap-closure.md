# EP-016: PR #4 Runtime Verification and Gap Closure

## 1. Purpose / Big Picture

Verify GitHub PR #4 merge `e0dfc28a15a173f9ffa2b52622f3e9125c75fce6` with real runtime evidence and close every locally actionable gap without touching the dirty main worktree.

## 2. Scope

Inspect PR #4's code, workflows, remediation ledger, full verification, production-readiness execution, and focused runtime paths. Fix only reproducible local defects and classify remaining external gates honestly.

## 3. Non-goals

No deployment, signing, destructive database action, live credential use, strategic-doc edits, human UAT, manual assistive-technology review, or long soak claim. User-authorized branch publication and hosted workflow reruns are in scope for the current closeout.

## 4. Context and Orientation

This isolated worktree is branch `codex/pr4-runtime-gaps` at the exact merge SHA. The primary checkout remains at PR #4's base with uncommitted EP-015 work and must not be overwritten. GitHub returned no merge-SHA workflow runs or combined statuses.

## 5. Files to Read First

- `AGENTS.md`
- `COMMANDS.md`
- `.agent/PLANS.md`
- `REPO_BRIEF.md`
- `docs/REMEDIATION_GAPS.md`
- `PRODUCTION_READINESS.md`
- `READINESS.md`
- `package.json`
- `.github/workflows/ci.yml`
- `.github/workflows/desktop-native.yml`
- `.github/workflows/release.yml`
- `tools/readiness/production-readiness-check.mjs`
- `tools/release/build-release.mjs`
- `tools/smoke/smoke-test.mjs`
- Tests covering PR #4's remaining-gap list

## 6. Files to Change

- This ExecPlan
- Focused source, test, script, workflow, and documentation files directly implicated by failing runtime evidence

## 7. Interfaces and Contracts

The candidate identity is the exact merge SHA. Commands come from `COMMANDS.md`. Readiness must separate executed local proof from external/manual requirements. Security boundaries remain fail closed.

## 8. Milestones

### M0: Confirm candidate and authority

- Goal: Establish exact candidate identity and current rules.
- Files to read: all Files to Read First.
- Files to change: this plan.
- Exact edits expected: Record identity, authority, and PR gap inventory.
- Validation command: `scripts\preflight.cmd`.
- Expected result: Preflight passes on the exact merge checkout.
- Recovery instruction: Inspect the exact failure and preserve both worktrees.

### M1: Establish runtime evidence

- Goal: Exercise the merged implementation and its complete local gate set.
- Files to read: runtime implementations and tests implicated by command output.
- Files to change: this plan.
- Exact edits expected: Record focused runtime, full verify, and readiness evidence.
- Validation command: documented focused package scripts, `scripts\verify.cmd`, and `scripts\production-readiness-check.cmd`.
- Expected result: Each gate passes or yields a reproducible attributable failure.
- Recovery instruction: Use the narrowest failing command and anti-fixation budget.

### M2: Close demonstrated local gaps

- Goal: Fix every locally actionable defect exposed by M1.
- Files to read: failing stack traces and implicated source/tests.
- Files to change: evidence-justified files recorded in the Decision Log.
- Exact edits expected: Minimal fixes with regression coverage.
- Validation command: narrow regression commands, then full verification and readiness.
- Expected result: Local gates pass; external gates remain explicit.
- Recovery instruction: Stop at a genuine STOP condition or after three same-root failures.

### M3: Final evidence and boundary review

- Goal: Close the plan with current proof and an exact diff boundary.
- Files to read: final command output and Git/GitHub evidence.
- Files to change: this plan and justified evidence docs.
- Exact edits expected: Complete Progress, Discoveries, Decision Log, and Outcomes.
- Validation command: `scripts\verify.cmd`, `scripts\production-readiness-check.cmd`, `git diff --check`, `git diff --name-only`, and `git status --short`.
- Expected result: Claims match runtime evidence and only expected files changed.
- Recovery instruction: Do not publish; report external blockers precisely.

### M4: Authorized publication and hosted rerun

- Goal: Publish the verified repair and obtain fresh hosted workflow evidence for the repaired commit.
- Files to read: final staged diff, branch refs, workflow definitions, and GitHub run/job results.
- Files to change: no source files beyond publication metadata and this plan.
- Exact edits expected: Commit the verified repair, push the authorized branch, trigger or rerun applicable workflows, and record every conclusion.
- Validation command: `git diff --cached --check`, `git push`, GitHub workflow-run/job queries, and remote commit verification.
- Expected result: Fresh hosted runs are green or produce a reproducible external blocker.
- Recovery instruction: Do not force-push; preserve failed run IDs and stop if provider permissions or required secrets block execution.

## 9. Concrete Steps

1. Read authority and PR #4 gap files.
2. Run preflight and focused runtime paths.
3. Run full verification and readiness.
4. Fix reproducible local failures with regression tests.
5. Repeat complete gates and audit the diff boundary.

## 10. Validation and Acceptance

- Exact merge SHA confirmed.
- Preserved main worktree remains unchanged.
- Hosted check absence is reported accurately.
- Full local verification passes after fixes.
- Production-readiness output is interpreted without overstating external readiness.
- Every PR body "still in progress" item is classified as merged-complete, fixed here, or externally blocked.
- Final diff passes `git diff --check` and contains only justified files.

## 11. Idempotence and Recovery

This worktree and branch are restartable. Tests use temp or ignored output. No automated cleanup, reset, stash mutation, or publication occurs.

## 12. Progress

- [x] M0: Exact merge worktree confirmed at `e0dfc28a`; authority read, `scripts\preflight.cmd` passed, and main diff remained preserved.
- [x] M1: Focused runtime, full JavaScript gates, native Rust gates, release build, clean-room smoke, and security/audit evidence established.
- [x] M2: Every reproducible local failure was repaired and revalidated; only external, platform, credential, duration, and human gates remain.
- [x] M3: Clean candidate `0bbe04ed` passed the 13-gate CI readiness profile; hosted failures and remaining external production gates were classified; final diff boundaries were reviewed.
- [ ] M4: User-authorized publication and fresh hosted reruns completed.

## 13. Surprises & Discoveries

- GitHub returned no workflow runs or combined statuses for the merge SHA.
- The primary checkout is still at the merge base with prior uncommitted work, so isolated validation is mandatory.
- `docs/REMEDIATION_GAPS.md` says the source-mutating one-shot workflow was removed, but `.github/workflows/one-shot-cargo-lock.yml` still exists in the merge and is configured to mutate the PR branch.
- The exact merge fails its first full-verification gate: storage lint reports an unused restore verification result, and agent-runtime lint reports a rethrown JSON-journal parse error without `cause`.
- The merged Windows verifier repeats the stale `%errorlevel%` false-green pattern and tests CLI-backed integrations before building. The POSIX verifier has no release build before a smoke script that requires release artifacts.
- After lint recovery, the exact merge reports 297 Prettier failures and includes write-protected strategic documents because PR #4 did not carry forward the established formatter exclusions.
- Windows Node 24 cannot execute the generated npm/pnpm command shims through `spawnSync` without a shell; invoking their JavaScript entry points through `process.execPath` restores shell-free release and smoke execution.
- Agent-runtime event appends replaced nested manifest objects after task references were captured, so completed and cancelled runs could remain `running`; advancing only manifest sequencing metadata preserves the active task object.
- The merged database restore/rollback tools parsed `process.argv` from index 1 and treated the Node executable as the backup path.
- Native validation exposed a Rust borrow-lifetime error and missing lock/icon inputs. The documented Tauri icon generator, Cargo lock generation, and a one-line lifetime fix made locked metadata, format, test, clippy, and Windows no-bundle build executable.
- A broad `release/` ignore pattern also ignored `tools/release` in newly assembled repositories; anchoring it as `/release/` preserves release tooling while excluding root artifacts.
- The readiness evaluator repeated the Windows command-shim defect, causing twelve synthetic 2-4 ms failures, and calculated evidence paths by slicing a root that already ended in a separator. Direct pnpm JavaScript invocation and `path.relative` produced real gate execution and valid `artifacts/readiness/...` paths.
- GitHub reports four failed PR-head workflows: all eight CI jobs, the repository-security job, the one-shot repair job, and all three native OS jobs failed. The merge SHA has no workflow runs or combined statuses, and GitHub returns `BlobNotFound` for representative historical job logs.
- User subsequently authorized publishing the verified repair and rerunning failed workflows; PR #1 and PR #2 are historical merged PRs, so fresh checks require new validation PRs because their old merge refs are immutable.

## 14. Decision Log

| Date | Decision | Reason | Alternatives | Files Affected |
| ---- | -------- | ------ | ------------ | -------------- |
| 2026-08-20 | Use this isolated branch at the exact merge SHA. | Pulling into dirty main could overwrite prior work. | In-place pull and stash mutation rejected. | This plan |
| 2026-08-20 | Treat empty GitHub status/run collections as missing hosted evidence. | Mergeability is not runtime proof. | Inferring hosted success rejected. | This plan |
| 2026-08-20 | Preserve restore validation as a side-effecting assertion and attach the caught JSON error as `cause`. | Both lint failures are genuine; discarding the verification result and retaining causal error context preserves behavior while satisfying the stricter toolchain. | Disabling lint rules was rejected. | `packages/storage/src/backup/backup.ts`, `packages/agent-runtime/src/engine/state.ts` |
| 2026-08-20 | Align POSIX and Windows verification to build before tests and build the release before smoke; use literal nonzero Windows exits. | The merge's wrappers otherwise test stale output, omit smoke prerequisites, or return false-green status. | Keeping divergent wrappers was rejected. | `scripts/verify.cmd`, `scripts/verify.sh` |
| 2026-08-20 | Restore local/generated/protected formatter exclusions and normalize only eligible files. | The 297-file gate includes protected documents and repeats a previously verified baseline loss. | Ignoring source files or formatting protected docs was rejected. | `.prettierignore`, `COMMANDS.md`, eligible files |
| 2026-08-20 | Make runtime and integration fixtures self-contained and line-oriented. | The merged tests depended on absent plans, stale databases, one-shot MCP processes, shell parsing, or prebuilt output and therefore did not exercise the claimed boundary reliably. | Weakening assertions or skipping suites was rejected. | Focused unit, integration, E2E, and Vitest configuration files |
| 2026-08-20 | Repair Windows release/smoke/database command entry points without enabling a shell. | Node 24 shim execution and argv parsing failures were reproducible platform defects; direct JavaScript entry points retain argument isolation. | `shell: true` was rejected as a command-injection regression. | `tools/release/build-release.mjs`, `tools/smoke/smoke-test.mjs`, `tools/db/restore.mjs`, `tools/db/rollback.mjs` |
| 2026-08-20 | Generate and track native lock/icon inputs, fix the Rust lifetime, and remove the obsolete self-pushing lock workflow. | These are required for reproducible locked native builds; the workflow contradicted the remediation ledger and mutated source branches with write permission. | Deferring lock generation to CI was rejected. | `apps/desktop/src-tauri`, `.github/workflows/one-shot-cargo-lock.yml`, `.gitignore` |
| 2026-08-20 | Validate release artifacts in a disposable clean Git repository containing the complete repaired candidate. | Release tooling intentionally rejects dirty source trees, while the repair branch must remain uncommitted until the user authorizes publication. | Bypassing the clean-tree invariant was rejected. | `.validation/release-candidate` (ignored local evidence only) |
| 2026-08-20 | Execute pnpm through its JavaScript entry point in the readiness evaluator and derive log paths with `path.relative`. | Windows Node 24 cannot directly spawn the command shim, and the previous string slice emitted invalid evidence paths. | Enabling a shell or accepting synthetic failures was rejected. | `tools/readiness/production-readiness-check.mjs` |
| 2026-08-23 | Publish the verified repair branch and create fresh validation refs for historical merged PRs. | Rerunning a historical workflow executes its original immutable SHA; new PR refs are required to prove repaired code in hosted CI. | Re-running old red attempts without changing their SHA was rejected as insufficient evidence. | Branch refs and GitHub validation PRs |

## 15. Outcomes & Retrospective

- Verified PR #4 identity: base `c6240412`, head `2779258c`, merge `e0dfc28a`, merged 2026-08-20. Hosted evidence is red: four PR-head workflows failed; the merge SHA has no runs or statuses.
- Closed the merged implementation gaps across agent state/cancellation, database backup/restore, MCP persistence, GUI capability exports, CLI/E2E fixtures, release/smoke portability, verification wrappers, dependency audit, formatter boundaries, and native Tauri inputs/builds.
- JavaScript evidence is green: lint, format, typecheck, build; unit 391 passed; integration 140 passed and one existing platform-gated skip; E2E 19 passed; secret scan 0 findings; dependency audit 0 known vulnerabilities.
- Native Windows evidence is green with Rust/Cargo 1.97.1: locked metadata, format, two tests across three suites, clippy with warnings denied, and `tauri build --no-bundle` producing `the-machine-desktop.exe`.
- Disposable clean candidate `0bbe04ed329dcb6d8c5646256c04e5c3969df120` passed release generation, 11/11 clean-room smoke assertions, and the repository's complete 13-gate CI readiness profile with checksum-backed evidence.
- The repaired candidate is locally CI-ready, not production-release-ready. Remaining gates require hosted reruns, Linux/macOS native builds and installers, signing/notarization, live credentials/providers/workers, persistent-runner soak/performance/recovery, and human UAT/accessibility/support/security sign-off.
- Before publication, no production data, credentials, deployment, or GitHub state was changed. The primary worktree remains preserved; user-authorized publication is now the active final milestone.
