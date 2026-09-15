import { countLabel } from "./format.ts";
import type { ShellStats } from "./model.ts";

export type HeaderHandle = {
  update: (stats: ShellStats) => void;
  pickerSlot: HTMLElement;
  unmount: () => void;
};

const STATS: readonly [keyof ShellStats, string, string][] = [
  ["working", "working", "working"],
  ["idle", "idle", "idle"],
  ["asleep", "asleep", "asleep"],
  ["eventsPerMinute", "ev/min", "rate"],
];

export function mountHeader(
  root: HTMLElement,
  input: { onToggleInspector: () => void },
): HeaderHandle {
  const mark = document.createElement("span");
  mark.className = "app-mark";
  mark.dataset.testid = "app-mark";
  mark.textContent = "lorien";

  const pickerSlot = document.createElement("div");
  pickerSlot.className = "header-picker";

  const strip = document.createElement("div");
  strip.className = "stats-strip";
  strip.dataset.testid = "stats-strip";
  strip.setAttribute("role", "status");
  strip.setAttribute("aria-live", "off");

  const values = new Map<keyof ShellStats, HTMLElement>();
  for (const [key, label, state] of STATS) {
    const cell = document.createElement("span");
    cell.className = "stat";
    cell.dataset.testid = `stat-${key}`;
    cell.dataset.state = state;
    const value = document.createElement("b");
    value.className = "stat-value";
    value.textContent = "0";
    const caption = document.createElement("span");
    caption.className = "stat-label";
    caption.textContent = label;
    cell.append(value, caption);
    values.set(key, value);
    strip.append(cell);
  }

  const inspectorToggle = document.createElement("button");
  inspectorToggle.type = "button";
  inspectorToggle.className = "inspector-toggle";
  inspectorToggle.dataset.testid = "inspector-toggle";
  inspectorToggle.textContent = "Inspector";
  inspectorToggle.addEventListener("click", input.onToggleInspector);

  root.append(mark, pickerSlot, strip, inspectorToggle);

  return {
    update(stats) {
      for (const [key, node] of values) {
        node.textContent = countLabel(stats[key]);
      }
      strip.dataset.working = String(stats.working);
      strip.dataset.idle = String(stats.idle);
      strip.dataset.asleep = String(stats.asleep);
      strip.dataset.eventsPerMinute = String(stats.eventsPerMinute);
    },
    pickerSlot,
    unmount() {
      inspectorToggle.removeEventListener("click", input.onToggleInspector);
      mark.remove();
      pickerSlot.remove();
      strip.remove();
      inspectorToggle.remove();
    },
  };
}
