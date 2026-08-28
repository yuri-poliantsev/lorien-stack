import type { BotId, BotRecord, PresenceHint } from "@bot-space/contracts";

export type BotListModel = {
  bots: readonly BotRecord[];
  selectedBotId: BotId | undefined;
  presence: ReadonlyMap<BotId, PresenceHint>;
};

export type BotListHandle = {
  update: (model: BotListModel) => void;
};

export function mountBotList(
  root: HTMLElement,
  input: { onSelect: (botId: BotId) => void },
): BotListHandle {
  root.dataset.testid = "bot-list";

  function badgeFor(hint: PresenceHint | undefined): string | undefined {
    if (hint === undefined) {
      return undefined;
    }
    return hint.reason;
  }

  return {
    update(model) {
      root.replaceChildren();
      const heading = document.createElement("h2");
      heading.textContent = "Bots";
      root.append(heading);
      root.dataset.rosterCount = String(model.bots.length);
      if (model.bots.length === 0) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = "waiting for roster";
        root.append(empty);
        return;
      }
      const list = document.createElement("ul");
      list.className = "bot-rows";
      for (const bot of model.bots) {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "bot-row";
        button.dataset.testid = "bot-row";
        button.dataset.botId = bot.id;
        button.dataset.botName = bot.name;
        if (model.selectedBotId === bot.id) {
          button.dataset.selected = "true";
          button.setAttribute("aria-current", "true");
        }
        const name = document.createElement("span");
        name.className = "bot-name";
        name.textContent = bot.name;
        button.append(name);
        const hint = model.presence.get(bot.id);
        const reason = badgeFor(hint);
        if (reason !== undefined) {
          const badge = document.createElement("span");
          badge.className = "presence-badge";
          badge.dataset.testid = "presence-badge";
          badge.dataset.reason = reason;
          badge.textContent = reason;
          button.append(badge);
        }
        const botId = bot.id;
        button.addEventListener("click", () => {
          input.onSelect(botId);
        });
        item.append(button);
        list.append(item);
      }
      root.append(list);
    },
  };
}
