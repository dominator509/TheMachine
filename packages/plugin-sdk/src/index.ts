// Plugin SDK — manifest types, filesystem loader, lifecycle registry, sandboxed hooks.
// No infrastructure imports beyond Node.js built-ins and @the-machine/core types.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { PluginManifest, EntityId, SemVer } from "@the-machine/core";
export { createSandboxedExecutor } from "./executor.js";
export type { PluginExecutor, PluginSandboxIsolation, PluginSandboxPolicy } from "./executor.js";

// ── Types ────────────────────────────────────────────────────────────────

/** A plugin's package.json manifest shape. */
export interface PluginPackage {
  readonly name: string;
  readonly version: SemVer;
  readonly description?: string;
  readonly main?: string;
  readonly machine?: {
    readonly plugin: boolean;
    readonly permissions?: PluginPermission[];
  };
}

/** Plugin permission entry. */
export interface PluginPermission {
  readonly resource: string;
  readonly actions: string[];
  readonly allowed: boolean;
}

/** Lifecycle hooks a plugin may expose. */
export interface PluginLifecycleHooks {
  onLoad?(context: PluginExecutionContext): void | Promise<void>;
  onUnload?(context: PluginExecutionContext): void | Promise<void>;
  onConfigure?(config: Record<string, unknown>): void | Promise<void>;
  onExecute?(input: unknown): unknown;
}

/** Execution context passed to plugin hooks. */
export interface PluginExecutionContext {
  readonly pluginId: EntityId;
  readonly pluginName: string;
  readonly api: PluginHostAPI;
}

/** Limited host API exposed to plugins. */
export interface PluginHostAPI {
  readonly log: (msg: string) => void;
  readonly getConfig: (key: string) => unknown;
}

/** A registered plugin in the host. */
export interface PluginRegistration {
  readonly id: EntityId;
  readonly manifest: PluginManifest;
  readonly hooks: PluginLifecycleHooks;
  readonly loaded: boolean;
  readonly error?: string;
}

/** Result of executing a plugin hook. */
export interface PluginExecutionResult {
  readonly success: boolean;
  readonly pluginId: EntityId;
  readonly hook: string;
  readonly output?: unknown;
  readonly error?: string;
}

// ── Filesystem Loader ────────────────────────────────────────────────────

/** Scans a directory for plugin packages and returns their manifests. */
export function loadPluginPackages(pluginsDir: string): PluginPackage[] {
  if (!existsSync(pluginsDir)) return [];

  const entries = readdirSync(pluginsDir);
  const packages: PluginPackage[] = [];

  for (const entry of entries) {
    const pkgJsonPath = resolve(pluginsDir, entry, "package.json");
    if (!existsSync(pkgJsonPath)) continue;

    try {
      const raw = readFileSync(pkgJsonPath, "utf-8");
      const pkg = JSON.parse(raw) as PluginPackage;
      if (pkg.machine?.plugin) {
        packages.push(pkg);
      }
    } catch {
      // Skip invalid packages silently
    }
  }

  return packages;
}

/** Builds a PluginManifest from a PluginPackage. */
export function pluginPackageToManifest(pkg: PluginPackage): PluginManifest {
  return {
    id: pkg.name as EntityId,
    name: pkg.name,
    version: pkg.version,
    entryPoint: pkg.main ?? "index.js",
    permissions: pkg.machine?.permissions ?? [],
  };
}

// ── Lifecycle Registry ──────────────────────────────────────────────────

/** Plugin registry interface. */
export interface PluginRegistry {
  readonly plugins: Map<EntityId, PluginRegistration>;
}

/** Creates an empty plugin registry. */
export function createPluginRegistry(): PluginRegistry {
  return { plugins: new Map() };
}

/** Registers a plugin with optional lifecycle hooks. */
export function registerPlugin(
  registry: PluginRegistry,
  manifest: PluginManifest,
  hooks: PluginLifecycleHooks,
): PluginRegistry {
  const registration: PluginRegistration = {
    id: manifest.id,
    manifest,
    hooks,
    loaded: false,
  };
  const newPlugins = new Map(registry.plugins).set(manifest.id, registration);
  return { plugins: newPlugins };
}

/** Unregisters a plugin by id. */
export function unregisterPlugin(registry: PluginRegistry, id: EntityId): PluginRegistry {
  const newPlugins = new Map(registry.plugins);
  newPlugins.delete(id);
  return { plugins: newPlugins };
}

/** Gets a registration by id. */
export function getPlugin(registry: PluginRegistry, id: EntityId): PluginRegistration | null {
  return registry.plugins.get(id) ?? null;
}

/** Lists all registered plugins. */
export function listPlugins(registry: PluginRegistry): PluginRegistration[] {
  return Array.from(registry.plugins.values());
}

// ── Plugin Host ─────────────────────────────────────────────────────────

/** Creates the limited host API for plugins. */
export function createPluginHostAPI(config: Record<string, unknown>): PluginHostAPI {
  return {
    log: (msg: string) => {
      console.log(`[plugin] ${msg}`);
    },
    getConfig: (key: string) => config[key],
  };
}

/** Creates the execution context for a plugin hook call. */
export function createPluginContext(
  registration: PluginRegistration,
  api: PluginHostAPI,
): PluginExecutionContext {
  return {
    pluginId: registration.id,
    pluginName: registration.manifest.name,
    api,
  };
}

// ── Sandboxed Hook Execution ────────────────────────────────────────────

/** Safely invokes a plugin lifecycle hook with error isolation. */
export function invokePluginHook(
  registration: PluginRegistration,
  hook: keyof PluginLifecycleHooks,
  context: PluginExecutionContext,
  arg?: unknown,
): PluginExecutionResult {
  const hookFn = registration.hooks[hook];
  if (!hookFn) {
    return { success: true, pluginId: registration.id, hook, output: undefined };
  }

  try {
    let result: unknown;
    if (hook === "onConfigure" && arg !== undefined) {
      result = (hookFn as (cfg: Record<string, unknown>) => unknown)(
        arg as Record<string, unknown>,
      );
    } else if (hook === "onExecute" && arg !== undefined) {
      result = (hookFn as (input: unknown) => unknown)(arg);
    } else {
      result = (hookFn as (ctx: PluginExecutionContext) => unknown)(context);
    }

    return { success: true, pluginId: registration.id, hook, output: result };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, pluginId: registration.id, hook, error: msg };
  }
}
