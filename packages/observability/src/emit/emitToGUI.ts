// PANTAW-EMIT v2 — Ported to The Machine observability package.
// GUI delivery is optional and fail-safe, but event publication requires a scoped capability.

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

const DEFAULT_STATION: Readonly<Record<number, string>> = {
  1: "planning",
  2: "planning",
  3: "planning",
  4: "planning",
  5: "coding",
  6: "code-review",
  7: "coding",
  8: "planning",
  9: "planning",
  10: "kaizen",
  11: "qa-testing",
  12: "deploy",
  13: "coding",
  14: "security-scan",
  15: "coding",
  16: "qa-testing",
  17: "planning",
  18: "planning",
  19: "gate-clear",
  20: "gate-clear",
  21: "takt",
  22: "kaizen",
  23: "kaizen",
  24: "dependency-check",
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
  "start",
  "progress",
  "complete",
  "victory",
  "andon",
  "blocker",
]);
const VALID_STATIONS = new Set<string>([
  "planning",
  "coding",
  "code-review",
  "qa-testing",
  "security-scan",
  "deploy",
  "gate-clear",
  "kaizen",
  "takt",
  "dependency-check",
]);

export interface GuiEvent {
  eventId: string;
  timestamp: string;
  agentId: number;
  agentName: string;
  station: GuiStation;
  eventType: GuiEventType;
  message: string;
  theme: string;
  metrics: Record<string, unknown>;
}

export interface GuiEventInput {
  agentId: number;
  eventType?: string;
  station?: string;
  message?: string;
  theme?: string;
  metrics?: Record<string, unknown>;
}

export interface EmitConfig {
  webhookUrl?: string;
  timeout?: number;
  defaultTheme?: string;
  /** Event-producer capability returned by getGuiServerAccess(). */
  eventToken?: string;
}

function generateEventId(): string {
  return `evt-${String(Date.now())}-${Math.random().toString(36).substring(2, 11)}`;
}

function cleanInput(
  input: GuiEventInput,
  defaultTheme: string,
): { event: GuiEvent; errors: string[] } {
  const errors: string[] = [];
  let agentId = Math.trunc(input.agentId);
  if (Number.isNaN(agentId) || agentId < 1 || agentId > 24) {
    errors.push(`Invalid agentId: ${String(input.agentId)} (must be 1-24)`);
    agentId = 0;
  }

  let eventType = (input.eventType ?? "").toLowerCase();
  if (!VALID_EVENT_TYPES.has(eventType)) {
    errors.push(`Invalid eventType: ${input.eventType ?? "undefined"}`);
    eventType = "progress";
  }

  let station = (input.station ?? "").toLowerCase();
  if (!station && agentId > 0) station = DEFAULT_STATION[agentId] ?? "planning";
  if (!VALID_STATIONS.has(station)) {
    errors.push(`Invalid station: ${station}`);
    station = "planning";
  }

  return {
    event: {
      eventId: generateEventId(),
      timestamp: new Date().toISOString(),
      agentId,
      agentName: AGENT_NAMES[agentId] ?? "Unknown Agent",
      station: station as GuiStation,
      eventType: eventType as GuiEventType,
      message: (input.message ?? "").substring(0, 240),
      theme: input.theme ?? defaultTheme,
      metrics:
        input.metrics && typeof input.metrics === "object" && !Array.isArray(input.metrics)
          ? input.metrics
          : {},
    },
    errors,
  };
}

function logFallback(event: GuiEvent, errors: string[], webhookUrl: string, reason: string): void {
  console.log(
    `[PANTAW-EMIT FALLBACK] Frontend webhook unavailable at ${webhookUrl} — reason: ${reason}`,
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
  eventToken: string | undefined,
): Promise<{ ok: boolean; reason: string }> {
  if (!eventToken) return { ok: false, reason: "missing event-producer capability" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${eventToken}`,
      },
      body: JSON.stringify(event),
      signal: controller.signal,
    });
    return response.ok
      ? { ok: true, reason: "" }
      : { ok: false, reason: `HTTP ${String(response.status)}` };
  } catch (error: unknown) {
    const reason =
      error instanceof Error
        ? error.name === "AbortError"
          ? "timeout"
          : error.message.substring(0, 200)
        : "unknown error";
    return { ok: false, reason };
  } finally {
    clearTimeout(timer);
  }
}

function resolvedConfig(config?: EmitConfig): {
  webhookUrl: string;
  timeout: number;
  defaultTheme: string;
  eventToken: string | undefined;
} {
  return {
    webhookUrl:
      config?.webhookUrl ??
      (typeof process !== "undefined" ? process.env["PANTAW_FRONTEND_WEBHOOK_URL"] : undefined) ??
      "http://localhost:3000/api/pipeline-event",
    timeout: config?.timeout ?? 2_000,
    defaultTheme: config?.defaultTheme ?? "fft-chibi",
    eventToken:
      config?.eventToken ??
      (typeof process !== "undefined" ? process.env["MACHINE_GUI_EVENT_TOKEN"] : undefined),
  };
}

export function emitToGUI(input: GuiEventInput, config?: EmitConfig): GuiEvent {
  const resolved = resolvedConfig(config);
  const { event, errors } = cleanInput(input, resolved.defaultTheme);
  postEvent(event, resolved.webhookUrl, resolved.timeout, resolved.eventToken)
    .then((result) => {
      if (!result.ok) logFallback(event, errors, resolved.webhookUrl, result.reason);
    })
    .catch((error: unknown) => {
      logFallback(event, errors, resolved.webhookUrl, String(error));
    });
  return event;
}

export async function emitToGUIAsync(
  input: GuiEventInput,
  config?: EmitConfig,
): Promise<{
  success: boolean;
  event: GuiEvent;
  reason?: string;
  validationErrors: string[];
}> {
  const resolved = resolvedConfig(config);
  const { event, errors } = cleanInput(input, resolved.defaultTheme);
  try {
    const result = await postEvent(
      event,
      resolved.webhookUrl,
      resolved.timeout,
      resolved.eventToken,
    );
    if (!result.ok) logFallback(event, errors, resolved.webhookUrl, result.reason);
    return result.ok
      ? { success: true, event, validationErrors: errors }
      : { success: false, event, reason: result.reason, validationErrors: errors };
  } catch (error: unknown) {
    const reason = (error instanceof Error ? error.message : String(error)).substring(0, 200);
    logFallback(event, errors, resolved.webhookUrl, reason);
    return { success: false, event, reason, validationErrors: errors };
  }
}
