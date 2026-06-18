// Sandboxed plugin execution hooks.
// Provides a safe execution environment for onLoad, onUnload, onConfigure, onExecute.

import { resolve } from "node:path";
import { existsSync } from "node:fs";
import type { PluginContext, PluginInstance, PluginExecutionResult } from "./types.js";

/** A sandboxed executor that runs plugin hooks with error isolation. */
export interface PluginExecutor {
  /** Execute the onLoad hook for a plugin. */
  executeOnLoad(instance: PluginInstance, ctx: PluginContext): Promise<PluginExecutionResult>;

  /** Execute the onUnload hook for a plugin. */
  executeOnUnload(instance: PluginInstance, ctx: PluginContext): Promise<PluginExecutionResult>;

  /** Execute the onConfigure hook for a plugin. */
  executeOnConfigure(
    instance: PluginInstance,
    ctx: PluginContext,
    config: Record<string, unknown>,
  ): Promise<PluginExecutionResult>;

  /** Execute the onExecute hook for a plugin with input. */
  executeOnExecute(
    instance: PluginInstance,
    ctx: PluginContext,
    input: unknown,
  ): Promise<PluginExecutionResult>;
}

/**
 * Creates a sandboxed plugin executor.
 *
 * Each hook execution is isolated from others — errors in one hook do not
 * affect subsequent executions. The executor dynamically imports the plugin
 * module and resolves its lifecycle hook exports on first access.
 *
 * Note: True sandboxing (vm module, subprocess isolation) requires additional
 * infrastructure beyond this SDK. This executor provides interface-level
 * isolation (error boundaries, independent execution) suitable for trusted
 * first-party plugins.
 */
export function createSandboxedExecutor(): PluginExecutor {
  const hookCache = new Map<string, Record<string, unknown>>();

  async function loadHooks(instance: PluginInstance): Promise<Record<string, unknown>> {
    const pluginId = instance.manifest.id;
    const cached = hookCache.get(pluginId);
    if (cached) return cached;

    const entryPath = resolve(instance.manifest.entryPoint);
    if (!existsSync(entryPath)) {
      return {};
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const mod = await import(/* @vite-ignore */ entryPath);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      hookCache.set(pluginId, mod);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return mod;
    } catch {
      return {};
    }
  }

  async function runHook(
    instance: PluginInstance,
    ctx: PluginContext,
    hookName: string,
    args: unknown[],
  ): Promise<PluginExecutionResult> {
    try {
      const mod = await loadHooks(instance);
      const hookFn = mod[hookName] as ((...a: unknown[]) => unknown) | undefined;

      if (typeof hookFn !== "function") {
        return { success: true, output: undefined };
      }

      const output = await hookFn(...args);
      return { success: true, output };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: `${hookName} failed: ${message}` };
    }
  }

  return {
    async executeOnLoad(instance, ctx): Promise<PluginExecutionResult> {
      return runHook(instance, ctx, "onLoad", [ctx]);
    },

    async executeOnUnload(instance, ctx): Promise<PluginExecutionResult> {
      return runHook(instance, ctx, "onUnload", [ctx]);
    },

    async executeOnConfigure(instance, ctx, config): Promise<PluginExecutionResult> {
      return runHook(instance, ctx, "onConfigure", [ctx, config]);
    },

    async executeOnExecute(instance, ctx, input): Promise<PluginExecutionResult> {
      return runHook(instance, ctx, "onExecute", [ctx, input]);
    },
  };
}
