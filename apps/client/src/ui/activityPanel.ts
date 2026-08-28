import type { ActivityEvent, BotRecord } from "@bot-space/contracts";

import { summarizeEvent } from "../safeSnippet.ts";

export type ActivityPanelModel = {
  bot: BotRecord | undefined;
  events: readonly ActivityEvent[];
};

export type ActivityPanelHandle = {
  update: (model: ActivityPanelModel) => void;
};

export function mountActivityPanel(root: HTMLElement): ActivityPanelHandle {
  root.dataset.testid = "activity-panel";

  return {
    update(model) {
      root.replaceChildren();
      const heading = document.createElement("h2");
      heading.dataset.testid = "activity-bot-name";
      heading.textContent = model.bot === undefined ? "Activity" : model.bot.name;
      root.append(heading);
      if (model.bot === undefined) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.dataset.testid = "activity-empty";
        empty.textContent = "Select a bot to read the tape.";
        root.append(empty);
        return;
      }
      const sub = document.createElement("p");
      sub.className = "muted activity-id";
      sub.textContent = model.bot.id;
      root.append(sub);
      if (model.events.length === 0) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.dataset.testid = "activity-empty";
        empty.textContent = "No lines yet.";
        root.append(empty);
        return;
      }
      const list = document.createElement("ol");
      list.className = "activity-rows";
      list.dataset.testid = "activity-rows";
      for (const event of model.events) {
        const row = summarizeEvent(event);
        const item = document.createElement("li");
        item.className = "activity-row";
        item.dataset.role = row.role;
        item.dataset.eventId = row.id;
        const chip = document.createElement("span");
        chip.className = "role-chip";
        chip.dataset.testid = "role-chip";
        chip.textContent = row.role;
        item.append(chip);
        if (row.toolName !== undefined) {
          const tool = document.createElement("span");
          tool.className = "tool-name";
          tool.dataset.testid = "tool-name";
          tool.textContent = row.toolName;
          item.append(tool);
        }
        const snippet = document.createElement("span");
        snippet.className = "snippet";
        snippet.dataset.testid = "snippet";
        snippet.textContent = row.snippet;
        item.append(snippet);
        list.append(item);
      }
      root.append(list);
    },
  };
}
