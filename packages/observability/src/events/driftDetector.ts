// PANTAW-OBS-AGGREGATE: Drift detection with sliding window analysis.
// Compares the current 5-step error window against the prior 5-step mean.
// Triggers circuit breaker when drift delta exceeds 1.5× the rolling baseline.

import type { EventBus } from "./eventBus.js";

// ── Types ───────────────────────────────────────────────────────────────────

/** Epoch milliseconds timestamp. */
type Timestamp = number;

/** Drift snapshot computed from a single window of events. */
export interface DriftSnapshot {
  /** Window index (increments per computation cycle). */
  readonly windowIndex: number;
  /** Start of the window (epoch ms). */
  readonly windowStart: Timestamp;
  /** End of the window (epoch ms). */
  readonly windowEnd: Timestamp;
  /** Total events in this window. */
  readonly totalEvents: number;
  /** Error events in this window. */
  readonly errorCount: number;
  /** Warning events in this window. */
  readonly warningCount: number;
  /** Critical events in this window. */
  readonly criticalCount: number;
  /** Error rate (errorCount / totalEvents), 0 if no events. */
  readonly errorRate: number;
  /** Drift delta compared to the prior baseline. Null on first window. */
  readonly driftDelta: number | null;
  /** Whether this window triggered an anomaly (delta > threshold). */
  readonly anomalous: boolean;
}

/** Configuration for the drift detector. */
export interface DriftDetectorConfig {
  /** Number of events to consider per window (default 5). */
  readonly windowSize: number;
  /** Time window in ms for event collection (default 300_000 = 5 min). */
  readonly windowDurationMs: number;
  /** Multiplier threshold for drift detection (default 1.5). */
  readonly driftThreshold: number;
  /** Number of prior windows to average for baseline (default 5). */
  readonly baselineWindows: number;
}

/** Drift detector state for external inspection. */
export interface DriftDetectorState {
  readonly baselineMean: number;
  readonly currentWindowErrors: number;
  readonly driftDelta: number | null;
  readonly anomalyActive: boolean;
  readonly windowCount: number;
  readonly snapshotHistory: readonly DriftSnapshot[];
}

// ── Drift Detector ──────────────────────────────────────────────────────────

export interface DriftDetector {
  /** Compute drift for the current window. Returns a snapshot. */
  compute(): DriftSnapshot;

  /** Return recent drift history. */
  history(): readonly DriftSnapshot[];

  /** Inspect detector state without computing. */
  inspect(): DriftDetectorState;

  /** Reset all state and history. */
  reset(): void;
}

// ── Implementation ──────────────────────────────────────────────────────────

export function createDriftDetector(
  eventBus: EventBus,
  config?: Partial<DriftDetectorConfig>,
): DriftDetector {
  const cfg: DriftDetectorConfig = {
    windowSize: config?.windowSize ?? 5,
    windowDurationMs: config?.windowDurationMs ?? 300_000,
    driftThreshold: config?.driftThreshold ?? 1.5,
    baselineWindows: config?.baselineWindows ?? 5,
  };

  const snapshots: DriftSnapshot[] = [];
  let windowIndex = 0;

  /**
   * Compute the rolling baseline mean error rate from prior windows.
   * Uses up to `baselineWindows` prior snapshots.
   */
  function computeBaselineMean(): number {
    const priorCount = Math.min(snapshots.length, cfg.baselineWindows);
    if (priorCount === 0) return 0;

    // Take the most recent N prior windows.
    const recent = snapshots.slice(-priorCount);
    const sum = recent.reduce((acc, s) => acc + s.errorRate, 0);
    return sum / priorCount;
  }

  const detector: DriftDetector = {
    compute(): DriftSnapshot {
      const now = Date.now();
      const windowStart = now - cfg.windowDurationMs;

      // Collect events in the current time window.
      const windowEvents = eventBus.inWindow(cfg.windowDurationMs);
      const errorEvents = windowEvents.filter((e) => e.category === "error");
      const warningEvents = windowEvents.filter((e) => e.category === "warning");
      const criticalEvents = windowEvents.filter((e) => e.severity === "critical");

      const totalEvents = windowEvents.length;
      const errorCount = errorEvents.length;
      const errorRate = totalEvents > 0 ? errorCount / totalEvents : 0;

      const baselineMean = computeBaselineMean();
      const driftDelta = snapshots.length > 0 ? errorRate - baselineMean : null;

      // Anomaly: drift delta exceeds threshold × baseline mean, AND baseline has sufficient data.
      const anomalous =
        driftDelta !== null && baselineMean > 0 && driftDelta > cfg.driftThreshold * baselineMean;

      windowIndex += 1;

      const snapshot: DriftSnapshot = {
        windowIndex,
        windowStart,
        windowEnd: now,
        totalEvents,
        errorCount,
        warningCount: warningEvents.length,
        criticalCount: criticalEvents.length,
        errorRate,
        driftDelta,
        anomalous,
      };

      snapshots.push(snapshot);

      // Keep history bounded.
      const maxHistory = cfg.baselineWindows * 3;
      while (snapshots.length > maxHistory) {
        snapshots.shift();
      }

      return snapshot;
    },

    history(): readonly DriftSnapshot[] {
      return Object.freeze([...snapshots]);
    },

    inspect(): DriftDetectorState {
      const baselineMean = computeBaselineMean();
      const lastSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;

      return {
        baselineMean,
        currentWindowErrors: lastSnapshot?.errorCount ?? 0,
        driftDelta: lastSnapshot?.driftDelta ?? null,
        anomalyActive: lastSnapshot?.anomalous ?? false,
        windowCount: snapshots.length,
        snapshotHistory: Object.freeze([...snapshots]),
      };
    },

    reset(): void {
      snapshots.length = 0;
      windowIndex = 0;
    },
  };

  return detector;
}
