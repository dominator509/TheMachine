// Non-destructive smoke test for the capability-scoped dashboard and builder.
import {
  getGuiServerAccess,
  startGuiServer,
  stopGuiServer,
} from "../packages/service/dist/index.js";

const PORT = 3098;
const BASE = `http://127.0.0.1:${PORT}`;
startGuiServer({
  port: PORT,
  host: "127.0.0.1",
  viewerToken: "smoke-viewer-capability",
  eventToken: "smoke-producer-capability",
});

let passed = 0;
let failed = 0;

async function test(label, fn) {
  try {
    await fn();
    console.log("  \x1b[32m✓\x1b[0m", label);
    passed += 1;
  } catch (error) {
    console.log(
      "  \x1b[31m✗\x1b[0m",
      `${label}:`,
      error instanceof Error ? error.message : String(error),
    );
    failed += 1;
  }
}

function cookie(response) {
  const value = response.headers.get("set-cookie");
  if (!value) throw new Error("viewer session cookie missing");
  return value.split(";", 1)[0];
}

setTimeout(async () => {
  console.log("\nSmoke testing GUI server:\n");
  const access = getGuiServerAccess();
  if (!access) throw new Error("GUI access capabilities unavailable");

  await test("plain GET / is denied without a launch capability", async () => {
    const response = await fetch(`${BASE}/`);
    if (response.status !== 403) throw new Error(`expected 403, got ${response.status}`);
  });

  const dashboard = await fetch(access.dashboardUrl);
  const viewerCookie = cookie(dashboard);

  await test("launch URL returns the dashboard", async () => {
    if (dashboard.status !== 200) throw new Error(`status ${dashboard.status}`);
    const html = await dashboard.text();
    if (!html.includes("War Council") || !html.includes("</html>")) {
      throw new Error("dashboard HTML is incomplete");
    }
  });

  await test("session cookie opens the builder", async () => {
    const response = await fetch(`${BASE}/builder`, { headers: { Cookie: viewerCookie } });
    if (response.status !== 200) throw new Error(`status ${response.status}`);
    const html = await response.text();
    if (!html.includes("Animated GUI Builder") || !html.includes("</html>")) {
      throw new Error("builder HTML is incomplete");
    }
  });

  await test("viewer session reads the theme registry", async () => {
    const response = await fetch(`${BASE}/api/themes`, { headers: { Cookie: viewerCookie } });
    if (response.status !== 200) throw new Error(`status ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.themes) || data.themes.length < 4) {
      throw new Error("built-in theme registry is incomplete");
    }
  });

  await test("producer capability publishes a pipeline event", async () => {
    const response = await fetch(access.eventWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${access.eventToken}`,
      },
      body: JSON.stringify({
        eventId: "smoke-1",
        agentId: 3,
        eventType: "progress",
        station: "coding",
        metrics: { message: "compiling" },
      }),
    });
    if (response.status !== 200) throw new Error(`status ${response.status}`);
  });

  console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed}\n`);
  stopGuiServer();
  process.exit(failed > 0 ? 1 : 0);
}, 600);
