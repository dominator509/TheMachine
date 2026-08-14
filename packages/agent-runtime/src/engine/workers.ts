import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runSafeProcess } from "../process.js";
import type {
  CliWorkerConfig,
  MachinePlan,
  MachineWorker,
  WorkerEvent,
  WorkerInput,
} from "./types.js";

export type FunctionWorkerHandler = (
  input: WorkerInput,
  emit: (event: WorkerEvent) => void,
) => Promise<void> | void;

export class WorkerRegistry {
  private readonly workers = new Map<string, MachineWorker>();

  constructor(workers: readonly MachineWorker[] = []) {
    workers.forEach((worker) => this.register(worker));
  }

  register(worker: MachineWorker): void {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(worker.id)) {
      throw new Error(`Invalid worker ID: ${worker.id}`);
    }
    this.workers.set(worker.id, worker);
  }

  unregister(workerId: string): boolean {
    return this.workers.delete(workerId);
  }

  get(workerId: string): MachineWorker | null {
    return this.workers.get(workerId) ?? null;
  }

  list(): MachineWorker[] {
    return Array.from(this.workers.values());
  }

  clone(): WorkerRegistry {
    return new WorkerRegistry(this.list());
  }
}

export function buildWorkerPrompt(input: WorkerInput): string {
  const validations = input.task.validations
    .map(
      (validation) =>
        `- ${validation.id}: ${validation.executable} ${(validation.args ?? []).join(" ")}`,
    )
    .join("\n");
  const allowedPaths = input.task.allowedPaths?.join(", ") ?? "plan policy defaults";
  const deniedPaths = input.task.deniedPaths?.join(", ") ?? "plan policy defaults";
  const priorFailures = input.priorFailures.length
    ? input.priorFailures.map((failure) => `- ${failure.category}: ${failure.message}`).join("\n")
    : "- none";

  return [
    `# The Machine task ${input.task.id}`,
    "",
    `Run: ${input.runId}`,
    `Plan: ${input.planId}`,
    `Attempt: ${String(input.attempt)}`,
    `Workspace: ${input.workspacePath}`,
    "",
    "## Objective",
    input.task.objective,
    "",
    "## Scope",
    `Allowed paths: ${allowedPaths}`,
    `Denied paths: ${deniedPaths}`,
    "",
    "## Deterministic validations",
    validations,
    "",
    "## Prior failures",
    priorFailures,
    "",
    "## Operating contract",
    "- Work only inside the supplied workspace.",
    "- Do not commit, merge, push, rewrite Git history, or alter Git configuration.",
    "- Do not access secrets unless the worker configuration explicitly passes them.",
    "- Keep changes tightly scoped to the objective and allowed paths.",
    "- The Machine, not the worker, applies policy, runs final validations, and creates checkpoints.",
    "- Finish by returning a concise result summary; do not expose hidden chain-of-thought.",
    "",
  ].join("\n");
}

function replacePlaceholders(
  value: string,
  input: WorkerInput,
  prompt: string,
  promptFile: string,
): string {
  return value
    .replaceAll("{workspace}", input.workspacePath)
    .replaceAll("{runDirectory}", input.runDirectory)
    .replaceAll("{runId}", input.runId)
    .replaceAll("{planId}", input.planId)
    .replaceAll("{taskId}", input.task.id)
    .replaceAll("{attempt}", String(input.attempt))
    .replaceAll("{promptFile}", promptFile)
    .replaceAll("{prompt}", prompt);
}

function replaceEnvironmentPlaceholders(
  environment: Readonly<Record<string, string>>,
  input: WorkerInput,
  prompt: string,
  promptFile: string,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(environment).map(([key, value]) => [
      key,
      replacePlaceholders(value, input, prompt, promptFile),
    ]),
  );
}

function workerMessage(
  level: Extract<WorkerEvent, { type: "worker.message" }>["level"],
  value: string,
): WorkerEvent | null {
  const message = value.trim();
  if (message.length === 0) return null;
  return {
    type: "worker.message",
    level,
    message,
  };
}

export function createCliWorker(config: CliWorkerConfig): MachineWorker {
  return {
    id: config.id,
    kind: "cli",
    async *execute(input: WorkerInput): AsyncIterable<WorkerEvent> {
      const prompt = buildWorkerPrompt(input);
      const promptDirectory = join(input.runDirectory, "prompts");
      mkdirSync(promptDirectory, { recursive: true, mode: 0o700 });
      const promptFile = join(
        promptDirectory,
        `${input.task.id}.attempt-${String(input.attempt)}.md`,
      );
      writeFileSync(promptFile, prompt, { encoding: "utf-8", mode: 0o600 });
      const args = config.args.map((arg) => replacePlaceholders(arg, input, prompt, promptFile));
      const environment = replaceEnvironmentPlaceholders(
        config.environment ?? {},
        input,
        prompt,
        promptFile,
      );

      yield {
        type: "worker.started",
        message: `Worker '${config.id}' started task '${input.task.id}' attempt ${String(input.attempt)}.`,
      };

      const result = await runSafeProcess(
        {
          executable: config.executable,
          args,
          cwd: input.workspacePath,
          timeoutMs: config.timeoutMs ?? 3_600_000,
          environment,
          passEnvironment: config.passEnvironment ?? [],
          maxOutputBytes: config.maxOutputBytes ?? 8 * 1024 * 1024,
        },
        input.signal,
      );

      const stdoutEvent = workerMessage("info", result.stdout);
      if (stdoutEvent) yield stdoutEvent;
      const stderrEvent = workerMessage(result.exitCode === 0 ? "warning" : "error", result.stderr);
      if (stderrEvent) yield stderrEvent;

      const reason = result.cancelled
        ? "cancelled"
        : result.timedOut
          ? "timed out"
          : result.truncated
            ? "exceeded the output limit"
            : `exited with code ${String(result.exitCode)}`;
      yield {
        type: "worker.completed",
        success:
          result.exitCode === 0 && !result.cancelled && !result.timedOut && !result.truncated,
        exitCode: result.exitCode,
        summary: `Worker '${config.id}' ${reason}.`,
      };
    },
  };
}

export function createFunctionWorker(id: string, handler: FunctionWorkerHandler): MachineWorker {
  return {
    id,
    kind: "in-process",
    async *execute(input: WorkerInput): AsyncIterable<WorkerEvent> {
      const events: WorkerEvent[] = [];
      const emit = (event: WorkerEvent): void => {
        events.push(event);
      };
      yield {
        type: "worker.started",
        message: `In-process worker '${id}' started task '${input.task.id}'.`,
      };
      try {
        await handler(input, emit);
        for (const event of events) yield event;
        if (!events.some((event) => event.type === "worker.completed")) {
          yield {
            type: "worker.completed",
            success: true,
            exitCode: 0,
            summary: `In-process worker '${id}' completed.`,
          };
        }
      } catch (error) {
        for (const event of events) yield event;
        yield {
          type: "worker.message",
          level: "error",
          message: error instanceof Error ? error.message : String(error),
        };
        yield {
          type: "worker.completed",
          success: false,
          exitCode: 1,
          summary: `In-process worker '${id}' failed.`,
        };
      }
    },
  };
}

export function registerPlanWorkers(plan: MachinePlan, registry: WorkerRegistry): WorkerRegistry {
  const runRegistry = registry.clone();
  for (const config of plan.workers ?? []) runRegistry.register(createCliWorker(config));
  return runRegistry;
}
