#!/usr/bin/env node
/**
 * Generate state-specific dwarf sprite animations.
 * Each dwarf gets their unique defaultState animation (mine, forge, guard, craft, etc.)
 */
import sharp from "sharp";
import { mkdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SPRITES = join(ROOT, "packages/service/src/gui/themes/assets/moria-dwarves/sprites");

const C = {
  iron: "#555555",
  ironBright: "#888888",
  gold: "#d4a017",
  wood: "#6b4226",
  skin: "#deb887",
  skinShadow: "#c4a46a",
  stone: "#3a3530",
  stoneLit: "#5a5045",
  fire: "#e8601c",
  torch: "#e8943a",
  door: "#444444",
};

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

const dwarfTraits = {
  1: { beard: "white", tunic: "blue", helm: "crown", tool: "pick", state: "mine" },
  2: { beard: "brown", tunic: "green", helm: "round", tool: "hammer", state: "mine" },
  3: { beard: "red", tunic: "brown", helm: "pointed", tool: "axe", state: "mine" },
  4: { beard: "black", tunic: "gold", helm: "crown", tool: "sword", state: "mine" },
  5: { beard: "grey", tunic: "red", helm: "pointed", tool: "shield", state: "guard" },
  6: { beard: "ginger", tunic: "teal", helm: "hood", tool: "hammer", state: "craft" },
  7: { beard: "brown", tunic: "grey", helm: "round", tool: "pick", state: "mine" },
  8: { beard: "black", tunic: "red", helm: "none", tool: "hammer", state: "forge" },
  9: { beard: "white", tunic: "purple", helm: "hood", tool: "book", state: "read" },
  10: { beard: "silver", tunic: "gold", helm: "pointed", tool: "coins", state: "count" },
  11: { beard: "brown", tunic: "brown", helm: "round", tool: "crate", state: "carry" },
  12: { beard: "black", tunic: "grey", helm: "hood", tool: "dagger", state: "sneak" },
  13: { beard: "blonde", tunic: "blue", helm: "none", tool: "quill", state: "write" },
  14: { beard: "red", tunic: "red", helm: "pointed", tool: "sword", state: "forge" },
  15: { beard: "brown", tunic: "green", helm: "none", tool: "bow", state: "aim" },
  16: { beard: "grey", tunic: "gold", helm: "crown", tool: "pick", state: "mine" },
  17: { beard: "blonde", tunic: "blue", helm: "pointed", tool: "shield", state: "guard" },
  18: { beard: "ginger", tunic: "brown", helm: "round", tool: "pick", state: "mine" },
  19: { beard: "grey", tunic: "teal", helm: "hood", tool: "map", state: "map" },
  20: { beard: "silver", tunic: "grey", helm: "none", tool: "staff", state: "wander" },
  21: { beard: "black", tunic: "red", helm: "pointed", tool: "axe", state: "guard" },
  22: { beard: "white", tunic: "purple", helm: "round", tool: "gem", state: "craft" },
  23: { beard: "red", tunic: "gold", helm: "pointed", tool: "hammer", state: "forge" },
  24: { beard: "black", tunic: "purple", helm: "crown", tool: "sword", state: "forge" },
};

function svg(w, h, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}
function rect(x, y, w, h, f, rx) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}"${rx != null ? ` rx="${rx}"` : ""}/>`;
}
function circle(cx, cy, r, f) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${f}"/>`;
}
function ellipse(cx, cy, rx, ry, f) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${f}"/>`;
}
function polygon(pts, f) {
  return `<polygon points="${pts}" fill="${f}"/>`;
}
function path(d, f, s, sw) {
  const st = s ? ` stroke="${s}" stroke-width="${sw || 1}"` : "";
  return `<path d="${d}" fill="${f}"${st}/>`;
}
function line(x1, y1, x2, y2, s, sw) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${s}" stroke-width="${sw || 1}"/>`;
}

function drawDwarf(id, frame, animState) {
  const t = dwarfTraits[id] || dwarfTraits[1];
  const beardC = BEARDS[t.beard];
  const tunicC = TUNICS[t.tunic];
  const bobY = animState === "idle" && frame === 1 ? -1 : animState === "sneak" ? 2 : 0;
  const baseY = 4 + bobY;
  let parts = "";

  // Shadow
  parts += ellipse(16, 30, 5, 1.5, "rgba(0,0,0,0.4)");

  // ---- State-specific body modifications ----
  const isMine = animState === "mine";
  const isForge = animState === "forge";
  const isGuard = animState === "guard";
  const isCraft = animState === "craft";
  const isRead = animState === "read";
  const isCount = animState === "count";
  const isCarry = animState === "carry";
  const isSneak = animState === "sneak";
  const isWrite = animState === "write";
  const isAim = animState === "aim";
  const isMap = animState === "map";
  const isWander = animState === "wander";

  // Legs
  if (isWander && frame === 1) {
    parts += rect(13, 22 + bobY, 3, 4, "#4a3020");
    parts += rect(18, 22 + bobY, 3, 5, "#4a3020");
  } else {
    parts += rect(12, 22 + bobY, 3, 5, "#4a3020");
    parts += rect(17, 22 + bobY, 3, 5, "#4a3020");
  }
  parts += rect(11, 26 + bobY, 4, 2, "#3a2010");
  parts += rect(17, 26 + bobY, 4, 2, "#3a2010");

  // Body
  if (isSneak) {
    parts += rect(12, 16 + bobY, 8, 7, tunicC, 2);
  } else {
    parts += rect(11, 14 + bobY, 10, 10, tunicC, 2);
    parts += rect(11, 20 + bobY, 10, 2, C.iron);
    parts += rect(15, 19 + bobY, 2, 3, C.gold);
  }

  // Arms + Tools
  if (isMine) {
    if (frame === 0) {
      parts += rect(6, 16 + bobY, 4, 3, tunicC, 1);
      parts += rect(22, 16 + bobY, 4, 3, tunicC, 1);
    } else {
      parts += rect(6, 14 + bobY, 4, 3, tunicC, 1);
      parts += rect(22, 12 + bobY, 4, 3, tunicC, 1);
      parts += line(24, 13 + bobY, 14, 6, C.wood, 1.5);
      parts += rect(10, 3, 10, 5, C.iron);
      parts += path(`M10,3 L8,0 L10,5 Z`, C.iron);
      parts += path(`M20,3 L22,0 L20,5 Z`, C.iron);
    }
  } else if (isForge) {
    if (frame === 0) {
      parts += rect(6, 16 + bobY, 4, 3, tunicC, 1);
      parts += rect(22, 15 + bobY, 4, 3, tunicC, 1);
      parts += line(24, 16 + bobY, 26, 10, C.wood, 1.5);
      parts += rect(24, 8, 6, 4, C.iron);
      parts += rect(26, 6, 2, 3, C.ironBright);
    } else {
      parts += rect(6, 16 + bobY, 4, 3, tunicC, 1);
      parts += rect(22, 10 + bobY, 4, 3, tunicC, 1);
      parts += line(24, 11 + bobY, 16, 2, C.wood, 1.5);
      parts += rect(14, 0, 6, 4, C.iron);
    }
  } else if (isGuard) {
    // Shield
    parts += rect(4, 14 + bobY, 4, 12, C.iron);
    parts += rect(5, 15 + bobY, 2, 10, C.ironBright);
    if (frame === 0) {
      parts += rect(22, 16 + bobY, 4, 3, tunicC, 1);
      parts += line(24, 17 + bobY, 28, 8, C.wood, 1);
      parts += rect(26, 5, 6, 5, C.iron);
    } else {
      parts += rect(22, 14 + bobY, 4, 3, tunicC, 1);
      parts += line(24, 15 + bobY, 26, 10, C.wood, 1);
      parts += rect(24, 8, 6, 4, C.iron);
    }
  } else if (isCraft) {
    // Workbench
    parts += rect(2, 22 + bobY, 20, 3, C.wood);
    if (frame === 0) {
      parts += rect(6, 16 + bobY, 4, 3, tunicC, 1);
      parts += rect(14, 18 + bobY, 4, 3, tunicC, 1);
      parts += rect(12, 14 + bobY, 6, 6, C.stoneLit, 1);
    } else {
      parts += rect(6, 15 + bobY, 4, 3, tunicC, 1);
      parts += rect(14, 16 + bobY, 4, 3, tunicC, 1);
      parts += line(16, 17 + bobY, 18, 12, C.iron, 1.5);
    }
  } else if (isRead) {
    // Open book
    parts += rect(6, 16 + bobY, 4, 3, tunicC, 1);
    parts += rect(22, 16 + bobY, 4, 3, tunicC, 1);
    parts += rect(8, 14 + bobY, 14, 2, "#f5deb3");
    parts += rect(10, 12 + bobY, 10, 3, "#fff8e0");
    parts += line(15, 12 + bobY, 15, 15 + bobY, "#ccc", 0.5);
  } else if (isCount) {
    // Coins
    parts += rect(6, 16 + bobY, 4, 3, tunicC, 1);
    parts += rect(22, 17 + bobY, 4, 3, tunicC, 1);
    parts += circle(8, 15 + bobY, 2.5, C.gold);
    parts += circle(12, 15 + bobY, 2.5, C.gold);
    parts += circle(10, 13 + bobY, 2.5, C.gold);
    parts += circle(24, 15 + bobY, 2.5, C.gold);
  } else if (isCarry) {
    // Crate
    parts += rect(6, 16 + bobY, 4, 3, tunicC, 1);
    parts += rect(22, 16 + bobY, 4, 3, tunicC, 1);
    parts += rect(10, 10 + bobY, 12, 8, C.wood, 1);
    parts += line(12, 10 + bobY, 20, 18 + bobY, "#4a3020", 0.5);
    parts += line(20, 10 + bobY, 12, 18 + bobY, "#4a3020", 0.5);
  } else if (isSneak) {
    // Crouched, dagger
    parts += rect(8, 14 + bobY, 4, 3, tunicC, 1);
    parts += rect(18, 17 + bobY, 4, 3, tunicC, 1);
    parts += line(20, 18 + bobY, 26, 14, C.iron, 1.5);
    parts += line(26, 14, 27, 12, C.iron, 2);
  } else if (isWrite) {
    // Desk + quill
    parts += rect(2, 20 + bobY, 20, 2, C.wood);
    parts += rect(6, 15 + bobY, 4, 3, tunicC, 1);
    parts += rect(22, 16 + bobY, 4, 3, tunicC, 1);
    parts += rect(8, 13 + bobY, 10, 7, "#f5deb3", 1);
    if (frame === 0) {
      parts += line(16, 14 + bobY, 18, 8, C.wood, 0.8);
    } else {
      parts += line(16, 14 + bobY, 20, 10, C.wood, 0.8);
    }
    parts += circle(18, 8 + bobY, 1, "#2a2a2a");
  } else if (isAim) {
    // Bow
    parts += rect(6, 16 + bobY, 4, 3, tunicC, 1);
    parts += rect(22, 15 + bobY, 4, 3, tunicC, 1);
    parts += path(`M6,${16 + bobY} Q2,10 6,8`, "none", C.wood, 1);
    parts += line(6, 12 + bobY, 20, 8, C.wood, 0.8);
    parts += line(6, 8, 6, 12 + bobY, "#8B4513", 0.5);
    parts += polygon(`20,7 22,8 20,9`, C.iron);
  } else if (isMap) {
    // Looking at map
    parts += rect(6, 16 + bobY, 4, 3, tunicC, 1);
    parts += rect(22, 16 + bobY, 4, 3, tunicC, 1);
    parts += rect(10, 12 + bobY, 12, 8, "#f5deb3", 1);
    parts += line(12, 14 + bobY, 18, 14 + bobY, "#8B4513", 0.5);
    parts += path(`M14,13+bobY L16,12 L18,14`, "none", "#4a7a4a", 0.5);
  } else if (isWander) {
    // Walking with staff
    parts += rect(6, 16 + bobY, 4, 3, tunicC, 1);
    parts += rect(22, 16 + bobY, 4, 3, tunicC, 1);
    parts += line(24, 17 + bobY, 28, 30, C.wood, 1.5);
    parts += circle(28, 30, 1.5, C.wood);
  } else {
    // Idle arms
    parts += rect(6, 16 + bobY, 4, 3, tunicC, 1);
    parts += rect(22, 16 + bobY, 4, 3, tunicC, 1);
  }

  // Beard
  parts += polygon(`12,${16 + bobY} 20,${16 + bobY} 18,${24 + bobY} 14,${24 + bobY}`, beardC);
  parts += line(16, 20 + bobY, 16, 23 + bobY, "rgba(0,0,0,0.2)", 0.5);

  // Head
  parts += circle(16, 12 + bobY, 5, C.skin);
  parts += circle(14, 11 + bobY, 1, "#000");
  parts += circle(18, 11 + bobY, 1, "#000");
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
    parts += path(
      `M10,${9 + bobY} Q16,${6 + bobY} 22,${9 + bobY}`,
      t.beard === "blonde" ? "#d4a050" : "#4a3020",
    );
  }

  return parts;
}

async function main() {
  await mkdir(SPRITES, { recursive: true });
  console.log("Generating state-specific dwarf animations...\n");

  let count = 0;
  for (const agentId of Object.keys(dwarfTraits)) {
    const state = dwarfTraits[agentId].state;

    // Skip if already generated (we ran the base script)
    // Generate work state: 2 frames
    const frames = [];
    for (let f = 0; f < 2; f++) {
      frames.push(drawDwarf(agentId, f, state));
    }

    const workSvg = svg(
      64,
      32,
      `<g transform="translate(0,0)">${frames[0]}</g>` +
        `<g transform="translate(32,0)">${frames[1]}</g>`,
    );
    const path = join(SPRITES, `dwarf-${agentId}-${state}.png`);
    await sharp(Buffer.from(workSvg)).png().toFile(path);
    count++;
    console.log(`  ✓  dwarf-${agentId}-${state}.png`);
  }

  console.log(`\n✅ ${count} state animations generated.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
