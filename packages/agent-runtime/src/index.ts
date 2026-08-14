import { createCommandRegistry } from "./commands/index.js";
import type { CommandRegistry } from "./commands/index.js";
import { createAgenticRuntime as createBareAgenticRuntime } from "./engine/orchestrator.js";
import type { AgenticRuntime } from "./engine/orchestrator.js";
import { createBuiltinWorkers } from "./engine/presets.js";
import type { AgenticRuntimeOptions } from "./engine/types.js";

export * from "./process.js";
export * from "./commands/index.js";
export * from "./engine/index.js";

export function createAgenticRuntime(options: AgenticRuntimeOptions = {}): AgenticRuntime {
  return createBareAgenticRuntime({
    ...options,
    workers: [...createBuiltinWorkers(), ...(options.workers ?? [])],
  });
}

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
