import type { BotId } from "@lorien-stack/contracts";

import type { Camera } from "./camera.ts";
import {
  persistThemeId,
  readStoredThemeId,
  resolveThemeId,
} from "./themes/choice.ts";
import {
  THEMES,
  themeIds,
  type ThemeEntry,
  type ThemeHandle,
  type ThemeMountContext,
  type ThemePalette,
  type ThemeRenderInput,
} from "./themes/registry.ts";

export type ThemeHostInput = {
  onSelect?: (botId: BotId) => void;
  camera: Camera;
  reducedMotion: () => boolean;
  shellRoot: HTMLElement;
};

export type ThemeHostHandle = {
  render: (input: ThemeRenderInput) => void;
  unmount: () => void;
  setTheme: (id: string) => void;
  remount: () => void;
  themeId: () => string;
};

const PALETTE_PROPERTIES: readonly [keyof ThemePalette, string][] = [
  ["panelBg", "--shell-panel-bg"],
  ["fg", "--shell-fg"],
  ["accent", "--shell-accent"],
  ["font", "--shell-font"],
];

export function mountThemeHost(
  root: HTMLElement,
  input: ThemeHostInput,
): ThemeHostHandle {
  const ids = themeIds(THEMES);
  const choice = resolveThemeId({
    search: window.location.search,
    stored: readStoredThemeId(window.localStorage),
    ids,
  });
  let activeId = entryFor(choice.id).id;
  let model: ThemeRenderInput = {
    roster: [],
    activity: new Map(),
    selectedBotId: undefined,
  };
  let handle: ThemeHandle = mount(activeId);
  writeChoice(activeId);

  function entryFor(id: string): ThemeEntry {
    return THEMES.get(id) ?? THEMES.entries[0];
  }

  function applyPalette(entry: ThemeEntry): void {
    for (const [key, property] of PALETTE_PROPERTIES) {
      const value = entry.palette?.[key];
      if (value === undefined) {
        input.shellRoot.style.removeProperty(property);
      } else {
        input.shellRoot.style.setProperty(property, value);
      }
    }
  }

  function context(entry: ThemeEntry): ThemeMountContext {
    const base: ThemeMountContext = {
      camera: input.camera,
      reducedMotion: input.reducedMotion(),
    };
    if (input.onSelect !== undefined) {
      base.onSelect = input.onSelect;
    }
    if (entry.palette !== undefined) {
      base.palette = entry.palette;
    }
    return base;
  }

  function mount(id: string): ThemeHandle {
    const entry = entryFor(id);
    applyPalette(entry);
    return entry.mount(root, context(entry));
  }

  function writeChoice(id: string): void {
    persistThemeId(id, window.location, window.history, window.localStorage);
    document.documentElement.dataset.theme = id;
  }

  function swap(id: string): void {
    handle.unmount();
    activeId = id;
    handle = mount(activeId);
    handle.render(model);
  }

  return {
    render(next) {
      model = next;
      handle.render(next);
    },
    setTheme(id) {
      const entry = entryFor(id);
      if (entry.id !== activeId) {
        swap(entry.id);
      }
      writeChoice(activeId);
    },
    remount() {
      swap(activeId);
    },
    themeId() {
      return activeId;
    },
    unmount() {
      handle.unmount();
    },
  };
}
