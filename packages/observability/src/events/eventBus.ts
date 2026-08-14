// PANTAW-ERR: Centralized event capture bus.
// Collects errors, warnings, and state-change signals from all subsystems.
// Feeds OBS-AGGREGATE drift detection with a sliding event window.

// ── Core Types (self-contained — no cross-package dependency) ───────────────

/** Epoch milliseconds timestamp. */
type Timestamp = number;

/** Severity of an event. */
export type Severity = "info" | "warning" | "error" | "critical";

// ── Event Types ─────────────────────────────────────────────────────────────

/** Categories of observable events in the system. */
export type EventCategory =
  | "error"
  | "warning"
  | "info"
  | "state_change"
  | "health_check"
  | "drift_signal"
  | "proposal_lifecycle";

/** Structured event captured by the event bus. */
export interface ObsEvent {
  /** Unique event identifier. */
  readonly id: string;
  /** When the event occurred (epoch ms). */
  readonly timestamp: Timestamp;
  /** Category for routing and aggregation. */
  readonly category: EventCategory;
  /** Severity of the event. */
  readonly severity: Severity;
  /** Subsystem or component that emitted the event. */
  readonly subsystem: string;
  /** Short machine-readable event code (e.g. "DRIFT_THRESHOLD_BREACH"). */
  readonly code: string;
  /** Human-readable description. */
  readonly message: string;
  /** Optional structured payload for downstream consumers. */
  readonly payload?: Record<string, unknown>;
}

/** Subscriber callback — invoked on every emitted event. */
export type EventSubscriber = (event: ObsEvent) => void;

/** Configuration for the event bus. */
export interface EventBusConfig {
  /** Maximum number of events retained in memory. */
  readonly maxEvents: number;
  /** Whether to emit events to stdout as JSON lines (for log aggregation). */
  readonly emitToStdout: boolean;
  /** Optional subscribers registered at creation time. */
  readonly subscribers?: readonly EventSubscriber[];
}

// ── Event Bus ───────────────────────────────────────────────────────────────

export interface EventBus {
  /** Push a new event onto the bus. */
  emit(event: Omit<ObsEvent, "id" | "timestamp">): ObsEvent;

  /** Return all events in insertion order (newest first). */
  all(): readonly ObsEvent[];

  /** Return the most recent N events (newest first). */
  recent(n: number): readonly ObsEvent[];

  /** Return events matching a category filter. */
  filter(predicate: (e: ObsEvent) => boolean): readonly ObsEvent[];

  /** Return only events from the last `windowMs` milliseconds. */
  inWindow(windowMs: number): readonly ObsEvent[];

  /** Count events by category. */
  countByCategory(): Map<EventCategory, number>;

  /** Count events by severity. */
  countBySeverity(): Map<Severity, number>;

  /** Drop all events. */
  clear(): void;

  /** Current event count. */
  readonly size: number;
}

// ── Implementation ──────────────────────────────────────────────────────────

let nextId = 0;

function generateEventId(): string {
  nextId += 1;
  return `evt_${String(Date.now())}_${nextId.toString(36)}`;
}

export function createEventBus(config?: Partial<EventBusConfig>): EventBus {
  const cfg: EventBusConfig = {
    maxEvents: config?.maxEvents ?? 1000,
    emitToStdout: config?.emitToStdout ?? false,
  };

  const events: ObsEvent[] = [];

  const bus: EventBus = {
    emit(raw): ObsEvent {
      const event: ObsEvent = {
        id: generateEventId(),
        timestamp: Date.now(),
        ...raw,
      };

      // Ring-buffer semantics: drop oldest when at capacity.
      if (events.length >= cfg.maxEvents) {
        events.shift();
      }
      events.push(event);

      if (cfg.emitToStdout) {
        process.stdout.write(JSON.stringify(event) + "\n");
      }

      return event;
    },

    all(): readonly ObsEvent[] {
      // Return a frozen copy, newest first.
      return Object.freeze([...events].reverse());
    },

    recent(n: number): readonly ObsEvent[] {
      const start = Math.max(0, events.length - Math.min(n, events.length));
      const slice: ObsEvent[] = [];
      for (let i = start; i < events.length; i++) {
        const e = events[i];
        if (e !== undefined) slice.push(e);
      }
      return Object.freeze(slice.reverse());
    },

    filter(predicate: (e: ObsEvent) => boolean): readonly ObsEvent[] {
      const results: ObsEvent[] = [];
      for (let i = events.length - 1; i >= 0; i--) {
        const e = events[i];
        if (e !== undefined && predicate(e)) {
          results.push(e);
        }
      }
      return Object.freeze(results);
    },

    inWindow(windowMs: number): readonly ObsEvent[] {
      const cutoff = Date.now() - windowMs;
      return bus.filter((e) => e.timestamp >= cutoff);
    },

    countByCategory(): Map<EventCategory, number> {
      const counts = new Map<EventCategory, number>();
      for (const e of events) {
        counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
      }
      return counts;
    },

    countBySeverity(): Map<Severity, number> {
      const counts = new Map<Severity, number>();
      for (const e of events) {
        counts.set(e.severity, (counts.get(e.severity) ?? 0) + 1);
      }
      return counts;
    },

    clear(): void {
      events.length = 0;
    },

    get size(): number {
      return events.length;
    },
  };

  return bus;
}
