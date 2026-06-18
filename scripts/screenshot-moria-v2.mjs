import { chromium } from '../node_modules/.pnpm/playwright-core@1.60.0/node_modules/playwright-core/index.mjs';

const EXE = '/root/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell';

const browser = await chromium.launch({ headless: true, executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

console.log('Loading dashboard...');
await page.goto('http://localhost:3099/', { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForTimeout(1000);

// Check if theme loaded
const themeData = await page.evaluate(() => window.currentTheme?.name);
console.log('Active theme:', themeData || 'NOT SET');

// Check background images on panels
const bgCount = await page.evaluate(() => {
  return document.querySelectorAll('.station-panel.has-background').length;
});
console.log('Panels with backgrounds:', bgCount);

// Check sprites
const spriteCount = await page.evaluate(() => {
  return document.querySelectorAll('.sprite.idle, .sprite.working').length;
});
console.log('Sprite elements:', spriteCount);

// Check sprite background-image
const spriteSources = await page.evaluate(() => {
  return [...document.querySelectorAll('.sprite')].slice(0, 3).map(s => s.style.backgroundImage);
});
console.log('Sprite sources (first 3):', spriteSources);

// Select Moria theme explicitly
await page.waitForSelector('#theme-select', { timeout: 5000 });
await page.selectOption('#theme-select', 'moria-dwarves');
await page.waitForTimeout(3000);

// Check after theme switch
const themeData2 = await page.evaluate(() => window.currentTheme?.name);
console.log('Active theme after switch:', themeData2 || 'NOT SET');

// Force station render by dispatching a test event
await page.evaluate(() => {
  for (let i = 1; i <= 12; i++) {
    const ev = {
      eventId: 'test-' + i,
      agentId: i,
      agentName: 'Dwarf ' + i,
      eventType: 'started',
      station: 'council-chamber',
      payload: { test: true }
    };
    window.handlePipelineEvent?.(ev);
  }
});
await page.waitForTimeout(1500);

// Re-check sprites after events
const spriteCount2 = await page.evaluate(() => document.querySelectorAll('.sprite').length);
console.log('Sprites after events:', spriteCount2);

const spriteSources2 = await page.evaluate(() => {
  return [...document.querySelectorAll('.sprite')].slice(0, 3).map(s => ({
    image: s.style.backgroundImage,
    size: s.style.backgroundSize,
    className: s.className
  }));
});
console.log('Sprite details (first 3):', JSON.stringify(spriteSources2, null, 2));

// Full dashboard screenshot
await page.screenshot({ path: '/root/Machine/screenshots/moria-v2-dashboard.png', fullPage: true });
console.log('✓ moria-v2-dashboard.png');

// Close-up: council-chamber panel
const panel = await page.$('#stations-view .station-panel:first-child');
if (panel) {
  await panel.screenshot({ path: '/root/Machine/screenshots/moria-v2-panel-closeup.png' });
  console.log('✓ moria-v2-panel-closeup.png');
}

// Agent badge close-up
const badge = await page.$('.agent-badge');
if (badge) {
  await badge.screenshot({ path: '/root/Machine/screenshots/moria-v2-badge.png' });
  console.log('✓ moria-v2-badge.png');
}

// Builder page
await page.goto('http://localhost:3099/builder', { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForTimeout(1000);
await page.screenshot({ path: '/root/Machine/screenshots/moria-v2-builder.png', fullPage: true });
console.log('✓ moria-v2-builder.png');

await browser.close();
console.log('\nDone.');
