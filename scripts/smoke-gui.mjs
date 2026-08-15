// Integration smoke test for dashboard + builder
// Run: node scripts/smoke-gui.mjs
import { startGuiServer, stopGuiServer, listThemes } from "../packages/service/dist/index.js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const PORT = 3098;
const BASE = `http://127.0.0.1:${PORT}`;

const server = startGuiServer({ port: PORT, host: "127.0.0.1" });

let passed = 0;
let failed = 0;

function ok(label) {
  console.log("  \x1b[32m✓\x1b[0m", label);
  passed++;
}
function fail(label, msg) {
  console.log("  \x1b[31m✗\x1b[0m", label + ":", msg);
  failed++;
}

async function test(label, fn) {
  try {
    await fn();
    ok(label);
  } catch (e) {
    fail(label, e.message);
  }
}

setTimeout(async () => {
  console.log("\nSmoke Testing GUI Server:\n");

  // 1. Dashboard HTML
  await test("GET / returns dashboard HTML", async () => {
    const r = await fetch(BASE + "/");
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    const html = await r.text();
    if (!html.includes("War Council")) throw new Error("missing title");
    if (!html.includes("</html>")) throw new Error("incomplete HTML");
  });

  // 2. Builder HTML
  await test("GET /builder returns builder HTML", async () => {
    const r = await fetch(BASE + "/builder");
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    const html = await r.text();
    if (!html.includes("Animated GUI Builder")) throw new Error("missing title");
    if (!html.includes("</html>")) throw new Error("incomplete HTML");
  });

  // 3. Theme list API
  await test("GET /api/themes returns 4 themes", async () => {
    const r = await fetch(BASE + "/api/themes");
    const data = await r.json();
    if (data.themes.length !== 4) throw new Error(`expected 4, got ${data.themes.length}`);
  });

  // 4. Individual theme API
  await test("GET /api/theme/fft-chibi returns valid theme JSON", async () => {
    const r = await fetch(BASE + "/api/theme/fft-chibi");
    const t = await r.json();
    if (t.name !== "fft-chibi") throw new Error("wrong name");
    if (!t.chrome || !t.stations || !t.sprites) throw new Error("missing sections");
  });

  // 5. Save theme
  await test("POST /api/save-theme creates theme file", async () => {
    const testTheme = {
      name: "smoke-test-theme",
      label: "Smoke Test",
      description: "Auto-created by smoke test",
      style: "custom",
      version: "1.0.0",
      chrome: { primary: "#111", secondary: "#0f0", text: "#fff", panel: "rgba(0,0,0,0.8)" },
      stations: {
        "smoke-station": {
          name: "Smoke",
          gridCols: 4,
          gridRows: 2,
          tileSize: 32,
          slots: [{ col: 0, row: 0 }],
        },
      },
      sprites: { 1: { name: "Test Agent", defaultState: "idle", scale: 1.0 } },
    };
    const r = await fetch(BASE + "/api/save-theme", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testTheme),
    });
    const data = await r.json();
    if (!data.ok) throw new Error(`save failed: ${data.error}`);
  });

  await test("Saved theme is now loadable", async () => {
    const r = await fetch(BASE + "/api/theme/smoke-test-theme");
    const t = await r.json();
    if (t.name !== "smoke-test-theme") throw new Error("not loadable");
  });

  // Cleanup the test theme
  try {
    const { unlinkSync } = await import("node:fs");
    unlinkSync("/root/Machine/packages/service/src/gui/themes/smoke-test-theme.json");
  } catch {}

  // 6. Pipeline event POST
  await test("POST /api/pipeline-event accepts valid event", async () => {
    const r = await fetch(BASE + "/api/pipeline-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: "s1",
        agentId: 3,
        eventType: "status",
        station: "coding",
        payload: { msg: "compiling" },
      }),
    });
    const data = await r.json();
    if (!data.ok) throw new Error("not ok");
  });

  // 7. Verify dashboard source file exists
  await test("dashboard.html exists in source", () => {
    if (!existsSync(resolve("/root/Machine/packages/service/src/gui/dashboard.html")))
      throw new Error("file missing");
  });

  await test("builder.html exists in source", () => {
    if (!existsSync(resolve("/root/Machine/packages/service/src/gui/builder.html")))
      throw new Error("file missing");
  });

  // Report
  console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed}\n`);
  stopGuiServer();
  process.exit(failed > 0 ? 1 : 0);
}, 600);
