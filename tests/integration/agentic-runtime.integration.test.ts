import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createAgenticRuntime,
  createFunctionWorker,
  type MachinePlan,
} from "@the-machine/agent-runtime";

const cleanupPaths: string[] = [];

function git(cwd: string, args: readonly string[]): string {
  const result = spawnSync("git", [...args], {
    cwd,
    encoding: "utf-8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function createRepository(): string {
  const repository = mkdtempSync(join(tmpdir(), "machine-agentic-e2e-"));
  cleanupPaths.push(repository);
  cleanupPaths.push(join(dirname(repository), `.${basename(repository)}.machine-worktrees`));
  git(repository, ["init", "-b", "main"]);
  writeFileSync(join(repository, "README.md"), "# Fixture\n", "utf-8");
  writeFileSync(join(repository, ".gitignore"), ".machine/\n", "utf-8");
  git(repository, ["add", "-A"]);
  git(repository, [
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-m",
    "initial fixture",
  ]);
  return repository;
}

function plan(repository: string, overrides: Partial<MachinePlan> = {}): MachinePlan {
  return {
    version: 1,
    id: "agentic-e2e",
    title: "Agentic E2E",
    repository: { path: repository, baseRef: "main" },
    workerStrategy: { primary: "fixture" },
    policy: {
      allowedPaths: ["result.txt"],
      deniedPaths: [".git/**", ".machine/**"],
      maxChangedFiles: 5,
      maxPatchBytes: 100_000,
      keepWorktree: true,
    },
    tasks: [
      {
        id: "write-result",
        title: "Write result",
        objective: "Create result.txt containing done.",
        allowedPaths: ["result.txt"],
        validations: [
          {
            id: "result-is-done",
            executable: process.execPath,
            args: [
              "-e",
              "const fs=require('node:fs');process.exit(fs.existsSync('result.txt')&&fs.readFileSync('result.txt','utf8')==='done\\n'?0:1)",
            ],
          },
        ],
        maxAttempts: 3,
        requireChanges: true,
        approval: "none",
      },
    ],
    kaizen: { enabled: false, minimumOccurrences: 2 },
    ...overrides,
  };
}

async function waitForFile(filePath: string, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(filePath)) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${filePath}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
}

afterEach(() => {
  while (cleanupPaths.length > 0) {
    const target = cleanupPaths.pop();
    if (target) rmSync(target, { recursive: true, force: true });
  }
});

describe("agentic runtime vertical slice", () => {
  it("edits an isolated worktree, validates, checkpoints, and writes verifiable evidence", async () => {
    const repository = createRepository();
    const runtime = createAgenticRuntime({
      idFactory: () => "run-success",
      workers: [
        createFunctionWorker("fixture", (input) => {
          writeFileSync(join(input.workspacePath, "result.txt"), "done\n", "utf-8");
        }),
      ],
    });

    const outcome = await runtime.run(plan(repository));
    expect(outcome.status).toBe("completed");
    expect(existsSync(join(repository, "result.txt"))).toBe(false);
    expect(git(repository, ["show", `${outcome.manifest.branch}:result.txt`])).toBe("done");
    expect(outcome.manifest.checkpoints).toHaveLength(1);
    expect(outcome.evidencePath).not.toBeNull();
    expect(runtime.verifyEvidence(outcome.evidencePath as string).valid).toBe(true);
    expect(readFileSync(join(outcome.evidencePath as string, "patch.diff"), "utf-8")).toContain(
      "result.txt",
    );
  });

  it("rolls back a policy violation and fails over to a different worker", async () => {
    const repository = createRepository();
    const runtime = createAgenticRuntime({
      idFactory: () => "run-failover",
      workers: [
        createFunctionWorker("bad", (input) => {
          writeFileSync(join(input.workspacePath, "forbidden.txt"), "bad\n", "utf-8");
        }),
        createFunctionWorker("good", (input) => {
          writeFileSync(join(input.workspacePath, "result.txt"), "done\n", "utf-8");
        }),
      ],
    });
    const outcome = await runtime.run(
      plan(repository, {
        workerStrategy: { primary: "bad", fallbacks: ["good"] },
        tasks: [
          {
            ...plan(repository).tasks[0],
            maxAttempts: 2,
          },
        ],
      }),
    );

    expect(outcome.status).toBe("completed");
    const task = outcome.manifest.taskStates["write-result"];
    expect(task?.attempts).toHaveLength(2);
    expect(task?.attempts[0]?.failure?.category).toBe("policy_violation");
    expect(task?.attempts[1]?.workerId).toBe("good");
    expect(git(repository, ["show", `${outcome.manifest.branch}:result.txt`])).toBe("done");
    expect(git(repository, ["ls-tree", "-r", "--name-only", outcome.manifest.branch])).not.toContain(
      "forbidden.txt",
    );
  });

  it("pauses before work and resumes only after an explicit approval", async () => {
    const repository = createRepository();
    let executions = 0;
    const runtime = createAgenticRuntime({
      idFactory: () => "run-approval",
      workers: [
        createFunctionWorker("fixture", (input) => {
          executions += 1;
          writeFileSync(join(input.workspacePath, "result.txt"), "done\n", "utf-8");
        }),
      ],
    });
    const approvalPlan = plan(repository, {
      tasks: [
        {
          ...plan(repository).tasks[0],
          approval: "before",
        },
      ],
    });

    const paused = await runtime.run(approvalPlan);
    expect(paused.status).toBe("awaiting_approval");
    expect(executions).toBe(0);

    runtime.approve(
      paused.runId,
      "write-result",
      "before",
      "test-operator",
      "Approved by integration test.",
      repository,
    );
    const resumed = await runtime.resume(paused.runId, repository);
    expect(resumed.status).toBe("completed");
    expect(executions).toBe(1);
    expect(resumed.manifest.approvals.at(-1)?.decision).toBe("approved");
  });

  it("cooperatively cancels an active worker and persists a cancelled terminal run", async () => {
    const repository = createRepository();
    const runtime = createAgenticRuntime({
      idFactory: () => "run-cancel",
      workers: [
        createFunctionWorker("fixture", async (input) => {
          await new Promise<void>((resolveWorker) => {
            if (input.signal.aborted) {
              resolveWorker();
              return;
            }
            input.signal.addEventListener("abort", () => resolveWorker(), { once: true });
          });
        }),
      ],
    });
    const running = runtime.run(plan(repository));
    const manifestPath = join(repository, ".machine", "runs", "run-cancel", "manifest.json");
    await waitForFile(manifestPath);
    runtime.cancel("run-cancel", "test-operator", "Cancellation test.", repository);
    const outcome = await running;
    expect(outcome.status).toBe("cancelled");
    expect(outcome.manifest.failure?.category).toBe("cancelled");
    expect(runtime.verifyEvidence(outcome.evidencePath as string).valid).toBe(true);
  });

  it("generates Kaizen proposals from repeated evidence but requires human approval to materialize", async () => {
    const repository = createRepository();
    let runNumber = 0;
    const runtime = createAgenticRuntime({
      idFactory: () => `run-kaizen-${String(++runNumber)}`,
      workers: [
        createFunctionWorker("bad", (input) => {
          writeFileSync(join(input.workspacePath, "forbidden.txt"), "bad\n", "utf-8");
        }),
      ],
    });
    const failingPlan = plan(repository, {
      workerStrategy: { primary: "bad" },
      tasks: [
        {
          ...plan(repository).tasks[0],
          maxAttempts: 1,
        },
      ],
    });
    expect((await runtime.run(failingPlan)).status).toBe("failed");
    expect((await runtime.run(failingPlan)).status).toBe("failed");

    const kaizen = runtime.kaizen(repository);
    const proposal = kaizen.analyze({ minimumOccurrences: 2 });
    expect(proposal?.status).toBe("pending_human_review");
    expect(() => kaizen.materialize(proposal?.id as string)).toThrow(/approval/i);

    const approved = kaizen.approve(
      proposal?.id as string,
      "test-operator",
      "Approve the bounded regression experiment.",
    );
    expect(approved.status).toBe("approved");
    const materialized = kaizen.materialize(approved.id);
    expect(materialized.status).toBe("materialized");
    expect(materialized.materializedPlanPath).not.toBeNull();
    expect(existsSync(materialized.materializedPlanPath as string)).toBe(true);
  });
});
