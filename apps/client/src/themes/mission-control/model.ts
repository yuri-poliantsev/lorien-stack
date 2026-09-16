import type { ActivityEvent, BotId, BotRecord } from "@lorien-stack/contracts";

import {
  actionFromEvent,
  nametagFromBotName,
  pathFromToolEvent,
  type Action,
} from "../../actions.ts";
import { ageLabel } from "../../shell/format.ts";

export const WORK_MS = 12_000;
export const SLEEP_MS = 22_000;
export const SPARK_BUCKETS = 20;
export const SPARK_BUCKET_MS = 3_000;

const DASH = "\u2013";

export type CardPose = "working" | "idle" | "sleeping";

export const POSE_WORDS: Record<CardPose, string> = {
  working: "working",
  idle: "idle",
  sleeping: "asleep",
};

export function poseFor(input: {
  eventCount: number;
  msSinceActivity: number;
}): CardPose {
  if (input.eventCount === 0) {
    return input.msSinceActivity >= SLEEP_MS ? "sleeping" : "idle";
  }
  if (input.msSinceActivity < WORK_MS) {
    return "working";
  }
  if (input.msSinceActivity < SLEEP_MS) {
    return "idle";
  }
  return "sleeping";
}

export function activityBars(input: {
  events: readonly ActivityEvent[] | undefined;
  nowMs: number;
}): readonly number[] {
  const counts = new Array<number>(SPARK_BUCKETS).fill(0);
  const windowMs = SPARK_BUCKETS * SPARK_BUCKET_MS;
  for (const event of input.events ?? []) {
    const at = Date.parse(event.at);
    if (Number.isNaN(at)) {
      continue;
    }
    const age = input.nowMs - at;
    if (age < 0 || age >= windowMs) {
      continue;
    }
    const index = SPARK_BUCKETS - 1 - Math.floor(age / SPARK_BUCKET_MS);
    counts[index] = (counts[index] ?? 0) + 1;
  }
  const peak = Math.max(1, ...counts);
  return counts.map((n) => n / peak);
}

export type CardModel = {
  botId: BotId;
  name: string;
  pose: CardPose;
  state: string;
  action: Action | "";
  path: string;
  age: string;
  events: number;
  bars: readonly number[];
};

export function cardModel(input: {
  bot: BotRecord;
  events: readonly ActivityEvent[] | undefined;
  nowMs: number;
  firstSeenMs: number;
}): CardModel {
  const events = input.events ?? [];
  const last = events[events.length - 1];
  const lastAtRaw = last === undefined ? Number.NaN : Date.parse(last.at);
  const lastAt = Number.isNaN(lastAtRaw) ? undefined : lastAtRaw;
  const msSinceActivity = Math.max(0, input.nowMs - (lastAt ?? input.firstSeenMs));
  const pose = poseFor({ eventCount: events.length, msSinceActivity });
  const quiet = pose === "sleeping";
  return {
    botId: input.bot.id,
    name: nametagFromBotName(input.bot.name),
    pose,
    state: POSE_WORDS[pose],
    action: last === undefined || quiet ? "" : actionFromEvent(last),
    path: last === undefined || quiet ? "" : (pathFromToolEvent(last) ?? ""),
    age: lastAt === undefined || quiet ? DASH : ageLabel(msSinceActivity),
    events: events.length,
    bars: activityBars({ events, nowMs: input.nowMs }),
  };
}

// Peaks at 13:00 and troughs at 01:00, so both the accent and the board's own
// day-or-night word come off one curve rather than two thresholds that can disagree.
export function dayFactor(hour: number): number {
  const h = ((Math.trunc(hour) % 24) + 24) % 24;
  return (1 + Math.cos(((h - 13) / 24) * Math.PI * 2)) / 2;
}

export function accentForHour(hour: number): string {
  const day = dayFactor(hour);
  return `hsl(${(26 + 18 * day).toFixed(1)} 88% ${(48 + 10 * day).toFixed(1)}%)`;
}

export function boardClock(nowMs: number): { time: string; phase: "day" | "night" } {
  const at = new Date(nowMs);
  const hours = String(at.getHours()).padStart(2, "0");
  const minutes = String(at.getMinutes()).padStart(2, "0");
  return {
    time: `${hours}:${minutes}`,
    phase: dayFactor(at.getHours()) >= 0.5 ? "day" : "night",
  };
}
