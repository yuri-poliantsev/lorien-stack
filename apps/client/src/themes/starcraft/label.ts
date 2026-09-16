import type { ActivityEvent } from "@lorien-stack/contracts";

import { actionFromEvent, nametagFromBotName, pathFromToolEvent } from "../../actions.ts";
import type { ThemePose } from "../hooks.ts";

export type PlotLabel = { name: string; status: string; path: string };

// Budgeted so the path line stays narrower than a pad at forty bots, where the plot is
// 167 world units wide and the mono glyph is about 7.
export const PATH_CHARS = 24;

export function plotLabel(input: {
  name: string;
  pose: ThemePose;
  events: readonly ActivityEvent[] | undefined;
}): PlotLabel {
  const name = nametagFromBotName(input.name);
  if (input.pose === "sleeping") {
    return { name, status: "", path: "" };
  }
  if (input.pose === "idle") {
    return { name, status: "idle", path: "" };
  }
  const events = input.events;
  const last = events === undefined ? undefined : events[events.length - 1];
  if (last === undefined) {
    return { name, status: "working", path: "" };
  }
  return {
    name,
    status: `working ${actionFromEvent(last)}`,
    path: shortenPath(pathFromToolEvent(last) ?? "", PATH_CHARS),
  };
}

// Keeps whole trailing segments so the filename a watcher is looking for survives,
// which a middle ellipsis or a hard slice would both cut.
export function shortenPath(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  const parts = value.split("/");
  let out = parts[parts.length - 1] ?? "";
  if (out.length + 2 > maxChars) {
    return `…${out.slice(out.length - (maxChars - 1))}`;
  }
  for (let i = parts.length - 2; i >= 0; i -= 1) {
    const next = `${parts[i] ?? ""}/${out}`;
    if (next.length + 2 > maxChars) {
      break;
    }
    out = next;
  }
  return `…/${out}`;
}
