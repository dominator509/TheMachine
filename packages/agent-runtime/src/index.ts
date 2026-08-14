import { createCommandRegistry } from "./commands/index.js";
import type { CommandRegistry } from "./commands/index.js";
import { createAgenticRuntime } from "./engine/orchestrator.js";
import type { AgenticRuntime } from "./engine/orchestrator.js";
import type { AgenticRuntimeOptions } from "./engine/types.js";

export * from "./process.js";
export * from "./commands/index.js";
export * from "./engine/index.js";

export interface Runtime {
  readonly commands: CommandRegistry;
  readonly agentic: AgenticRuntime;
}

export function createRuntime(options: AgenticRuntimeOptions = {}): Runtime {
  return {
    commands: createCommandRegistry(),
    agentic: createAgenticRuntime(options),
  };
}
