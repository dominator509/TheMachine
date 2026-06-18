// Readiness gate logic — validates subsystem health.
// No infrastructure imports.

import type { ReadinessGate, ReadinessCheck } from "../domain/index.js";

/** Overall readiness evaluation. */
export interface ReadinessEvaluation {
  readonly ready: boolean;
  readonly gates: ReadinessGate[];
  readonly failedGates: string[];
}

/** Creates a readiness gate with checks for a subsystem. */
export function createReadinessGate(subsystem: string, checks: ReadinessCheck[]): ReadinessGate {
  const allPassed = checks.length > 0 && checks.every((c) => c.passed);
  return {
    subsystem,
    status: checks.length === 0 ? "pending" : allPassed ? "completed" : "failed",
    checks,
  };
}

/** Evaluates if all readiness gates are green. */
export function evaluateReadiness(gates: ReadinessGate[]): ReadinessEvaluation {
  const failedGates = gates.filter((g) => g.status !== "completed").map((g) => g.subsystem);

  return {
    ready: failedGates.length === 0,
    gates,
    failedGates,
  };
}

/** Checks whether a specific gate is ready. */
export function isGateReady(gate: ReadinessGate): boolean {
  return gate.status === "completed";
}
