// Theme Manifest — defines the visual world for one GUI theme variant.
//
// Each theme is a self-contained JSON module. To add a new theme,
// create a new file here (e.g., shark-tank.json) and it auto-registers.
//
// Theme system:
//   - agentId  → sprite (character)
//   - station  → background / work-zone layout
//   - eventType → animation (idle, working, victory, alert)

// ---------------------------------------------------------------------------
// Sprite / Animation
// ---------------------------------------------------------------------------

export interface SpriteAnimation {
  /** Keyframe name: idle, walk, work, victory, alert, death. */
  state: string;
  /** Source image URL (relative to theme assets). */
  src: string;
  /** Frame dimensions. */
  width: number;
  height: number;
  /** Number of frames in the spritesheet. */
  frames: number;
  /** Frame duration in ms. */
  frameDurationMs: number;
  /** Loop the animation (default true). */
  loop?: boolean;
}

export interface SpriteConfig {
  /** Display name for the character. */
  name: string;
  /** Animations keyed by state name. */
  animations: Record<string, SpriteAnimation>;
  /** Default state. */
  defaultState: string;
  /** Scale multiplier (1.0 = original). */
  scale?: number;
}

// ---------------------------------------------------------------------------
// Station Layout
// ---------------------------------------------------------------------------

export interface StationSlot {
  /** Grid column (0-based). */
  col: number;
  /** Grid row (0-based). */
  row: number;
  /** Which agentId occupies this slot (0 = empty, available). */
  occupantAgentId?: number;
}

export interface StationLayout {
  /** Display name for the station. */
  name: string;
  /** Background image URL. */
  background: string;
  /** Grid dimensions. */
  gridCols: number;
  gridRows: number;
  /** Tile size in pixels. */
  tileSize: number;
  /** Where agents stand when at this station. */
  slots: StationSlot[];
}

// ---------------------------------------------------------------------------
// Theme Manifest
// ---------------------------------------------------------------------------

export interface ThemeManifest {
  /** Unique theme name — used in emitToGUI(theme: "...") */
  name: string;
  /** Human-readable label. */
  label: string;
  /** Short description shown in theme picker. */
  description: string;
  /** Art style identifier. */
  style: "fft-chibi" | "snes-pixel" | "nes-8bit" | "tolkien-fantasy" | "aquarium" | "custom";
  /** Version for asset cache busting. */
  version: string;
  /** Sprites for each agentId (1-24). Missing entries fall back to agent 1. */
  sprites: Record<string, SpriteConfig>;
  /** Station layouts. Missing stations fall back to 'planning'. */
  stations: Record<string, StationLayout>;
  /** Background music / ambience (optional). */
  bgm?: string;
  /** UI chrome theme colours. */
  chrome?: {
    primary: string;    // e.g. "#2d1b4e"
    secondary: string;  // e.g. "#c8a96e"
    text: string;       // e.g. "#f5eedc"
    panel: string;      // e.g. "rgba(0,0,0,0.7)"
  };
}
