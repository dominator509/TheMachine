#!/usr/bin/env node
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  
  const host = '127.0.0.1';
  const port = 3099;
  
  // Load dashboard
  await page.goto(`http://${host}:${port}/`, { waitUntil: 'networkidle', timeout: 10000 });
  
  // Switch to moria-dwarves theme
  await page.selectOption('#theme-picker', 'moria-dwarves');
  await page.waitForTimeout(1500);
  
  // Post pipeline events to populate agents
  const stations = ['council-chamber','great-forge','rune-archives','testing-cavern','durins-gate','bridge','great-gates','mithril-treasury','drum-chamber','supply-depot'];
  for (let i = 0; i < 24; i++) {
    const station = stations[i % 10];
    await page.evaluate(({i, station}) => {
      fetch('/api/pipeline-event', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ eventId: 'e'+i, agentId: i+1, eventType: 'agent-assigned', station: station, payload: { msg: 'idle' } })
      });
    }, {i, station});
  }
  await page.waitForTimeout(1000);
  
  // Check if sprites are visible
  const spriteCount = await page.evaluate(() => document.querySelectorAll('.sprite').length);
  console.log('Sprites found:', spriteCount);
  
  // Check sprite bg images
  const spriteInfo = await page.evaluate(() => {
    const sprites = document.querySelectorAll('.sprite');
    return Array.from(sprites).slice(0, 5).map(s => {
      const bg = getComputedStyle(s).backgroundImage;
      const natural = s.naturalWidth || 'N/A';
      return { bg: bg.substring(0, 80), classes: s.className };
    });
  });
  console.log('Sprite info:', JSON.stringify(spriteInfo, null, 2));
  
  // Check console errors
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  
  // Take screenshot
  await page.screenshot({ path: '/tmp/dashboard-moria.png', fullPage: false });
  console.log('Screenshot saved to /tmp/dashboard-moria.png');
  
  if (errors.length > 0) console.log('Console errors:', errors);
  
  await browser.close();
  console.log('Done');
})();
