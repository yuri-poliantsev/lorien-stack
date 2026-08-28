import type { ActivityEvent, BotId, BotRecord } from "@bot-space/contracts";

export type ThemeHostHandle = {
  render: (input: {
    roster: readonly BotRecord[];
    activity: ReadonlyMap<BotId, readonly ActivityEvent[]>;
  }) => void;
};

export function mountThemeHost(root: HTMLElement): ThemeHostHandle {
  root.dataset.themeHost = "placeholder";
  root.replaceChildren();
  const heading = document.createElement("h2");
  heading.textContent = "Floor";
  const list = document.createElement("pre");
  list.dataset.testid = "theme-placeholder";
  list.className = "theme-placeholder";
  root.append(heading, list);

  return {
    render(input) {
      if (input.roster.length === 0) {
        list.textContent = "no bots yet";
        return;
      }
      list.textContent = input.roster
        .map((bot) => {
          const count = input.activity.get(bot.id)?.length ?? 0;
          return count > 0 ? `${bot.name} (${count})` : bot.name;
        })
        .join("\n");
    },
  };
}
