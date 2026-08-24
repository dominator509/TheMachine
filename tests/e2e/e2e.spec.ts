import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import {
  getGuiServerAccess,
  startGuiServer,
  stopGuiServer,
} from "@the-machine/service";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CLI_PATH = join(ROOT, "apps", "cli", "dist", "index.js");

function run(
  executable: string,
  args: readonly string[],
  cwd: string,
  expectedExitCode = 0,
): string {
  const result = spawnSync(executable, [...args], {
    cwd,
    encoding: "utf-8",
    shell: false,
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exitCode = result.status ?? 1;
  if (exitCode !== expectedExitCode) {
    throw new Error(
      `${executable} ${args.join(" ")} exited ${String(exitCode)}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  return result.stdout;
}

function git(cwd: string, args: readonly string[]): string {
  return run("git", args, cwd);
}

function createAgenticFixture(): { parent: string; repository: string; planPath: string } {
  const parent = mkdtempSync(join(tmpdir(), "machine-e2e-"));
  const repository = join(parent, "repository");
  const mkdir = spawnSync(process.execPath, ["-e", "require('node:fs').mkdirSync(process.argv[1],{recursive:true})", repository], {
    encoding: "utf-8",
    shell: false,
  });
  if (mkdir.status !== 0) throw new Error(mkdir.stderr);

  git(repository, ["init"]);
  git(repository, ["config", "user.name", "The Machine E2E"]);
  git(repository, ["config", "user.email", "e2e@example.invalid"]);
  writeFileSync(join(repository, "README.md"), "# Fixture\n", "utf-8");
  writeFileSync(
    join(repository, "worker.mjs"),
    `import { writeFileSync } from "node:fs";
import { join } from "node:path";
const workspace = process.argv[2];
writeFileSync(join(workspace, "result.txt"), "real agentic execution\\n", "utf-8");
console.log(JSON.stringify({ type: "completed", workspace }));
`,
    "utf-8",
  );
  const planPath = join(repository, "e2e.machine.json");
  writeFileSync(
    planPath,
    `${JSON.stringify(
      {
        version: 1,
        id: "e2e-real-run",
        title: "Real E2E agentic execution",
        repository: { path: ".", baseRef: "HEAD" },
        workers: [
          {
            id: "fixture-worker",
            kind: "cli",
            executable: "node",
            args: ["{workspace}/worker.mjs", "{workspace}"],
            timeoutMs: 30_000,
            maxOutputBytes: 1024 * 1024,
          },
        ],
        workerStrategy: { primary: "fixture-worker" },
        policy: {
          allowedPaths: ["result.txt"],
          deniedPaths: [".git/**", ".machine/**"],
          maxChangedFiles: 1,
          maxPatchBytes: 10_000,
          allowDependencyChanges: false,
          allowBinaryChanges: false,
          keepWorktree: true,
        },
        tasks: [
          {
            id: "produce-real-change",
            title: "Produce a real change",
            objective: "Write result.txt with the exact expected content.",
            allowedPaths: ["result.txt"],
            validations: [
              {
                id: "verify-result",
                executable: "node",
                args: [
                  "-e",
                  "const fs=require('node:fs');process.exit(fs.readFileSync('result.txt','utf8')==='real agentic execution\\n'?0:1)",
                ],
                timeoutMs: 30_000,
              },
            ],
            maxAttempts: 1,
            requireChanges: true,
            approval: "none",
            checkpointMessage: "e2e: prove real agentic execution",
          },
        ],
        kaizen: { enabled: false },
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );
  git(repository, ["add", "-A"]);
  git(repository, ["commit", "-m", "fixture baseline"]);
  return { parent, repository, planPath };
}

async function listening(server: ReturnType<typeof startGuiServer>): Promise<void> {
  if (server.listening) return;
  await new Promise<void>((resolveListening, reject) => {
    server.once("listening", resolveListening);
    server.once("error", reject);
  });
}

test.describe.serial("The Machine functional E2E", () => {
  test("built CLI starts and reports the exact release version", () => {
    expect(existsSync(CLI_PATH)).toBe(true);
    const help = run(process.execPath, [CLI_PATH, "help"], ROOT);
    expect(help).toContain("The Machine CLI v0.3.0-alpha.1");
    expect(help).toContain("run <plan.machine.json>");

    const health = run(process.execPath, [CLI_PATH, "--json", "health"], ROOT);
    const parsed = JSON.parse(health) as { status: string; version: string };
    expect(parsed).toEqual(expect.objectContaining({ status: "ok", version: "0.3.0-alpha.1" }));
  });

  test("built CLI performs a real isolated run, checkpoint, and evidence verification", () => {
    const fixture = createAgenticFixture();
    try {
      const validationOutput = run(
        process.execPath,
        [CLI_PATH, "--json", "plan:validate", fixture.planPath],
        fixture.repository,
      );
      expect(JSON.parse(validationOutput)).toEqual(
        expect.objectContaining({ valid: true, id: "e2e-real-run" }),
      );

      const runOutput = run(
        process.execPath,
        [CLI_PATH, "--json", "run", fixture.planPath],
        fixture.repository,
      );
      const outcome = JSON.parse(runOutput) as {
        status: string;
        manifest: {
          runId: string;
          status: string;
          branch: string;
          worktreePath: string;
          evidencePath: string;
          checkpoints: string[];
        };
      };
      expect(outcome.status).toBe("completed");
      expect(outcome.manifest.status).toBe("completed");
      expect(outcome.manifest.branch).toMatch(/^machine\//);
      expect(outcome.manifest.checkpoints).toHaveLength(1);
      expect(existsSync(join(outcome.manifest.worktreePath, "result.txt"))).toBe(true);
      expect(readFileSync(join(outcome.manifest.worktreePath, "result.txt"), "utf-8")).toBe(
        "real agentic execution\n",
      );
      expect(existsSync(join(fixture.repository, "result.txt"))).toBe(false);
      expect(git(fixture.repository, ["status", "--porcelain"])).toBe("");
      expect(git(fixture.repository, ["show", `${outcome.manifest.branch}:result.txt`])).toBe(
        "real agentic execution\n",
      );

      const evidenceOutput = run(
        process.execPath,
        [CLI_PATH, "--json", "evidence", "verify", outcome.manifest.evidencePath],
        fixture.repository,
      );
      expect(JSON.parse(evidenceOutput)).toEqual(
        expect.objectContaining({ valid: true, unexpected: [], mismatched: [], missing: [] }),
      );
    } finally {
      rmSync(fixture.parent, { recursive: true, force: true });
    }
  });

  test("browser dashboard requires a launch capability and establishes a viewer session", async ({
    page,
  }) => {
    const port = 45_000 + Math.floor(Math.random() * 10_000);
    const base = `http://127.0.0.1:${String(port)}`;
    const server = startGuiServer({
      port,
      host: "127.0.0.1",
      viewerToken: "playwright-viewer-capability",
      eventToken: "playwright-producer-capability",
    });
    try {
      await listening(server);
      const access = getGuiServerAccess();
      if (!access) throw new Error("GUI launch capabilities were not created");

      const denied = await page.request.get(`${base}/`);
      expect(denied.status()).toBe(403);

      await page.goto(access.dashboardUrl);
      await expect(page.locator("body")).toContainText("War Council");
      expect(page.url()).toContain("access=");

      await page.goto(`${base}/builder`);
      await expect(page.locator("body")).toContainText("Animated GUI Builder");
    } finally {
      stopGuiServer();
    }
  });
});
