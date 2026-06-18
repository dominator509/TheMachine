// Provider configuration validator.
// No infrastructure imports.

import type { ProviderConfig } from "../domain/index.js";

/** Provider validation result. */
export interface ProviderValidation {
  readonly valid: boolean;
  readonly errors: string[];
}

/**
 * Validates a provider configuration.
 * No secret values are stored — only references.
 */
export function validateProviderConfig(config: ProviderConfig): ProviderValidation {
  const errors: string[] = [];

  if (!config.id || config.id.length === 0) {
    errors.push("Provider id is required");
  }
  if (!config.name || config.name.length === 0) {
    errors.push("Provider name is required");
  }
  if (!["cloud", "local", "hybrid"].includes(config.tier)) {
    errors.push("Provider tier must be 'cloud', 'local', or 'hybrid'");
  }
  if (!config.endpoint || config.endpoint.length === 0) {
    errors.push("Provider endpoint is required");
  }
  if (!Array.isArray(config.models) || config.models.length === 0) {
    errors.push("Provider must expose at least one model");
  }
  if (config.timeoutMs <= 0) {
    errors.push("Provider timeout must be a positive number");
  }
  if (!config.healthCheckCommand || config.healthCheckCommand.length === 0) {
    errors.push("Provider health check command is required");
  }

  return { valid: errors.length === 0, errors };
}
