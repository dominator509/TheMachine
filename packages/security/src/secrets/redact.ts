// Redaction utilities for secrets and sensitive data.
// No infrastructure imports — pure domain logic.

/** Common secret patterns to detect and redact. */
const SECRET_PATTERNS: { pattern: RegExp; label: string }[] = [
  // OpenAI-style keys: sk-... (min 20 chars after prefix)
  { pattern: /(sk-[A-Za-z0-9]{20,})/g, label: "OPENAI_KEY" },
  // Anthropic-style keys
  { pattern: /(sk-ant-[A-Za-z0-9]{20,})/g, label: "ANTHROPIC_KEY" },
  // GitHub PATs
  { pattern: /(ghp_[A-Za-z0-9]{36,})/g, label: "GITHUB_PAT" },
  // GitHub OAuth tokens
  { pattern: /(gho_[A-Za-z0-9]{36,})/g, label: "GITHUB_OAUTH" },
  // GitHub app tokens
  { pattern: /(ghu_[A-Za-z0-9]{36,})/g, label: "GITHUB_APP" },
  // Bearer tokens in Authorization headers
  { pattern: /(Bearer\s+[A-Za-z0-9._~+/-]{20,})/g, label: "BEARER_TOKEN" },
  // Basic auth credentials in headers
  { pattern: /(Basic\s+[A-Za-z0-9+/=]{20,})/g, label: "BASIC_AUTH" },
  // Private keys (RSA, EC, or generic)
  {
    pattern:
      /(-----BEGIN\s+(RSA\s+|EC\s+)?PRIVATE\s+KEY-----)[\s\S]*?(-----END\s+(RSA\s+|EC\s+)?PRIVATE\s+KEY-----)/g,
    label: "PRIVATE_KEY",
  },
  // Generic passwords in config patterns
  { pattern: /(password\s*[=:]\s*['"]?[^'"\s]{4,})/gi, label: "PASSWORD" },
  // Generic secret/token patterns
  { pattern: /(secret\s*[=:]\s*['"]?[^'"\s]{8,})/gi, label: "SECRET_VALUE" },
  // API key pattern
  { pattern: /(api[_-]?key\s*[=:]\s*['"]?[^'"\s]{8,})/gi, label: "API_KEY" },
];

/** Redaction result for a single field or value. */
export interface RedactionResult {
  readonly original: string;
  readonly redacted: string;
  readonly matchedPatterns: string[];
}

/** Options for redaction behavior. */
export interface RedactionOptions {
  /** Character to use for masking (default: '*') */
  readonly maskChar?: string;
  /** Number of characters to keep visible at start (default: 4) */
  readonly visibleStart?: number;
  /** Number of characters to keep visible at end (default: 4) */
  readonly visibleEnd?: number;
}

const DEFAULT_OPTIONS: Required<RedactionOptions> = {
  maskChar: "*",
  visibleStart: 4,
  visibleEnd: 4,
};

/**
 * Redact a single secret value, keeping only the first N and last N characters visible.
 * Returns the redacted string and the label indicating what was redacted.
 */
export function redactSecret(value: string, options?: RedactionOptions): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (value.length <= opts.visibleStart + opts.visibleEnd) {
    // Too short to show any — fully mask
    return opts.maskChar.repeat(value.length);
  }

  const start = value.slice(0, opts.visibleStart);
  const end = value.slice(-opts.visibleEnd);
  const middleLen = value.length - opts.visibleStart - opts.visibleEnd;
  return `${start}${opts.maskChar.repeat(middleLen)}${end}`;
}

/**
 * Redact all known secret patterns in a text string.
 * Returns the redacted text and a summary of what was found.
 */
export function redactText(text: string, options?: RedactionOptions): RedactionResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const matchedPatterns: string[] = [];
  let redacted = text;

  for (const { pattern, label } of SECRET_PATTERNS) {
    if (pattern.test(redacted)) {
      // Reset lastIndex after test
      pattern.lastIndex = 0;
      matchedPatterns.push(label);
      redacted = redacted.replace(pattern, (match) => {
        return `[REDACTED_${label}(${redactSecret(match, opts)})]`;
      });
    }
  }

  return { original: text, redacted, matchedPatterns };
}

/**
 * Check if a string appears to contain a secret pattern.
 */
export function containsSecret(text: string): boolean {
  return SECRET_PATTERNS.some(({ pattern }) => {
    const result = pattern.test(text);
    pattern.lastIndex = 0;
    return result;
  });
}

/**
 * List all known secret pattern labels.
 */
export function listSecretLabels(): string[] {
  return SECRET_PATTERNS.map(({ label }) => label);
}
