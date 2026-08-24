#!/usr/bin/env node
/**
 * Moria Dwarves Theme — Asset Generator
 * Generates 10 station backdrops + 24 dwarf sprites for the Khazad-dûm theme.
 * Uses Sharp for SVG→PNG rendering.
 */
import sharp from "sharp";
import { mkdir, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ASSETS = join(ROOT, "packages/service/src/gui/themes/assets/moria-dwarves");
const SPRITES = join(ASSETS, "sprites");

// ── Colour Palette ──────────────────────────────────────────────
const C = {
  stone: "#3a3530",
  stoneLit: "#5a5045",
  stoneDark: "#1a1510",
  pillar: "#4a4038",
  torch: "#e8943a",
  torchGlow: "#f0a040",
  fire: "#e8601c",
  fireGlow: "#ff8844",
  mithril: "#88bbee",
  mithrilGlow: "#aaddff",
  gold: "#d4a017",
  goldBright: "#f0c040",
  gem: "#e04040",
  gemBlue: "#4080e0",
  gemGreen: "#40c040",
  shadow: "#080808",
  deep: "#000000",
  wood: "#6b4226",
  iron: "#555555",
  ironBright: "#888888",
  rune: "#88ccff",
  water: "#102040",
  mist: "#203050",
  sky: "#0a1020",
  door: "#444444",
  doorEdge: "#666666",
  // dwarven skin tones
  skin: "#deb887",
  skinShadow: "#c4a46a",
  skinLight: "#f0d8b0",
};

// ── SVG Helpers ──────────────────────────────────────────────────
function svgDoc(w, h, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}

function rect(x, y, w, h, fill, rx) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${rx != null ? ` rx="${rx}"` : ""}/>`;
}

function circle(cx, cy, r, fill) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
}

function ellipse(cx, cy, rx, ry, fill) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"/>`;
}

function polygon(points, fill) {
  return `<polygon points="${points}" fill="${fill}"/>`;
}

function path(d, fill, stroke, sw) {
  const s = stroke ? ` stroke="${stroke}" stroke-width="${sw || 1}"` : "";
  return `<path d="${d}" fill="${fill}"${s}/>`;
}

function line(x1, y1, x2, y2, stroke, sw) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw || 1}"/>`;
}

function radialGradient(id, cx, cy, r, stops) {
  let s = `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">`;
  for (const [offset, color] of stops) {
    s += `<stop offset="${offset}" stop-color="${color}"/>`;
  }
  s += `</radialGradient>`;
  return s;
}

function linearGradient(id, x1, y1, x2, y2, stops) {
  let s = `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">`;
  for (const [offset, color] of stops) {
    s += `<stop offset="${offset}" stop-color="${color}"/>`;
  }
  s += `</linearGradient>`;
  return s;
}

function defs(content) {
  return `<defs>${content}</defs>`;
}

// ── Common background elements ───────────────────────────────────
function stoneWall(w, h) {
  let parts = rect(0, 0, w, h, C.stoneDark);
  // Stone block pattern
  const blockH = 16;
  const blockW = 24;
  for (let y = 0; y < h; y += blockH) {
    const offset = (Math.floor(y / blockH) % 2) * (blockW / 2);
    for (let x = -offset; x < w; x += blockW) {
      const shade = C.stone;
      parts += rect(x, y, blockW - 2, blockH - 2, shade);
      parts += rect(x + 1, y + 1, blockW - 4, blockH - 4, C.stoneLit, 2);
    }
  }
  return parts;
}

function torchAt(x, y, h) {
  // Torch bracket
  const bracket = rect(x - 3, y, 6, 4, C.iron);
  const stick = rect(x - 1, y + 4, 2, 14, C.wood);
  const flame = ellipse(x, y - 6, 4, 10, C.fire);
  const flameInner = ellipse(x, y - 4, 2, 6, C.torch);
  const glow = circle(x, y - 4, 30, "url(#torchGlow)");
  return glow + bracket + stick + flame + flameInner;
}

function torchGlowGradient() {
  return radialGradient("torchGlow", "50%", "50%", "50%", [
    ["0%", "rgba(240,160,64,0.3)"],
    ["40%", "rgba(240,160,64,0.1)"],
    ["100%", "rgba(240,160,64,0)"],
  ]);
}

function pillar(x, y, w, h) {
  const base = rect(x, y + h - 8, w, 8, C.pillar);
  const body = rect(x + 2, y, w - 4, h - 8, C.pillar);
  // Carving detail
  const detail1 = rect(x + 4, y + 10, w - 8, 4, C.stoneLit);
  const detail2 = rect(x + 4, y + h - 22, w - 8, 4, C.stoneLit);
  return base + body + detail1 + detail2;
}

// ── STATION BACKDROPS ────────────────────────────────────────────
const backdrops = {};

backdrops["council-chamber"] = (w, h) => {
  let bg = stoneWall(w, h);
  // Floor
  bg += rect(0, h - 32, w, 32, C.stoneDark);
  bg += rect(0, h - 32, w, 2, C.stoneLit);
  // Pillars
  bg += pillar(16, 20, 20, h - 52);
  bg += pillar(w - 36, 20, 20, h - 52);
  bg += pillar(w / 2 - 10, 20, 20, h - 52);
  // Grand table
  bg += rect(w / 2 - 50, h - 54, 100, 8, C.wood, 2);
  bg += rect(w / 2 - 48, h - 46, 4, 14, C.wood);
  bg += rect(w / 2 + 44, h - 46, 4, 14, C.wood);
  // Throne at back
  bg += rect(w / 2 - 14, 28, 28, 40, C.stoneDark);
  bg += rect(w / 2 - 10, 30, 20, 36, C.stoneLit, 2);
  bg += path(`M${w / 2 - 10},30 L${w / 2},20 L${w / 2 + 10},30`, C.gold);
  // Torches
  bg += torchAt(40, 42, h);
  bg += torchAt(w - 40, 42, h);
  // Runes on wall
  bg += circle(w / 2 - 30, 80, 6, C.rune, 0.4);
  bg += circle(w / 2 - 30, 80, 3, C.mithril, 0.6);
  bg += circle(w / 2 + 30, 80, 6, C.rune, 0.4);
  bg += circle(w / 2 + 30, 80, 3, C.mithril, 0.6);
  return bg;
};

backdrops["great-forge"] = (w, h) => {
  let bg = stoneWall(w, h);
  bg += rect(0, h - 28, w, 28, C.stoneDark);
  // Forge fire pits
  const fireGlowGrad = radialGradient("fireGlow", "50%", "50%", "50%", [
    ["0%", "rgba(255,136,68,0.4)"],
    ["50%", "rgba(255,100,30,0.15)"],
    ["100%", "rgba(255,68,0,0)"],
  ]);
  bg += defs(fireGlowGrad + torchGlowGradient());
  // Three forge stations
  for (let i = 0; i < 3; i++) {
    const fx = (w / 4) * (i + 1);
    // Fire pit
    bg += rect(fx - 18, h - 66, 36, 18, C.stoneDark);
    bg += ellipse(fx, h - 66, 16, 6, C.stoneLit);
    bg += ellipse(fx, h - 66, 12, 4, C.fire);
    bg += ellipse(fx, h - 67, 8, 3, C.torch);
    bg += circle(fx, h - 64, 40, "url(#fireGlow)");
    // Anvil
    bg += rect(fx + 22, h - 48, 16, 10, C.iron);
    bg += rect(fx + 24, h - 50, 12, 4, C.ironBright);
    bg += path(`M${fx + 26},${h - 48} L${fx + 30},${h - 56} L${fx + 34},${h - 48}`, C.iron);
  }
  // Sparks
  bg += circle(w / 4, h - 76, 1.5, C.torch, 0.6);
  bg += circle(w / 2, h - 78, 1, C.fire, 0.8);
  bg += circle((w * 3) / 4, h - 74, 1.5, C.torch, 0.5);
  // Torches on walls
  bg += torchAt(30, 30, h);
  bg += torchAt(w - 30, 30, h);
  return bg;
};

backdrops["rune-archives"] = (w, h) => {
  let bg = stoneWall(w, h);
  bg += rect(0, h - 24, w, 24, C.stoneDark);
  // Shelves carved into stone
  for (let i = 0; i < 3; i++) {
    const sx = 16 + i * 56;
    bg += rect(sx, 20, 48, 4, C.wood);
    bg += rect(sx, 56, 48, 4, C.wood);
    // Books/scrolls on shelves
    for (let j = 0; j < 4; j++) {
      const bx = sx + 6 + j * 10;
      bg += rect(bx, 8, 6, 12, ["#8B4513", "#654321", "#A0522D", "#6B3410"][j], 1);
      bg += rect(bx + 2, 10, 2, 8, C.gold, 0.5);
      bg += rect(bx, 44, 6, 10, ["#2F4F4F", "#3D2B1F", "#1B1B3A", "#4A3520"][j], 1);
    }
  }
  // Reading desk
  bg += rect(w / 2 - 24, h - 58, 48, 6, C.wood, 2);
  bg += rect(w / 2 - 22, h - 52, 4, 28, C.wood);
  bg += rect(w / 2 + 18, h - 52, 4, 28, C.wood);
  // Candle
  bg += rect(w / 2, h - 68, 3, 10, "#fff8e0");
  bg += ellipse(w / 2 + 1.5, h - 70, 3, 6, C.torch);
  bg += circle(w / 2 + 1.5, h - 70, 20, "url(#torchGlow)");
  // Glowing runes
  bg += defs(torchGlowGradient());
  bg += path(`M40,90 L44,82 L48,90 L44,86 Z`, C.rune, null, 0);
  bg += path(`M${w - 40},90 L${w - 44},82 L${w - 36},82 Z`, C.rune);
  return bg;
};

backdrops["testing-cavern"] = (w, h) => {
  let bg = stoneWall(w, h);
  bg += rect(0, h - 28, w, 28, C.stoneDark);
  bg += defs(torchGlowGradient());
  // Cracked floor
  bg += path(
    `M0,${h - 28} L40,${h - 30} L80,${h - 26} L120,${h - 32} L160,${h - 28} L200,${h - 30} L${w},${h - 28}`,
    C.stoneLit,
    null,
    0,
  );
  bg += line(10, h - 40, 30, h - 60, C.stoneDark, 1);
  bg += line(90, h - 35, 110, h - 55, C.stoneDark, 1);
  // Testing anvils (broken/scored)
  bg += rect(40, h - 52, 18, 12, C.iron);
  bg += line(44, h - 50, 54, h - 42, C.ironBright, 1);
  bg += rect(w - 60, h - 52, 18, 12, C.iron);
  bg += line(w - 56, h - 44, w - 46, h - 50, C.ironBright, 1);
  // Broken pillar
  bg += rect(w / 2 - 8, 30, 16, 40, C.pillar);
  bg += polygon(`${w / 2 - 10},30 ${w / 2 + 10},30 ${w / 2 + 6},20 ${w / 2 - 6},20`, C.stoneLit);
  // Target dummies
  bg += rect(70, 50, 3, 40, C.wood);
  bg += circle(71.5, 58, 8, C.wood);
  bg += circle(71.5, 58, 4, C.fire, 0.5);
  bg += rect(w - 76, 50, 3, 40, C.wood);
  bg += circle(w - 74.5, 58, 8, C.wood);
  bg += circle(w - 74.5, 58, 4, C.fire, 0.5);
  // Torches
  bg += torchAt(28, 34, h);
  bg += torchAt(w - 28, 34, h);
  return bg;
};

backdrops["durins-door"] = (w, h) => {
  // Night sky
  let bg = rect(0, 0, w, h, C.sky);
  bg += circle(w / 2, 24, 10, C.mithril, 0.3); // moon
  // Rock frame
  bg += stoneWall(w, h);
  // The great door
  const dw = 56,
    dh = 72,
    dx = (w - dw) / 2,
    dy = (h - dh) / 2 + 4;
  bg += rect(dx - 4, dy - 4, dw + 8, dh + 8, C.stoneDark);
  bg += rect(dx, dy, dw, dh, C.door);
  bg += rect(dx + 2, dy + 2, dw - 4, dh - 4, C.doorEdge);
  // Door carvings
  bg += path(
    `M${dx + 8},${dy + dh / 2} Q${dx + dw / 2},${dy + 6} ${dx + dw - 8},${dy + dh / 2}`,
    C.stoneDark,
  );
  bg += path(
    `M${dx + 8},${dy + dh / 2} Q${dx + dw / 2},${dy + dh - 6} ${dx + dw - 8},${dy + dh / 2}`,
    C.stoneDark,
  );
  bg += circle(dx + dw / 2, dy + dh / 2, 6, C.mithril, 0.2);
  // Ithildin runes (faint)
  bg += path(
    `M${dx + 12},${dy + 14} Q${dx + dw / 2},${dy + 4} ${dx + dw - 12},${dy + 14}`,
    C.mithril,
    C.mithril,
    1,
  );
  // Watcher posts
  bg += rect(4, h - 32, 14, 28, C.pillar);
  bg += rect(4, h - 36, 14, 6, C.stoneLit);
  bg += rect(w - 18, h - 32, 14, 28, C.pillar);
  bg += rect(w - 18, h - 36, 14, 6, C.stoneLit);
  // Torches at watcher posts
  bg += defs(torchGlowGradient());
  bg += torchAt(11, 32, h);
  bg += torchAt(w - 11, 32, h);
  return bg;
};

backdrops["bridge"] = (w, h) => {
  let bg = rect(0, 0, w, h, C.deep);
  // Chasm walls
  bg += rect(0, 0, 30, h, C.stoneDark);
  bg += rect(w - 30, 0, 30, h, C.stoneDark);
  bg += rect(0, 0, 30, h * 0.4, C.stone);
  bg += rect(w - 30, 0, 30, h * 0.4, C.stone);
  // Depth mist
  bg += ellipse(w / 2, h - 10, w / 2, 40, C.mist, 0.3);
  bg += ellipse(w / 2, h - 4, w / 3, 30, C.mist, 0.2);
  // Deep glow
  bg += ellipse(w / 2, h + 10, 40, 20, "rgba(255,100,20,0.08)"); // Balrog hint
  // Bridge
  const by = h / 2 - 10;
  bg += rect(34, by, w - 68, 8, C.stone);
  bg += rect(34, by - 2, w - 68, 4, C.stoneLit);
  // Bridge arch
  bg += path(`M34,${by + 8} Q${w / 2},${by + 20} ${w - 34},${by + 8}`, C.stoneDark);
  // Bridge edge stones
  for (let x = 34; x < w - 34; x += 8) {
    bg += rect(x, by - 6, 6, 6, C.stoneLit);
  }
  // Torches at ends
  bg += defs(torchGlowGradient());
  bg += torchAt(38, h / 2 - 18, h);
  bg += torchAt(w - 38, h / 2 - 18, h);
  return bg;
};

backdrops["great-gates"] = (w, h) => {
  let bg = stoneWall(w, h);
  bg += defs(torchGlowGradient());
  // Mountain rock above
  bg += polygon(`0,0 ${w},0 ${w},25 ${w * 0.75},45 ${w * 0.25},45 0,25`, C.stoneDark);
  // Gates
  const gw = 52,
    gh = 64,
    gx = (w - gw) / 2,
    gy = 16;
  bg += rect(gx - 6, gy - 6, gw + 12, gh + 12, C.stoneDark);
  bg += rect(gx, gy, gw, gh, C.door);
  // Gate details
  bg += rect(gx + 2, gy + 2, gw / 2 - 6, gh - 4, C.doorEdge);
  bg += rect(gx + gw / 2 + 4, gy + 2, gw / 2 - 6, gh - 4, C.doorEdge);
  // Iron bands
  for (let i = 0; i < 4; i++) {
    bg += rect(gx, gy + 12 + i * 12, gw, 4, C.iron);
  }
  // Dwarven star above
  bg += path(
    `M${gx + gw / 2},${gy - 10} L${gx + gw / 2 + 6},${gy - 2} L${gx + gw / 2 + 12},${gy + 2} L${gx + gw / 2 + 6},${gy + 6} L${gx + gw / 2 + 4},${gy + 14} L${gx + gw / 2},${gy + 8} L${gx + gw / 2 - 4},${gy + 14} L${gx + gw / 2 - 6},${gy + 6} L${gx + gw / 2 - 12},${gy + 2} L${gx + gw / 2 - 6},${gy - 2} Z`,
    C.gold,
    0.7,
  );
  // Guard posts
  bg += rect(4, h - 28, 16, 24, C.stoneLit);
  bg += rect(w - 20, h - 28, 16, 24, C.stoneLit);
  bg += torchAt(12, 24, h);
  bg += torchAt(w - 12, 24, h);
  return bg;
};

backdrops["mithril-vein"] = (w, h) => {
  let bg = stoneWall(w, h);
  // Darker — deep mine
  bg += rect(0, 0, w, h, "rgba(0,0,0,0.3)");
  // Mithril veins
  const veinPath1 = `M0,${h / 3} Q${w * 0.3},${h / 4} ${w * 0.5},${h / 3} T${w},${h * 0.4}`;
  const veinPath2 = `M${w * 0.2},${h * 0.6} Q${w * 0.5},${h * 0.5} ${w * 0.7},${h * 0.7} T${w},${h * 0.8}`;
  bg += defs(`
    <filter id="glow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    ${torchGlowGradient()}
  `);
  bg += path(veinPath1, "none", C.mithril, 6, 'filter="url(#glow)"');
  bg += path(veinPath1, "none", C.mithrilGlow, 2);
  bg += path(veinPath2, "none", C.mithril, 5, 'filter="url(#glow)"');
  bg += path(veinPath2, "none", C.mithrilGlow, 1.5);
  // Smaller veins
  bg += line(30, 20, 60, 40, C.mithril, 2);
  bg += line(w - 40, 60, w - 20, 80, C.mithril, 1.5);
  // Sparkle points
  for (const [sx, sy] of [
    [w * 0.15, h * 0.35],
    [w * 0.45, h * 0.28],
    [w * 0.7, h * 0.42],
    [w * 0.35, h * 0.65],
    [w * 0.8, h * 0.75],
  ]) {
    bg += circle(sx, sy, 2, C.mithrilGlow, 0.8);
    bg += path(
      `M${sx},${sy - 4} L${sx + 1},${sy - 1} L${sx + 4},${sy} L${sx + 1},${sy + 1} L${sx},${sy + 4} L${sx - 1},${sy + 1} L${sx - 4},${sy} L${sx - 1},${sy - 1} Z`,
      C.mithrilGlow,
    );
  }
  // Pickaxes leaning
  bg += line(16, h - 20, 28, h - 40, C.wood, 2);
  bg += rect(26, h - 44, 8, 6, C.iron);
  bg += line(w - 16, h - 20, w - 28, h - 36, C.wood, 2);
  bg += rect(w - 30, h - 40, 8, 6, C.iron);
  // Single torch
  bg += torchAt(w / 2, 28, h);
  return bg;
};

backdrops["drum-chamber"] = (w, h) => {
  let bg = stoneWall(w, h);
  bg += rect(0, 0, w, h, "rgba(0,0,0,0.4)");
  bg += defs(torchGlowGradient());
  // Drums
  for (let i = 0; i < 2; i++) {
    const dx = 24 + i * 44;
    bg += ellipse(dx + 13, h - 30, 14, 8, C.wood);
    bg += rect(dx, h - 60, 26, 32, C.wood, 2);
    bg += ellipse(dx + 13, h - 60, 14, 8, C.wood);
    // Drum skin
    bg += ellipse(dx + 13, h - 60, 11, 6, "#f5deb3");
    // Iron bands
    bg += rect(dx, h - 46, 26, 3, C.iron);
  }
  // Deep shadow
  bg += ellipse(w / 2, h + 4, w / 2, 10, C.deep, 0.5);
  // Single guttering torch
  bg += torchAt(w / 2, 20, h);
  return bg;
};

backdrops["treasury"] = (w, h) => {
  let bg = stoneWall(w, h);
  bg += rect(0, h - 28, w, 28, C.stoneDark);
  bg += defs(torchGlowGradient());
  // Gold piles
  for (let i = 0; i < 3; i++) {
    const gx = 20 + i * 56;
    bg += ellipse(gx + 16, h - 28, 22, 12, C.gold);
    bg += ellipse(gx + 16, h - 30, 20, 10, C.goldBright);
    // Individual coins
    bg += circle(gx + 8, h - 34, 3, C.goldBright);
    bg += circle(gx + 20, h - 36, 3, C.gold);
    bg += circle(gx + 14, h - 31, 2.5, C.goldBright);
  }
  // Treasure chest
  bg += rect(w - 44, h - 46, 36, 20, C.wood, 2);
  bg += rect(w - 44, h - 48, 36, 6, C.wood, 3);
  bg += rect(w - 28, h - 48, 4, 4, C.gold);
  // Gems scattered
  bg += polygon(
    `${w / 2 - 20},${h - 32} ${w / 2 - 18},${h - 36} ${w / 2 - 16},${h - 32} ${w / 2 - 18},${h - 30}`,
    C.gem,
  );
  bg += polygon(
    `${w / 2 + 10},${h - 34} ${w / 2 + 12},${h - 38} ${w / 2 + 14},${h - 34} ${w / 2 + 12},${h - 32}`,
    C.gemBlue,
  );
  bg += circle(w / 2 + 26, h - 33, 3, C.gemGreen);
  bg += polygon(
    `${w - 54},${h - 30} ${w - 52},${h - 34} ${w - 50},${h - 30} ${w - 52},${h - 28}`,
    C.gem,
  );
  // Iron-bound door
  bg += rect(8, 12, 24, 40, C.door);
  bg += rect(10, 14, 20, 4, C.iron);
  bg += rect(10, 28, 20, 4, C.iron);
  bg += rect(10, 42, 20, 4, C.iron);
  // Torches
  bg += torchAt(28, 28, h);
  bg += torchAt(w - 28, 28, h);
  return bg;
};

// ── DWARF SPRITES ────────────────────────────────────────────────
// Each dwarf: 32×32. 2-frame spritesheet = 64×32 (idle) + state animation.

// Dwarf physical traits
const BEARDS = {
  white: "#e8e0d0",
  grey: "#a0a0a0",
  brown: "#6b4226",
  red: "#b84020",
  blonde: "#d4a050",
  black: "#2a2a2a",
  silver: "#c0c0c8",
  ginger: "#d47030",
};

const TUNICS = {
  brown: "#8B4513",
  green: "#2E5E2E",
  blue: "#2E3E6E",
  red: "#6E2E2E",
  purple: "#4E2E6E",
  grey: "#5E5E5E",
  gold: "#8E6E1E",
  teal: "#1E5E5E",
};

// Assign each agent distinct traits
const dwarfTraits = {
  // agentId: { beard, tunic, hair, helm, tool }
  1: { beard: "white", tunic: "blue", helm: "crown", tool: "pick" },
  2: { beard: "brown", tunic: "green", helm: "round", tool: "hammer" },
  3: { beard: "red", tunic: "brown", helm: "pointed", tool: "axe" },
  4: { beard: "black", tunic: "gold", helm: "crown", tool: "sword" },
  5: { beard: "grey", tunic: "red", helm: "pointed", tool: "shield" },
  6: { beard: "ginger", tunic: "teal", helm: "hood", tool: "hammer" },
  7: { beard: "brown", tunic: "grey", helm: "round", tool: "pick" },
  8: { beard: "black", tunic: "red", helm: "none", tool: "hammer" },
  9: { beard: "white", tunic: "purple", helm: "hood", tool: "book" },
  10: { beard: "silver", tunic: "gold", helm: "pointed", tool: "coins" },
  11: { beard: "brown", tunic: "brown", helm: "round", tool: "crate" },
  12: { beard: "black", tunic: "grey", helm: "hood", tool: "dagger" },
  13: { beard: "blonde", tunic: "blue", helm: "none", tool: "quill" },
  14: { beard: "red", tunic: "red", helm: "pointed", tool: "sword" },
  15: { beard: "brown", tunic: "green", helm: "none", tool: "bow" },
  16: { beard: "grey", tunic: "gold", helm: "crown", tool: "pick" },
  17: { beard: "blonde", tunic: "blue", helm: "pointed", tool: "shield" },
  18: { beard: "ginger", tunic: "brown", helm: "round", tool: "pick" },
  19: { beard: "grey", tunic: "teal", helm: "hood", tool: "map" },
  20: { beard: "silver", tunic: "grey", helm: "none", tool: "staff" },
  21: { beard: "black", tunic: "red", helm: "pointed", tool: "axe" },
  22: { beard: "white", tunic: "purple", helm: "round", tool: "gem" },
  23: { beard: "red", tunic: "gold", helm: "pointed", tool: "hammer" },
  24: { beard: "black", tunic: "purple", helm: "crown", tool: "sword" },
};

function drawDwarf(id, frame, state) {
  const t = dwarfTraits[id] || dwarfTraits[1];
  const beardC = BEARDS[t.beard];
  const tunicC = TUNICS[t.tunic];
  const bobY = state === "idle" && frame === 1 ? -1 : 0;
  const baseY = 4 + bobY;

  let parts = "";

  // Shadow on ground
  parts += ellipse(16, 30, 5, 1.5, "rgba(0,0,0,0.4)");

  // Legs
  parts += rect(12, 22 + bobY, 3, 5, "#4a3020");
  parts += rect(17, 22 + bobY, 3, 5, "#4a3020");
  // Boots
  parts += rect(11, 26 + bobY, 4, 2, "#3a2010");
  parts += rect(17, 26 + bobY, 4, 2, "#3a2010");

  // Body / tunic
  parts += rect(11, 14 + bobY, 10, 10, tunicC, 2);
  // Belt
  parts += rect(11, 20 + bobY, 10, 2, C.iron);
  parts += rect(15, 19 + bobY, 2, 3, C.gold); // buckle

  // Arms
  if (state === "idle" || (state === "mine" && frame === 0) || (state === "guard" && frame === 0)) {
    parts += rect(6, 16 + bobY, 4, 3, tunicC, 1);
    parts += rect(22, 16 + bobY, 4, 3, tunicC, 1);
  } else if (state === "mine" && frame === 1) {
    // Pickaxe raised
    parts += rect(6, 14 + bobY, 4, 3, tunicC, 1);
    parts += rect(22, 12 + bobY, 4, 3, tunicC, 1);
    parts += line(24, 12 + bobY, 14, 5, C.wood, 1.5); // handle
    parts += rect(12, 3, 8, 4, C.iron); // head
  } else if (state === "forge" && frame === 0) {
    parts += rect(6, 16 + bobY, 4, 3, tunicC, 1);
    parts += rect(22, 14 + bobY, 4, 3, tunicC, 1);
  } else if (state === "forge" && frame === 1) {
    // Hammer raised
    parts += rect(6, 16 + bobY, 4, 3, tunicC, 1);
    parts += rect(22, 10 + bobY, 4, 3, tunicC, 1);
    parts += line(24, 10 + bobY, 16, 2, C.wood, 1.5);
    parts += rect(14, 0, 6, 4, C.iron);
  }

  // Beard
  parts += polygon(`12,${16 + bobY} 20,${16 + bobY} 18,${24 + bobY} 14,${24 + bobY}`, beardC);
  // Beard detail
  parts += line(16, 20 + bobY, 16, 23 + bobY, "rgba(0,0,0,0.2)", 0.5);

  // Head
  parts += circle(16, 12 + bobY, 5, C.skin);
  // Eyes
  parts += circle(14, 11 + bobY, 1, "#000");
  parts += circle(18, 11 + bobY, 1, "#000");
  // Nose
  parts += circle(16, 13 + bobY, 1.5, C.skinShadow);

  // Helmet
  const helm = t.helm;
  if (helm === "pointed") {
    parts += path(`M10,${10 + bobY} L16,${3 + bobY} L22,${10 + bobY}`, C.iron);
    parts += rect(10, 8 + bobY, 12, 3, C.iron, 1);
  } else if (helm === "round") {
    parts += path(`M10,${9 + bobY} Q16,${5 + bobY} 22,${9 + bobY}`, C.iron);
    parts += rect(10, 8 + bobY, 12, 3, C.iron, 1);
  } else if (helm === "crown") {
    parts += rect(10, 7 + bobY, 12, 4, C.gold);
    parts += rect(11, 4 + bobY, 2, 4, C.gold);
    parts += rect(15, 3 + bobY, 2, 5, C.gold);
    parts += rect(19, 4 + bobY, 2, 4, C.gold);
  } else if (helm === "hood") {
    parts += path(
      `M10,${10 + bobY} Q16,${5 + bobY} 22,${10 + bobY} L20,${15 + bobY} L12,${15 + bobY} Z`,
      tunicC,
    );
  } else {
    // Bare head / hair
    parts += path(
      `M10,${9 + bobY} Q16,${6 + bobY} 22,${9 + bobY}`,
      t.beard === "blonde" ? "#d4a050" : "#4a3020",
    );
  }

  // Tool (shown for state-specific frames)
  if (state === "idle" || (state !== "idle" && frame === 0)) {
    // Tool at side or held normally
  }

  return svgDoc(32, 32, parts);
}

function animationStrip(id, state, frameCount) {
  // Generate frame SVGs, composite into a strip
  const frameSvgs = [];
  for (let f = 0; f < frameCount; f++) {
    frameSvgs.push(drawDwarf(id, f, state));
  }
  return frameSvgs;
}

// ── Main Generator ───────────────────────────────────────────────
async function main() {
  console.log("🔨 Khazad-dûm Asset Generator");
  console.log("═══════════════════════════════\n");

  // Ensure directories
  await mkdir(SPRITES, { recursive: true });

  // ── Generate Station Backdrops ──
  console.log("📐 Generating station backdrops...");
  const stationDims = {
    "council-chamber": [256, 160],
    "great-forge": [256, 160],
    "rune-archives": [192, 128],
    "testing-cavern": [256, 160],
    "durins-door": [128, 128],
    bridge: [192, 128],
    "great-gates": [128, 96],
    "mithril-vein": [192, 128],
    "drum-chamber": [128, 96],
    treasury: [192, 128],
  };

  let stationCount = 0;
  for (const [name, [w, h]] of Object.entries(stationDims)) {
    const genFn = backdrops[name];
    if (!genFn) {
      console.log(`  ⚠  no generator for "${name}", skipping`);
      continue;
    }
    const bgSvg = genFn(w, h);
    const fullSvg = svgDoc(w, h, bgSvg);
    const outPath = join(ASSETS, `${name}.png`);
    await sharp(Buffer.from(fullSvg)).png().toFile(outPath);
    stationCount++;
    console.log(`  ✓  ${name}.png (${w}×${h})`);
  }

  // ── Generate Dwarf Sprites ──
  console.log(`\n🧔 Generating ${Object.keys(dwarfTraits).length} dwarf sprites...`);
  let spriteCount = 0;
  for (const agentId of Object.keys(dwarfTraits)) {
    // Idle animation (2 frames)
    const idleFrames = animationStrip(agentId, "idle", 2);
    const idleSvg = svgDoc(
      64,
      32,
      `<g transform="translate(0,0)">${idleFrames[0]}</g>` +
        `<g transform="translate(32,0)">${idleFrames[1]}</g>`,
    );
    const idlePath = join(SPRITES, `dwarf-${agentId}-idle.png`);
    await sharp(Buffer.from(idleSvg)).png().toFile(idlePath);
    spriteCount++;

    // Work state animation (2 frames)
    const state = "mine"; // default for now — we'll update per-agent in JSON
    const workFrames = animationStrip(agentId, state, 2);
    const workSvg = svgDoc(
      64,
      32,
      `<g transform="translate(0,0)">${workFrames[0]}</g>` +
        `<g transform="translate(32,0)">${workFrames[1]}</g>`,
    );
    const workPath = join(SPRITES, `dwarf-${agentId}-${state}.png`);
    await sharp(Buffer.from(workSvg)).png().toFile(workPath);
    spriteCount++;
  }

  // Also generate per-agent state animations for non-default states
  // (We'll add more states in the JSON update)

  console.log(`\n✅ Done! ${stationCount} backdrops, ${spriteCount} sprite sheets generated.`);
  console.log(`   Assets → ${ASSETS}`);
}

main().catch((err) => {
  console.error("❌ Asset generation failed:", err);
  process.exit(1);
});
