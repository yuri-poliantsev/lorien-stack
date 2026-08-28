import type { ActivityEvent, BotId, BotRecord } from "@bot-space/contracts";

import { mountStarCraftTheme } from "./themes/starcraft/scene.ts";

export type ThemeHostHandle = {
  render: (input: {
    roster: readonly BotRecord[];
    activity: ReadonlyMap<BotId, readonly ActivityEvent[]>;
  }) => void;
};

export function mountThemeHost(
  root: HTMLElement,
  input: { onSelect?: (botId: BotId) => void } = {},
): ThemeHostHandle {
  if (input.onSelect === undefined) {
    return mountStarCraftTheme(root, {});
  }
  return mountStarCraftTheme(root, { onSelect: input.onSelect });
}
