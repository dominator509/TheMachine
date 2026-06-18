// Secure storage abstraction — OS keychain/vault interface.
// Implementations should never expose raw secret values in logs or errors.

/**
 * Generic secure storage interface.
 * Production implementations should wrap OS keychain (macOS Keychain, Linux Secret Service, Windows Credential Manager).
 */
export interface SecureStorage {
  /** Retrieve a secret value by key. Returns undefined if not found. */
  get(key: string): string | undefined;

  /** Store a secret value. Overwrites if key exists. */
  set(key: string, value: string): void;

  /** Delete a stored secret. Returns true if existed, false if not found. */
  delete(key: string): boolean;

  /** List all stored secret keys. */
  list(): string[];

  /** Check if the storage backend is available/operational. */
  health(): { available: boolean; error?: string };
}

/** Options for creating a secure storage instance. */
export interface SecureStorageOptions {
  /** Namespace/prefix to isolate secrets per application or workspace. */
  readonly namespace?: string;
}
