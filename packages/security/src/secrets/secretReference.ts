// Secret reference management — lookup and resolution.
// No infrastructure imports — pure domain logic.

import type { SecretReference } from "@the-machine/core";

/** Result of resolving a secret reference. */
export interface SecretResolution {
  readonly resolved: boolean;
  readonly error?: string;
}

/** Interface for a secret store that resolves references to values. */
export interface SecretStore {
  /** Resolve a secret reference to its value. Returns undefined if not found. */
  resolve(ref: SecretReference): string | undefined;
  /** Store a secret value for a given reference. */
  store(ref: SecretReference, value: string): void;
  /** Delete a stored secret. */
  delete(ref: SecretReference): boolean;
  /** List all stored secret keys. */
  list(): SecretReference[];
}

/**
 * Validate a SecretReference has all required fields.
 */
export function validateSecretReference(ref: unknown): ref is SecretReference {
  if (typeof ref !== "object" || ref === null) return false;
  const candidate = ref as Record<string, unknown>;
  if (typeof candidate["key"] !== "string" || candidate["key"].length === 0) return false;
  if (typeof candidate["provider"] !== "string" || candidate["provider"].length === 0) return false;
  return true;
}

/**
 * Create a display-safe form of a SecretReference (no raw values).
 */
export function formatSecretReference(ref: SecretReference): string {
  return `${ref.provider}:${ref.key}`;
}

/**
 * In-memory secret store — for testing only.
 * Production use should wrap OS keychain or encrypted vault.
 */
export function createInMemorySecretStore(): SecretStore {
  const secrets = new Map<string, string>();

  function keyFor(ref: SecretReference): string {
    return `${ref.provider}:${ref.key}`;
  }

  return {
    resolve(ref: SecretReference): string | undefined {
      return secrets.get(keyFor(ref));
    },
    store(ref: SecretReference, value: string): void {
      secrets.set(keyFor(ref), value);
    },
    delete(ref: SecretReference): boolean {
      return secrets.delete(keyFor(ref));
    },
    list(): SecretReference[] {
      return Array.from(secrets.keys()).map((k) => {
        const colonIdx = k.indexOf(":");
        return {
          key: k.slice(colonIdx + 1),
          provider: k.slice(0, colonIdx),
        };
      });
    },
  };
}
