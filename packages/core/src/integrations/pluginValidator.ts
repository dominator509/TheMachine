// Plugin manifest validator.
// No infrastructure imports.

import type { PluginManifest } from "../domain/index.js";

/** Plugin validation result. */
export interface PluginValidation {
  readonly valid: boolean;
  readonly errors: string[];
}

/**
 * Validates a plugin manifest.
 * No secret values are stored — only references or permission entries.
 */
export function validatePluginManifest(manifest: PluginManifest): PluginValidation {
  const errors: string[] = [];

  if (!manifest.id || manifest.id.length === 0) {
    errors.push("Plugin id is required");
  }
  if (!manifest.name || manifest.name.length === 0) {
    errors.push("Plugin name is required");
  }
  if (!manifest.version || manifest.version.length === 0) {
    errors.push("Plugin version is required");
  }
  if (!manifest.entryPoint || manifest.entryPoint.length === 0) {
    errors.push("Plugin entry point is required");
  }
  if (!Array.isArray(manifest.permissions)) {
    errors.push("Plugin permissions must be an array");
  } else {
    for (const perm of manifest.permissions) {
      if (!perm.resource || perm.resource.length === 0) {
        errors.push("Each permission must have a resource");
      }
      if (!Array.isArray(perm.actions)) {
        errors.push("Each permission must have an actions array");
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
