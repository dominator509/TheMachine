// Fake (in-memory) secure storage adapter for testing.
// Not suitable for production — use OS keychain wrapper instead.

import type { SecureStorage, SecureStorageOptions } from "./types.js";

/**
 * Create an in-memory fake secure storage for testing.
 * All secrets are stored in a plain Map — never use in production.
 */
export function createFakeSecureStorage(options?: SecureStorageOptions): SecureStorage {
  const namespace = options?.namespace ?? "test";
  const secrets = new Map<string, string>();

  function prefixed(key: string): string {
    return `${namespace}:${key}`;
  }

  return {
    get(key: string): string | undefined {
      return secrets.get(prefixed(key));
    },

    set(key: string, value: string): void {
      secrets.set(prefixed(key), value);
    },

    delete(key: string): boolean {
      return secrets.delete(prefixed(key));
    },

    list(): string[] {
      const prefix = `${namespace}:`;
      return Array.from(secrets.keys())
        .filter((k) => k.startsWith(prefix))
        .map((k) => k.slice(prefix.length));
    },

    health(): { available: boolean; error?: string } {
      return { available: true };
    },
  };
}
