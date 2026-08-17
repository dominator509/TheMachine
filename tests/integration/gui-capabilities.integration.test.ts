import { afterEach, describe, expect, it } from "vitest";
import {
  getGuiServerAccess,
  startGuiServer,
  stopGuiServer,
} from "@the-machine/service";

async function listening(server: ReturnType<typeof startGuiServer>): Promise<void> {
  if (server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
}

function cookieFrom(response: Response): string {
  const header = response.headers.get("set-cookie");
  if (!header) throw new Error("bootstrap response did not establish a viewer session");
  return header.split(";", 1)[0] ?? header;
}

afterEach(() => {
  stopGuiServer();
});

describe("GUI capability boundary", () => {
  it("requires bootstrap, viewer-session, and event-producer capabilities", async () => {
    const port = 35_000 + Math.floor(Math.random() * 10_000);
    const base = `http://127.0.0.1:${String(port)}`;
    const server = startGuiServer({
      port,
      host: "127.0.0.1",
      viewerToken: "viewer-test-capability",
      eventToken: "producer-test-capability",
    });
    await listening(server);
    const access = getGuiServerAccess();
    expect(access).not.toBeNull();

    expect((await fetch(`${base}/`)).status).toBe(403);
    expect((await fetch(`${base}/api/themes`)).status).toBe(403);
    expect((await fetch(`${base}/api/pipeline-stream`)).status).toBe(403);

    const bootstrap = await fetch(access?.dashboardUrl ?? "");
    expect(bootstrap.status).toBe(200);
    const cookie = cookieFrom(bootstrap);
    expect(cookie).toMatch(/^machine_session=/);

    const themes = await fetch(`${base}/api/themes`, { headers: { Cookie: cookie } });
    expect(themes.status).toBe(200);

    const noProducer = await fetch(`${base}/api/pipeline-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "unauthorized" }),
    });
    expect(noProducer.status).toBe(403);

    const wrongProducer = await fetch(`${base}/api/pipeline-event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer wrong",
      },
      body: JSON.stringify({ eventId: "wrong" }),
    });
    expect(wrongProducer.status).toBe(403);

    const crossOrigin = await fetch(`${base}/api/pipeline-event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer producer-test-capability",
        Origin: "https://attacker.example",
        "Sec-Fetch-Site": "cross-site",
      },
      body: JSON.stringify({ eventId: "cross-origin" }),
    });
    expect(crossOrigin.status).toBe(403);

    const accepted = await fetch(`${base}/api/pipeline-event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer producer-test-capability",
      },
      body: JSON.stringify({ eventId: "accepted", type: "progress" }),
    });
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({ ok: true, eventId: "accepted" });
  });
});
