// PANTAW-OBS-AGGREGATE: Circuit breaker for proposal pipeline.
// Halts all proposals when drift detector reports anomaly (delta > 1.5× baseline).
// Requires explicit human reset to re-enable the proposal pipeline.
//
// States:
//   CLOSED    — Normal operation, proposals flow freely.
//   OPEN      — Proposals halted. Drift anomaly detected.
//   HALF_OPEN — Testing recovery. One successful window allows CLOSED transition.

import type { DriftDetector, DriftSnapshot } from "./driftDetector.js";

// ── Types ───────────────────────────────────────────────────────────────────

/** Circuit breaker states. */
export type BreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

/** Reason for the circuit breaker opening. */
export interface BreakerTripReason {
  /** The drift snapshot that triggered the trip. */
  readonly snapshot: DriftSnapshot;
  /** Human-readable explanation. */
  readonly message: string;
  /** When the trip occurred (epoch ms). */
  readonly trippedAt: number;
}

/** Configuration for the circuit breaker. */
export interface CircuitBreakerConfig {
  /** Whether auto-transition from CLOSED→OPEN is enabled (default true). */
  readonly autoTrip: boolean;
  /** Maximum number of successive HALF_OPEN failures before forcing OPEN with cooldown (default 3). */
  readonly maxHalfOpenFailures: number;
  /** Cooldown in ms before HALF_OPEN can be attempted again after max failures (default 600_000 = 10 min). */
  readonly cooldownMs: number;
}

/** Circuit breaker state for external inspection. */
export interface CircuitBreakerState {
  readonly state: BreakerState;
  readonly tripReason: BreakerTripReason | null;
  readonly halfOpenFailures: number;
  readonly cooldownUntil: number | null;
  readonly proposalCountSinceTrip: number;
}

// ── Circuit Breaker ─────────────────────────────────────────────────────────

export interface CircuitBreaker {
  /** Evaluate the drift detector and transition state if needed. Call before allowing proposals. */
  evaluate(detector: DriftDetector): BreakerState;

  /** Check whether a proposal is allowed right now. Does not modify state. */
  isProposalAllowed(): boolean;

  /** Record that a proposal was submitted. Tracks count in OPEN state. */
  recordProposal(): void;

  /** Human-initiated reset: transition OPEN → HALF_OPEN. */
  reset(): void;

  /** Force immediate transition to CLOSED (human override). */
  forceClose(): void;

  /** Inspect current state. */
  inspect(): CircuitBreakerState;

  /** Get the current breaker state. */
  readonly state: BreakerState;
}

// ── Implementation ──────────────────────────────────────────────────────────

export function createCircuitBreaker(
  config?: Partial<CircuitBreakerConfig>,
): CircuitBreaker {
  const cfg: CircuitBreakerConfig = {
    autoTrip: config?.autoTrip ?? true,
    maxHalfOpenFailures: config?.maxHalfOpenFailures ?? 3,
    cooldownMs: config?.cooldownMs ?? 600_000,
  };

  let breakerState: BreakerState = "CLOSED";
  let tripReason: BreakerTripReason | null = null;
  let halfOpenFailures = 0;
  let cooldownUntil: number | null = null;
  let proposalCountSinceTrip = 0;

  const breaker: CircuitBreaker = {
    evaluate(detector: DriftDetector): BreakerState {
      // If in cooldown, check if it's expired.
      if (cooldownUntil !== null && Date.now() >= cooldownUntil) {
        cooldownUntil = null;
      }

      if (breakerState === "CLOSED" && cfg.autoTrip) {
        const lastSnapshot = detector.history().length > 0
          ? detector.history()[0] // newest first
          : null;

        if (lastSnapshot?.anomalous) {
          breakerState = "OPEN";
          proposalCountSinceTrip = 0;
          tripReason = {
            snapshot: lastSnapshot,
            message: `Drift anomaly detected: delta ${lastSnapshot.driftDelta?.toFixed(4) ?? "N/A"} exceeds threshold. window=${lastSnapshot.windowIndex}, errorRate=${lastSnapshot.errorRate.toFixed(4)}`,
            trippedAt: Date.now(),
          };
        }
      }

      if (breakerState === "HALF_OPEN") {
        // Check if a successful window has passed.
        const lastSnapshot = detector.history().length > 0
          ? detector.history()[0]
          : null;

        if (lastSnapshot && !lastSnapshot.anomalous) {
          // Recovery: transition to CLOSED.
          breakerState = "CLOSED";
          tripReason = null;
          halfOpenFailures = 0;
          proposalCountSinceTrip = 0;
        } else if (lastSnapshot?.anomalous) {
          // Failed recovery attempt.
          halfOpenFailures += 1;
          if (halfOpenFailures >= cfg.maxHalfOpenFailures) {
            breakerState = "OPEN";
            cooldownUntil = Date.now() + cfg.cooldownMs;
          }
        }
      }

      return breakerState;
    },

    isProposalAllowed(): boolean {
      if (breakerState === "OPEN") return false;
      if (cooldownUntil !== null && Date.now() < cooldownUntil) return false;
      return true;
    },

    recordProposal(): void {
      if (breakerState !== "CLOSED") {
        proposalCountSinceTrip += 1;
      }
    },

    reset(): void {
      if (breakerState === "OPEN" && cooldownUntil === null) {
        breakerState = "HALF_OPEN";
        halfOpenFailures = 0;
      }
    },

    forceClose(): void {
      breakerState = "CLOSED";
      tripReason = null;
      halfOpenFailures = 0;
      cooldownUntil = null;
      proposalCountSinceTrip = 0;
    },

    inspect(): CircuitBreakerState {
      return {
        state: breakerState,
        tripReason,
        halfOpenFailures,
        cooldownUntil,
        proposalCountSinceTrip,
      };
    },

    get state(): BreakerState {
      return breakerState;
    },
  };

  return breaker;
}
