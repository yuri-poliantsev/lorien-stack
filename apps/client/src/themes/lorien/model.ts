import type { ActivityEvent } from "@lorien-stack/contracts";

import type { Action } from "../../actions.ts";

export const WORK_MS = 12_000;
export const SLEEP_MS = 22_000;

export type FletPose = "working" | "idle" | "sleeping";

export type ActionProp = "scroll" | "quill" | "forge" | "speech" | "gaze" | "token";

export type SkyPhaseName = "night" | "dawn" | "day" | "dusk";

export type Sky = {
  name: SkyPhaseName;
  zenith: string;
  mid: string;
  horizon: string;
  ambient: number;
};

const PROPS: Record<Action, ActionProp> = {
  reading: "scroll",
  writing: "quill",
  shell: "forge",
  talking: "speech",
  thinking: "gaze",
  unknown: "token",
};

// Every phase stays inside the concept frame's teal-to-purple range, so no
// hour of the cycle reads paler than its dusk.
const NIGHT: Sky = { name: "night", zenith: "#102838", mid: "#243050", horizon: "#12283c", ambient: 0.4 };
const DAWN: Sky = { name: "dawn", zenith: "#3a4868", mid: "#8a5a58", horizon: "#2a4050", ambient: 0.58 };
const DAY: Sky = { name: "day", zenith: "#3a7080", mid: "#6a88a0", horizon: "#2a5868", ambient: 0.95 };
const DUSK: Sky = { name: "dusk", zenith: "#1c4a58", mid: "#4a3a68", horizon: "#163848", ambient: 0.55 };

export function poseFromPulse(input: {
  eventCount: number;
  msSincePulse: number;
  workMs?: number;
  sleepMs?: number;
}): FletPose {
  const workMs = input.workMs ?? WORK_MS;
  const sleepMs = input.sleepMs ?? SLEEP_MS;
  if (input.eventCount === 0) {
    return input.msSincePulse >= sleepMs ? "sleeping" : "idle";
  }
  if (input.msSincePulse < workMs) {
    return "working";
  }
  return input.msSincePulse < sleepMs ? "idle" : "sleeping";
}

export function eventSignature(events: readonly ActivityEvent[] | undefined): string {
  if (events === undefined || events.length === 0) {
    return "0";
  }
  const last = events[events.length - 1];
  return last === undefined ? String(events.length) : `${String(events.length)}:${last.id}`;
}

export function actionProp(action: Action): ActionProp {
  return PROPS[action];
}

export function inSceneLabel(input: {
  pose: FletPose;
  action: Action;
  path: string | undefined;
}): string {
  if (input.pose === "sleeping") {
    return "SLEEPING";
  }
  if (input.pose === "idle") {
    return "IDLE";
  }
  const parts = ["WORKING", input.action];
  if (input.path !== undefined && input.path.length > 0) {
    parts.push(shortPath(input.path));
  }
  return parts.join(LABEL_SEPARATOR);
}

export const LABEL_SEPARATOR = " \u00b7 ";
export const PATH_CHARS = 28;

// Keeps whole trailing segments behind an ellipsis, so the file name and its
// nearest directories survive and the repository root is what gets cut.
export function shortPath(path: string, maxChars: number = PATH_CHARS): string {
  if (path.length <= maxChars) {
    return path;
  }
  const parts = path.split("/").filter((part) => part.length > 0);
  let kept = "";
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const next = kept.length === 0 ? (parts[i] ?? "") : `${parts[i] ?? ""}/${kept}`;
    if (next.length + 1 > maxChars) {
      break;
    }
    kept = next;
  }
  if (kept.length === 0) {
    kept = path.slice(path.length - (maxChars - 1));
  }
  return `\u2026${kept}`;
}

// Minutes past midnight on the real clock. Night holds until 05:00, dawn
// arrives by 07:00, day by 10:00, dusk at 20:00, and night again by midnight.
// Reduced motion pins the concept frame's dusk.
export function skyFromClock(input: { minutes: number; reducedMotion: boolean }): Sky {
  if (input.reducedMotion) {
    return DUSK;
  }
  const minutes = ((input.minutes % 1440) + 1440) % 1440;
  if (minutes < 5 * 60) {
    return NIGHT;
  }
  if (minutes < 7 * 60) {
    return mixSky(NIGHT, DAWN, (minutes - 5 * 60) / 120);
  }
  if (minutes < 17 * 60) {
    return mixSky(DAWN, DAY, Math.min(1, (minutes - 7 * 60) / 180));
  }
  if (minutes < 20 * 60) {
    return mixSky(DAY, DUSK, (minutes - 17 * 60) / 180);
  }
  return mixSky(DUSK, NIGHT, Math.min(1, (minutes - 20 * 60) / 240));
}

function mixSky(from: Sky, to: Sky, t: number): Sky {
  return {
    name: t < 0.5 ? from.name : to.name,
    zenith: mixHex(from.zenith, to.zenith, t),
    mid: mixHex(from.mid, to.mid, t),
    horizon: mixHex(from.horizon, to.horizon, t),
    ambient: Number((from.ambient + (to.ambient - from.ambient) * t).toFixed(4)),
  };
}

export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  const clamped = Math.min(1, Math.max(0, t));
  const channel = (from: number, to: number): string =>
    Math.round(from + (to - from) * clamped)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(ar, br)}${channel(ag, bg)}${channel(ab, bb)}`;
}

function parseHex(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}
