// Anti-failure controller — retry budget, STOP conditions, scope/diff rules.
// Pure functions and state machine. No infrastructure imports.

/**
 * Retry budget for anti-fixation rules.
 * Implements the 3-strike rule from AGENTS.md §7.
 */
export interface RetryBudget {
  readonly rootFailures: Map<string, FailureEntry>;
}

/** Record of a root cause failure with its retry count. */
export interface FailureEntry {
  readonly rootCause: string;
  readonly retryCount: number;
  readonly narrowDiagnosticUsed: boolean;
  readonly exhausted: boolean;
}

/** Outcome of a retry attempt. */
export type RetryAction =
  | { readonly action: "smallest_fix"; readonly remaining: number }
  | { readonly action: "narrow_diagnostic"; readonly remaining: number }
  | { readonly action: "stop_and_abandon"; readonly reason: string };

/** Creates an empty retry budget. */
export function createRetryBudget(): RetryBudget {
  return { rootFailures: new Map() };
}

/** Records a failure and returns the suggested action based on retry count. */
export function recordFailure(
  budget: RetryBudget,
  rootCause: string,
): { readonly budget: RetryBudget; readonly action: RetryAction } {
  const entry = budget.rootFailures.get(rootCause) ?? {
    rootCause,
    retryCount: 0,
    narrowDiagnosticUsed: false,
    exhausted: false,
  };

  const newCount = entry.retryCount + 1;
  const newEntry: FailureEntry = {
    ...entry,
    retryCount: newCount,
    narrowDiagnosticUsed: newCount >= 2,
    exhausted: newCount >= 3,
  };

  const newBudget: RetryBudget = {
    rootFailures: new Map(budget.rootFailures).set(rootCause, newEntry),
  };

  let action: RetryAction;
  if (newCount === 1) {
    action = { action: "smallest_fix", remaining: 2 };
  } else if (newCount === 2) {
    action = { action: "narrow_diagnostic", remaining: 1 };
  } else {
    action = {
      action: "stop_and_abandon",
      reason: `Same-root failure #${String(newCount)} for "${rootCause}". Record failed hypotheses in Surprises & Discoveries, choose simpler safe path.`,
    };
  }

  return { budget: newBudget, action };
}

/** Resets the retry budget for a given root cause (e.g., after a different approach). */
export function clearFailure(budget: RetryBudget, rootCause: string): RetryBudget {
  const newMap = new Map(budget.rootFailures);
  newMap.delete(rootCause);
  return { rootFailures: newMap };
}

/** Checks if any failure has exceeded the retry budget. */
export function hasExhaustedFailures(budget: RetryBudget): boolean {
  return Array.from(budget.rootFailures.values()).some((f) => f.exhausted);
}
