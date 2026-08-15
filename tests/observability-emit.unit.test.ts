import { describe, it, expect } from "vitest";
import { emitToGUI, type GuiEventInput } from "../packages/observability/src/emit/emitToGUI";

// Patch fetch so we don't hit the network in tests.
const originalFetch = globalThis.fetch;
let lastPostedBody: string | null = null;

function mockFetch(respondWith: Response): void {
  globalThis.fetch = async (url, init) => {
    lastPostedBody = (init as RequestInit)?.body as string | null;
    return respondWith;
  };
}

function restoreFetch(): void {
  globalThis.fetch = originalFetch;
  lastPostedBody = null;
}

describe("emitToGUI (fire-and-forget)", () => {
  it("returns a valid GuiEvent for minimum input", () => {
    mockFetch(new Response(null, { status: 200 }));

    const event = emitToGUI({ agentId: 7 }, { webhookUrl: "http://test/api/pipe" });

    expect(event.agentId).toBe(7);
    expect(event.agentName).toBe("Ii Naomasa");
    expect(event.station).toBe("coding"); // agent 7 default
    expect(event.eventType).toBe("progress"); // default
    expect(event.message).toBe("");
    expect(event.theme).toBe("fft-chibi"); // default
    expect(event.eventId).toMatch(/^evt-/);

    restoreFetch();
  });

  it("respects explicit station and eventType", () => {
    mockFetch(new Response(null, { status: 200 }));

    const event = emitToGUI(
      { agentId: 3, eventType: "victory", station: "gate-clear", theme: "nes-8bit" },
      { webhookUrl: "http://test/api/pipe" },
    );

    expect(event.agentName).toBe("Miyamoto Musashi");
    expect(event.eventType).toBe("victory");
    expect(event.station).toBe("gate-clear");
    expect(event.theme).toBe("nes-8bit");

    restoreFetch();
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
      const event = emitToGUI({ agentId: Number(id) }, { webhookUrl: "http://test/api/pipe" });
      expect(event.agentName).toBe(name);
    }

    restoreFetch();
  });

  it("clamps invalid agentId to 0 and 'Unknown Agent' without throwing", () => {
    mockFetch(new Response(null, { status: 200 }));

    // @ts-expect-error testing invalid input
    const event = emitToGUI({ agentId: 99 }, { webhookUrl: "http://test/api/pipe" });

    expect(event.agentId).toBe(0);
    expect(event.agentName).toBe("Unknown Agent");

    restoreFetch();
  });

  it("sanitizes invalid eventType to 'progress'", () => {
    mockFetch(new Response(null, { status: 200 }));

    const event = emitToGUI(
      { agentId: 1, eventType: "nonsense" },
      { webhookUrl: "http://test/api/pipe" },
    );

    expect(event.eventType).toBe("progress");

    restoreFetch();
  });

  it("sanitizes invalid station to 'planning'", () => {
    mockFetch(new Response(null, { status: 200 }));

    const event = emitToGUI(
      { agentId: 1, station: "the-kitchen" },
      { webhookUrl: "http://test/api/pipe" },
    );

    expect(event.station).toBe("planning");

    restoreFetch();
  });

  it("truncates message to 240 characters", () => {
    mockFetch(new Response(null, { status: 200 }));

    const longMsg = "x".repeat(500);
    const event = emitToGUI(
      { agentId: 1, message: longMsg },
      { webhookUrl: "http://test/api/pipe", timeout: 100 },
    );

    expect(event.message.length).toBe(240);

    restoreFetch();
  });

  it("posts valid JSON to the webhook", async () => {
    mockFetch(new Response(null, { status: 200 }));

    // Using the async variant to catch the post result
    await new Promise<void>((resolve) => {
      emitToGUI(
        { agentId: 12, eventType: "complete", station: "deploy", message: "Push complete" },
        { webhookUrl: "http://test/api/pipe", timeout: 500 },
      );
      // Give fire-and-forget a tick to execute
      setTimeout(resolve, 50);
    });

    expect(lastPostedBody).not.toBeNull();
    const parsed = JSON.parse(lastPostedBody!);
    expect(parsed.agentId).toBe(12);
    expect(parsed.eventType).toBe("complete");
    expect(parsed.message).toBe("Push complete");

    restoreFetch();
  });

  it("never throws even when fetch is completely broken", () => {
    // Simulate total network failure
    globalThis.fetch = async () => {
      throw new Error("ENOTFOUND");
    };

    expect(() =>
      emitToGUI({ agentId: 1 }, { webhookUrl: "http://nonexistent.example/api/pipe", timeout: 10 }),
    ).not.toThrow();

    restoreFetch();
  });
});
