import type { BotId } from "@lorien-stack/contracts";

import { ageLabel } from "./format.ts";
import type { RosterRow } from "./model.ts";

const ROSTER_COLLAPSED_KEY = "lorien.roster.collapsed";

type RosterPanelModel = {
  rows: readonly RosterRow[];
  selectedBotId: BotId | undefined;
};

type RosterPanelHandle = {
  update: (model: RosterPanelModel) => void;
  collapsed: () => boolean;
  unmount: () => void;
};

type RowNodes = {
  item: HTMLLIElement;
  button: HTMLButtonElement;
  name: HTMLElement;
  action: HTMLElement;
  age: HTMLElement;
};

export function mountRosterPanel(
  root: HTMLElement,
  input: {
    onSelect: (botId: BotId) => void;
    storage: Pick<Storage, "getItem" | "setItem">;
  },
): RosterPanelHandle {
  const panel = document.createElement("aside");
  panel.className = "roster-panel";
  panel.dataset.testid = "roster-panel";
  panel.dataset.shellOverlay = "true";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "roster-toggle";
  toggle.dataset.testid = "roster-toggle";

  const body = document.createElement("div");
  body.className = "roster-body";

  const list = document.createElement("ol");
  list.className = "roster-rows";
  list.dataset.testid = "roster-rows";

  const empty = document.createElement("p");
  empty.className = "roster-empty";
  empty.textContent = "waiting for roster";

  body.append(list, empty);
  panel.append(toggle, body);
  root.append(panel);

  let collapsed = input.storage.getItem(ROSTER_COLLAPSED_KEY) === "1";
  const nodes = new Map<BotId, RowNodes>();
  paintCollapsed();

  function paintCollapsed(): void {
    panel.dataset.collapsed = collapsed ? "true" : "false";
    toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    toggle.textContent = collapsed ? "Roster" : "Roster \u2013";
    toggle.title = collapsed ? "Expand the roster" : "Collapse the roster";
    body.hidden = collapsed;
  }

  function onToggle(): void {
    collapsed = !collapsed;
    input.storage.setItem(ROSTER_COLLAPSED_KEY, collapsed ? "1" : "0");
    paintCollapsed();
  }
  toggle.addEventListener("click", onToggle);

  function rowNodesFor(row: RosterRow): RowNodes {
    const existing = nodes.get(row.botId);
    if (existing !== undefined) {
      return existing;
    }
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "roster-row";
    // Step 4's capture lever counts [data-testid=bot-row]; scripts/ is not this step's to edit.
    button.dataset.testid = "bot-row";
    button.dataset.botId = row.botId;
    const dot = document.createElement("span");
    dot.className = "roster-dot";
    dot.setAttribute("aria-hidden", "true");
    const name = document.createElement("span");
    name.className = "roster-name";
    const action = document.createElement("span");
    action.className = "roster-action";
    const age = document.createElement("span");
    age.className = "roster-age";
    button.append(dot, name, action, age);
    item.append(button);
    const botId = row.botId;
    button.addEventListener("click", () => {
      input.onSelect(botId);
    });
    const created: RowNodes = { item, button, name, action, age };
    nodes.set(botId, created);
    return created;
  }

  return {
    update(model) {
      panel.dataset.rosterCount = String(model.rows.length);
      empty.hidden = model.rows.length > 0;
      const live = new Set<BotId>();
      const order: HTMLLIElement[] = [];
      for (const row of model.rows) {
        live.add(row.botId);
        const cells = rowNodesFor(row);
        cells.button.dataset.state = row.state;
        cells.button.dataset.action = row.action;
        cells.button.dataset.botName = row.name;
        cells.button.setAttribute(
          "aria-label",
          `${row.name}, ${row.state}, ${row.action}`,
        );
        if (model.selectedBotId === row.botId) {
          cells.button.dataset.selected = "true";
          cells.button.setAttribute("aria-current", "true");
        } else {
          delete cells.button.dataset.selected;
          cells.button.removeAttribute("aria-current");
        }
        cells.name.textContent = row.name;
        // A wall of "unknown" reads as an error at 40 bots. The dot already carries
        // presence, so the word is spent only on an action we actually observed.
        cells.action.textContent = row.action === "unknown" ? "" : row.action;
        cells.age.textContent = ageLabel(row.ageMs);
        order.push(cells.item);
      }
      for (const [botId, cells] of nodes) {
        if (!live.has(botId)) {
          cells.item.remove();
          nodes.delete(botId);
        }
      }
      list.replaceChildren(...order);
    },
    collapsed() {
      return collapsed;
    },
    unmount() {
      toggle.removeEventListener("click", onToggle);
      panel.remove();
      nodes.clear();
    },
  };
}
