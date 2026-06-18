// Plugin SDK types — lifecycle hooks, context, and extended manifest.
// Depends on @the-machine/core for PluginManifest and PluginPermission.

import type { PluginManifest } from "@the-machine/core";

/** Runtime context passed to every plugin hook. */
export interface PluginContext {
  readonly pluginId: string;
  readonly pluginDir: string;
  readonly config: Record<string, unknown>;
}

/** Lifecycle hooks a plugin module may export. */
export interface PluginHooks {
  onLoad?(ctx: PluginContext): Promise<void> | void;
  onUnload?(ctx: PluginContext): Promise<void> | void;
  onConfigure?(ctx: PluginContext, config: Record<string, unknown>): Promise<void> | void;
  onExecute?(ctx: PluginContext, input: unknown): Promise<unknown>;
}

/** A loaded plugin instance with its manifest, hooks, and runtime state. */
export interface PluginInstance {
  readonly manifest: PluginManifest;
  readonly hooks: PluginHooks;
  readonly enabled: boolean;
}

/** Extended plugin manifest with optional hooks declaration. */
export interface PluginManifestEx extends PluginManifest {
  readonly hooks?: string[];
}

/** Result of loading a plugin. */
export interface PluginLoadResult {
  readonly success: boolean;
  readonly instance?: PluginInstance;
  readonly error?: string;
}

/** Result of executing a plugin hook. */
export interface PluginExecutionResult {
  readonly success: boolean;
  readonly output?: unknown;
  readonly error?: string;
}
