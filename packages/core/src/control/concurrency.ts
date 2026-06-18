// Concurrency state machine — mutex-based agent execution coordination.
// State transitions: IDLE → ACQUIRING → ACQUIRED → RELEASING → IDLE
// Pure functions and immutable state. No infrastructure imports.

/**
 * States in the concurrency lifecycle.
 *
 * IDLE       — No agent actively executing.
 * ACQUIRING  — Agent requesting execution permission.
 * ACQUIRED   — Agent holds execution permission and is running.
 * RELEASING  — Agent releasing execution permission.
 */
export type ConcurrencyState = "IDLE" | "ACQUIRING" | "ACQUIRED" | "RELEASING";

/** A work queue entry representing a pending execution request. */
export interface WorkQueueEntry {
  readonly agentId: string;
  readonly enqueuedAt: number;
  readonly timeoutMs: number;
}

/** Configuration for the concurrency state machine. */
export interface ConcurrencyConfig {
  readonly maxConcurrency: number;
  readonly defaultTimeoutMs: number;
}

/** Full state of the concurrency manager. */
export interface ConcurrencyStateMachine {
  readonly state: ConcurrencyState;
  readonly currentAgentId: string | null;
  readonly acquiredCount: number;
  readonly config: ConcurrencyConfig;
  readonly queue: readonly WorkQueueEntry[];
}

/** Result of a state transition. */
export interface ConcurrencyTransition {
  readonly machine: ConcurrencyStateMachine;
  readonly allowed: boolean;
  readonly reason?: string;
}

/** Result of a deadlock check. */
export interface DeadlockCheck {
  readonly hasDeadlock: boolean;
  readonly deadlockedAgentIds: readonly string[];
  readonly reason?: string;
}

/** Default concurrency configuration. */
export const DEFAULT_CONCURRENCY_CONFIG: ConcurrencyConfig = {
  maxConcurrency: 1,
  defaultTimeoutMs: 30_000,
};

/**
 * Creates the initial concurrency state machine.
 */
export function createConcurrencyStateMachine(
  config: ConcurrencyConfig = DEFAULT_CONCURRENCY_CONFIG,
): ConcurrencyStateMachine {
  return {
    state: "IDLE",
    currentAgentId: null,
    acquiredCount: 0,
    config,
    queue: [],
  };
}

/**
 * Attempts to transition from IDLE to ACQUIRING.
 * Enqueues the agent if max concurrency is already reached.
 */
export function requestAcquisition(
  machine: ConcurrencyStateMachine,
  agentId: string,
  timeoutMs?: number,
): ConcurrencyTransition {
  const effectiveTimeout = timeoutMs ?? machine.config.defaultTimeoutMs;

  // If max concurrency not reached and queue is empty, go directly to ACQUIRING
  if (machine.acquiredCount < machine.config.maxConcurrency && machine.queue.length === 0) {
    return {
      machine: {
        ...machine,
        state: "ACQUIRING",
        currentAgentId: agentId,
      },
      allowed: true,
    };
  }

  // Otherwise, enqueue the request
  const entry: WorkQueueEntry = {
    agentId,
    enqueuedAt: Date.now(),
    timeoutMs: effectiveTimeout,
  };

  return {
    machine: {
      ...machine,
      queue: [...machine.queue, entry],
      state: machine.state, // state unchanged — still waiting
    },
    allowed: false,
    reason: "Max concurrency reached; request enqueued",
  };
}

/**
 * Transitions from ACQUIRING to ACQUIRED.
 * Agent has been granted execution permission.
 */
export function confirmAcquisition(
  machine: ConcurrencyStateMachine,
  agentId: string,
): ConcurrencyTransition {
  if (machine.state !== "ACQUIRING") {
    return {
      machine,
      allowed: false,
      reason: `Cannot acquire in state ${machine.state}`,
    };
  }

  if (machine.currentAgentId !== agentId) {
    return {
      machine,
      allowed: false,
      reason: `Agent ${agentId} is not the acquiring agent`,
    };
  }

  return {
    machine: {
      ...machine,
      state: "ACQUIRED",
      acquiredCount: machine.acquiredCount + 1,
    },
    allowed: true,
  };
}

/**
 * Initiates release from ACQUIRED to RELEASING.
 */
export function requestRelease(
  machine: ConcurrencyStateMachine,
  agentId: string,
): ConcurrencyTransition {
  if (machine.state !== "ACQUIRED") {
    return {
      machine,
      allowed: false,
      reason: `Cannot release in state ${machine.state}`,
    };
  }

  if (machine.currentAgentId !== agentId) {
    return {
      machine,
      allowed: false,
      reason: `Agent ${agentId} does not hold the acquisition`,
    };
  }

  return {
    machine: {
      ...machine,
      state: "RELEASING",
    },
    allowed: true,
  };
}

/**
 * Completes release: transitions from RELEASING to IDLE.
 * If the queue has pending entries, dequeues the next agent and advances to ACQUIRING.
 */
export function completeRelease(machine: ConcurrencyStateMachine): ConcurrencyTransition {
  if (machine.state !== "RELEASING") {
    return {
      machine,
      allowed: false,
      reason: `Cannot complete release in state ${machine.state}`,
    };
  }

  const newCount = Math.max(0, machine.acquiredCount - 1);
  const queue = [...machine.queue];

  // If there are queued agents, dequeue the next one (FIFO)
  if (queue.length > 0) {
    const first = queue[0];
    if (!first) {
      // Should not happen since we checked length > 0
      return {
        machine: {
          ...machine,
          state: "IDLE",
          currentAgentId: null,
          acquiredCount: newCount,
          queue: [],
        },
        allowed: true,
      };
    }
    const remaining = queue.slice(1);

    return {
      machine: {
        ...machine,
        state: "ACQUIRING",
        currentAgentId: first.agentId,
        acquiredCount: newCount,
        queue: remaining,
      },
      allowed: true,
    };
  }

  // No queued agents — return to IDLE
  return {
    machine: {
      ...machine,
      state: "IDLE",
      currentAgentId: null,
      acquiredCount: newCount,
      queue: [],
    },
    allowed: true,
  };
}

/**
 * Detects deadlocked entries in the work queue.
 * An entry is deadlocked if its timeout has expired.
 */
export function checkDeadlocks(machine: ConcurrencyStateMachine): DeadlockCheck {
  const now = Date.now();
  const deadlockedIds: string[] = [];

  for (const entry of machine.queue) {
    if (now - entry.enqueuedAt > entry.timeoutMs) {
      deadlockedIds.push(entry.agentId);
    }
  }

  if (deadlockedIds.length > 0) {
    return {
      hasDeadlock: true,
      deadlockedAgentIds: deadlockedIds,
      reason: `${String(deadlockedIds.length)} agent(s) timed out in queue`,
    };
  }

  return {
    hasDeadlock: false,
    deadlockedAgentIds: [],
  };
}

/**
 * Removes deadlocked entries from the queue.
 */
export function removeDeadlocked(machine: ConcurrencyStateMachine): ConcurrencyStateMachine {
  const { hasDeadlock, deadlockedAgentIds } = checkDeadlocks(machine);

  if (!hasDeadlock) return machine;

  const deadlockedSet = new Set(deadlockedAgentIds);
  const remaining = machine.queue.filter((e) => !deadlockedSet.has(e.agentId));

  return {
    ...machine,
    queue: remaining,
  };
}

/**
 * Resets the state machine to its initial IDLE state.
 */
export function resetConcurrencyStateMachine(
  machine: ConcurrencyStateMachine,
): ConcurrencyStateMachine {
  return createConcurrencyStateMachine(machine.config);
}
