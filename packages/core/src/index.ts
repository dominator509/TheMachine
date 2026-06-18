// Domain: pure business logic, entities, validators, state machines.
// No filesystem, network, DB, GUI, CLI, provider SDK, or MCP transport imports.

export const PLATFORM_NAME = "The Machine";

// Re-export all domain entities.
export * from "./domain/index.js";

// Re-export ExecPlan validation.
export * from "./execplan/index.js";

// Re-export anti-failure controller (without StopCondition to avoid conflict with domain).
export {
  createRetryBudget,
  recordFailure,
  clearFailure,
  hasExhaustedFailures,
  evaluateStopConditions,
  checkScope,
  createConcurrencyStateMachine,
  requestAcquisition,
  confirmAcquisition,
  requestRelease,
  completeRelease,
  checkDeadlocks,
  removeDeadlocked,
  resetConcurrencyStateMachine,
  DEFAULT_CONCURRENCY_CONFIG,
} from "./control/index.js";
export type {
  RetryBudget,
  FailureEntry,
  RetryAction,
  StopEvaluation,
  ExecutionContext,
  ScopeCheck,
  ConcurrencyState,
  ConcurrencyConfig,
  ConcurrencyStateMachine,
  ConcurrencyTransition,
  WorkQueueEntry,
  DeadlockCheck,
} from "./control/index.js";

// Re-export provider/MCP/plugin validators.
export * from "./integrations/index.js";

// Re-export readiness gates.
export * from "./readiness/index.js";
