# The Machine

**A durable, local-first control plane for coding agents.**

The Machine turns a versioned software plan into an isolated, restartable delivery run. It can launch any configured CLI worker, constrain its patch, run deterministic validations, create Git checkpoints, pause for human approval, fail over to another worker, and leave a checksum-backed evidence bundle.

> Maturity: **0.2.0 alpha**. The new agentic runtime is functional and covered by real Git-worktree integration tests, but it should still be evaluated on non-production repositories before broader use.

## What works now

- Strict, versioned `.machine.json` plans with stable SHA-256 digests.
- Dependency-ordered task execution.
- Vendor-neutral CLI workers configured as direct executable + argv—never shell strings.
- One isolated Git worktree and branch per run.
- Path, patch-size, changed-file, dependency, and binary-change policy gates.
- Deterministic post-worker validations with timeouts, cancellation, and output limits.
- Worker retries and ordered failover.
- Human approval gates before or after worker changes.
- Durable manifests, append-only events, leases, cancellation requests, and crash recovery.
- Git checkpoint commits owned by The Machine, not by workers.
- Redacted evidence bundles with plan, events, approvals, policies, validations, final diff, and SHA-256 checksums.
- Evidence-driven Kaizen proposals that remain inert until explicitly approved by a human.
- CLI lifecycle for run, resume, status, cancel, approve/reject, evidence verification, and Kaizen review.
- Legacy Markdown execution disabled by default and retained only as an explicitly opted-in compatibility path.

## Requirements

- Node.js **22.13 or newer**.
- pnpm **11.6.0** through Corepack.
- Git with worktree support.
- A clean Git repository for agentic runs.

```bash
corepack enable
corepack prepare pnpm@11.6.0 --activate
pnpm install --frozen-lockfile
pnpm build
```

## Prove the end-to-end loop without credentials

The repository includes a deterministic worker and plan that require no API key:

```bash
pnpm machine -- plan:validate examples/plans/demo.machine.json
pnpm machine -- run examples/plans/demo.machine.json
```

A successful run:

1. Creates a linked worktree outside the main checkout.
2. Launches the configured worker with `shell: false`.
3. Stages and independently inspects the resulting patch.
4. Rejects any path outside `demo-output.txt`.
5. Executes the deterministic validation.
6. Commits a checkpoint on `machine/<run-id>`.
7. Writes `.machine/runs/<run-id>/evidence/`.

Inspect the result:

```bash
pnpm machine -- runs
pnpm machine -- status <run-id>
pnpm machine -- evidence verify .machine/runs/<run-id>/evidence
```

The main working tree is not modified. Review or merge the generated `machine/<run-id>` branch only after inspecting its evidence and diff.

## Configure a real coding worker

Workers are deliberately generic. The Machine does not pretend that a completion API is itself a software engineer; it supervises an external coding worker.

```json
{
  "workers": [
    {
      "id": "my-agent",
      "kind": "cli",
      "executable": "your-agent-executable",
      "args": [
        "your-noninteractive-subcommand",
        "--workspace",
        "{workspace}",
        "--prompt-file",
        "{promptFile}"
      ],
      "passEnvironment": ["YOUR_AGENT_API_KEY"],
      "timeoutMs": 21600000,
      "maxOutputBytes": 8388608
    }
  ],
  "workerStrategy": {
    "primary": "my-agent",
    "fallbacks": ["second-agent"]
  }
}
```

Supported placeholders:

| Placeholder    | Value                                      |
| -------------- | ------------------------------------------ |
| `{workspace}`  | Isolated run worktree                      |
| `{prompt}`     | Full bounded task prompt as one argv value |
| `{promptFile}` | Mode-0600 prompt file outside the worktree |
| `{runId}`      | Durable run identifier                     |
| `{planId}`     | Immutable plan identifier                  |
| `{taskId}`     | Current task identifier                    |
| `{attempt}`    | Current retry number                       |

The Machine passes only a small safe base environment plus names explicitly listed in `passEnvironment`. Fixed environment values are never displayed by `machine workers`; only their variable names are shown.

## Minimal plan

```json
{
  "version": 1,
  "id": "fix-example",
  "title": "Fix the example defect",
  "repository": { "path": ".", "baseRef": "main" },
  "workers": [],
  "workerStrategy": { "primary": "configured-worker" },
  "policy": {
    "allowedPaths": ["packages/example/**", "tests/**"],
    "deniedPaths": [".git/**", ".machine/**"],
    "maxChangedFiles": 20,
    "maxPatchBytes": 500000,
    "allowDependencyChanges": false,
    "allowBinaryChanges": false,
    "keepWorktree": true
  },
  "tasks": [
    {
      "id": "fix",
      "title": "Fix and regress the defect",
      "objective": "Implement the smallest correct fix and add a regression test.",
      "allowedPaths": ["packages/example/**", "tests/**"],
      "validations": [
        {
          "id": "unit",
          "executable": "pnpm",
          "args": ["test:unit"],
          "timeoutMs": 600000
        }
      ],
      "maxAttempts": 3,
      "requireChanges": true,
      "approval": "after"
    }
  ],
  "kaizen": { "enabled": true, "minimumOccurrences": 2 }
}
```

Plans are data, not scripts. Shell executables, command operators, absolute task paths, `..` traversal, unvalidated tasks, duplicate IDs, and dependency cycles are rejected during compilation.

## Run lifecycle

```text
Plan compile
  → create run + lease
  → create isolated worktree/branch
  → approval gate (optional)
  → launch worker
  → stage patch
  → policy decision
  → approval gate (optional)
  → deterministic validations
  → policy re-check
  → Git checkpoint
  → next task
  → terminal evidence
  → Kaizen observation/proposal (optional, review-only)
```

Important properties:

- A worker cannot declare its own success.
- A task cannot complete without its declared validations.
- A task requiring changes cannot pass with an empty patch.
- Failed attempts are reset to the prior checkpoint before retry or failover.
- A killed process is recovered as an interrupted attempt and retried from the last checkpoint.
- A changed plan snapshot stops rather than silently resuming different work.
- Kaizen never auto-runs, auto-merges, or weakens policy.

## CLI

```text
machine plan:validate <plan>
machine run <plan>
machine resume <run-id> [repository]
machine status <run-id> [repository]
machine runs [repository]
machine cancel <run-id> [repository] [reason]
machine approve <run-id> <task-id> <before|after> [repository] [note]
machine reject <run-id> <task-id> <before|after> [repository] [note]
machine workers <plan>
machine evidence verify <directory>

machine kaizen analyze [repository] [minimum-occurrences]
machine kaizen list [repository]
machine kaizen show <proposal-id> [repository]
machine kaizen approve <proposal-id> [repository] [note]
machine kaizen reject <proposal-id> [repository] <note>
machine kaizen materialize <proposal-id> [repository]
machine kaizen record <proposal-id> <run-id> [repository]
```

Use `--json` for automation. Exit code `2` means a run is safely paused for approval; nonzero terminal failures return `1`.

## Kaizen feedback loop

Kaizen is an evidence-driven improvement controller:

1. Reads terminal run manifests and validation evidence.
2. Aggregates recurring failure categories, workers, and validations.
3. Scores severity and concentration.
4. Generates one bounded proposal and draft plan.
5. Stores it as `pending_human_review`.
6. Requires an identified human to approve it.
7. Materializes—but does not execute—the approved experiment plan.
8. Records the resulting run as validated or failed.

This is self-improvement with a safety boundary: the system can observe and propose, while humans retain authority over execution and adoption.

## Security model

- Direct executable + argv with `shell: false`.
- Shell binaries and legacy shell syntax denied.
- Imported Markdown commands disabled unless `MACHINE_ALLOW_LEGACY_PLAN_EXECUTION=1` is deliberately set.
- Work only in linked run worktrees.
- Default-denied `.git`, `.machine`, and `node_modules` patch paths.
- Explicit environment-variable pass-through.
- Time, output, patch, and changed-file budgets.
- Same-origin, loopback GUI server with body and theme limits.
- Secret redaction before evidence persistence.
- Human approval gates and persisted decisions.

The 0.2 alpha does **not** claim a hostile-code container boundary. A configured worker is still a local process under the user account. Container/OS sandbox profiles, network egress policy, and scoped secret leasing remain required before running untrusted third-party workers against sensitive repositories.

## Architecture

```text
apps/cli
    ↓
packages/agent-runtime
    ├── plan compiler
    ├── worker registry/adapters
    ├── durable orchestrator
    ├── Git worktree/checkpoint manager
    ├── patch policy
    ├── validation runner
    ├── state/event store
    ├── evidence writer/verifier
    └── Kaizen engine

packages/service
    └── legacy metadata/UI compatibility; no longer the agentic execution engine
```

The broader monorepo still contains storage, provider, MCP, plugin, security, observability, desktop, and UI packages. Those integrations should connect through the agentic runtime’s worker/policy/event contracts rather than bypassing them.

## Verification

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm build
pnpm test:e2e
pnpm security:check
pnpm audit
pnpm build:release
pnpm smoke
pnpm production:readiness
```

The integration suite creates real temporary Git repositories and verifies isolated edits, policy rollback, worker failover, approval/resume, cooperative cancellation, checkpoint branches, evidence integrity, and Kaizen approval requirements.

## Project documents

- [Agentic runtime guide](./docs/AGENTIC_RUNTIME.md)
- [Architecture](./ARCHITECTURE.md)
- [Security policy](./SECURITY.md)
- [Commands](./COMMANDS.md)
- [Contributing](./CONTRIBUTING.md)
- [Known issues](./KNOWN_ISSUES.md)

## License

MIT. See [LICENSE](./LICENSE).
