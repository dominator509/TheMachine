import { startGuiServer, stopGuiServer } from "/root/Machine/packages/service/dist/index.js";
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const PORT = 3099;
const HOST = "127.0.0.1";
const BASE = "http://" + HOST + ":" + PORT;
const OUT = "/tmp/theme-screenshots/";
mkdirSync(OUT, { recursive: true });

const server = startGuiServer({ port: PORT, host: HOST });
console.log("Server started on port", PORT);

const browser = await chromium.launch({
  headless: true,
  executablePath: "/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// 1. Dashboard - default theme (use 'domcontentloaded', SSE keeps networkidle from ever firing)
console.log("Loading dashboard...");
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 10000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: OUT + "01-dashboard-default.png", fullPage: false });
console.log("Screenshot: dashboard default");

// 2. Cycle through each theme
const themes = ["fft-chibi", "hobbiton", "moria-dwarves", "shark-tank"];
for (const theme of themes) {
  console.log("Switching to theme: " + theme);
  try {
    await page.selectOption("#theme-picker", theme);
  } catch (e) {
    console.log("  selectOption failed, trying direct eval");
    await page.evaluate((t) => {
      const sel = document.getElementById("theme-picker");
      if (sel) {
        sel.value = t;
        sel.dispatchEvent(new Event("change"));
      }
    }, theme);
  }
  await page.waitForTimeout(1000);
  await page.screenshot({ path: OUT + "02-dashboard-" + theme + ".png", fullPage: false });
  console.log("Screenshot: dashboard " + theme);
}

// 3. Builder page
console.log("Loading builder...");
await page.goto(BASE + "/builder", { waitUntil: "domcontentloaded", timeout: 10000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: OUT + "03-builder.png", fullPage: false });
console.log("Screenshot: builder");

await browser.close();
stopGuiServer(server);
console.log("Done");
