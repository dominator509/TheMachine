#!/usr/bin/env node
/** Generate 10 Moria station backdrops with Sharp — 800×500 */
import sharp from 'sharp';
import { mkdirSync } from 'fs';

const OUT = '/root/Machine/packages/service/src/gui/themes/moria-dwarves/backgrounds';
const W = 800, H = 500;

mkdirSync(OUT, { recursive: true });

// Helper: create base stone texture
function makeStoneTexture(w, h, baseColor, variation) {
  const pixels = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const noise = (Math.random() - 0.5) * variation;
      pixels[i] = Math.min(255, Math.max(0, baseColor[0] + noise));
      pixels[i + 1] = Math.min(255, Math.max(0, baseColor[1] + noise));
      pixels[i + 2] = Math.min(255, Math.max(0, baseColor[2] + noise));
      pixels[i + 3] = 255;
    }
  }
  return sharp(pixels, { raw: { width: w, height: h, channels: 4 } }).png();
}

// Helper: composite torch glow
async function addTorchGlow(base, x, y, radius, intensity) {
  const glow = makeGlow(radius, intensity);
  // Use overlay via SVG
  const svg = `<svg width="${W}" height="${H}">
    <defs>
      <radialGradient id="t${x}${y}">
        <stop offset="0%" stop-color="rgba(255,180,60,0.9)"/>
        <stop offset="40%" stop-color="rgba(255,140,30,0.5)"/>
        <stop offset="100%" stop-color="rgba(255,100,10,0)"/>
      </radialGradient>
    </defs>
    <circle cx="${x}" cy="${y}" r="${radius}" fill="url(#t${x}${y})"/>
  </svg>`;
  const glowBuf = await sharp(Buffer.from(svg)).resize(W, H).png().toBuffer();
  return sharp(await base.toBuffer()).composite([{ input: glowBuf, blend: 'screen' }]);
}

function makeGlow(radius, intensity) {
  const s = radius * 2;
  const r = radius;
  const pixels = Buffer.alloc(s * s * 4);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const i = (y * s + x) * 4;
      const dx = x - r, dy = y - r;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const alpha = dist <= r ? (1 - dist / r) * intensity * 255 : 0;
      pixels[i] = 255;     // R
      pixels[i + 1] = 140 + Math.floor(alpha * 0.3); // G
      pixels[i + 2] = 20;  // B
      pixels[i + 3] = Math.floor(alpha);
    }
  }
  return sharp(pixels, { raw: { width: s, height: s, channels: 4 } }).png();
}

async function renderStoneWall(baseColor = [60, 50, 40], brickW = 80, brickH = 30) {
  // Generate a brick wall texture with grout lines
  const svgParts = [];
  let y = 0, row = 0;
  while (y < H) {
    const offset = row % 2 === 0 ? 0 : brickW / 2;
    let x = -brickW + Math.floor(offset);
    while (x < W + brickW) {
      const bx = Math.max(0, x);
      const bw = brickW - (bx - x) - Math.max(0, x + brickW - W);
      const by = y;
      const bh = Math.min(brickH, H - y);
      const shade = baseColor.map(c => Math.min(255, Math.max(0, c + (Math.random() - 0.5) * 25)));
      svgParts.push(`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="rgb(${shade[0]},${shade[1]},${shade[2]})" rx="2"/>`);
      x += brickW + 2;
    }
    y += brickH + 2;
    row++;
  }
  const svg = `<svg width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#1a1410"/>${svgParts.join('')}</svg>`;
  return sharp(Buffer.from(svg)).png();
}

// ==================================================================
// 1. COUNCIL CHAMBER — grand hall with pillars, throne, torches
// ==================================================================
async function renderCouncilChamber() {
  // Pillars
  const svg = `<svg width="${W}" height="${H}">
    <defs>
      <linearGradient id="pillar" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#3a3028"/>
        <stop offset="50%" stop-color="#6b5a48"/>
        <stop offset="100%" stop-color="#3a3028"/>
      </linearGradient>
      <radialGradient id="torch1"><stop offset="0%" stop-color="rgba(255,180,50,0.95)"/><stop offset="50%" stop-color="rgba(255,130,20,0.3)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></radialGradient>
      <radialGradient id="torch2"><stop offset="0%" stop-color="rgba(255,180,50,0.95)"/><stop offset="50%" stop-color="rgba(255,130,20,0.3)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="#1a1410"/>
    <!-- Floor -->
    <rect x="0" y="340" width="${W}" height="160" fill="#2a2018"/>
    <rect x="0" y="340" width="${W}" height="3" fill="#4a3a28"/>
    <!-- Left pillar -->
    <rect x="100" y="80" width="60" height="270" fill="url(#pillar)" rx="4"/>
    <rect x="110" y="70" width="40" height="20" fill="#4a3a28" rx="2"/>
    <rect x="110" y="350" width="40" height="20" fill="#4a3a28" rx="2"/>
    <!-- Right pillar -->
    <rect x="640" y="80" width="60" height="270" fill="url(#pillar)" rx="4"/>
    <rect x="650" y="70" width="40" height="20" fill="#4a3a28" rx="2"/>
    <rect x="650" y="350" width="40" height="20" fill="#4a3a28" rx="2"/>
    <!-- Throne -->
    <rect x="340" y="220" width="120" height="130" fill="#3a2818" rx="4"/>
    <rect x="360" y="200" width="80" height="40" fill="#5a4030" rx="3"/>
    <rect x="380" y="180" width="40" height="30" fill="#6b5040" rx="2"/>
    <!-- Torches on pillars -->
    <circle cx="130" cy="120" r="50" fill="url(#torch1)"/>
    <circle cx="670" cy="120" r="50" fill="url(#torch2)"/>
    <circle cx="130" cy="120" r="8" fill="#ffcc44"/>
    <circle cx="670" cy="120" r="8" fill="#ffcc44"/>
    <!-- Archway -->
    <path d="M 50,350 Q 50,20 400,20 Q 750,20 750,350" fill="none" stroke="#4a3828" stroke-width="8"/>
    <!-- Floor stones -->
    <line x1="0" y1="380" x2="800" y2="380" stroke="#3a3020" stroke-width="1"/>
    <line x1="0" y1="420" x2="800" y2="420" stroke="#3a3020" stroke-width="1"/>
    <line x1="0" y1="460" x2="800" y2="460" stroke="#3a3020" stroke-width="1"/>
    <line x1="200" y1="345" x2="220" y2="495" stroke="#3a3020" stroke-width="1"/>
    <line x1="400" y1="345" x2="400" y2="495" stroke="#3a3020" stroke-width="1"/>
    <line x1="600" y1="345" x2="595" y2="495" stroke="#3a3020" stroke-width="1"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toFile(`${OUT}/council-chamber.png`);
}

// 2. GREAT FORGE — anvils, fire glow, stone fireplaces
async function renderGreatForge() {
  const svg = `<svg width="${W}" height="${H}">
    <defs>
      <radialGradient id="forge1"><stop offset="0%" stop-color="rgba(255,100,20,0.9)"/><stop offset="60%" stop-color="rgba(200,40,0,0.3)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></radialGradient>
      <radialGradient id="forge2"><stop offset="0%" stop-color="rgba(255,100,20,0.9)"/><stop offset="60%" stop-color="rgba(200,40,0,0.3)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></radialGradient>
      <radialGradient id="forge3"><stop offset="0%" stop-color="rgba(255,100,20,0.9)"/><stop offset="60%" stop-color="rgba(200,40,0,0.3)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="#181210"/>
    <!-- Stone walls -->
    <rect x="10" y="10" width="780" height="230" fill="#2a2018" rx="10"/>
    <rect x="20" y="20" width="760" height="210" fill="#1e1812"/>
    <!-- Three forge stations -->
    <rect x="50" y="260" width="180" height="120" fill="#3a2815" rx="6"/> <!-- forge body left -->
    <rect x="330" y="260" width="180" height="120" fill="#3a2815" rx="6"/> <!-- center -->
    <rect x="570" y="260" width="180" height="120" fill="#3a2815" rx="6"/> <!-- right -->
    <!-- Anvils -->
    <rect x="80" y="290" width="120" height="20" fill="#5a5a5a" rx="3"/>
    <rect x="100" y="310" width="40" height="30" fill="#4a4a4a"/>
    <rect x="120" y="295" width="15" height="15" fill="#666"/>
    <rect x="360" y="290" width="120" height="20" fill="#5a5a5a" rx="3"/>
    <rect x="380" y="310" width="40" height="30" fill="#4a4a4a"/>
    <rect x="400" y="295" width="15" height="15" fill="#666"/>
    <rect x="600" y="290" width="120" height="20" fill="#5a5a5a" rx="3"/>
    <rect x="620" y="310" width="40" height="30" fill="#4a4a4a"/>
    <rect x="640" y="295" width="15" height="15" fill="#666"/>
    <!-- Fire glow -->
    <circle cx="140" cy="230" r="90" fill="url(#forge1)"/>
    <circle cx="420" cy="230" r="90" fill="url(#forge2)"/>
    <circle cx="660" cy="230" r="90" fill="url(#forge3)"/>
    <!-- Fire source points -->
    <circle cx="140" cy="235" r="12" fill="#ff8822"/>
    <circle cx="420" cy="235" r="12" fill="#ff8822"/>
    <circle cx="660" cy="235" r="12" fill="#ff8822"/>
    <!-- Sparks -->
    <circle cx="130" cy="210" r="2" fill="#ffcc66" opacity="0.8"/>
    <circle cx="150" cy="200" r="1.5" fill="#ffcc66" opacity="0.6"/>
    <circle cx="410" cy="205" r="2" fill="#ffcc66" opacity="0.8"/>
    <circle cx="430" cy="215" r="1.5" fill="#ffcc66" opacity="0.6"/>
    <circle cx="650" cy="208" r="2" fill="#ffcc66" opacity="0.8"/>
    <circle cx="670" cy="218" r="1.5" fill="#ffcc66" opacity="0.6"/>
    <!-- Floor stones -->
    <rect x="0" y="380" width="${W}" height="120" fill="#2a2018"/>
    <line x1="0" y1="410" x2="${W}" y2="410" stroke="#3a3020" stroke-width="1"/>
    <line x1="0" y1="450" x2="${W}" y2="450" stroke="#3a3020" stroke-width="1"/>
    <!-- Tool rack -->
    <rect x="700" y="260" width="80" height="5" fill="#5a4a30"/>
    <rect x="720" y="230" width="8" height="35" fill="#666"/>
    <rect x="750" y="225" width="8" height="40" fill="#666"/>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(`${OUT}/great-forge.png`);
}

// 3. RUNE ARCHIVES — library/archives with candles, scrolls, glowing runes
async function renderRuneArchives() {
  const svg = `<svg width="${W}" height="${H}">
    <defs>
      <radialGradient id="candle1"><stop offset="0%" stop-color="rgba(255,200,80,0.9)"/><stop offset="40%" stop-color="rgba(255,150,30,0.4)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></radialGradient>
      <radialGradient id="candle2"><stop offset="0%" stop-color="rgba(255,200,80,0.9)"/><stop offset="40%" stop-color="rgba(255,150,30,0.4)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></radialGradient>
      <filter id="glow"><feGaussianBlur stdDeviation="3"/></filter>
    </defs>
    <rect width="${W}" height="${H}" fill="#181410"/>
    <!-- Bookshelves left -->
    <rect x="20" y="30" width="200" height="340" fill="#3a2818" rx="4"/>
    <rect x="30" y="40" width="180" height="8" fill="#2a1a0e"/>
    <rect x="30" y="60" width="180" height="90" fill="#2a1a0e"/>
    <rect x="30" y="165" width="180" height="90" fill="#2a1a0e"/>
    <rect x="30" y="270" width="180" height="90" fill="#2a1a0e"/>
    <!-- Books right -->
    <rect x="580" y="30" width="200" height="340" fill="#3a2818" rx="4"/>
    <rect x="590" y="40" width="180" height="8" fill="#2a1a0e"/>
    <rect x="590" y="60" width="180" height="90" fill="#2a1a0e"/>
    <rect x="590" y="165" width="180" height="90" fill="#2a1a0e"/>
    <rect x="590" y="270" width="180" height="90" fill="#2a1a0e"/>
    <!-- Center table -->
    <rect x="250" y="300" width="300" height="80" fill="#4a3020" rx="3"/>
    <rect x="260" y="310" width="280" height="60" fill="#3a2010"/>
    <!-- Scroll on table -->
    <rect x="320" y="315" width="100" height="20" fill="#ddc8a0" rx="5" opacity="0.7"/>
    <!-- Candles on table -->
    <circle cx="300" cy="290" r="30" fill="url(#candle1)"/>
    <circle cx="300" cy="290" r="4" fill="#ffcc44"/>
    <circle cx="500" cy="290" r="30" fill="url(#candle2)"/>
    <circle cx="500" cy="290" r="4" fill="#ffcc44"/>
    <!-- Glowing runes on wall -->
    <text x="340" y="120" font-family="serif" font-size="28" fill="#44ccff" filter="url(#glow)" opacity="0.7">ᚱ ᚢ ᚾ ᛖ ᛋ</text>
    <text x="310" y="160" font-family="serif" font-size="22" fill="#44ccff" filter="url(#glow)" opacity="0.5">ᛗ ᛁ ᛏ ᚺ ᚱ ᛁ ᛚ</text>
    <!-- Floor -->
    <rect x="0" y="380" width="${W}" height="120" fill="#221810"/>
    <line x1="0" y1="420" x2="${W}" y2="420" stroke="#3a2818" stroke-width="1"/>
    <line x1="0" y1="460" x2="${W}" y2="460" stroke="#3a2818" stroke-width="1"/>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(`${OUT}/rune-archives.png`);
}

// 4. TESTING CAVERN — broken pillar, target dummies, deep cave
async function renderTestingCavern() {
  const svg = `<svg width="${W}" height="${H}">
    <defs>
      <radialGradient id="crystal"><stop offset="0%" stop-color="rgba(100,200,255,0.8)"/><stop offset="50%" stop-color="rgba(50,150,220,0.3)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="#141210"/>
    <!-- Cave ceiling -->
    <path d="M0,0 L${W},0 L${W},80 Q 600,140 400,100 Q 200,140 0,80 Z" fill="#1a1614"/>
    <!-- Broken pillar -->
    <rect x="180" y="140" width="30" height="250" fill="#4a3828"/>
    <rect x="182" y="140" width="26" height="240" fill="#3a2818"/>
    <!-- pillar top (broken) -->
    <polygon points="180,140 195,110 210,140" fill="#5a4830"/>
    <!-- pillar rubble at base -->
    <rect x="170" y="390" width="20" height="15" fill="#5a4830" rx="2" transform="rotate(15,180,397)"/>
    <rect x="200" y="395" width="15" height="12" fill="#5a4830" rx="2"/>
    <!-- Target dummies -->
    <rect x="500" y="250" width="30" height="140" fill="#6a4a20"/>
    <rect x="510" y="230" width="10" height="30" fill="#7a5a30" rx="5"/>
    <circle cx="530" cy="270" r="20" fill="none" stroke="#cc4444" stroke-width="1.5" stroke-dasharray="4,4"/>
    <circle cx="530" cy="270" r="10" fill="none" stroke="#cc4444" stroke-width="1"/>
    <!-- Second dummy -->
    <rect x="620" y="260" width="30" height="130" fill="#6a4a20"/>
    <rect x="630" y="245" width="10" height="25" fill="#7a5a30" rx="5"/>
    <circle cx="650" cy="275" r="18" fill="none" stroke="#cc4444" stroke-width="1.5" stroke-dasharray="4,4"/>
    <!-- Crystal glow on wall -->
    <circle cx="700" cy="80" r="30" fill="url(#crystal)"/>
    <circle cx="700" cy="80" r="6" fill="#88ddf8"/>
    <!-- Floor -->
    <rect x="0" y="390" width="${W}" height="110" fill="#1a1410"/>
    <rect x="0" y="392" width="${W}" height="3" fill="#2a2018"/>
    <!-- Cave moss -->
    <ellipse cx="100" cy="395" rx="40" ry="8" fill="#2a3a20" opacity="0.4"/>
    <ellipse cx="350" cy="398" rx="35" ry="6" fill="#2a3a20" opacity="0.3"/>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(`${OUT}/testing-cavern.png`);
}

// 5. DURIN'S DOOR — moonlit stone doors, ivy, stars
async function renderDurinsDoor() {
  const svg = `<svg width="${W}" height="${H}">
    <defs>
      <radialGradient id="moon"><stop offset="0%" stop-color="rgba(200,220,255,0.9)"/><stop offset="60%" stop-color="rgba(150,180,220,0.3)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></radialGradient>
      <radialGradient id="doorrunes"><stop offset="0%" stop-color="rgba(180,220,255,0.8)"/><stop offset="70%" stop-color="rgba(100,160,220,0.2)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="#0a0a14"/>
    <!-- Stars -->
    <circle cx="100" cy="30" r="1.5" fill="#fff" opacity="0.7"/>
    <circle cx="300" cy="50" r="1" fill="#fff" opacity="0.5"/>
    <circle cx="550" cy="20" r="1.5" fill="#fff" opacity="0.6"/>
    <circle cx="700" cy="60" r="1" fill="#fff" opacity="0.4"/>
    <circle cx="650" cy="25" r="1" fill="#fff" opacity="0.5"/>
    <circle cx="200" cy="70" r="1" fill="#fff" opacity="0.3"/>
    <circle cx="450" cy="40" r="1.5" fill="#fff" opacity="0.6"/>
    <!-- Moon (upper right) -->
    <circle cx="650" cy="120" r="80" fill="url(#moon)"/>
    <circle cx="650" cy="120" r="25" fill="#ddeeff"/>
    <!-- Mountain silhouette at top -->
    <polygon points="0,100 150,40 300,90 450,50 600,80 720,30 800,100 800,0 0,0" fill="#0e0e1a"/>
    <!-- Cliff/rock face -->
    <polygon points="0,120 100,180 200,150 300,200 400,170 500,210 650,180 800,160 800,500 0,500" fill="#151520"/>
    <!-- Door arch -->
    <path d="M 250,500 L 250,250 Q 400,100 550,250 L 550,500" fill="#1a1a2a" stroke="#4a4a6a" stroke-width="4"/>
    <!-- Door seam -->
    <line x1="400" y1="170" x2="400" y2="500" stroke="#4a4a6a" stroke-width="2"/>
    <!-- Door runes -->
    <circle cx="400" cy="200" r="40" fill="url(#doorrunes)"/>
    <text x="370" y="210" font-family="serif" font-size="14" fill="#8899cc">ᛞᚢᚱᛁᚾ</text>
    <!-- Door rings -->
    <circle cx="340" cy="350" r="8" fill="none" stroke="#6a6a8a" stroke-width="2"/>
    <circle cx="460" cy="350" r="8" fill="none" stroke="#6a6a8a" stroke-width="2"/>
    <!-- Ivy on rock -->
    <path d="M30,200 Q60,220 40,250 Q20,280 50,310 Q30,340 60,370" fill="none" stroke="#2a4a20" stroke-width="3"/>
    <circle cx="35" cy="220" r="4" fill="#2a4a20"/>
    <circle cx="25" cy="260" r="3" fill="#2a4a20"/>
    <circle cx="45" cy="300" r="4" fill="#2a4a20"/>
    <circle cx="55" cy="345" r="3" fill="#2a4a20"/>
    <!-- Ground -->
    <rect x="0" y="470" width="${W}" height="30" fill="#141420"/>
    <!-- Moonlight reflection on ground -->
    <ellipse cx="550" cy="475" rx="200" ry="15" fill="rgba(150,180,255,0.05)"/>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(`${OUT}/durins-door.png`);
}

// 6. BRIDGE — narrow stone bridge over chasm
async function renderBridge() {
  const svg = `<svg width="${W}" height="${H}">
    <defs>
      <radialGradient id="lava"><stop offset="0%" stop-color="rgba(255,60,10,0.8)"/><stop offset="60%" stop-color="rgba(200,20,0,0.2)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></radialGradient>
    </defs>
    <!-- Chasm walls -->
    <rect x="0" y="0" width="250" height="${H}" fill="#1a1412"/>
    <rect x="550" y="0" width="250" height="${H}" fill="#1a1412"/>
    <!-- Bridge pillars -->
    <rect x="220" y="200" width="20" height="300" fill="#3a2820"/>
    <rect x="560" y="200" width="20" height="300" fill="#3a2820"/>
    <!-- Bridge span -->
    <rect x="230" y="200" width="340" height="12" fill="#4a3830"/>
    <rect x="240" y="195" width="320" height="6" fill="#5a4840"/>
    <!-- Bridge top surface -->
    <rect x="230" y="180" width="340" height="20" fill="#4a4038"/>
    <!-- Bridge stones -->
    <line x1="280" y1="180" x2="280" y2="200" stroke="#3a3028" stroke-width="1"/>
    <line x1="340" y1="180" x2="340" y2="200" stroke="#3a3028" stroke-width="1"/>
    <line x1="400" y1="180" x2="400" y2="200" stroke="#3a3028" stroke-width="1"/>
    <line x1="460" y1="180" x2="460" y2="200" stroke="#3a3028" stroke-width="1"/>
    <line x1="520" y1="180" x2="520" y2="200" stroke="#3a3028" stroke-width="1"/>
    <!-- Railing -->
    <line x1="230" y1="175" x2="570" y2="175" stroke="#3a3028" stroke-width="2"/>
    <line x1="260" y1="175" x2="260" y2="160" stroke="#3a3028" stroke-width="1.5"/>
    <line x1="320" y1="175" x2="320" y2="160" stroke="#3a3028" stroke-width="1.5"/>
    <line x1="380" y1="175" x2="380" y2="160" stroke="#3a3028" stroke-width="1.5"/>
    <line x1="440" y1="175" x2="440" y2="160" stroke="#3a3028" stroke-width="1.5"/>
    <line x1="500" y1="175" x2="500" y2="160" stroke="#3a3028" stroke-width="1.5"/>
    <line x1="560" y1="175" x2="560" y2="160" stroke="#3a3028" stroke-width="1.5"/>
    <!-- Chasm depth (+ darkness gradient) -->
    <rect x="248" y="212" width="304" height="290" fill="#0a0505"/>
    <!-- Lava far below -->
    <ellipse cx="400" cy="450" rx="120" ry="30" fill="url(#lava)" opacity="0.5"/>
    <!-- Chasm walls inside -->
    <polygon points="248,212 248,500 300,500 300,212" fill="#1a1412"/>
    <polygon points="500,212 500,500 552,500 552,212" fill="#1a1412"/>
    <!-- Spire-like rock formations on sides -->
    <polygon points="200,300 220,380 240,310" fill="#1a1412"/>
    <polygon points="560,280 580,370 600,290" fill="#1a1412"/>
    <!-- Ground on both sides -->
    <rect x="0" y="180" width="230" height="320" fill="#1a1412"/>
    <rect x="570" y="180" width="230" height="320" fill="#1a1412"/>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(`${OUT}/bridge.png`);
}

// 7. GREAT GATES — massive iron doors, guard posts
async function renderGreatGates() {
  const svg = `<svg width="${W}" height="${H}">
    <defs>
      <radialGradient id="torchg1"><stop offset="0%" stop-color="rgba(255,180,50,0.9)"/><stop offset="50%" stop-color="rgba(255,120,20,0.3)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></radialGradient>
      <radialGradient id="torchg2"><stop offset="0%" stop-color="rgba(255,180,50,0.9)"/><stop offset="50%" stop-color="rgba(255,120,20,0.3)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="#1a1816"/>
    <!-- Wall texture -->
    <rect x="0" y="0" width="${W}" height="${H}" fill="#2a2420"/>
    <!-- Gates -->
    <rect x="250" y="80" width="300" height="420" fill="#3a3030"/>
    <rect x="260" y="90" width="130" height="400" fill="#2a2020" rx="2"/> <!-- left door -->
    <rect x="410" y="90" width="130" height="400" fill="#2a2020" rx="2"/> <!-- right door -->
    <!-- Iron bands left door -->
    <rect x="260" y="140" width="130" height="10" fill="#4a4040"/>
    <rect x="260" y="230" width="130" height="10" fill="#4a4040"/>
    <rect x="260" y="320" width="130" height="10" fill="#4a4040"/>
    <rect x="260" y="410" width="130" height="10" fill="#4a4040"/>
    <!-- Iron bands right door -->
    <rect x="410" y="140" width="130" height="10" fill="#4a4040"/>
    <rect x="410" y="230" width="130" height="10" fill="#4a4040"/>
    <rect x="410" y="320" width="130" height="10" fill="#4a4040"/>
    <rect x="410" y="410" width="130" height="10" fill="#4a4040"/>
    <!-- Door studs -->
    <circle cx="282" cy="165" r="5" fill="#5a5050"/>
    <circle cx="282" cy="255" r="5" fill="#5a5050"/>
    <circle cx="282" cy="345" r="5" fill="#5a5050"/>
    <circle cx="282" cy="435" r="5" fill="#5a5050"/>
    <circle cx="432" cy="165" r="5" fill="#5a5050"/>
    <circle cx="432" cy="255" r="5" fill="#5a5050"/>
    <circle cx="432" cy="345" r="5" fill="#5a5050"/>
    <circle cx="432" cy="435" r="5" fill="#5a5050"/>
    <!-- Center seam -->
    <line x1="400" y1="90" x2="400" y2="490" stroke="#1a1010" stroke-width="3"/>
    <!-- Door rings -->
    <circle cx="350" cy="300" r="15" fill="none" stroke="#5a4a3a" stroke-width="3"/>
    <circle cx="450" cy="300" r="15" fill="none" stroke="#5a4a3a" stroke-width="3"/>
    <!-- Arch -->
    <path d="M 220,490 L 220,150 Q 400,20 580,150 L 580,490" fill="none" stroke="#4a4038" stroke-width="12"/>
    <!-- Guard post left -->
    <rect x="180" y="140" width="50" height="60" fill="#3a3028"/>
    <!-- Guard post right -->
    <rect x="570" y="140" width="50" height="60" fill="#3a3028"/>
    <!-- Torches -->
    <circle cx="205" cy="120" r="35" fill="url(#torchg1)"/>
    <circle cx="595" cy="120" r="35" fill="url(#torchg2)"/>
    <circle cx="205" cy="125" r="6" fill="#ffcc44"/>
    <circle cx="595" cy="125" r="6" fill="#ffcc44"/>
    <!-- Dwarf sigil above -->
    <text x="360" y="60" font-family="serif" font-size="24" fill="#887060">⛏️ KHAZAD-DÛM</text>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(`${OUT}/great-gates.png`);
}

// 8. MITHRIL VEIN — blue-silver glowing veins in dark rock
async function renderMithrilVein() {
  const svg = `<svg width="${W}" height="${H}">
    <defs>
      <radialGradient id="vein1"><stop offset="0%" stop-color="rgba(150,200,255,0.9)"/><stop offset="60%" stop-color="rgba(80,160,240,0.2)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></radialGradient>
      <radialGradient id="vein2"><stop offset="0%" stop-color="rgba(150,200,255,0.7)"/><stop offset="60%" stop-color="rgba(80,160,240,0.15)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></radialGradient>
      <radialGradient id="vein3"><stop offset="0%" stop-color="rgba(150,200,255,0.6)"/><stop offset="60%" stop-color="rgba(80,160,240,0.1)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></radialGradient>
      <filter id="glow2"><feGaussianBlur stdDeviation="4"/></filter>
    </defs>
    <rect width="${W}" height="${H}" fill="#0c0e12"/>
    <!-- Rock face -->
    <rect x="0" y="0" width="${W}" height="${H}" fill="#141618"/>
    <!-- Dark rock striations -->
    <path d="M0,50 Q200,60 400,45 Q600,30 800,55" fill="none" stroke="#1a1c20" stroke-width="3"/>
    <path d="M0,150 Q200,140 350,155 Q550,170 800,145" fill="none" stroke="#1a1c20" stroke-width="3"/>
    <path d="M0,280 Q150,290 300,275 Q500,260 800,285" fill="none" stroke="#1a1c20" stroke-width="3"/>
    <path d="M0,380 Q250,390 450,375 Q650,360 800,385" fill="none" stroke="#1a1c20" stroke-width="3"/>
    <!-- Mithril veins -->
    <path d="M50,10 Q100,40 80,90 Q60,140 120,160 Q180,180 160,230 Q140,280 200,300 Q260,320 240,370 Q220,410 300,430 Q380,450 400,490" fill="none" stroke="#88bbee" stroke-width="3" filter="url(#glow2)" opacity="0.6"/>
    <path d="M400,10 Q450,50 420,100 Q390,150 460,180 Q530,210 500,260 Q470,310 540,340 Q610,370 580,420 Q550,470 620,490" fill="none" stroke="#88bbee" stroke-width="2.5" filter="url(#glow2)" opacity="0.5"/>
    <path d="M700,10 Q680,60 720,100 Q760,140 730,190 Q700,240 760,280 Q820,320 780,370 Q740,420 790,490" fill="none" stroke="#88bbee" stroke-width="2" filter="url(#glow2)" opacity="0.4"/>
    <!-- Cross veins -->
    <path d="M150,200 Q250,180 300,230" fill="none" stroke="#aaccee" stroke-width="1.5" filter="url(#glow2)" opacity="0.3"/>
    <path d="M480,150 Q530,200 500,290" fill="none" stroke="#aaccee" stroke-width="1.5" filter="url(#glow2)" opacity="0.3"/>
    <!-- Glow hotspots -->
    <circle cx="130" cy="180" r="20" fill="url(#vein1)"/>
    <circle cx="500" cy="280" r="25" fill="url(#vein2)"/>
    <circle cx="740" cy="220" r="18" fill="url(#vein3)"/>
    <circle cx="250" cy="380" r="15" fill="url(#vein3)"/>
    <!-- Small crystals -->
    <polygon points="128,170 132,160 136,170 132,180" fill="#aaddee" opacity="0.7"/>
    <polygon points="498,270 502,258 506,270 502,282" fill="#aaddee" opacity="0.8"/>
    <polygon points="738,212 742,200 746,212 742,224" fill="#aaddee" opacity="0.6"/>
    <!-- Ground -->
    <rect x="0" y="460" width="${W}" height="40" fill="#0e1014"/>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(`${OUT}/mithril-vein.png`);
}

// 9. DRUM CHAMBER — large war drum, stone chamber
async function renderDrumChamber() {
  const svg = `<svg width="${W}" height="${H}">
    <defs>
      <radialGradient id="drumglow"><stop offset="0%" stop-color="rgba(255,140,30,0.6)"/><stop offset="70%" stop-color="rgba(200,80,10,0.1)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="#161210"/>
    <!-- Chamber walls -->
    <rect x="0" y="0" width="${W}" height="250" fill="#1e1814"/>
    <!-- Huge drum center -->
    <ellipse cx="400" cy="220" rx="160" ry="50" fill="#4a3020"/>
    <ellipse cx="400" cy="210" rx="160" ry="50" fill="#6a4a30"/>
    <ellipse cx="400" cy="210" rx="140" ry="42" fill="#3a2010"/>
    <!-- Drum ropes -->
    <line x1="270" y1="220" x2="270" y2="160" stroke="#8a6a40" stroke-width="3"/>
    <line x1="330" y1="235" x2="330" y2="160" stroke="#8a6a40" stroke-width="3"/>
    <line x1="400" y1="240" x2="400" y2="160" stroke="#8a6a40" stroke-width="3"/>
    <line x1="470" y1="235" x2="470" y2="160" stroke="#8a6a40" stroke-width="3"/>
    <line x1="530" y1="220" x2="530" y2="160" stroke="#8a6a40" stroke-width="3"/>
    <!-- Drum top ring -->
    <ellipse cx="400" cy="160" rx="170" ry="35" fill="none" stroke="#6a5040" stroke-width="4"/>
    <!-- Drum stands -->
    <rect x="250" y="250" width="20" height="180" fill="#3a2820"/>
    <rect x="530" y="250" width="20" height="180" fill="#3a2820"/>
    <rect x="260" y="420" width="40" height="10" fill="#4a3830"/>
    <rect x="500" y="420" width="40" height="10" fill="#4a3830"/>
    <!-- Drum beat waves -->
    <path d="M180,240 Q300,220 400,230 Q500,220 620,240" fill="none" stroke="rgba(255,150,50,0.2)" stroke-width="2"/>
    <path d="M160,260 Q300,235 400,245 Q500,235 640,260" fill="none" stroke="rgba(255,150,50,0.1)" stroke-width="2"/>
    <!-- Floor -->
    <rect x="0" y="430" width="${W}" height="70" fill="#1a1410"/>
    <line x1="0" y1="460" x2="${W}" y2="460" stroke="#2a2018" stroke-width="1"/>
    <!-- Drum glow -->
    <circle cx="400" cy="210" r="200" fill="url(#drumglow)"/>
    <!-- Dwarven runes on wall -->
    <text x="330" y="100" font-family="serif" font-size="18" fill="#886040">ᚱ ᚢ ᚾ ᛖ ᛋ</text>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(`${OUT}/drum-chamber.png`);
}

// 10. TREASURY — gold piles, gems, treasure chests
async function renderTreasury() {
  const svg = `<svg width="${W}" height="${H}">
    <defs>
      <radialGradient id="treasureglow"><stop offset="0%" stop-color="rgba(255,220,50,0.4)"/><stop offset="70%" stop-color="rgba(255,200,30,0.05)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="#141210"/>
    <!-- Stone chamber -->
    <rect x="10" y="10" width="780" height="480" fill="#1a1614" rx="8"/>
    <rect x="20" y="20" width="760" height="460" fill="#1e1816"/>
    <!-- Floor -->
    <rect x="0" y="350" width="${W}" height="150" fill="#201810"/>
    <!-- Gold pile left -->
    <ellipse cx="200" cy="370" rx="120" ry="35" fill="#4a3810"/>
    <ellipse cx="200" cy="355" rx="100" ry="28" fill="#6a5020"/>
    <ellipse cx="200" cy="340" rx="80" ry="22" fill="#8a6830"/>
    <!-- Gold coins on pile -->
    <circle cx="150" cy="350" r="6" fill="#ddaa20"/>
    <circle cx="180" cy="340" r="6" fill="#ddaa20"/>
    <circle cx="220" cy="345" r="5" fill="#ddcc30"/>
    <circle cx="200" cy="330" r="5" fill="#ddcc30"/>
    <circle cx="170" cy="335" r="4" fill="#eebb30"/>
    <circle cx="230" cy="355" r="4" fill="#eecc40"/>
    <circle cx="195" cy="320" r="4" fill="#ffdd40"/>
    <!-- Gold pile right -->
    <ellipse cx="580" cy="380" rx="100" ry="30" fill="#4a3810"/>
    <ellipse cx="580" cy="365" rx="80" ry="22" fill="#6a5020"/>
    <ellipse cx="580" cy="352" rx="60" ry="16" fill="#8a6830"/>
    <circle cx="560" cy="360" r="5" fill="#ddaa20"/>
    <circle cx="600" cy="350" r="5" fill="#ddcc30"/>
    <circle cx="580" cy="340" r="4" fill="#eebb30"/>
    <circle cx="550" cy="350" r="4" fill="#eecc40"/>
    <!-- Treasure chest center -->
    <rect x="340" y="320" width="120" height="60" fill="#4a3020" rx="4"/>
    <rect x="360" y="310" width="80" height="20" fill="#5a4030" rx="3"/>
    <rect x="370" y="325" width="60" height="4" fill="#8a6a40"/>
    <circle cx="360" cy="340" r="3" fill="#ddcc30"/>
    <circle cx="440" cy="340" r="3" fill="#ddcc30"/>
    <!-- Open chest gold inside -->
    <ellipse cx="400" cy="325" rx="30" ry="8" fill="#8a6020"/>
    <circle cx="390" cy="322" r="4" fill="#ddaa20"/>
    <circle cx="410" cy="320" r="4" fill="#ddcc30"/>
    <circle cx="400" cy="318" r="3" fill="#ffdd40"/>
    <!-- Scattered gems -->
    <circle cx="300" cy="380" r="5" fill="#22aacc"/>
    <circle cx="520" cy="390" r="4" fill="#ff3366"/>
    <circle cx="450" cy="400" r="4" fill="#44cc22"/>
    <circle cx="650" cy="405" r="5" fill="#9944dd"/>
    <circle cx="140" cy="400" r="4" fill="#ff6600"/>
    <!-- Golden glow -->
    <circle cx="400" cy="350" r="300" fill="url(#treasureglow)"/>
    <!-- Crown on pillar -->
    <rect x="460" y="220" width="40" height="120" fill="#3a2820"/>
    <rect x="450" y="210" width="60" height="20" fill="#4a3830"/>
    <polygon points="455,210 465,180 475,210 485,175 495,210 505,180 510,210" fill="#ddcc30"/>
    <!-- Pillars -->
    <rect x="80" y="200" width="30" height="170" fill="#3a2820"/>
    <rect x="690" y="200" width="30" height="170" fill="#3a2820"/>
    <!-- Wall torch -->
    <circle cx="400" cy="40" r="30" fill="rgba(255,180,40,0.2)"/>
    <circle cx="400" cy="40" r="5" fill="#ffaa20"/>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(`${OUT}/treasury.png`);
}

// Generate all
console.log('Generating Moria station backdrops...');
await renderCouncilChamber();    console.log('✓ council-chamber.png');
await renderGreatForge();        console.log('✓ great-forge.png');
await renderRuneArchives();      console.log('✓ rune-archives.png');
await renderTestingCavern();     console.log('✓ testing-cavern.png');
await renderDurinsDoor();        console.log('✓ durins-door.png');
await renderBridge();             console.log('✓ bridge.png');
await renderGreatGates();        console.log('✓ great-gates.png');
await renderMithrilVein();       console.log('✓ mithril-vein.png');
await renderDrumChamber();       console.log('✓ drum-chamber.png');
await renderTreasury();           console.log('✓ treasury.png');
console.log('\n✅ All 10 backgrounds generated in', OUT);
