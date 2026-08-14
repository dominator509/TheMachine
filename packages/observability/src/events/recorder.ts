export interface ObservableEvent {
  type: "run" | "milestone" | "command" | "provider" | "mcp" | "plugin";
  timestamp: string;
  run_id?: string;
  execplan_path?: string;
  status?: string;
  duration_ms?: number;
  milestone_id?: string;
  command?: string;
  exit_code?: number;
  stdout_length?: number;
  stderr_length?: number;
  error_code?: string;
  provider_id?: string;
  model?: string;
  success?: boolean;
  token_count?: number;
  mcp_server_id?: string;
  tool_name?: string;
  plugin_id?: string;
  action?: string;
}

export interface EventFilter {
  type?: string;
  run_id?: string;
  status?: string;
  limit?: number;
  since?: string;
}

export function createEventRecorder() {
  let events: ObservableEvent[] = [];
  return {
    record(event: ObservableEvent) {
      events.push(event);
    },
    query(filter?: EventFilter): ObservableEvent[] {
      let filtered = [...events];
      if (filter) {
        if (filter.type) {
          filtered = filtered.filter((e) => e.type === filter.type);
        }
        if (filter.run_id) {
          filtered = filtered.filter((e) => e.run_id === filter.run_id);
        }
        if (filter.status) {
          filtered = filtered.filter((e) => e.status === filter.status);
        }
        if (filter.since) {
          filtered = filtered.filter((e) => new Date(e.timestamp) >= new Date(filter.since ?? ""));
        }
        if (filter.limit !== undefined) {
          filtered = filtered.slice(0, filter.limit);
        }
      }
      return filtered;
    },
    count() {
      return events.length;
    },
    types() {
      return Array.from(new Set(events.map((e) => e.type)));
    },
    clear() {
      events = [];
    },
  };
}
