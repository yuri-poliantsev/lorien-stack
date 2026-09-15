import type { BotId } from "@lorien-stack/contracts";

import {
  persistThemeId,
  readStoredThemeId,
  resolveThemeId,
} from "./themes/choice.ts";
import {
  THEMES,
  themeIds,
  type ThemeHandle,
  type ThemeRenderInput,
} from "./themes/registry.ts";

export type ThemeHostHandle = {
  render: (input: ThemeRenderInput) => void;
  unmount: () => void;
  setTheme: (id: string) => void;
  themeId: () => string;
};

function mountArgs(onSelect: ((botId: BotId) => void) | undefined): {
  onSelect?: (botId: BotId) => void;
} {
  if (onSelect === undefined) {
    return {};
  }
  return { onSelect };
}

export function mountThemeHost(
  root: HTMLElement,
  input: { onSelect?: (botId: BotId) => void } = {},
): ThemeHostHandle {
  const ids = themeIds(THEMES);
  const choice = resolveThemeId({
    search: window.location.search,
    stored: readStoredThemeId(window.localStorage),
    ids,
  });
  let activeId = choice.id;
  let model: ThemeRenderInput = { roster: [], activity: new Map() };
  let handle: ThemeHandle = mountEntry(root, activeId, input.onSelect);
  writeChoice(activeId);

  function writeChoice(id: string): void {
    persistThemeId(id, window.location, window.history, window.localStorage);
    document.documentElement.dataset.theme = id;
  }

  function mountEntry(
    host: HTMLElement,
    id: string,
    onSelect: ((botId: BotId) => void) | undefined,
  ): ThemeHandle {
    const entry = THEMES.get(id) ?? THEMES.entries[0];
    return entry.mount(host, mountArgs(onSelect));
  }

  return {
    render(next) {
      model = next;
      handle.render(next);
    },
    setTheme(id) {
      const entry = THEMES.get(id) ?? THEMES.entries[0];
      if (entry.id !== activeId) {
        handle.unmount();
        activeId = entry.id;
        handle = entry.mount(root, mountArgs(input.onSelect));
        handle.render(model);
      }
      writeChoice(activeId);
    },
    themeId() {
      return activeId;
    },
    unmount() {
      handle.unmount();
    },
  };
}
