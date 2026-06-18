// Allowlist command registry — unknown commands are rejected.

import { execSync } from "node:child_process";
import type { CommandRegistry, CommandEntry, CommandResult } from "./types.js";

export function createCommandRegistry(): CommandRegistry {
  const entries = new Map<string, CommandEntry>();

  return {
    register(cmd: CommandEntry): void {
      entries.set(cmd.name, cmd);
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

    // eslint-disable-next-line @typescript-eslint/require-await
    async execute(name: string, args?: string[]): Promise<CommandResult> {
      const entry = entries.get(name);
      if (!entry) {
        return {
          command: name,
          exitCode: 1,
          stdout: "",
          stderr: `Unknown command: ${name}. Not in allowlist.`,
        };
      }

      const cmd = args && args.length > 0 ? `${entry.script} ${args.join(" ")}` : entry.script;
      try {
        const result = execSync(cmd, { encoding: "utf-8", timeout: 30000 });
        return { command: name, exitCode: 0, stdout: result, stderr: "" };
      } catch (err: unknown) {
        const execErr = err as {
          status?: number;
          stdout?: string;
          stderr?: string;
          message?: string;
        };
        return {
          command: name,
          exitCode: execErr.status ?? 1,
          stdout: execErr.stdout ?? "",
          stderr: execErr.stderr ?? execErr.message ?? "",
        };
      }
    },
  };
}
