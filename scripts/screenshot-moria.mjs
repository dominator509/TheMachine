import { chromium } from '../node_modules/.pnpm/playwright-core@1.60.0/node_modules/playwright-core/index.mjs';

const browser = await chromium.launch({
  headless: true,
  executablePath: '/root/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

console.log('Loading dashboard...');
await page.goto('http://localhost:3099/', { waitUntil: 'domcontentloaded', timeout: 15000 });
console.log('Loaded.');

await page.waitForSelector('#theme-select', { timeout: 5000 });
await page.selectOption('#theme-select', 'moria-dwarves');
await page.waitForTimeout(3000);

await page.screenshot({ path: '/root/Machine/screenshots/moria-dashboard.png', fullPage: true });
console.log('✓ moria-dashboard.png');

const stationPanels = await page.$$('.station-panel');
if (stationPanels.length > 0) {
  await stationPanels[0].screenshot({ path: '/root/Machine/screenshots/moria-station-closeup.png' });
  console.log('✓ moria-station-closeup.png');
}

await page.goto('http://localhost:3099/builder', { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForTimeout(1000);
await page.screenshot({ path: '/root/Machine/screenshots/moria-builder.png', fullPage: true });
console.log('✓ moria-builder.png');

await browser.close();
console.log('Done.');
