import type { MachineTask, PlanPolicy, PolicyDecision, PolicyViolation } from "./types.js";
import type { StagedPatch } from "./git.js";

const DEFAULT_DENIED_PATHS = [".git/**", ".machine/**", "node_modules/**"] as const;
const DEPENDENCY_FILES = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "Cargo.toml",
  "Cargo.lock",
  "pyproject.toml",
  "poetry.lock",
  "requirements.txt",
  "go.mod",
  "go.sum",
  "Gemfile",
  "Gemfile.lock",
]);

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

export function globToRegExp(glob: string): RegExp {
  const normalized = normalizePath(glob);
  let pattern = "^";
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index] ?? "";
    if (character === "*") {
      const next = normalized[index + 1];
      if (next === "*") {
        pattern += ".*";
        index += 1;
      } else {
        pattern += "[^/]*";
      }
    } else if (character === "?") {
      pattern += "[^/]";
    } else {
      pattern += escapeRegex(character);
    }
  }
  return new RegExp(`${pattern}$`);
}

export function matchesAnyGlob(filePath: string, globs: readonly string[]): boolean {
  const normalized = normalizePath(filePath);
  return globs.some((glob) => globToRegExp(glob).test(normalized));
}

function dependencyChange(filePath: string): boolean {
  const normalized = normalizePath(filePath);
  const name = normalized.split("/").at(-1) ?? normalized;
  return DEPENDENCY_FILES.has(name);
}

function pathViolation(
  filePath: string,
  planPolicy: PlanPolicy,
  task: MachineTask,
): PolicyViolation[] {
  const normalized = normalizePath(filePath);
  const violations: PolicyViolation[] = [];
  const planAllowed = planPolicy.allowedPaths ?? ["**"];
  const taskAllowed = task.allowedPaths ?? ["**"];
  const denied = [
    ...DEFAULT_DENIED_PATHS,
    ...(planPolicy.deniedPaths ?? []),
    ...(task.deniedPaths ?? []),
  ];

  if (!matchesAnyGlob(normalized, planAllowed) || !matchesAnyGlob(normalized, taskAllowed)) {
    violations.push({
      code: "PATH_NOT_ALLOWED",
      message: `Changed path is outside the approved scope: ${normalized}`,
      path: normalized,
    });
  }
  if (matchesAnyGlob(normalized, denied)) {
    violations.push({
      code: "PATH_DENIED",
      message: `Changed path matches a denied path rule: ${normalized}`,
      path: normalized,
    });
  }
  if (!(planPolicy.allowDependencyChanges ?? false) && dependencyChange(normalized)) {
    violations.push({
      code: "DEPENDENCY_CHANGE_DENIED",
      message: `Dependency manifest or lockfile changes require explicit plan permission: ${normalized}`,
      path: normalized,
    });
  }
  return violations;
}

export function evaluatePatchPolicy(input: {
  readonly task: MachineTask;
  readonly planPolicy?: PlanPolicy;
  readonly attempt: number;
  readonly patch: StagedPatch;
  readonly decidedAt: string;
}): PolicyDecision {
  const planPolicy = input.planPolicy ?? {};
  const changedFiles = Array.from(new Set(input.patch.changedFiles.map(normalizePath))).sort();
  const ignoredFiles = Array.from(
    new Set((input.patch.ignoredFiles ?? []).map(normalizePath)),
  ).sort();
  const unsafeSymlinks = Array.from(
    new Set((input.patch.unsafeSymlinks ?? []).map(normalizePath)),
  ).sort();
  const violations: PolicyViolation[] = changedFiles.flatMap((filePath) =>
    pathViolation(filePath, planPolicy, input.task),
  );

  for (const ignoredFile of ignoredFiles) {
    violations.push({
      code: "PATH_DENIED",
      message:
        `Worker created an ignored path that would evade the staged patch and could influence ` +
        `validation or a later attempt: ${ignoredFile}`,
      path: ignoredFile,
    });
  }
  for (const symlink of unsafeSymlinks) {
    violations.push({
      code: "PATH_DENIED",
      message: `Changed symbolic link resolves outside the run worktree or into protected state: ${symlink}`,
      path: symlink,
    });
  }

  const maxChangedFiles = planPolicy.maxChangedFiles ?? 100;
  const maxPatchBytes = planPolicy.maxPatchBytes ?? 1024 * 1024;

  if (changedFiles.length > maxChangedFiles) {
    violations.push({
      code: "TOO_MANY_FILES",
      message: `Patch changes ${String(changedFiles.length)} files; limit is ${String(maxChangedFiles)}.`,
      path: null,
    });
  }
  if (input.patch.patchBytes > maxPatchBytes) {
    violations.push({
      code: "PATCH_TOO_LARGE",
      message: `Patch is ${String(input.patch.patchBytes)} bytes; limit is ${String(maxPatchBytes)}.`,
      path: null,
    });
  }
  if (!(planPolicy.allowBinaryChanges ?? false)) {
    const binaryPatch =
      input.patch.patch.includes("GIT binary patch") || input.patch.patch.includes("Binary files ");
    if (binaryPatch) {
      violations.push({
        code: "BINARY_CHANGE_DENIED",
        message: "Binary changes require explicit plan permission.",
        path: null,
      });
    }
  }
  if ((input.task.requireChanges ?? true) && changedFiles.length === 0) {
    violations.push({
      code: "NO_CHANGES",
      message: "The worker produced no repository changes for a task that requires changes.",
      path: null,
    });
  }

  return {
    taskId: input.task.id,
    attempt: input.attempt,
    allowed: violations.length === 0,
    changedFiles,
    patchBytes: input.patch.patchBytes,
    violations,
    decidedAt: input.decidedAt,
  };
}
