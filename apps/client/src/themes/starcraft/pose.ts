import type { ActivityEvent } from "@lorien-stack/contracts";

import type { ThemePose } from "../hooks.ts";

export const WORK_MS = 12_000;
export const SLEEP_MS = 22_000;

export function poseFromPulse(input: {
  eventCount: number;
  msSincePulse: number;
  workMs?: number;
  sleepMs?: number;
}): ThemePose {
  const workMs = input.workMs ?? WORK_MS;
  const sleepMs = input.sleepMs ?? SLEEP_MS;
  if (input.eventCount === 0) {
    return input.msSincePulse >= sleepMs ? "sleeping" : "idle";
  }
  if (input.msSincePulse < workMs) {
    return "working";
  }
  if (input.msSincePulse < sleepMs) {
    return "idle";
  }
  return "sleeping";
}

export function eventSignature(events: readonly ActivityEvent[] | undefined): string {
  if (events === undefined || events.length === 0) {
    return "0";
  }
  const last = events[events.length - 1];
  return last === undefined ? String(events.length) : `${events.length}:${last.id}`;
}
