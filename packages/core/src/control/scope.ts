// Scope enforcement — ensures only expected files are changed.
// Pure functions. No infrastructure imports.

/** Result of comparing actual changed files to expected. */
export interface ScopeCheck {
  readonly compliant: boolean;
  readonly expected: readonly string[];
  readonly actual: readonly string[];
  readonly unexpected: readonly string[];
  readonly missing: readonly string[];
  readonly justified: readonly string[];
}

/**
 * Checks that only expected files were changed AND all expected files are present.
 * Unexpected files can be justified in the Decision Log.
 */
export function checkScope(
  expectedFiles: readonly string[],
  actualFiles: readonly string[],
  justifiedFiles: readonly string[] = [],
): ScopeCheck {
  const justified = new Set(justifiedFiles);

  const unexpected = actualFiles.filter((f) => !expectedFiles.includes(f) && !justified.has(f));

  const actualSet = new Set(actualFiles);
  const missing = expectedFiles.filter((f) => !actualSet.has(f));

  return {
    compliant: unexpected.length === 0 && missing.length === 0,
    expected: expectedFiles,
    actual: actualFiles,
    unexpected,
    missing,
    justified: justifiedFiles,
  };
}
