import type { ActivityEvent, BotId, BotRecord } from "@lorien-stack/contracts";

import {
  actionFromEvent,
  nametagFromBotName,
  pathFromToolEvent,
  type Action,
} from "../../actions.ts";
import { ageLabel } from "../../shell/format.ts";
import type { ThemePose } from "../hooks.ts";

const WORK_MS = 12_000;
const SLEEP_MS = 22_000;
export const SPARK_BUCKETS = 20;
const SPARK_BUCKET_MS = 3_000;

const DASH = "\u2013";
const ELLIPSIS = "\u2026";
const MIDDLE_DOT = "\u00B7";
const MIN_PATH_CHARS = 6;


const POSE_WORDS: Record<ThemePose, string> = {
  working: "working",
  idle: "idle",
  sleeping: "asleep",
};

export function poseFor(input: {
  eventCount: number;
  msSinceActivity: number;
}): ThemePose {
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

type Tally = { roster: number; working: number; sleeping: number };

export const METRICS: readonly { key: keyof Tally; label: string }[] = [
  { key: "roster", label: "roster" },
  { key: "working", label: "live now" },
  { key: "sleeping", label: "asleep" },
];

export function tallyPoses(poses: readonly ThemePose[]): Tally {
  let working = 0;
  let sleeping = 0;
  for (const pose of poses) {
    if (pose === "working") {
      working += 1;
    } else if (pose === "sleeping") {
      sleeping += 1;
    }
  }
  return { roster: poses.length, working, sleeping };
}

export function metricText(n: number): string {
  return String(n).padStart(2, "0");
}

const ACTION_GLYPHS: Record<Action, string> = {
  reading: "\u2192",
  writing: "\u270E",
  shell: "$",
  talking: "\u2026",
  thinking: "?",
  unknown: "\u00B7",
};

// Keeps the file name, the part a watcher reads, and drops leading directories.
// String logic rather than a CSS `direction: rtl` ellipsis, which reorders bidi text.
export function truncateLeft(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  if (maxChars <= 1) {
    return ELLIPSIS;
  }
  return `${ELLIPSIS}${text.slice(text.length - (maxChars - 1))}`;
}

export function actionLine(input: {
  action: Action;
  path: string | undefined;
  maxChars: number;
}): string {
  const head = `${ACTION_GLYPHS[input.action]} ${input.action}`;
  if (input.path === undefined) {
    return head;
  }
  const separator = ` ${MIDDLE_DOT} `;
  const room = input.maxChars - head.length - separator.length;
  return `${head}${separator}${truncateLeft(input.path, Math.max(MIN_PATH_CHARS, room))}`;
}

export type CardModel = {
  botId: BotId;
  name: string;
  pose: ThemePose;
  state: string;
  line: string;
  age: string;
  events: number;
  bars: readonly number[];
};

export function cardModel(input: {
  bot: BotRecord;
  events: readonly ActivityEvent[] | undefined;
  nowMs: number;
  firstSeenMs: number;
  lineChars: number;
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
    line:
      last === undefined || quiet
        ? ""
        : actionLine({
            action: actionFromEvent(last),
            path: pathFromToolEvent(last),
            maxChars: input.lineChars,
          }),
    age: lastAt === undefined || quiet ? DASH : ageLabel(msSinceActivity),
    events: events.length,
    bars: activityBars({ events, nowMs: input.nowMs }),
  };
}

// Peaks at 13:00 and troughs at 01:00, so both the accent and the board's own
// day-or-night word come off one curve rather than two thresholds that can disagree.
function dayFactor(hour: number): number {
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
