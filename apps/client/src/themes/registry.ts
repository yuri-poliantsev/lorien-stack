import type { ActivityEvent, BotId, BotRecord } from "@lorien-stack/contracts";

import type { Camera, Viewport } from "../camera.ts";
import { WORLD_HEIGHT as LORIEN_HEIGHT, WORLD_WIDTH as LORIEN_WIDTH } from "./lorien/layout.ts";
import { mountLorienTheme } from "./lorien/scene.ts";
import { WORLD_HEIGHT, WORLD_WIDTH } from "./starcraft/layout.ts";
import { mountStarCraftTheme } from "./starcraft/scene.ts";

export type ThemeRenderInput = {
  roster: readonly BotRecord[];
  activity: ReadonlyMap<BotId, readonly ActivityEvent[]>;
  // The shell owns selection. A theme that tracked its own copy would keep
  // highlighting a bot the roster no longer has selected.
  selectedBotId: BotId | undefined;
};

export type ThemeHandle = {
  render(input: ThemeRenderInput): void;
  unmount(): void;
};

export type ThemePalette = {
  panelBg: string;
  fg: string;
  accent: string;
  font: string;
};

export type ThemeMountContext = {
  onSelect?: (botId: BotId) => void;
  camera: Camera;
  reducedMotion: boolean;
  palette?: ThemePalette;
};

export type ThemePreview =
  | { kind: "url"; href: string }
  | { kind: "draw"; paint: (canvas: HTMLCanvasElement) => void };

export type ThemeEntry = {
  id: string;
  label: string;
  mount: (root: HTMLElement, context: ThemeMountContext) => ThemeHandle;
  preview: ThemePreview;
  world: Viewport;
  palette?: ThemePalette;
};

export type ThemeRegistry = {
  entries: readonly [ThemeEntry, ...ThemeEntry[]];
  get(id: string): ThemeEntry | undefined;
};

const STARCRAFT_PREVIEW =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect fill="#070a06" width="64" height="64"/><rect fill="#e0b24a" x="20" y="28" width="24" height="16"/></svg>`,
  );

const STARCRAFT: ThemeEntry = {
  id: "starcraft",
  label: "StarCraft",
  mount: mountStarCraftTheme,
  preview: { kind: "url", href: STARCRAFT_PREVIEW },
  world: { w: WORLD_WIDTH, h: WORLD_HEIGHT },
  palette: {
    panelBg: "rgba(10, 14, 8, 0.82)",
    fg: "#ece7d4",
    accent: "#e0b24a",
    font: '"IBM Plex Mono", ui-monospace, monospace',
  },
};

const LORIEN_PREVIEW =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect fill="#0f2a33" width="64" height="64"/><rect fill="#9db3b1" x="12" y="0" width="7" height="64"/><rect fill="#9db3b1" x="45" y="0" width="7" height="64"/><rect fill="#7a5a33" x="20" y="34" width="24" height="5"/><circle fill="#ffd7a0" cx="24" cy="28" r="4"/></svg>`,
  );

const LORIEN: ThemeEntry = {
  id: "lorien",
  label: "L\u00f3rien",
  mount: mountLorienTheme,
  preview: { kind: "url", href: LORIEN_PREVIEW },
  world: { w: LORIEN_WIDTH, h: LORIEN_HEIGHT },
  palette: {
    panelBg: "rgba(9, 20, 26, 0.82)",
    fg: "#ece4cf",
    accent: "#e8c378",
    font: '"IBM Plex Mono", ui-monospace, monospace',
  },
};

export const THEMES: ThemeRegistry = {
  entries: [STARCRAFT, LORIEN],
  get(id) {
    return this.entries.find((entry) => entry.id === id);
  },
};

export function themeIds(registry: ThemeRegistry): readonly string[] {
  return registry.entries.map((entry) => entry.id);
}
