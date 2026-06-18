// Structured logging with automatic redaction of sensitive fields.
// Uses @the-machine/security for secret detection and masking.

import { redactText } from "@the-machine/security";

// ── Types ───────────────────────────────────────────────────────────────────

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  event: string;
  run_id?: string;
  workspace_id?: string;
  repository_id?: string;
  execplan_path?: string;
  milestone_id?: string;
  command?: string;
  duration_ms?: number;
  status?: string;
  error_code?: string;
  provider_id?: string;
  mcp_server_id?: string;
  plugin_id?: string;
  redaction_applied: boolean;
}

export interface Logger {
  debug(event: string, meta?: Partial<LogEntry>): void;
  info(event: string, meta?: Partial<LogEntry>): void;
  warn(event: string, meta?: Partial<LogEntry>): void;
  error(event: string, meta?: Partial<LogEntry>): void;
  log(entry: LogEntry): void;
}

// ── Fields that may contain secrets and should be redacted ───────────────────

const SENSITIVE_FIELDS = new Set<string>(["command", "status", "event"]);

// ── Implementation ──────────────────────────────────────────────────────────

function applyRedaction(meta: Partial<LogEntry>): {
  redacted: Partial<LogEntry>;
  applied: boolean;
} {
  let applied = false;
  const redacted: Record<string, unknown> = {};

  const keys = Object.keys(meta) as (keyof LogEntry)[];
  for (const key of keys) {
    const value = meta[key];
    if (value === undefined) continue;

    if (SENSITIVE_FIELDS.has(key) && typeof value === "string") {
      const result = redactText(value);
      if (result.matchedPatterns.length > 0) {
        applied = true;
        redacted[key] = result.redacted;
      } else {
        redacted[key] = value;
      }
    } else {
      redacted[key] = value;
    }
  }

  return { redacted, applied };
}

function formatEntry(entry: LogEntry): string {
  return JSON.stringify(entry);
}

function writeLog(entry: LogEntry): void {
  // In v1, write to stdout as JSON lines.
  // Future: rotate files, SQLite event store.
  const line = formatEntry(entry);
  switch (entry.level) {
    case "error":
      process.stderr.write(line + "\n");
      break;
    default:
      process.stdout.write(line + "\n");
      break;
  }
}

// ── Logger factory ──────────────────────────────────────────────────────────

export function createLogger(): Logger {
  const logger: Logger = {
    debug(event: string, meta?: Partial<LogEntry>): void {
      logger.log({
        timestamp: new Date().toISOString(),
        level: "debug",
        event,
        ...meta,
        redaction_applied: false,
      });
    },
    info(event: string, meta?: Partial<LogEntry>): void {
      logger.log({
        timestamp: new Date().toISOString(),
        level: "info",
        event,
        ...meta,
        redaction_applied: false,
      });
    },
    warn(event: string, meta?: Partial<LogEntry>): void {
      logger.log({
        timestamp: new Date().toISOString(),
        level: "warn",
        event,
        ...meta,
        redaction_applied: false,
      });
    },
    error(event: string, meta?: Partial<LogEntry>): void {
      logger.log({
        timestamp: new Date().toISOString(),
        level: "error",
        event,
        ...meta,
        redaction_applied: false,
      });
    },
    log(entry: LogEntry): void {
      const { redacted, applied } = applyRedaction(entry);
      const finalEntry: LogEntry = { ...entry, ...redacted, redaction_applied: applied };
      writeLog(finalEntry);
    },
  };

  return logger;
}
