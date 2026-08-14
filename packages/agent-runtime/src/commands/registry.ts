import { resolve } from "node:path";
import {
  legacyCommandToSpec,
  runSafeProcess,
  UnsafeProcessError,
  type SafeProcessSpec,
} from "../process.js";
import type {
  CommandRegistry,
  CommandEntry,
  CommandResult,
  CommandExecutionOptions,
} from "./types.js";

function commandSpec(
  entry: CommandEntry,
  userArgs: readonly string[],
  options: CommandExecutionOptions,
): SafeProcessSpec {
  const cwd = resolve(options.cwd ?? entry.cwd ?? process.cwd());
  const base = entry.executable
    ? {
        executable: entry.executable,
        args: [...(entry.args ?? [])],
        cwd,
      }
    : entry.script
      ? legacyCommandToSpec(entry.script, cwd)
      : null;

  if (!base) {
    throw new UnsafeProcessError(
      `Command '${entry.name}' must declare executable + args or a safe legacy script.`,
    );
  }

  const environment = {
    ...(entry.environment ?? {}),
    ...(options.environment ?? {}),
  };
  const passEnvironment = [
    ...(entry.passEnvironment ?? []),
    ...(options.passEnvironment ?? []),
  ];

  return {
    executable: base.executable,
    args: [...(base.args ?? []), ...userArgs],
    cwd: base.cwd,
    timeoutMs: options.timeoutMs ?? entry.timeoutMs,
    environment,
    passEnvironment,
    maxOutputBytes: options.maxOutputBytes,
  };
}

export function createCommandRegistry(): CommandRegistry {
  const entries = new Map<string, CommandEntry>();

  return {
    register(cmd: CommandEntry): void {
      const name = cmd.name.trim();
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(name)) {
        throw new Error(`Invalid command name: ${cmd.name}`);
      }
      if (!cmd.executable && !cmd.script) {
        throw new Error(`Command '${name}' has no executable.`);
      }
      entries.set(name, { ...cmd, name });
    },

    isAllowed(name: string): boolean {
      return entries.has(name);
    },

    get(name: string): CommandEntry | null {
      return entries.get(name) ?? null;
    },

    list(): CommandEntry[] {
      return Array.from(entries.values());
    },

    async execute(
      name: string,
      args: readonly string[] = [],
      options: CommandExecutionOptions = {},
    ): Promise<CommandResult> {
      const entry = entries.get(name);
      if (!entry) {
        return {
          command: name,
          exitCode: 1,
          stdout: "",
          stderr: `Unknown command: ${name}. Not in allowlist.`,
        };
      }

      try {
        const result = await runSafeProcess(commandSpec(entry, args, options), options.signal);
        return {
          command: name,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          command: name,
          exitCode: 1,
          stdout: "",
          stderr: message,
        };
      }
    },
  };
}
