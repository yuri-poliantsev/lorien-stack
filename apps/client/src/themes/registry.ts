import type { ActivityEvent, BotId, BotRecord } from "@lorien-stack/contracts";

import { mountStarCraftTheme } from "./starcraft/scene.ts";

export type ThemeRenderInput = {
  roster: readonly BotRecord[];
  activity: ReadonlyMap<BotId, readonly ActivityEvent[]>;
};

export type ThemeHandle = {
  render(input: ThemeRenderInput): void;
  unmount(): void;
};

export type ThemePreview =
  | { kind: "url"; href: string }
  | { kind: "draw"; paint: (canvas: HTMLCanvasElement) => void };

export type ThemeEntry = {
  id: string;
  label: string;
  mount: (
    root: HTMLElement,
    opts: { onSelect?: (botId: BotId) => void },
  ) => ThemeHandle;
  preview: ThemePreview;
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
};

export const THEMES: ThemeRegistry = {
  entries: [STARCRAFT],
  get(id) {
    return this.entries.find((entry) => entry.id === id);
  },
};

export function themeIds(registry: ThemeRegistry): readonly string[] {
  return registry.entries.map((entry) => entry.id);
}
