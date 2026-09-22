import { afterEach, describe, expect, it } from "vitest";
import { emitToGUI, emitToGUIAsync } from "../packages/observability/src/emit/emitToGUI";

const originalFetch = globalThis.fetch;
let lastPostedBody: string | null = null;
let lastAuthorization: string | null = null;

function mockFetch(respondWith: Response): void {
  globalThis.fetch = async (_url, init) => {
    lastPostedBody = (init as RequestInit)?.body as string | null;
    lastAuthorization = new Headers((init as RequestInit)?.headers).get("authorization");
    return respondWith;
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  lastPostedBody = null;
  lastAuthorization = null;
});

const delivery = {
  webhookUrl: "http://test/api/pipe",
  eventToken: "producer-capability",
};

describe("emitToGUI (fire-and-forget)", () => {
  it("returns a valid GuiEvent for minimum input", () => {
    mockFetch(new Response(null, { status: 200 }));
    const event = emitToGUI({ agentId: 7 }, delivery);
    expect(event.agentId).toBe(7);
    expect(event.agentName).toBe("Ii Naomasa");
    expect(event.station).toBe("coding");
    expect(event.eventType).toBe("progress");
    expect(event.message).toBe("");
    expect(event.theme).toBe("fft-chibi");
    expect(event.eventId).toMatch(/^evt-/);
  });

  it("respects explicit station and eventType", () => {
    mockFetch(new Response(null, { status: 200 }));
    const event = emitToGUI(
      { agentId: 3, eventType: "victory", station: "gate-clear", theme: "nes-8bit" },
      delivery,
    );
    expect(event.agentName).toBe("Miyamoto Musashi");
    expect(event.eventType).toBe("victory");
    expect(event.station).toBe("gate-clear");
    expect(event.theme).toBe("nes-8bit");
  });

  it("maps all 24 agent IDs to correct samurai names", () => {
    mockFetch(new Response(null, { status: 200 }));
    const expected: Record<number, string> = {
      1: "Oda Nobunaga",
      5: "Date Masamune",
      12: "Kato Kiyomasa",
      14: "Uesugi Kenshin",
      16: "Yasuke",
      17: "Tomoe Gozen",
      24: "Hattori Hanzo",
    };
    for (const [id, name] of Object.entries(expected)) {
      expect(emitToGUI({ agentId: Number(id) }, delivery).agentName).toBe(name);
    }
  });

  it("clamps invalid agentId without throwing", () => {
    mockFetch(new Response(null, { status: 200 }));
    const event = emitToGUI({ agentId: 99 }, delivery);
    expect(event.agentId).toBe(0);
    expect(event.agentName).toBe("Unknown Agent");
  });

  it("sanitizes invalid eventType and station", () => {
    mockFetch(new Response(null, { status: 200 }));
    const event = emitToGUI(
      { agentId: 1, eventType: "nonsense", station: "the-kitchen" },
      delivery,
    );
    expect(event.eventType).toBe("progress");
    expect(event.station).toBe("planning");
  });

  it("truncates messages to 240 characters", () => {
    mockFetch(new Response(null, { status: 200 }));
    const event = emitToGUI({ agentId: 1, message: "x".repeat(500) }, delivery);
    expect(event.message).toHaveLength(240);
  });

  it("posts JSON with the event-producer bearer capability", async () => {
    mockFetch(new Response(null, { status: 200 }));
    const result = await emitToGUIAsync(
      { agentId: 12, eventType: "complete", station: "deploy", message: "Push complete" },
      delivery,
    );
    expect(result.success).toBe(true);
    expect(lastAuthorization).toBe("Bearer producer-capability");
    const parsed = JSON.parse(lastPostedBody ?? "null") as Record<string, unknown>;
    expect(parsed["agentId"]).toBe(12);
    expect(parsed["eventType"]).toBe("complete");
    expect(parsed["message"]).toBe("Push complete");
  });

  it("fails closed without an event-producer capability", async () => {
    mockFetch(new Response(null, { status: 200 }));
    const result = await emitToGUIAsync({ agentId: 1 }, { webhookUrl: "http://test/api/pipe" });
    expect(result.success).toBe(false);
    expect(result.reason).toContain("missing event-producer capability");
    expect(lastPostedBody).toBeNull();
  });

  it("never throws even when fetch is broken", () => {
    globalThis.fetch = async () => {
      throw new Error("ENOTFOUND");
    };
    expect(() =>
      emitToGUI(
        { agentId: 1 },
        {
          webhookUrl: "http://nonexistent.example/api/pipe",
          timeout: 10,
          eventToken: "producer-capability",
        },
      ),
    ).not.toThrow();
  });
});
