import { resolveInsideRoot, runSafeProcess } from "../process.js";
import type { MachineTask, ValidationResult } from "./types.js";

export async function runTaskValidations(input: {
  readonly task: MachineTask;
  readonly worktreePath: string;
  readonly signal: AbortSignal;
  readonly clock: () => Date;
}): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  for (const validation of input.task.validations) {
    if (input.signal.aborted) break;
    const cwd = resolveInsideRoot(input.worktreePath, validation.cwd ?? ".");
    const processResult = await runSafeProcess(
      {
        executable: validation.executable,
        args: validation.args ?? [],
        cwd,
        timeoutMs: validation.timeoutMs ?? 10 * 60 * 1_000,
        environment: validation.environment ?? {},
        passEnvironment: validation.passEnvironment ?? [],
        maxOutputBytes: 8 * 1024 * 1024,
      },
      input.signal,
    );
    const expectedExitCode = validation.expectedExitCode ?? 0;
    const passed =
      processResult.exitCode === expectedExitCode &&
      !processResult.timedOut &&
      !processResult.cancelled &&
      !processResult.truncated &&
      (validation.stdoutIncludes === undefined ||
        processResult.stdout.includes(validation.stdoutIncludes)) &&
      (validation.stderrExcludes === undefined ||
        !processResult.stderr.includes(validation.stderrExcludes));
    results.push({
      taskId: input.task.id,
      validationId: validation.id,
      executable: validation.executable,
      args: [...(validation.args ?? [])],
      exitCode: processResult.exitCode,
      passed,
      stdout: processResult.stdout,
      stderr: processResult.stderr,
      durationMs: processResult.durationMs,
      timedOut: processResult.timedOut,
      cancelled: processResult.cancelled,
      recordedAt: input.clock().toISOString(),
    });
  }
  return results;
}
