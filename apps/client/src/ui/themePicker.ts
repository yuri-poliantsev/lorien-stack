import { nextThemeId } from "../themes/choice.ts";
import {
  THEMES,
  themeIds,
  type ThemeEntry,
  type ThemeRegistry,
} from "../themes/registry.ts";

export type ThemePickerHandle = {
  unmount: () => void;
};

function previewNode(entry: ThemeEntry): HTMLElement {
  if (entry.preview.kind === "url") {
    const img = document.createElement("img");
    img.className = "theme-preview";
    img.src = entry.preview.href;
    img.alt = "";
    img.width = 64;
    img.height = 64;
    return img;
  }
  const canvas = document.createElement("canvas");
  canvas.className = "theme-preview";
  canvas.width = 64;
  canvas.height = 64;
  entry.preview.paint(canvas);
  return canvas;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export function mountThemePicker(
  root: HTMLElement,
  input: {
    registry?: ThemeRegistry;
    getId: () => string;
    onSelect: (id: string) => void;
  },
): ThemePickerHandle {
  const registry = input.registry ?? THEMES;
  const ids = themeIds(registry);
  const group = document.createElement("div");
  group.className = "theme-picker";
  group.dataset.testid = "theme-picker";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "Theme");

  const buttons = new Map<string, HTMLButtonElement>();
  for (const entry of registry.entries) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.themeId = entry.id;
    button.textContent = entry.label;
    button.title = entry.label;
    button.setAttribute("aria-pressed", entry.id === input.getId() ? "true" : "false");
    button.append(previewNode(entry));
    const id = entry.id;
    button.addEventListener("click", () => {
      input.onSelect(id);
      paintPressed(input.getId());
    });
    buttons.set(entry.id, button);
    group.append(button);
  }
  root.append(group);

  function paintPressed(id: string): void {
    for (const [themeId, button] of buttons) {
      button.setAttribute("aria-pressed", themeId === id ? "true" : "false");
    }
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key !== "t" && event.key !== "T") {
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (isTypingTarget(event.target)) {
      return;
    }
    event.preventDefault();
    const next = nextThemeId(input.getId(), ids);
    input.onSelect(next);
    paintPressed(input.getId());
  }
  window.addEventListener("keydown", onKey);

  return {
    unmount() {
      window.removeEventListener("keydown", onKey);
      group.remove();
    },
  };
}
