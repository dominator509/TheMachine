// Plugin registry — manages registration, unregistration, and lifecycle tracking.

import type { PluginInstance, PluginContext } from "./types.js";

/** Registry entry for a loaded plugin. */
export interface RegistryEntry {
  readonly instance: PluginInstance;
  readonly context: PluginContext;
  readonly registeredAt: number;
}

/** Plugin registry — manages plugin lifecycle. */
export interface PluginRegistry {
  /** Register a loaded plugin instance. */
  register(instance: PluginInstance, context: PluginContext): RegistryEntry;

  /** Unregister a plugin by ID. Returns false if not found. */
  unregister(pluginId: string): boolean;

  /** Get a registered plugin by ID. */
  get(pluginId: string): RegistryEntry | undefined;

  /** List all registered plugins. */
  list(): RegistryEntry[];

  /** Get count of registered plugins. */
  count(): number;

  /** Check if a plugin ID is already registered. */
  has(pluginId: string): boolean;

  /** Unregister all plugins and clear the registry. */
  clear(): void;
}

/**
 * Creates a new plugin registry.
 * The registry is the single source of truth for loaded plugins.
 */
export function createPluginRegistry(): PluginRegistry {
  const entries = new Map<string, RegistryEntry>();

  return {
    register(instance: PluginInstance, context: PluginContext): RegistryEntry {
      const entry: RegistryEntry = {
        instance,
        context,
        registeredAt: Date.now(),
      };
      entries.set(instance.manifest.id, entry);
      return entry;
    },

    unregister(pluginId: string): boolean {
      return entries.delete(pluginId);
    },

    get(pluginId: string): RegistryEntry | undefined {
      return entries.get(pluginId);
    },

    list(): RegistryEntry[] {
      return Array.from(entries.values());
    },

    count(): number {
      return entries.size;
    },

    has(pluginId: string): boolean {
      return entries.has(pluginId);
    },

    clear(): void {
      entries.clear();
    },
  };
}
