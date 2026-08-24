# Agentic Runtime

This document is the operational specification for The Machine 0.2 agentic runtime.

## Design goal

The Machine is a control plane, not a replacement for every coding agent. A worker may be a local model, Codex-style CLI, Claude-style CLI, Aider-style tool, OpenHands-style environment, MCP agent, or an internal company system. The Machine owns durable execution and safety decisions around that worker.

## Trust boundaries

| Boundary    | The Machine responsibility                                                      |
| ----------- | ------------------------------------------------------------------------------- |
| Plan        | Parse, normalize, validate, digest, snapshot                                    |
| Worker      | Launch direct executable/argv, constrain environment, capture terminal protocol |
| Workspace   | Create one linked Git worktree and branch per run                               |
| Patch       | Stage independently, enumerate files, calculate binary diff and size            |
| Policy      | Enforce plan/task path intersection and change budgets                          |
| Validation  | Execute declared deterministic commands after worker completion                 |
| Checkpoint  | Commit only after validation and final policy re-check                          |
| State       | Persist manifests, append-only events, approvals, lease, cancellation           |
| Evidence    | Redact, bundle, checksum, verify                                                |
| Improvement | Aggregate failures and propose; never auto-run or auto-merge                    |

A worker is not trusted to report that a patch is in scope, correct, validated, or complete.

## Plan compilation

`compileMachinePlan()` accepts unknown JSON and either returns a canonical `CompiledMachinePlan` or throws `PlanValidationError` with all discovered errors.

Compilation enforces:

- Schema version `1`.
- Bounded identifiers.
- At least one task.
- Unique task and worker IDs.
- Known dependency references.
- Acyclic task graph.
- At least one deterministic validation per task.
- Relative task paths without traversal.
- Direct worker/validation executables.
- Rejection of common shell interpreters.
- Bounded time and output values.
- Stable topological order.
- Absolute normalized repository path.
- Canonical SHA-256 plan digest.

The normalized plan is copied into the run directory as `plan.snapshot.json`. Resume recompiles that snapshot and compares its digest to the original manifest. A mismatch stops the run.

## Worker protocol

```ts
interface MachineWorker {
  readonly id: string;
  readonly kind: string;
  execute(input: WorkerInput): AsyncIterable<WorkerEvent>;
}
```

A valid worker must terminate with exactly enough information for a `worker.completed` event. Ending without that event is a retryable protocol failure.

CLI workers receive a bounded prompt and optional prompt file. Template replacement is performed on individual argv values; no shell interpolates placeholders.

The runtime only passes a safe base environment plus variable names explicitly declared in `passEnvironment`. Fixed variables can be supplied in the worker definition, but CLI inspection reports only their names.

## Run state machine

```text
pending
  → running
      → awaiting_approval → running
      → completed
      → failed
      → stopped
      → cancelled
```

Per-task phases:

```text
pending
  → awaiting_before_approval
  → working
  → awaiting_after_approval
  → validating
  → checkpointing
  → completed
```

Every meaningful transition appends a JSON event with a monotonically increasing sequence and atomically rewrites the materialized manifest.

## Durable state layout

```text
<repository>/.machine/
  runs/
    <run-id>/
      manifest.json
      plan.snapshot.json
      events.jsonl
      approvals.jsonl
      cancellation.requested
      lease.json
      prompts/
      evidence/
  kaizen/
    proposals/
    plans/
```

Worktrees intentionally live outside the main checkout:

```text
<repository-parent>/.<repository-name>.machine-worktrees/<run-id>/
```

This avoids nesting one worktree inside another and keeps the primary checkout unchanged.

## Leases and restart recovery

Only one owner may execute a run while its lease is live. The active process renews the lease periodically. A stale lease can be replaced after expiry.

When `resume` sees a task interrupted in `working`, `validating`, or `checkpointing`:

1. The worktree resets to the last committed checkpoint.
2. The running attempt becomes a retryable `interrupted` failure.
3. The task returns to `pending`.
4. A `run.recovered` event is appended.
5. Execution continues under a new lease.

An approval wait is not treated as an interruption; staged post-worker changes remain for human review.

## Retry and failover

Worker candidates are ordered as:

1. Task-specific worker, when declared.
2. Plan primary worker.
3. Plan fallback workers.

Attempts rotate through this list until `maxAttempts` is exhausted. Every failed attempt resets the worktree to `HEAD`, preventing partial work from contaminating the next worker.

Failures are typed:

- `worker_unavailable`
- `worker_failed`
- `worker_protocol`
- `validation_failed`
- `policy_violation`
- `approval_rejected`
- `interrupted`
- `plan_changed`
- `cancelled`
- `internal_error`

Retryability is explicit on each failure record.

## Patch policy

The runtime stages the worker result and evaluates the actual Git patch.

A file must match both the plan-level and task-level allowed-path sets. Denied paths are a union. Defaults deny `.git/**`, `.machine/**`, and `node_modules/**`.

Additional controls:

- Maximum changed-file count.
- Maximum binary patch byte size.
- Dependency manifest/lockfile permission.
- Binary-change permission.
- Required non-empty patch.

Policy runs twice: once immediately after the worker, and again after validations in case validation tools create or modify tracked files.

## Validation

Validations are direct executable + argv definitions with:

- Repository-contained working directory.
- Timeout.
- Output limit.
- Safe environment.
- Expected exit code.
- Optional required stdout substring.
- Optional forbidden stderr substring.
- Cancellation signal.

All declared validations must complete and pass. The worker’s own tests are useful progress signals but do not replace this independent gate.

## Approvals

A task may require approval `before` or `after` worker changes.

Before approval prevents the worker from starting. After approval preserves the staged patch for review and blocks validation/checkpointing. Decisions record:

- Run and task.
- Phase.
- Approved/rejected.
- Actor.
- Note.
- Timestamp.

Rejection is a non-retryable STOP outcome.

## Cancellation

`machine cancel` creates a durable request file and event. Active worker and validation processes receive an abort signal. The request also survives a process crash, so a later resume finalizes the run as cancelled rather than restarting it.

## Evidence

Terminal runs produce:

```text
evidence/
  summary.md
  manifest.json
  plan.snapshot.json
  events.jsonl
  approvals.json
  policy-decisions.json
  validations.json
  patch.diff
  checksums.sha256
```

Known API-key, bearer-token, GitHub-token, private-key, password, and secret-environment values are redacted before files are written. `machine evidence verify` recalculates every SHA-256 entry and rejects path traversal in the checksum manifest.

Evidence is not a claim of formal correctness. It is a tamper-evident record of what plan, worker, policy, validation, approval, patch, and checkpoint produced the result.

## Kaizen model

The Kaizen engine reads terminal run facts and applies this loop:

```text
observe
  → aggregate typed failures
  → weight severity and recurrence
  → select highest signal
  → generate one proposal + draft plan
  → pending_human_review
  → approve/reject
  → materialize approved experiment
  → run through normal policy/approval system
  → record validation outcome
```

Proposal evidence references the exact run manifest and terminal evidence bundle. A draft preserves source worker configuration and validation commands, requires a pre-task human approval, and disables recursive Kaizen generation for the experiment itself.

The engine deliberately does not:

- Edit source code while analyzing.
- Execute an unapproved proposal.
- Merge or push a generated branch.
- Remove a failing validation.
- Lower a policy threshold to obtain a pass.
- Treat model confidence as evidence.

## Current isolation level

Worktree, argv, environment, policy, timeout, and evidence controls are implemented. The current CLI worker still runs as the local user. This is not a hostile-code sandbox.

Before enabling untrusted workers or repositories, add an execution backend with:

- Container or OS-level filesystem isolation.
- Default-deny network egress.
- CPU, memory, process, and disk quotas.
- Scoped, short-lived secret leasing.
- Read-only base repository mount.
- Disposable writable worktree mount.
- Provenance for worker binaries and plugins.

That backend should implement the same `MachineWorker` contract so the durable orchestration layer remains unchanged.
