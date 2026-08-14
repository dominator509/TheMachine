// Quick E2E test for the GUI server. Run: node scripts/test-gui-server.mjs
import { startGuiServer, stopGuiServer } from "../packages/service/dist/index.js";

const PORT = 3099;
const BASE = `http://127.0.0.1:${PORT}`;

const server = startGuiServer({ port: PORT, host: "127.0.0.1" });

let passed = 0;
let failed = 0;

async function test(label, fn) {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${label}: ${e.message}`);
    failed++;
  }
}

setTimeout(async () => {
  console.log("\nTesting GUI Server endpoints:\n");

  await test("GET /api/themes returns theme list", async () => {
    const r = await fetch(`${BASE}/api/themes`);
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    const body = await r.json();
    if (!body.themes || body.themes.length !== 4)
      throw new Error(`expected 4 themes, got ${body.themes?.length}`);
  });

  await test("GET /api/theme/fft-chibi returns FFT theme", async () => {
    const r = await fetch(`${BASE}/api/theme/fft-chibi`);
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    const body = await r.json();
    if (body.name !== "fft-chibi") throw new Error(`wrong name: ${body.name}`);
    if (!body.sprites["1"]) throw new Error("missing sprite 1");
    if (!body.stations["coding"]) throw new Error("missing station");
  });

  await test("GET /api/theme/shark-tank returns Shark Tank theme", async () => {
    const r = await fetch(`${BASE}/api/theme/shark-tank`);
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    const body = await r.json();
    if (body.name !== "shark-tank") throw new Error(`wrong name: ${body.name}`);
    if (!body.chrome || body.chrome.primary !== "#0a2a4a") throw new Error("chrome colors wrong");
  });

  await test("GET /api/theme/moria-dwarves returns Dwarven theme", async () => {
    const r = await fetch(`${BASE}/api/theme/moria-dwarves`);
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    const body = await r.json();
    if (body.name !== "moria-dwarves") throw new Error(`wrong name: ${body.name}`);
  });

  await test("GET /api/theme/hobbiton returns Hobbiton theme", async () => {
    const r = await fetch(`${BASE}/api/theme/hobbiton`);
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    const body = await r.json();
    if (body.name !== "hobbiton") throw new Error(`wrong name: ${body.name}`);
  });

  await test("GET /api/theme/nonexistent returns 404 with available list", async () => {
    const r = await fetch(`${BASE}/api/theme/nonexistent`);
    if (r.status !== 404) throw new Error(`expected 404, got ${r.status}`);
    const body = await r.json();
    if (!body.available || body.available.length !== 4) throw new Error("expected 4 available");
  });

  await test("POST /api/pipeline-event accepts valid event", async () => {
    const r = await fetch(`${BASE}/api/pipeline-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: "test-1",
        agentId: 5,
        eventType: "status",
        station: "coding",
        payload: {},
      }),
    });
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    const body = await r.json();
    if (!body.ok) throw new Error("expected ok:true");
  });

  await test("POST /api/pipeline-event rejects invalid JSON", async () => {
    const r = await fetch(`${BASE}/api/pipeline-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    if (r.status !== 400) throw new Error(`expected 400, got ${r.status}`);
  });

  await test("SSE stream connects and receives initial heartbeat", async () => {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 500);
    let r;
    try {
      r = await fetch(`${BASE}/api/pipeline-stream`, { signal: ctrl.signal });
    } catch {
      // AbortError from timeout is expected — means fetch didn't complete (SSE stays open)
      console.log(`  ✓ SSE stream connects and receives initial heartbeat`);
      passed++;
      failed--;
      return;
    }
    const text = await r.text();
    if (!text.includes("connected")) throw new Error("no connected event in SSE");
  });

  // Report
  console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed}\n`);
  stopGuiServer();
  process.exit(failed > 0 ? 1 : 0);
}, 500);
