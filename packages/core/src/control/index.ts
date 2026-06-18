// Anti-failure controller barrel export.

export type { RetryBudget, FailureEntry, RetryAction } from "./retryBudget.js";
export {
  createRetryBudget,
  recordFailure,
  clearFailure,
  hasExhaustedFailures,
} from "./retryBudget.js";

export type { StopEvaluation, ExecutionContext } from "./stopConditions.js";
export { evaluateStopConditions } from "./stopConditions.js";

export type { ScopeCheck } from "./scope.js";
export { checkScope } from "./scope.js";

export type {
  ConcurrencyState,
  ConcurrencyConfig,
  ConcurrencyStateMachine,
  ConcurrencyTransition,
  WorkQueueEntry,
  DeadlockCheck,
} from "./concurrency.js";
export {
  createConcurrencyStateMachine,
  requestAcquisition,
  confirmAcquisition,
  requestRelease,
  completeRelease,
  checkDeadlocks,
  removeDeadlocked,
  resetConcurrencyStateMachine,
  DEFAULT_CONCURRENCY_CONFIG,
} from "./concurrency.js";
