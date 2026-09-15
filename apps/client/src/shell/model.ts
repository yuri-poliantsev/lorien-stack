import type {
  ActivityEvent,
  BotId,
  BotRecord,
  EventId,
  IsoTimestamp,
  PresenceHint,
} from "@lorien-stack/contracts";

import { actionFromEvent, pathFromToolEvent } from "../actions.ts";
import type { Action } from "../actions.ts";

export type PresenceState = "working" | "idle" | "asleep";

export type RosterRow = {
  botId: BotId;
  name: string;
  state: PresenceState;
  action: Action;
  ageMs: number | undefined;
};

export type ShellStats = {
  working: number;
  idle: number;
  asleep: number;
  eventsPerMinute: number;
};

export type TapeRow = {
  eventId: EventId;
  role: ActivityEvent["role"];
  toolName: string | undefined;
  path: string | undefined;
  at: IsoTimestamp;
  text: string;
};

export type ShellModelInput = {
  roster: readonly BotRecord[];
  activity: ReadonlyMap<BotId, readonly ActivityEvent[]>;
  presence: ReadonlyMap<BotId, PresenceHint>;
  nowMs: number;
};

export const WORK_MS = 60_000;
export const SLEEP_MS = 600_000;
export const TAPE_TEXT_MAX = 120;

export function presenceStateFor(input: {
  hint: PresenceHint | undefined;
  lastEventAt: IsoTimestamp | undefined;
  nowMs: number;
}): PresenceState {
  if (input.hint !== undefined) {
    if (input.hint.reason === "recent") {
      return "working";
    }
    if (input.hint.reason === "quiet") {
      return "idle";
    }
    if (input.hint.reason === "sleep") {
      return "asleep";
    }
    return presenceFromAge(input.hint.freshnessMs);
  }
  if (input.lastEventAt !== undefined) {
    const parsed = Date.parse(input.lastEventAt);
    if (Number.isNaN(parsed)) {
      return "idle";
    }
    return presenceFromAge(Math.max(0, input.nowMs - parsed));
  }
  return "idle";
}

export function rosterRows(input: ShellModelInput): readonly RosterRow[] {
  return input.roster.map((bot) => {
    const events = input.activity.get(bot.id);
    const lastEvent =
      events !== undefined && events.length > 0 ? events[events.length - 1] : undefined;
    let ageMs: number | undefined;
    if (lastEvent !== undefined) {
      const parsed = Date.parse(lastEvent.at);
      if (!Number.isNaN(parsed)) {
        ageMs = Math.max(0, input.nowMs - parsed);
      }
    }
    return {
      botId: bot.id,
      name: bot.name,
      state: presenceStateFor({
        hint: input.presence.get(bot.id),
        lastEventAt: lastEvent?.at,
        nowMs: input.nowMs,
      }),
      action: lastEvent !== undefined ? actionFromEvent(lastEvent) : "unknown",
      ageMs,
    };
  });
}

export function shellStats(input: ShellModelInput): ShellStats {
  const rows = rosterRows(input);
  let working = 0;
  let idle = 0;
  let asleep = 0;
  for (const row of rows) {
    if (row.state === "working") {
      working += 1;
    } else if (row.state === "idle") {
      idle += 1;
    } else {
      asleep += 1;
    }
  }
  let eventsPerMinute = 0;
  for (const bot of input.roster) {
    const events = input.activity.get(bot.id);
    if (events === undefined) {
      continue;
    }
    for (const event of events) {
      const parsed = Date.parse(event.at);
      if (Number.isNaN(parsed)) {
        continue;
      }
      const age = input.nowMs - parsed;
      if (age >= 0 && age < WORK_MS) {
        eventsPerMinute += 1;
      }
    }
  }
  return { working, idle, asleep, eventsPerMinute };
}

export function tapeRows(input: {
  activity: ReadonlyMap<BotId, readonly ActivityEvent[]>;
  botId: BotId | undefined;
  limit: number;
}): readonly TapeRow[] {
  if (input.botId === undefined || input.limit <= 0) {
    return [];
  }
  const events = input.activity.get(input.botId);
  if (events === undefined) {
    return [];
  }
  const start = Math.max(0, events.length - input.limit);
  const newestFirst = events.slice(start).reverse();
  return newestFirst.map((event) => ({
    eventId: event.id,
    role: event.role,
    toolName: event.role === "tool" ? event.toolName : undefined,
    path: pathFromToolEvent(event),
    at: event.at,
    text: truncateOneLine(event.text, TAPE_TEXT_MAX),
  }));
}

export function truncateOneLine(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) {
    return collapsed;
  }
  return collapsed.slice(0, max - 1) + "\u2026";
}

function presenceFromAge(ageMs: number): PresenceState {
  if (ageMs < WORK_MS) {
    return "working";
  }
  if (ageMs < SLEEP_MS) {
    return "idle";
  }
  return "asleep";
}
