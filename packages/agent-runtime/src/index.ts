// Agent runtime: orchestrates plans, commands, providers, MCP, plugins, etc.
import { createCommandRegistry } from "./commands/index.js";
import type { CommandRegistry } from "./commands/index.js";

export * from "./commands/index.js";

export interface Runtime {
  readonly commands: CommandRegistry;
}

export function createRuntime(): Runtime {
  return {
    commands: createCommandRegistry(),
  };
}
