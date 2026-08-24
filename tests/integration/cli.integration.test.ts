// Integration tests for The Machine CLI — spawns the CLI as a subprocess.
import { afterAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CLI_PATH = resolve(import.meta.dirname, "../../apps/cli/dist/index.js");
const CLI_TEMP_DIRECTORY = mkdtempSync(join(tmpdir(), "machine-cli-"));
const CLI_DB_PATH = resolve(CLI_TEMP_DIRECTORY, "machine.sqlite");
const CLI_PLAN_PATH = resolve(CLI_TEMP_DIRECTORY, "test-plan.md");

writeFileSync(
  CLI_PLAN_PATH,
  [
    "# CLI Integration Plan",
    "",
    "### M0: CLI milestone",
    "",
    "- Goal: Exercise CLI plan persistence.",
    "- Validation command: `pnpm run test:integration`",
    "- Expected result: Integration tests pass.",
    "- Recovery instruction: Inspect the failing CLI integration test.",
    "",
  ].join("\n"),
  "utf-8",
);

afterAll(() => {
  rmSync(CLI_TEMP_DIRECTORY, { recursive: true, force: true });
});

function run(args: string | readonly string[]): {
  stdout: string;
  stderr: string;
  exitCode: number;
} {
  const argv = typeof args === "string" ? args.split(" ").filter(Boolean) : [...args];
  const result = spawnSync(process.execPath, [CLI_PATH, ...argv], {
    encoding: "utf-8",
    timeout: 5000,
    env: { ...process.env, MACHINE_DB_PATH: CLI_DB_PATH },
    shell: false,
    windowsHide: true,
  });
  return {
    stdout: (result.stdout ?? "").trim(),
    stderr:
      `${result.stderr ?? ""}${result.error ? `${result.stderr ? "\n" : ""}${result.error.message}` : ""}`.trim(),
    exitCode: result.status ?? 1,
  };
}

describe("CLI", () => {
  it("help lists all commands", () => {
    const { stdout, exitCode } = run("help");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("The Machine CLI");
    expect(stdout).toContain("health");
    expect(stdout).toContain("workspace");
    expect(stdout).toContain("repo");
    expect(stdout).toContain("plan");
    expect(stdout).toContain("providers");
    expect(stdout).toContain("mcp");
    expect(stdout).toContain("plugins");
    expect(stdout).toContain("readiness");
    expect(stdout).toContain("diagnostics");
  });

  it("version outputs version string", () => {
    const { stdout, exitCode } = run("version");
    expect(exitCode).toBe(0);
    expect(stdout).toBe("0.3.0-alpha.1");
  });

  it("health returns ok", () => {
    const { stdout, exitCode } = run("health");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Status: ok");
    expect(stdout).toContain("health: ok");
  });

  it("health --json returns JSON", () => {
    const { stdout, exitCode } = run("--json health");
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe("ok");
    expect(parsed.platform).toBe("The Machine");
  });

  it("workspace returns workspace info", () => {
    const { stdout, exitCode } = run("workspace");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Workspace path:");
    expect(stdout).toContain("Status:");
  });

  it("workspace --json returns JSON", () => {
    const { stdout, exitCode } = run("--json workspace");
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty("path");
    expect(parsed).toHaveProperty("status");
  });

  it("repo discovers repository profile", () => {
    const { stdout, exitCode } = run("repo");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Repository:");
    expect(stdout).toContain("Package manager: pnpm");
    expect(stdout).toContain("Branch:");
  });

  it("repo --json returns JSON", () => {
    const { stdout, exitCode } = run("--json repo");
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty("rootPath");
    expect(parsed).toHaveProperty("packageManager");
  });

  it("plan loads a plan file", () => {
    const { stdout, exitCode } = run(["plan", CLI_PLAN_PATH]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Plan:");
    expect(stdout).toContain("CLI Integration Plan");
    expect(stdout).toContain("Status: pending");
  });

  it("plan requires a file argument", () => {
    const { stderr, exitCode } = run("plan");
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Usage: machine plan");
  });

  it("plans lists loaded plans", () => {
    expect(run(["plan", CLI_PLAN_PATH]).exitCode).toBe(0);
    const { stdout, exitCode } = run("plans");
    expect(exitCode).toBe(0);
    expect(stdout).toContain(CLI_PLAN_PATH);
  });

  it("validation requires a run-id argument", () => {
    const { stderr, exitCode } = run("validation");
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Usage: machine validation");
  });

  it("providers lists configured providers", () => {
    const { stdout, exitCode } = run("providers");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("No providers configured.");
  });

  it("provider requires an id argument", () => {
    const { stderr, exitCode } = run("provider");
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Usage: machine provider");
  });

  it("mcp lists MCP servers", () => {
    const { stdout, exitCode } = run("mcp");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("No MCP servers registered.");
  });

  it("plugins lists plugins", () => {
    const { stdout, exitCode } = run("plugins");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("No plugins registered.");
  });

  it("readiness checks system readiness", () => {
    const { stdout, exitCode } = run("readiness");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Overall:");
  });

  it("readiness --json returns JSON", () => {
    const { stdout, exitCode } = run("--json readiness");
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty("overall");
    expect(parsed).toHaveProperty("gates");
  });

  it("readiness filters by subsystem", () => {
    const { stdout, exitCode } = run("readiness core");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("core: pending (0/5)");
  });

  it("diagnostics shows system info", () => {
    const { stdout, exitCode } = run("diagnostics");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Platform:");
    expect(stdout).toContain("diagnostics: ok");
  });

  it("diagnostics --json returns JSON", () => {
    const { stdout, exitCode } = run("--json diagnostics");
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty("platform");
    expect(parsed).toHaveProperty("version");
  });

  it("unknown command errors", () => {
    const { stderr, exitCode } = run("nonexistent-command");
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Unknown command");
  });
});
