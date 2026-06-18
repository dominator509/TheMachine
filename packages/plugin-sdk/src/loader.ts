// Filesystem-based plugin loader.
// Scans directories for plugin manifests and loads plugin modules.

import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { PluginLoadResult, PluginInstance, PluginHooks, PluginManifestEx } from "./types.js";

/** Expected filename for a plugin manifest. */
const MANIFEST_FILE = "plugin.json";

/** Expected field in plugin.json that points to the entry module. */
const ENTRY_FIELD = "main" as const;

/**
 * Scans a directory for plugin subdirectories containing plugin.json manifests.
 * Returns the list of loaded plugin instances.
 */
export function scanForPlugins(pluginsDir: string): PluginLoadResult[] {
  const results: PluginLoadResult[] = [];

  if (!existsSync(pluginsDir)) {
    return results;
  }

  const entries = readdirSync(pluginsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const pluginDir = join(pluginsDir, entry.name);
    const manifestPath = join(pluginDir, MANIFEST_FILE);

    if (!existsSync(manifestPath)) continue;

    const loadResult = loadPlugin(pluginDir);
    results.push(loadResult);
  }

  return results;
}

/**
 * Loads a single plugin from its directory.
 * Expects plugin.json manifest and an entry module.
 */
export function loadPlugin(pluginDir: string): PluginLoadResult {
  try {
    const manifestPath = join(pluginDir, MANIFEST_FILE);

    if (!existsSync(manifestPath)) {
      return { success: false, error: `Missing ${MANIFEST_FILE} in ${pluginDir}` };
    }

    const raw = readFileSync(manifestPath, "utf-8");
    let manifestJson: Record<string, unknown>;
    try {
      manifestJson = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { success: false, error: `Invalid JSON in ${manifestPath}` };
    }

    const manifest = manifestJson as unknown as PluginManifestEx;

    // Resolve entry point relative to plugin directory
    const entryModule = (manifestJson[ENTRY_FIELD] as string | undefined) ?? manifest.entryPoint;
    const entryPath = resolve(pluginDir, entryModule);

    if (!existsSync(entryPath)) {
      return { success: false, error: `Entry module not found: ${entryPath}` };
    }

    // Load hooks synchronously — actual dynamic import happens in sandbox
    const hooks: PluginHooks = {};

    const instance: PluginInstance = {
      manifest,
      hooks,
      enabled: true,
    };

    return { success: true, instance };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Failed to load plugin: ${message}` };
  }
}

/**
 * Reads and parses a plugin manifest from a directory without loading the module.
 * Useful for discovery/preview before full loading.
 */
export function readPluginManifest(pluginDir: string): PluginManifestEx | null {
  const manifestPath = join(pluginDir, MANIFEST_FILE);

  if (!existsSync(manifestPath)) return null;

  try {
    const raw = readFileSync(manifestPath, "utf-8");
    return JSON.parse(raw) as PluginManifestEx;
  } catch {
    return null;
  }
}
