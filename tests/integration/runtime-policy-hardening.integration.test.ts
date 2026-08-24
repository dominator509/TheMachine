import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluatePatchPolicy, stageAndInspect } from "@the-machine/agent-runtime";
import type { MachineTask } from "@the-machine/agent-runtime";

function git(cwd: string, args: readonly string[]): void {
  const result = spawnSync("git", [...args], { cwd, encoding: "utf-8", shell: false });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
}

function repository(): string {
  const root = mkdtempSync(join(tmpdir(), "machine-policy-hardening-"));
  git(root, ["init"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["config", "user.email", "test@example.invalid"]);
  writeFileSync(join(root, ".gitignore"), "ignored-output.txt\n", "utf-8");
  writeFileSync(join(root, "tracked.txt"), "baseline\n", "utf-8");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-m", "baseline"]);
  return root;
}

const task: MachineTask = {
  id: "hardening",
  title: "Hardening",
  objective: "Exercise patch containment.",
  allowedPaths: ["**"],
  validations: [
    {
      id: "noop",
      executable: process.execPath,
      args: ["-e", "process.exit(0)"],
    },
  ],
  requireChanges: false,
};

describe("agent runtime patch containment", () => {
  it("captures and removes ignored files before policy or validation can continue", () => {
    const root = repository();
    try {
      writeFileSync(join(root, "ignored-output.txt"), "could-influence-validation\n", "utf-8");
      const patch = stageAndInspect(root);
      expect(patch.ignoredFiles).toContain("ignored-output.txt");
      expect(existsSync(join(root, "ignored-output.txt"))).toBe(false);

      const decision = evaluatePatchPolicy({
        task,
        attempt: 1,
        patch,
        decidedAt: new Date(0).toISOString(),
      });
      expect(decision.allowed).toBe(false);
      expect(decision.violations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "PATH_DENIED", path: "ignored-output.txt" }),
        ]),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.runIf(process.platform !== "win32")(
    "rejects changed symlinks that resolve outside the run worktree",
    () => {
      const root = repository();
      const outside = mkdtempSync(join(tmpdir(), "machine-policy-outside-"));
      try {
        writeFileSync(join(outside, "secret.txt"), "outside\n", "utf-8");
        symlinkSync(join(outside, "secret.txt"), join(root, "escape-link"));
        const patch = stageAndInspect(root);
        expect(patch.unsafeSymlinks).toContain("escape-link");

        const decision = evaluatePatchPolicy({
          task,
          attempt: 1,
          patch,
          decidedAt: new Date(0).toISOString(),
        });
        expect(decision.allowed).toBe(false);
        expect(decision.violations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ code: "PATH_DENIED", path: "escape-link" }),
          ]),
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
        rmSync(outside, { recursive: true, force: true });
      }
    },
  );
});
