import { timeLabel } from "./format.ts";
import type { TapeRow } from "./model.ts";

export type InspectorModel = {
  open: boolean;
  title: string;
  rows: readonly TapeRow[];
};

export type InspectorHandle = {
  update: (model: InspectorModel) => void;
  unmount: () => void;
};

export function mountInspector(
  root: HTMLElement,
  input: { onClose: () => void },
): InspectorHandle {
  const drawer = document.createElement("aside");
  drawer.className = "inspector";
  drawer.dataset.testid = "inspector";
  drawer.dataset.open = "false";
  drawer.setAttribute("aria-label", "Inspector");

  const head = document.createElement("div");
  head.className = "inspector-head";
  const title = document.createElement("h2");
  title.className = "inspector-title";
  title.dataset.testid = "inspector-title";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "inspector-close";
  close.dataset.testid = "inspector-close";
  close.textContent = "\u00d7";
  close.title = "Close the inspector";
  close.setAttribute("aria-label", "Close the inspector");
  close.addEventListener("click", input.onClose);
  head.append(title, close);

  const tape = document.createElement("ol");
  tape.className = "tape";
  tape.dataset.testid = "tape";

  const empty = document.createElement("p");
  empty.className = "tape-empty";
  empty.textContent = "no activity yet";

  drawer.append(head, tape, empty);
  root.append(drawer);

  function rowNode(row: TapeRow): HTMLLIElement {
    const item = document.createElement("li");
    item.className = "tape-row";
    item.dataset.testid = "tape-row";
    item.dataset.role = row.role;

    const top = document.createElement("div");
    top.className = "tape-top";
    const tool = document.createElement("span");
    tool.className = "tape-tool";
    tool.dataset.testid = "tape-tool";
    tool.textContent = row.toolName ?? row.role;
    const at = document.createElement("time");
    at.className = "tape-at";
    at.dateTime = row.at;
    at.textContent = timeLabel(row.at);
    top.append(tool, at);

    const meta = document.createElement("div");
    meta.className = "tape-meta";
    if (row.path !== undefined) {
      const path = document.createElement("span");
      path.className = "tape-path";
      path.dataset.testid = "tape-path";
      path.textContent = row.path;
      path.title = row.path;
      meta.append(path);
    }
    const role = document.createElement("span");
    role.className = "tape-role";
    role.textContent = row.role;
    meta.append(role);

    const text = document.createElement("p");
    text.className = "tape-text";
    text.dataset.testid = "tape-text";
    text.textContent = row.text;

    item.append(top, meta, text);
    return item;
  }

  return {
    update(model) {
      drawer.dataset.open = model.open ? "true" : "false";
      drawer.hidden = !model.open;
      title.textContent = model.title;
      empty.hidden = model.rows.length > 0;
      tape.replaceChildren(...model.rows.map(rowNode));
      tape.dataset.rowCount = String(model.rows.length);
    },
    unmount() {
      close.removeEventListener("click", input.onClose);
      drawer.remove();
    },
  };
}
