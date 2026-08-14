// Theme loader — discovers and loads theme manifests from the themes directory.
// To add a theme, drop a .json file here. No code changes needed.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ThemeManifest } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve theme dir: try source first (dev), fall back to dist (production).
function resolveThemeDir(): string {
  // Source dir: three levels up from dist/gui/themes/loader.js
  const sourceDir = path.resolve(__dirname, "../../../src/gui/themes");

  try {
    const hasJson = fs.readdirSync(sourceDir).some((f) => f.endsWith(".json"));
    if (hasJson) return sourceDir;
  } catch {
    /* directory may not exist */
  }

  // Fallback: same directory as this compiled JS file (dist/gui/themes/).
  const primary = __dirname;
  try {
    const hasJson = fs.readdirSync(primary).some((f) => f.endsWith(".json"));
    if (hasJson) return primary;
  } catch {
    /* fall through */
  }

  return sourceDir; // last resort
}

const THEME_DIR = resolveThemeDir();

function discoverThemeFiles(): string[] {
  try {
    return fs
      .readdirSync(THEME_DIR)
      .filter((f) => f.endsWith(".json"))
      .filter((f) => f !== "package.json" && f !== "tsconfig.json");
  } catch {
    return [];
  }
}

let themeCache: Map<string, ThemeManifest> | null = null;

function loadAllThemes(): Map<string, ThemeManifest> {
  if (themeCache) return themeCache;

  themeCache = new Map();
  const files = discoverThemeFiles();

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(THEME_DIR, file), "utf-8");
      const manifest = JSON.parse(raw) as ThemeManifest;
      themeCache.set(manifest.name, manifest);
    } catch (err) {
      console.warn(`[pipeline-gui] Failed to load theme ${file}: ${String(err)}`);
    }
  }

  return themeCache;
}

/** Invalidate the theme cache so new/updated themes are picked up. */
export function clearThemeCache(): void {
  themeCache = null;
}

/** Get a single theme by name. Throws if not found. */
export function loadTheme(themeName: string): ThemeManifest {
  const themes = loadAllThemes();
  const theme = themes.get(themeName);
  if (!theme) {
    throw new Error(`Theme not found: ${themeName}. Available: ${[...themes.keys()].join(", ")}`);
  }
  return theme;
}

/** List all available themes (metadata only, no sprites/assets). */
export function listThemes(): {
  name: string;
  label: string;
  description: string;
  style: string;
  version: string;
}[] {
  const themes = loadAllThemes();
  return [...themes.values()].map((t) => ({
    name: t.name,
    label: t.label,
    description: t.description,
    style: t.style,
    version: t.version,
  }));
}
