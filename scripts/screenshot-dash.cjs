const pw = require("playwright");

(async () => {
  let browser;
  try {
    browser = await pw.chromium.launch({
      headless: true,
      executablePath: "/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome",
      args: ["--no-sandbox", "--disable-gpu", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    // Capture errors
    page.on("pageerror", (err) => console.log("  PAGE ERROR:", err.message.substring(0, 200)));
    page.on("requestfailed", (req) =>
      console.log(
        "  REQ FAIL:",
        req.url().substring(0, 100),
        "—",
        req.failure()?.errorText?.substring(0, 50),
      ),
    );

    await page.goto("http://127.0.0.1:3099/", { waitUntil: "domcontentloaded", timeout: 10000 });
    console.log("Page loaded");

    // Wait for theme list fetch to complete
    await page.waitForTimeout(2000);

    // Switch to moria-dwarves theme
    await page.selectOption("#theme-select", "moria-dwarves");
    console.log("Switched to moria-dwarves");
    await page.waitForTimeout(3000);

    // Check rendered state
    const state = await page.evaluate(() => {
      const panels = document.querySelectorAll(".station-panel");
      const badges = document.querySelectorAll(".agent-badge");
      const sprites = document.querySelectorAll(".agent-badge .sprite");

      const panelInfo = Array.from(panels)
        .slice(0, 3)
        .map((p) => {
          const header = p.querySelector(".station-name")?.textContent;
          const slots = p.querySelector(".station-slots");
          const hasBadges = slots?.querySelectorAll(".agent-badge").length || 0;
          const bgStyle = p.style.backgroundImage;
          return { header, hasBadges, bgStyle: bgStyle.substring(0, 60) };
        });

      const spriteInfo = Array.from(sprites)
        .slice(0, 5)
        .map((s) => {
          const cs = getComputedStyle(s);
          return {
            bg: cs.backgroundImage.substring(0, 80),
            bgSize: cs.backgroundSize,
            pos: cs.backgroundPosition,
            dims: s.offsetWidth + "x" + s.offsetHeight,
            visible: s.offsetWidth > 0 && cs.backgroundImage !== "none",
          };
        });

      return {
        panels: panels.length,
        badges: badges.length,
        sprites: sprites.length,
        panelInfo,
        spriteInfo,
      };
    });
    console.log("State:", JSON.stringify(state, null, 2));

    // Screenshots
    await page.screenshot({ path: "/tmp/dashboard-view.png" });
    console.log("View screenshot saved");

    await page.screenshot({ path: "/tmp/dashboard-full.png", fullPage: true });
    console.log("Full screenshot saved");
  } catch (e) {
    console.error("ERROR:", e.message);
  } finally {
    if (browser) await browser.close();
    console.log("Done");
  }
})();
