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

// Anchored on the hour each phase reads most strongly, and blended between the
// two that bracket the clock, so the cycle has no visible step at a boundary.
const ANCHORS: readonly (Sky & { hour: number })[] = [
  { hour: 0, name: "night", zenith: "#08131d", mid: "#15243a", horizon: "#0d1c26", ambient: 0.4 },
  { hour: 6.5, name: "dawn", zenith: "#23405c", mid: "#7a6a86", horizon: "#c9926a", ambient: 0.6 },
  { hour: 12.5, name: "day", zenith: "#2f6a86", mid: "#6d9aa2", horizon: "#a9c3b6", ambient: 0.95 },
  { hour: 19, name: "dusk", zenith: "#1d4350", mid: "#5c4468", horizon: "#1b3b48", ambient: 0.55 },
];

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
    return "asleep";
  }
  if (input.pose === "idle") {
    return "idle";
  }
  const parts = ["working", input.action];
  if (input.path !== undefined && input.path.length > 0) {
    parts.push(input.path);
  }
  return parts.join(" \u00b7 ");
}

export function skyAt(hours: number): Sky {
  const hour = ((hours % 24) + 24) % 24;
  let from = ANCHORS[ANCHORS.length - 1];
  let to = ANCHORS[0];
  if (from === undefined || to === undefined) {
    throw new Error("sky anchors must not be empty");
  }
  for (let i = 0; i < ANCHORS.length; i += 1) {
    const anchor = ANCHORS[i];
    if (anchor === undefined) {
      continue;
    }
    if (hour >= anchor.hour) {
      from = anchor;
      to = ANCHORS[i + 1] ?? ANCHORS[0];
    }
  }
  if (to === undefined) {
    throw new Error("sky anchors must not be empty");
  }
  const span = ((to.hour - from.hour + 24) % 24) || 24;
  const t = (((hour - from.hour + 24) % 24) % 24) / span;
  return {
    name: t < 0.5 ? from.name : to.name,
    zenith: mixHex(from.zenith, to.zenith, t),
    mid: mixHex(from.mid, to.mid, t),
    horizon: mixHex(from.horizon, to.horizon, t),
    ambient: Number((from.ambient + (to.ambient - from.ambient) * t).toFixed(4)),
  };
}

export function mixHex(a: string, b: string, t: number): string {
  const from = parseHex(a);
  const to = parseHex(b);
  const clamped = Math.min(1, Math.max(0, t));
  const channel = (i: number): string =>
    Math.round(from[i] + (to[i] - from[i]) * clamped)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

function parseHex(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}
