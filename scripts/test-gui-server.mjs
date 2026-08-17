// Live integration test for the capability-scoped GUI server.
import {
  getGuiServerAccess,
  startGuiServer,
  stopGuiServer,
} from "../packages/service/dist/index.js";

const PORT = 3099;
const BASE = `http://127.0.0.1:${PORT}`;
startGuiServer({
  port: PORT,
  host: "127.0.0.1",
  viewerToken: "gui-test-viewer",
  eventToken: "gui-test-producer",
});

let passed = 0;
let failed = 0;

async function test(label, fn) {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
    passed += 1;
  } catch (error) {
    console.log(`  ✗ ${label}: ${error instanceof Error ? error.message : String(error)}`);
    failed += 1;
  }
}

function sessionCookie(response) {
  const cookie = response.headers.get("set-cookie");
  if (!cookie) throw new Error("bootstrap did not set a session cookie");
  return cookie.split(";", 1)[0];
}

setTimeout(async () => {
  console.log("\nTesting GUI server endpoints:\n");
  const access = getGuiServerAccess();
  if (!access) throw new Error("GUI capabilities unavailable");

  await test("unauthenticated API reads are denied", async () => {
    const response = await fetch(`${BASE}/api/themes`);
    if (response.status !== 403) throw new Error(`expected 403, got ${response.status}`);
  });

  const bootstrap = await fetch(access.dashboardUrl);
  const cookie = sessionCookie(bootstrap);

  await test("viewer bootstrap returns dashboard and establishes a session", async () => {
    if (bootstrap.status !== 200) throw new Error(`status ${bootstrap.status}`);
    if (!(await bootstrap.text()).includes("War Council")) throw new Error("missing dashboard");
  });

  await test("authenticated theme list is available", async () => {
    const response = await fetch(`${BASE}/api/themes`, { headers: { Cookie: cookie } });
    if (response.status !== 200) throw new Error(`status ${response.status}`);
    const body = await response.json();
    if (!Array.isArray(body.themes) || body.themes.length < 4) {
      throw new Error("expected the built-in themes");
    }
  });

  await test("event injection without a producer capability is denied", async () => {
    const response = await fetch(`${BASE}/api/pipeline-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "unauthorized" }),
    });
    if (response.status !== 403) throw new Error(`expected 403, got ${response.status}`);
  });

  await test("event producer capability publishes a valid event", async () => {
    const response = await fetch(access.eventWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${access.eventToken}`,
      },
      body: JSON.stringify({
        eventId: "test-1",
        agentId: 5,
        eventType: "progress",
        station: "coding",
        metrics: {},
      }),
    });
    if (response.status !== 200) throw new Error(`status ${response.status}`);
  });

  await test("invalid JSON remains a client error after authentication", async () => {
    const response = await fetch(access.eventWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${access.eventToken}`,
      },
      body: "not json",
    });
    if (response.status !== 400) throw new Error(`expected 400, got ${response.status}`);
  });

  console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed}\n`);
  stopGuiServer();
  process.exit(failed > 0 ? 1 : 0);
}, 500);
