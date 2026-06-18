// Integration tests for The Machine CLI — spawns the CLI as a subprocess.
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const CLI_PATH = resolve(import.meta.dirname, "../../apps/cli/dist/index.js");

function run(args: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`node ${CLI_PATH} ${args}`, {
      encoding: "utf-8",
      timeout: 5000,
    });
    return { stdout: stdout.trim(), stderr: "", exitCode: 0 };
  } catch (e: any) {
    return {
      stdout: e.stdout?.toString().trim() ?? "",
      stderr: e.stderr?.toString().trim() ?? "",
      exitCode: e.status ?? 1,
    };
  }
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
    expect(stdout).toBe("0.1.0");
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
    expect(stdout).toContain("repo: ok");
  });

  it("repo --json returns JSON", () => {
    const { stdout, exitCode } = run("--json repo");
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty("rootPath");
    expect(parsed).toHaveProperty("packageManager");
  });

  it("plan loads a plan file", () => {
    const { stdout, exitCode } = run("plan /tmp/test-plan.md");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Plan:");
    expect(stdout).toContain("plan: ok");
  });

  it("plan requires a file argument", () => {
    const { stderr, exitCode } = run("plan");
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Usage: machine plan");
  });

  it("plans lists loaded plans", () => {
    const { stdout, exitCode } = run("plans");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("No plans loaded.");
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
    expect(stdout).toContain("Filtered subsystem: core");
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
