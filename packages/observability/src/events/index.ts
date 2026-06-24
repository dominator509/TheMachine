export * from "./eventBus.js";
export * from "./driftDetector.js";
export * from "./circuitBreaker.js";

export interface ObservableEvent {
  readonly type: string;
  readonly timestamp: string;
  readonly [key: string]: unknown;
}

export interface EventFilter {
  readonly type?: string;
  readonly run_id?: string;
  readonly status?: string;
  readonly since?: string;
  readonly limit?: number;
}

export interface EventRecorder {
  record(event: ObservableEvent): void;
  query(filter?: EventFilter): ObservableEvent[];
  count(): number;
  types(): string[];
  clear(): void;
}

export function createEventRecorder(): EventRecorder {
  const events: ObservableEvent[] = [];

  return {
    record(event): void {
      events.push({ ...event });
    },

    query(filter = {}): ObservableEvent[] {
      let result = events.filter((event) => {
        if (filter.type !== undefined && event.type !== filter.type) return false;
        if (filter.run_id !== undefined && event["run_id"] !== filter.run_id) return false;
        if (filter.status !== undefined && event["status"] !== filter.status) return false;
        if (filter.since !== undefined && event.timestamp < filter.since) return false;
        return true;
      });
      if (filter.limit !== undefined) {
        result = result.slice(0, filter.limit);
      }
      return result.map((event) => ({ ...event }));
    },

    count(): number {
      return events.length;
    },

    types(): string[] {
      return Array.from(new Set(events.map((event) => event.type)));
    },

    clear(): void {
      events.length = 0;
    },
  };
}
