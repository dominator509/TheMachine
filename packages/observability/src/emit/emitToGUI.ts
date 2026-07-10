// PANTAW-EMIT v2 — Ported to The Machine observability package
// Hardened failsafe: GUI is OPTIONAL. Never throws, never blocks.
// Compatible with the original PANTAW 24-samurai mapping.

/** The 24 samurai names — identical to PANTAW-EMIT mapping. */
const AGENT_NAMES: Readonly<Record<number, string>> = {
  1: "Oda Nobunaga",
  2: "Tokugawa Ieyasu",
  3: "Miyamoto Musashi",
  4: "Tsukahara Bokuden",
  5: "Date Masamune",
  6: "Honda Tadakatsu",
  7: "Ii Naomasa",
  8: "Toyotomi Hideyoshi",
  9: "Minamoto no Yoshitsune",
  10: "Minamoto no Yoritomo",
  11: "Sasaki Kojirō",
  12: "Kato Kiyomasa",
  13: "Shimazu Yoshihiro",
  14: "Uesugi Kenshin",
  15: "Ashikaga Takauji",
  16: "Yasuke",
  17: "Tomoe Gozen",
  18: "Takeda Shingen",
  19: "Sanada Yukimura",
  20: "Mori Motonari",
  21: "Torii Mototada",
  22: "Kusunoki Masashige",
  23: "Yagyū Munenori",
  24: "Hattori Hanzo",
};

/** Default station assignment per agent — mirrors PANTAW's DEFAULT_STATION_BY_AGENT. */
const DEFAULT_STATION: Readonly<Record<number, string>> = {
  1: "planning", 2: "planning", 3: "planning", 4: "planning",
  5: "coding", 6: "code-review", 7: "coding",
  8: "planning", 9: "planning", 10: "kaizen",
  11: "qa-testing", 12: "deploy", 13: "coding",
  14: "security-scan", 15: "coding", 16: "qa-testing",
  17: "planning", 18: "planning",
  19: "gate-clear", 20: "gate-clear", 21: "takt",
  22: "kaizen", 23: "kaizen", 24: "dependency-check",
};

export type GuiEventType = "start" | "progress" | "complete" | "victory" | "andon" | "blocker";

export type GuiStation =
  | "planning"
  | "coding"
  | "code-review"
  | "qa-testing"
  | "security-scan"
  | "deploy"
  | "gate-clear"
  | "kaizen"
  | "takt"
  | "dependency-check";

const VALID_EVENT_TYPES = new Set<string>([
  "start", "progress", "complete", "victory", "andon", "blocker",
]);
const VALID_STATIONS = new Set<string>([
  "planning", "coding", "code-review", "qa-testing", "security-scan",
  "deploy", "gate-clear", "kaizen", "takt", "dependency-check",
]);

/** Payload sent to the GUI webhook. */
export interface GuiEvent {
  eventId: string;
  timestamp: string;
  agentId: number;
  agentName: string;
  station: GuiStation;
  eventType: GuiEventType;
  message: string;
  /** Theme version identifier — lets the GUI render different art styles.
   *  e.g. "fft-chibi", "snes-pixel", "nes-8bit", "samurai-dojo" */
  theme: string;
  metrics: Record<string, unknown>;
}

/** Raw input — all fields optional except agentId. Unset fields get safe defaults. */
export interface GuiEventInput {
  agentId: number;
  eventType?: string;
  station?: string;
  message?: string;
  theme?: string;
  metrics?: Record<string, unknown>;
}

export interface EmitConfig {
  /** Webhook URL for the GUI. Defaults to ENV['PANTAW_FRONTEND_WEBHOOK_URL']
   *  or 'http://localhost:3000/api/pipeline-event'. */
  webhookUrl?: string;
  /** HTTP timeout in ms. Default 2000 (PANTAW-compatible). */
  timeout?: number;
  /** Default theme. Default "fft-chibi". */
  defaultTheme?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function generateEventId(): string {
  return `evt-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

function cleanInput(
  input: GuiEventInput,
  defaultTheme: string,
): { event: GuiEvent; errors: string[] } {
  const errors: string[] = [];

  let agentId = Math.trunc(input.agentId);
  if (isNaN(agentId) || agentId < 1 || agentId > 24) {
    errors.push(`Invalid agentId: ${String(input.agentId)} (must be 1-24)`);
    agentId = 0;
  }

  let eventType = String(input.eventType ?? "").toLowerCase();
  if (!VALID_EVENT_TYPES.has(eventType)) {
    errors.push(`Invalid eventType: ${input.eventType ?? "undefined"}`);
    eventType = "progress";
  }

  let station = String(input.station ?? "").toLowerCase();
  if (!station && agentId > 0) {
    station = DEFAULT_STATION[agentId] ?? "planning";
  }
  if (!VALID_STATIONS.has(station)) {
    errors.push(`Invalid station: ${station}`);
    station = "planning";
  }

  const agentName = AGENT_NAMES[agentId] ?? "Unknown Agent";
  const message = (input.message ?? "").substring(0, 240);
  const theme = input.theme ?? defaultTheme;
  const metrics =
    input.metrics &&
    typeof input.metrics === "object" &&
    !Array.isArray(input.metrics)
      ? input.metrics
      : {};

  return {
    event: {
      eventId: generateEventId(),
      timestamp: new Date().toISOString(),
      agentId,
      agentName,
      station: station as GuiStation,
      eventType: eventType as GuiEventType,
      message,
      theme,
      metrics,
    },
    errors,
  };
}

function logFallback(
  event: GuiEvent,
  errors: string[],
  webhookUrl: string,
  reason: string,
): void {
  console.log(
    `[PANTAW-EMIT FALLBACK] Frontend webhook unreachable at ${webhookUrl} — reason: ${reason}`,
  );
  console.log(`[PANTAW-EMIT EVENT] ${JSON.stringify(event)}`);
  if (errors.length > 0) {
    console.log(`[PANTAW-EMIT VALIDATION ERRORS] ${JSON.stringify(errors)}`);
  }
}

async function postEvent(
  event: GuiEvent,
  webhookUrl: string,
  timeoutMs: number,
): Promise<{ ok: boolean; reason: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => { controller.abort(); }, timeoutMs);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      signal: controller.signal,
    });

    if (!response.ok) {
      return { ok: false, reason: `HTTP ${String(response.status)}` };
    }
    return { ok: true, reason: "" };
  } catch (err: unknown) {
    const reason =
      err instanceof Error
        ? err.name === "AbortError"
          ? "timeout"
          : err.message.substring(0, 200)
        : "unknown error";
    return { ok: false, reason };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fire-and-forget emit to the War Council GUI.
 *
 * NEVER throws, NEVER blocks the caller. If the GUI is unreachable (crashed,
 * closed, returning 500s), the event is console.log'd as a fallback.
 *
 * @example
 *   import { emitToGUI } from '@the-machine/observability/emit';
 *
 *   emitToGUI({
 *     agentId: 7,          // Ii Naomasa
 *     eventType: 'start',
 *     station: 'coding',
 *     message: 'Beginning EP-002 M4 implementation',
 *     theme: 'fft-chibi',
 *     metrics: { execPlan: 'EP-002', milestone: 'M4' },
 *   });
 */
export function emitToGUI(
  input: GuiEventInput,
  config?: EmitConfig,
): GuiEvent {
  const webhookUrl =
    config?.webhookUrl ??
    (typeof process !== "undefined"
      ? process.env["PANTAW_FRONTEND_WEBHOOK_URL"]
      : undefined) ??
    "http://localhost:3000/api/pipeline-event";

  const timeout = config?.timeout ?? 2000;
  const defaultTheme = config?.defaultTheme ?? "fft-chibi";

  const { event, errors } = cleanInput(input, defaultTheme);

  // Fire and forget — log fallback on failure
  postEvent(event, webhookUrl, timeout)
    .then((result) => {
      if (!result.ok) {
        logFallback(event, errors, webhookUrl, result.reason);
      }
    })
    .catch((err: unknown) => {
      logFallback(event, errors, webhookUrl, String(err));
    });

  return event;
}

/**
 * Synchronous variant — returns a Promise that resolves with the result.
 * Use this when the caller wants to know if the GUI received the event.
 */
export async function emitToGUIAsync(
  input: GuiEventInput,
  config?: EmitConfig,
): Promise<{
  success: boolean;
  event: GuiEvent;
  reason?: string;
  validationErrors: string[];
}> {
  const webhookUrl =
    config?.webhookUrl ??
    (typeof process !== "undefined"
      ? process.env["PANTAW_FRONTEND_WEBHOOK_URL"]
      : undefined) ??
    "http://localhost:3000/api/pipeline-event";

  const timeout = config?.timeout ?? 2000;
  const defaultTheme = config?.defaultTheme ?? "fft-chibi";

  const { event, errors } = cleanInput(input, defaultTheme);

  try {
    const result = await postEvent(event, webhookUrl, timeout);
    if (!result.ok) {
      logFallback(event, errors, webhookUrl, result.reason);
    }
    const out: { success: boolean; event: unknown; reason?: string; validationErrors: string[] } = {
      success: result.ok,
      event,
      validationErrors: errors,
    };
    if (!result.ok) out.reason = result.reason;
    return out as { success: boolean; event: GuiEvent; reason?: string; validationErrors: string[]; };
  } catch (err: unknown) {
    const reason = (err instanceof Error ? err.message : String(err)).substring(0, 200);
    logFallback(event, errors, webhookUrl, reason);
    return {
      success: false,
      event,
      reason,
      validationErrors: errors,
    };
  }
}
