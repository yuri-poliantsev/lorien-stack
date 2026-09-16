import type { ActivityEvent } from "@lorien-stack/contracts";

import { actionFromEvent, nametagFromBotName, pathFromToolEvent } from "../../actions.ts";
import type { ThemePose } from "../hooks.ts";

export type PlotLabel = { name: string; status: string; path: string };

// At eight bots a pad takes about 24 mono glyphs. At forty the chip is narrower, so the
// path budget drops to 16 and shortenPath keeps the filename.
export const PATH_CHARS = 24;
export const PATH_CHARS_CROWDED = 16;

export function plotLabel(input: {
  name: string;
  pose: ThemePose;
  events: readonly ActivityEvent[] | undefined;
  maxChars?: number;
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
    return { name, status: "WORKING", path: "" };
  }
  const budget = input.maxChars ?? PATH_CHARS;
  return {
    name,
    status: `WORKING · ${actionFromEvent(last).toUpperCase()}`,
    path: shortenPath(pathFromToolEvent(last) ?? "", budget),
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
