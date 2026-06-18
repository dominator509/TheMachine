/** Result of a validation check. */
export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: string[];
}

/**
 * Validates that a value is a valid SecretReference, not a raw secret value.
 * Raw strings, numbers, and plain objects without key/provider are rejected.
 */
export function validateSecretReference(value: unknown): ValidationResult {
  const errors: string[] = [];

  if (value === null || value === undefined) {
    return { valid: false, errors: ["Secret reference must not be null or undefined"] };
  }

  if (typeof value === "string") {
    if (value.length > 0) {
      return {
        valid: false,
        errors: [
          "Raw secret strings are not allowed. Use a SecretReference { key, provider } instead.",
        ],
      };
    }
    return { valid: true, errors: [] };
  }

  if (typeof value !== "object") {
    return {
      valid: false,
      errors: [
        `Invalid secret type: ${typeof value}. Use a SecretReference { key, provider } instead.`,
      ],
    };
  }

  const ref = value as Record<string, unknown>;

  if (typeof ref["key"] !== "string" || ref["key"].length === 0) {
    errors.push("SecretReference must have a non-empty 'key' string");
  }

  if (typeof ref["provider"] !== "string" || ref["provider"].length === 0) {
    errors.push("SecretReference must have a non-empty 'provider' string");
  }

  // Reject if it looks like a raw secret (contains a value that looks like a credential)
  if ("value" in ref && typeof ref["value"] === "string" && ref["value"].length > 0) {
    errors.push(
      "Raw secret values are not allowed. Use a SecretReference { key, provider } instead.",
    );
  }
  if ("secret" in ref && typeof ref["secret"] === "string" && ref["secret"].length > 0) {
    errors.push(
      "Raw secret values are not allowed. Use a SecretReference { key, provider } instead.",
    );
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates an array of values, ensuring no raw secrets are present.
 */
export function validateNoRawSecrets(values: unknown[]): ValidationResult {
  const allErrors: string[] = [];
  for (let i = 0; i < values.length; i++) {
    const result = validateSecretReference(values[i]);
    if (!result.valid) {
      allErrors.push(`[${String(i)}]: ${result.errors.join("; ")}`);
    }
  }
  return { valid: allErrors.length === 0, errors: allErrors };
}

/**
 * Ensures a config object's secret-related fields use SecretReference only.
 */
export function validateConfigSecrets(
  config: Record<string, unknown>,
  secretFields: string[],
): ValidationResult {
  const errors: string[] = [];
  for (const field of secretFields) {
    if (field in config) {
      const result = validateSecretReference(config[field]);
      if (!result.valid) {
        errors.push(`${field}: ${result.errors.join("; ")}`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}
