import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PlanValidationError,
  compileMachinePlan,
  createCommandRegistry,
  evaluatePatchPolicy,
  globToRegExp,
  redactEvidenceText,
  splitLegacyCommand,
  type MachinePlan,
  type MachineTask,
} from "@the-machine/agent-runtime";

function fixtureTask(overrides: Partial<MachineTask> = {}): MachineTask {
  return {
    id: "implement",
    title: "Implement fixture",
    objective: "Create result.txt.",
    validations: [
      {
        id: "result-exists",
        executable: process.execPath,
        args: ["-e", "process.exit(0)"],
      },
    ],
    ...overrides,
  };
}

function fixturePlan(overrides: Partial<MachinePlan> = {}): MachinePlan {
  return {
    version: 1,
    id: "fixture-plan",
    title: "Fixture plan",
    repository: { path: mkdtempSync(join(tmpdir(), "machine-plan-")) },
    workerStrategy: { primary: "fixture" },
    tasks: [fixtureTask()],
    ...overrides,
  };
}

describe("shell-free command execution", () => {
  it("tokenizes a legacy command without invoking a shell", () => {
    expect(splitLegacyCommand(`node -e "console.log('ok')"`)).toEqual([
      "node",
      "-e",
      "console.log('ok')",
    ]);
  });

  it("rejects shell operators outside quotes", () => {
    expect(() => splitLegacyCommand("node ok.js | sh")).toThrow(/shell syntax/i);
    expect(() => splitLegacyCommand("node ok.js && echo pwned")).toThrow(/shell syntax/i);
    expect(() => splitLegacyCommand("powershell -Command Get-ChildItem")).toThrow(/denied/i);
  });

  it("executes a registered executable with distinct argv", async () => {
    const registry = createCommandRegistry();
    registry.register({
      name: "fixture",
      description: "Print a deterministic value.",
      executable: process.execPath,
      args: ["-e", "console.log(process.argv[1])"],
    });
    const result = await registry.execute("fixture", ["hello;not-a-shell"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hello;not-a-shell");
  });
});

describe("Machine plan compiler", () => {
  it("produces a stable digest and topological task order", () => {
    const repository = mkdtempSync(join(tmpdir(), "machine-plan-"));
    const plan = fixturePlan({
      repository: { path: repository },
      tasks: [
        fixtureTask({ id: "first", title: "First" }),
        fixtureTask({ id: "second", title: "Second", dependsOn: ["first"] }),
      ],
    });
    const first = compileMachinePlan(plan);
    const second = compileMachinePlan(structuredClone(plan));
    expect(first.digest).toBe(second.digest);
    expect(first.taskOrder).toEqual(["first", "second"]);
    expect(first.plan.repository.path).toBe(repository);
  });

  it("rejects unvalidated tasks, dependency cycles, and shell workers", () => {
    expect(() =>
      compileMachinePlan(
        fixturePlan({ tasks: [fixtureTask({ validations: [] })] }),
      ),
    ).toThrow(PlanValidationError);

    expect(() =>
      compileMachinePlan(
        fixturePlan({
          tasks: [
            fixtureTask({ id: "a", dependsOn: ["b"] }),
            fixtureTask({ id: "b", dependsOn: ["a"] }),
          ],
        }),
      ),
    ).toThrow(/cycle/i);

    expect(() =>
      compileMachinePlan(
        fixturePlan({
          workers: [
            {
              id: "unsafe",
              kind: "cli",
              executable: "bash",
              args: ["-c", "echo unsafe"],
            },
          ],
          workerStrategy: { primary: "unsafe" },
        }),
      ),
    ).toThrow(/denied/i);
  });
});

describe("patch policy", () => {
  it("enforces plan and task scope as an intersection", () => {
    const task = fixtureTask({ allowedPaths: ["src/**"] });
    const allowed = evaluatePatchPolicy({
      task,
      planPolicy: { allowedPaths: ["src/**", "tests/**"] },
      attempt: 1,
      patch: { changedFiles: ["src/index.ts"], patch: "diff", patchBytes: 4 },
      decidedAt: new Date(0).toISOString(),
    });
    expect(allowed.allowed).toBe(true);

    const denied = evaluatePatchPolicy({
      task,
      planPolicy: { allowedPaths: ["src/**", "tests/**"] },
      attempt: 1,
      patch: { changedFiles: ["tests/escape.ts"], patch: "diff", patchBytes: 4 },
      decidedAt: new Date(0).toISOString(),
    });
    expect(denied.allowed).toBe(false);
    expect(denied.violations.some((violation) => violation.code === "PATH_NOT_ALLOWED")).toBe(true);
  });

  it("denies dependency and binary changes unless explicitly enabled", () => {
    const decision = evaluatePatchPolicy({
      task: fixtureTask({ allowedPaths: ["**"] }),
      planPolicy: {},
      attempt: 1,
      patch: {
        changedFiles: ["package.json", "asset.bin"],
        patch: "GIT binary patch",
        patchBytes: 32,
      },
      decidedAt: new Date(0).toISOString(),
    });
    expect(decision.violations.map((violation) => violation.code)).toEqual(
      expect.arrayContaining(["DEPENDENCY_CHANGE_DENIED", "BINARY_CHANGE_DENIED"]),
    );
  });

  it("supports recursive path globs", () => {
    expect(globToRegExp("packages/**/src/*.ts").test("packages/core/src/index.ts")).toBe(true);
    expect(globToRegExp("packages/**/src/*.ts").test("apps/cli/src/index.ts")).toBe(false);
  });
});

describe("evidence redaction", () => {
  it("redacts common secrets before persistence", () => {
    const redacted = redactEvidenceText(
      'authorization: Bearer abcdefghijklmnop\n{"apiKey":"sk-abcdefghijklmnop123456"}',
    );
    expect(redacted).not.toContain("abcdefghijklmnop");
    expect(redacted).toContain("[REDACTED]");
  });
});
