import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createAgenticRuntime,
  createFunctionWorker,
  loadRunConsoleSnapshot,
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
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function repositoryFixture(): string {
  const repository = mkdtempSync(join(tmpdir(), "machine-console-"));
  cleanupPaths.push(repository);
  cleanupPaths.push(join(dirname(repository), `.${basename(repository)}.machine-worktrees`));
  git(repository, ["init", "-b", "main"]);
  writeFileSync(join(repository, "README.md"), "# Run Console Fixture\n", "utf-8");
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

function plan(repository: string): MachinePlan {
  return {
    version: 1,
    id: "console-fixture",
    title: "Console fixture",
    repository: { path: repository, baseRef: "main" },
    workerStrategy: { primary: "fixture" },
    policy: {
      allowedPaths: ["result.txt"],
      deniedPaths: [".git/**", ".machine/**"],
      keepWorktree: true,
    },
    tasks: [
      {
        id: "write-result",
        title: "Write result",
        objective: "Create result.txt.",
        allowedPaths: ["result.txt"],
        validations: [
          {
            id: "result-exists",
            executable: process.execPath,
            args: [
              "-e",
              "const fs=require('node:fs');process.exit(fs.readFileSync('result.txt','utf8')==='console\\n'?0:1)",
            ],
          },
        ],
        requireChanges: true,
        approval: "none",
      },
    ],
    kaizen: { enabled: false },
  };
}

afterEach(() => {
  while (cleanupPaths.length > 0) {
    const target = cleanupPaths.pop();
    if (target) rmSync(target, { recursive: true, force: true });
  }
});

describe("shared native run-console snapshot", () => {
  it("returns the durable manifest, plan, events, diff, artifacts, and verified evidence", async () => {
    const repository = repositoryFixture();
    const runtime = createAgenticRuntime({
      idFactory: () => "run-console",
      workers: [
        createFunctionWorker("fixture", (input) => {
          writeFileSync(join(input.workspacePath, "result.txt"), "console\n", "utf-8");
        }),
      ],
    });

    const outcome = await runtime.run(plan(repository));
    expect(outcome.status).toBe("completed");
    const snapshot = loadRunConsoleSnapshot(outcome.runId, repository);

    expect(snapshot.manifest.status).toBe("completed");
    expect(snapshot.plan.id).toBe("console-fixture");
    expect(snapshot.events.some((event) => event.type === "run.completed")).toBe(true);
    expect(snapshot.diff).toContain("result.txt");
    expect(snapshot.artifacts.some((artifact) => artifact.path === "evidence/manifest.json")).toBe(true);
    expect(snapshot.evidenceVerification?.valid).toBe(true);
    expect(existsSync(snapshot.manifest.evidencePath as string)).toBe(true);
  });
});
