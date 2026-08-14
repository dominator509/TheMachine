#!/usr/bin/env node
/** Generate the updated moria-dwarves.json theme with animation data + background paths */
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const THEME_DIR = join(__dirname, "..", "packages/service/src/gui/themes");
const OUT_PATH = join(THEME_DIR, "moria-dwarves.json");

// Dwarf traits (must match the asset generator)
const dwarfTraits = {
  1: { name: "Durin VII", state: "mine" },
  2: { name: "Balin", state: "mine" },
  3: { name: "Dwalin", state: "mine" },
  4: { name: "Óin", state: "mine" },
  5: { name: "Glóin", state: "guard" },
  6: { name: "Bifur", state: "craft" },
  7: { name: "Bofur", state: "mine" },
  8: { name: "Bombur", state: "forge" },
  9: { name: "Ori", state: "read" },
  10: { name: "Dori", state: "count" },
  11: { name: "Nori", state: "carry" },
  12: { name: "Fíli", state: "sneak" },
  13: { name: "Kíli", state: "write" },
  14: { name: "Thorin III", state: "forge" },
  15: { name: "Gimli", state: "aim" },
  16: { name: "Flói", state: "mine" },
  17: { name: "Frar", state: "guard" },
  18: { name: "Lóni", state: "mine" },
  19: { name: "Náli", state: "map" },
  20: { name: "Thráin", state: "wander" },
  21: { name: "Thrór", state: "guard" },
  22: { name: "Fundin", state: "craft" },
  23: { name: "Náin", state: "forge" },
  24: { name: "Dáin", state: "forge" },
};

const stationData = {
  "council-chamber": { grid: [8, 5], bg: "council-chamber.png" },
  "great-forge": { grid: [8, 5], bg: "great-forge.png" },
  "rune-archives": { grid: [6, 4], bg: "rune-archives.png" },
  "testing-cavern": { grid: [8, 5], bg: "testing-cavern.png" },
  "durins-door": { grid: [4, 4], bg: "durins-door.png" },
  bridge: { grid: [6, 4], bg: "bridge.png" },
  "great-gates": { grid: [4, 3], bg: "great-gates.png" },
  "mithril-vein": { grid: [6, 4], bg: "mithril-vein.png" },
  "drum-chamber": { grid: [4, 3], bg: "drum-chamber.png" },
  treasury: { grid: [6, 4], bg: "treasury.png" },
};

function makeAnimations(agentId, defaultState) {
  const anims = {
    idle: {
      src: `/assets/moria-dwarves/sprites/dwarf-${agentId}-idle.png`,
      width: 32,
      height: 32,
      frames: 2,
      frameDurationMs: 600,
    },
  };
  // Work state animation
  anims[defaultState] = {
    src: `/assets/moria-dwarves/sprites/dwarf-${agentId}-${defaultState}.png`,
    width: 32,
    height: 32,
    frames: 2,
    frameDurationMs: 500,
  };
  return anims;
}

function buildSprites() {
  const sprites = {};
  for (const [id, info] of Object.entries(dwarfTraits)) {
    sprites[id] = {
      name: info.name,
      defaultState: info.state,
      scale: 1.0,
      animations: makeAnimations(id, info.state),
    };
  }
  return sprites;
}

function buildStations() {
  const stations = {};
  for (const [name, info] of Object.entries(stationData)) {
    const [grid, max] = info.grid;
    const slots = [];
    for (let i = 0; i < max; i++) {
      slots.push({
        id: `slot-${i}`,
        label: `Post ${i + 1}`,
        maxAgents: 3,
      });
    }
    stations[name] = {
      label: name
        .split("-")
        .map((w) => w[0].toUpperCase() + w.slice(1))
        .join(" "),
      tileSize: 32,
      gridWidth: grid,
      gridHeight: max,
      backgroundImage: `/assets/moria-dwarves/${info.bg}`,
      backgroundCss: "",
      slots,
    };
  }
  return stations;
}

// Build full manifest
const manifest = {
  name: "moria-dwarves",
  label: "Khazad-dûm: Mithril Mines",
  description:
    "Tolkien-themed dwarven aesthetic — 24 dwarf agents mining mithril in the vast halls of Khazad-dûm (Moria). Deep stone, torchlight, and dwarven craftsmanship.",
  style: "tolkien-fantasy",
  version: "2.0.0",
  tileSize: 32,
  sprites: buildSprites(),
  stations: buildStations(),
  chrome: {
    backgroundColor: "#0a0a14",
    panelBackground: "#1a1428",
    borderColor: "#3a2a1a",
    textColor: "#d0c8a0",
    textDimColor: "#887a50",
    accentColor: "#c8a040",
    accentGlow: "rgba(200,160,64,0.3)",
    successColor: "#4ade80",
    warningColor: "#fbbf24",
    dangerColor: "#f87147",
    infoColor: "#60a5fa",
    fontMono: "'Courier New', Courier, monospace",
    fontUi: "system-ui, -apple-system, sans-serif",
  },
  audio: {
    bgm: null,
    sfx: {},
  },
};

writeFileSync(OUT_PATH, JSON.stringify(manifest, null, 2));
console.log(`✅ moria-dwarves.json written (${JSON.stringify(manifest).length} chars)`);
console.log(
  `   ${Object.keys(manifest.sprites).length} sprites, ${Object.keys(manifest.stations).length} stations`,
);
