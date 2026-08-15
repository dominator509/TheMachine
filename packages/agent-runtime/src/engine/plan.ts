import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { assertSafeExecutable } from "../process.js";
import type {
  CliWorkerConfig,
  CompiledMachinePlan,
  MachinePlan,
  MachineTask,
  PlanPolicy,
  ValidationCommand,
} from "./types.js";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_TASKS = 1_000;
const MAX_VALIDATIONS_PER_TASK = 100;

export class PlanValidationError extends Error {
  readonly errors: readonly string[];

  constructor(errors: readonly string[]) {
    super(`Invalid Machine plan:\n- ${errors.join("\n- ")}`);
    this.name = "PlanValidationError";
    this.errors = errors;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
): string | null {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${path}.${key} must be a non-empty string.`);
    return null;
  }
  return value;
}

function validId(value: unknown, path: string, errors: string[]): value is string {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    errors.push(`${path} must match ${ID_PATTERN.source}.`);
    return false;
  }
  return true;
}

function validateRelativePath(value: unknown, path: string, errors: string[]): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${path} must be a non-empty relative path.`);
    return;
  }
  const normalizedSegments = value.replaceAll("\\", "/").split("/");
  if (isAbsolute(value) || normalizedSegments.includes("..") || value.includes("\0")) {
    errors.push(`${path} must stay within the repository and may not contain '..'.`);
  }
}

function validatePathPatterns(value: unknown, path: string, errors: string[]): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array of path globs.`);
    return;
  }
  value.forEach((item, index) => validateRelativePath(item, `${path}[${String(index)}]`, errors));
}

function validatePositiveInteger(
  value: unknown,
  path: string,
  errors: string[],
  minimum: number,
  maximum: number,
): void {
  if (value === undefined) return;
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    errors.push(`${path} must be an integer between ${String(minimum)} and ${String(maximum)}.`);
  }
}

function validateValidationCommand(
  value: unknown,
  path: string,
  errors: string[],
): value is ValidationCommand {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return false;
  }
  validId(value["id"], `${path}.id`, errors);
  const executable = stringValue(value, "executable", path, errors);
  if (executable) {
    try {
      assertSafeExecutable(executable);
    } catch (error) {
      errors.push(`${path}.executable: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const args = value["args"];
  if (args !== undefined && (!Array.isArray(args) || args.some((arg) => typeof arg !== "string"))) {
    errors.push(`${path}.args must be an array of strings.`);
  }
  if (value["cwd"] !== undefined) validateRelativePath(value["cwd"], `${path}.cwd`, errors);
  validatePositiveInteger(value["timeoutMs"], `${path}.timeoutMs`, errors, 1, 3_600_000);
  if (value["expectedExitCode"] !== undefined && !Number.isInteger(value["expectedExitCode"])) {
    errors.push(`${path}.expectedExitCode must be an integer.`);
  }
  for (const key of ["stdoutIncludes", "stderrExcludes"] as const) {
    if (value[key] !== undefined && typeof value[key] !== "string") {
      errors.push(`${path}.${key} must be a string.`);
    }
  }
  const environment = value["environment"];
  if (
    environment !== undefined &&
    (!isRecord(environment) || Object.values(environment).some((item) => typeof item !== "string"))
  ) {
    errors.push(`${path}.environment must map variable names to string values.`);
  }
  const passEnvironment = value["passEnvironment"];
  if (
    passEnvironment !== undefined &&
    (!Array.isArray(passEnvironment) || passEnvironment.some((item) => typeof item !== "string"))
  ) {
    errors.push(`${path}.passEnvironment must be an array of environment variable names.`);
  }
  return true;
}

function validateWorker(value: unknown, path: string, errors: string[]): value is CliWorkerConfig {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return false;
  }
  validId(value["id"], `${path}.id`, errors);
  if (value["kind"] !== "cli") errors.push(`${path}.kind must be 'cli'.`);
  const executable = stringValue(value, "executable", path, errors);
  if (executable) {
    try {
      assertSafeExecutable(executable);
    } catch (error) {
      errors.push(`${path}.executable: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (
    !Array.isArray(value["args"]) ||
    (value["args"] as unknown[]).some((arg) => typeof arg !== "string")
  ) {
    errors.push(`${path}.args must be an array of strings.`);
  }
  validatePositiveInteger(value["timeoutMs"], `${path}.timeoutMs`, errors, 1, 24 * 60 * 60 * 1_000);
  validatePositiveInteger(
    value["maxOutputBytes"],
    `${path}.maxOutputBytes`,
    errors,
    1,
    64 * 1024 * 1024,
  );
  const environment = value["environment"];
  if (
    environment !== undefined &&
    (!isRecord(environment) || Object.values(environment).some((item) => typeof item !== "string"))
  ) {
    errors.push(`${path}.environment must map variable names to string values.`);
  }
  const passEnvironment = value["passEnvironment"];
  if (
    passEnvironment !== undefined &&
    (!Array.isArray(passEnvironment) || passEnvironment.some((item) => typeof item !== "string"))
  ) {
    errors.push(`${path}.passEnvironment must be an array of strings.`);
  }
  return true;
}

function validateTask(value: unknown, path: string, errors: string[]): value is MachineTask {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return false;
  }
  validId(value["id"], `${path}.id`, errors);
  stringValue(value, "title", path, errors);
  stringValue(value, "objective", path, errors);
  const dependencies = value["dependsOn"];
  if (
    dependencies !== undefined &&
    (!Array.isArray(dependencies) ||
      dependencies.some((dependency) => typeof dependency !== "string"))
  ) {
    errors.push(`${path}.dependsOn must be an array of task IDs.`);
  }
  if (value["worker"] !== undefined) validId(value["worker"], `${path}.worker`, errors);
  validatePathPatterns(value["allowedPaths"], `${path}.allowedPaths`, errors);
  validatePathPatterns(value["deniedPaths"], `${path}.deniedPaths`, errors);
  const validations = value["validations"];
  if (!Array.isArray(validations) || validations.length === 0) {
    errors.push(`${path}.validations must contain at least one deterministic validation.`);
  } else if (validations.length > MAX_VALIDATIONS_PER_TASK) {
    errors.push(`${path}.validations exceeds ${String(MAX_VALIDATIONS_PER_TASK)} entries.`);
  } else {
    validations.forEach((validation, index) =>
      validateValidationCommand(validation, `${path}.validations[${String(index)}]`, errors),
    );
  }
  validatePositiveInteger(value["maxAttempts"], `${path}.maxAttempts`, errors, 1, 10);
  if (value["requireChanges"] !== undefined && typeof value["requireChanges"] !== "boolean") {
    errors.push(`${path}.requireChanges must be boolean.`);
  }
  if (
    value["approval"] !== undefined &&
    value["approval"] !== "none" &&
    value["approval"] !== "before" &&
    value["approval"] !== "after"
  ) {
    errors.push(`${path}.approval must be 'none', 'before', or 'after'.`);
  }
  if (value["checkpointMessage"] !== undefined && typeof value["checkpointMessage"] !== "string") {
    errors.push(`${path}.checkpointMessage must be a string.`);
  }
  return true;
}

function validatePolicy(value: unknown, path: string, errors: string[]): value is PlanPolicy {
  if (value === undefined) return true;
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return false;
  }
  validatePathPatterns(value["allowedPaths"], `${path}.allowedPaths`, errors);
  validatePathPatterns(value["deniedPaths"], `${path}.deniedPaths`, errors);
  validatePositiveInteger(value["maxChangedFiles"], `${path}.maxChangedFiles`, errors, 1, 100_000);
  validatePositiveInteger(
    value["maxPatchBytes"],
    `${path}.maxPatchBytes`,
    errors,
    1,
    128 * 1024 * 1024,
  );
  for (const key of ["allowDependencyChanges", "allowBinaryChanges", "keepWorktree"] as const) {
    if (value[key] !== undefined && typeof value[key] !== "boolean") {
      errors.push(`${path}.${key} must be boolean.`);
    }
  }
  return true;
}

function validateGraph(tasks: readonly MachineTask[], errors: string[]): readonly string[] {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  for (const task of tasks) {
    for (const dependency of task.dependsOn ?? []) {
      if (!taskById.has(dependency))
        errors.push(`Task '${task.id}' depends on unknown task '${dependency}'.`);
      if (dependency === task.id) errors.push(`Task '${task.id}' cannot depend on itself.`);
    }
  }

  const order: string[] = [];
  const state = new Map<string, "visiting" | "visited">();
  const visit = (taskId: string, stack: readonly string[]): void => {
    const current = state.get(taskId);
    if (current === "visited") return;
    if (current === "visiting") {
      errors.push(`Task dependency cycle detected: ${[...stack, taskId].join(" -> ")}.`);
      return;
    }
    state.set(taskId, "visiting");
    const task = taskById.get(taskId);
    for (const dependency of task?.dependsOn ?? []) visit(dependency, [...stack, taskId]);
    state.set(taskId, "visited");
    order.push(taskId);
  };
  tasks.forEach((task) => visit(task.id, []));
  return order;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (isRecord(value)) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) sorted[key] = canonicalValue(value[key]);
    return sorted;
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export function digestPlan(plan: MachinePlan): string {
  return createHash("sha256").update(stableStringify(plan), "utf-8").digest("hex");
}

export function compileMachinePlan(
  input: unknown,
  sourcePath: string | null = null,
): CompiledMachinePlan {
  const errors: string[] = [];
  if (!isRecord(input)) throw new PlanValidationError(["Plan root must be an object."]);

  if (input["version"] !== 1) errors.push("version must be 1.");
  validId(input["id"], "id", errors);
  stringValue(input, "title", "plan", errors);
  if (input["description"] !== undefined && typeof input["description"] !== "string") {
    errors.push("description must be a string.");
  }

  const repository = input["repository"];
  if (!isRecord(repository)) {
    errors.push("repository must be an object.");
  } else {
    stringValue(repository, "path", "repository", errors);
    if (repository["baseRef"] !== undefined && typeof repository["baseRef"] !== "string") {
      errors.push("repository.baseRef must be a string.");
    }
  }

  const workers = input["workers"];
  if (workers !== undefined && !Array.isArray(workers)) {
    errors.push("workers must be an array.");
  } else if (Array.isArray(workers)) {
    workers.forEach((worker, index) => validateWorker(worker, `workers[${String(index)}]`, errors));
    const ids = workers
      .filter(isRecord)
      .map((worker) => worker["id"])
      .filter((id): id is string => typeof id === "string");
    if (new Set(ids).size !== ids.length) errors.push("worker IDs must be unique.");
  }

  const workerStrategy = input["workerStrategy"];
  if (!isRecord(workerStrategy)) {
    errors.push("workerStrategy must be an object.");
  } else {
    validId(workerStrategy["primary"], "workerStrategy.primary", errors);
    const fallbacks = workerStrategy["fallbacks"];
    if (
      fallbacks !== undefined &&
      (!Array.isArray(fallbacks) ||
        fallbacks.some((fallback) => !validId(fallback, "workerStrategy.fallbacks[]", errors)))
    ) {
      errors.push("workerStrategy.fallbacks must be an array of worker IDs.");
    }
  }

  validatePolicy(input["policy"], "policy", errors);

  const taskInput = input["tasks"];
  const tasks: MachineTask[] = [];
  if (!Array.isArray(taskInput) || taskInput.length === 0) {
    errors.push("tasks must contain at least one task.");
  } else if (taskInput.length > MAX_TASKS) {
    errors.push(`tasks exceeds ${String(MAX_TASKS)} entries.`);
  } else {
    taskInput.forEach((task, index) => {
      if (validateTask(task, `tasks[${String(index)}]`, errors)) tasks.push(task);
    });
    const taskIds = tasks.map((task) => task.id);
    if (new Set(taskIds).size !== taskIds.length) errors.push("task IDs must be unique.");
  }

  const taskOrder = validateGraph(tasks, errors);
  if (errors.length > 0) throw new PlanValidationError(errors);

  const cloned = structuredClone(input) as unknown as MachinePlan;
  const repositoryPath = cloned.repository.path;
  const absoluteRepositoryPath = sourcePath
    ? resolve(dirname(sourcePath), repositoryPath)
    : resolve(repositoryPath);
  const normalized: MachinePlan = {
    ...cloned,
    repository: {
      ...cloned.repository,
      path: absoluteRepositoryPath,
    },
  };

  return {
    plan: normalized,
    digest: digestPlan(normalized),
    taskOrder,
    sourcePath,
  };
}

export function loadMachinePlan(filePath: string): CompiledMachinePlan {
  const absolutePath = resolve(filePath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(absolutePath, "utf-8")) as unknown;
  } catch (error) {
    throw new PlanValidationError([
      `Unable to parse ${absolutePath}: ${error instanceof Error ? error.message : String(error)}`,
    ]);
  }
  return compileMachinePlan(parsed, absolutePath);
}

export function writeMachinePlan(filePath: string, plan: MachinePlan): void {
  const compiled = compileMachinePlan(plan);
  writeFileSync(resolve(filePath), `${JSON.stringify(compiled.plan, null, 2)}\n`, "utf-8");
}
