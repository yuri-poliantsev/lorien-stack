import {
  presenceHintFromQuietClock,
  type ActivityEvent,
  type BotId,
  type IsoTimestamp,
  type PresenceHint,
} from "@lorien-stack/contracts";

export const DEFAULT_PRESENCE_WORK_MS = 12_000;
export const DEFAULT_PRESENCE_SLEEP_MS = 22_000;
export const DEFAULT_PRESENCE_TICK_MS = 1_000;

export const PRESENCE_REASON_RECENT = "recent";
export const PRESENCE_REASON_QUIET = "quiet";
export const PRESENCE_REASON_SLEEP = "sleep";

export type PresenceConfig = {
  workMs: number;
  sleepMs: number;
  tickMs: number;
};

export type PresenceStamp = {
  at: IsoTimestamp;
  atMs: number;
  source: "spawn" | "event";
};

export type PresenceClock = {
  noteSpawn: (input: { botId: BotId; at: IsoTimestamp }) => void;
  noteEvents: (events: readonly ActivityEvent[]) => void;
  noteGone: (botId: BotId) => void;
  stamp: (botId: BotId) => PresenceStamp | undefined;
  stamps: () => ReadonlyMap<BotId, PresenceStamp>;
};

export function reasonFromQuietMs(input: {
  freshnessMs: number;
  workMs: number;
  sleepMs: number;
}): string {
  if (input.freshnessMs < input.workMs) {
    return PRESENCE_REASON_RECENT;
  }
  if (input.freshnessMs < input.sleepMs) {
    return PRESENCE_REASON_QUIET;
  }
  return PRESENCE_REASON_SLEEP;
}

export function pickPresenceMs(
  option: number | undefined,
  env: string | undefined,
  fallback: number,
): number {
  if (option !== undefined && Number.isFinite(option) && option > 0) {
    return option;
  }
  if (env !== undefined && env.trim().length > 0) {
    const parsed = Number(env);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return fallback;
}

export function resolvePresenceConfig(input: {
  workMs?: number;
  sleepMs?: number;
  tickMs?: number;
  env: NodeJS.ProcessEnv;
}): PresenceConfig {
  return {
    workMs: pickPresenceMs(
      input.workMs,
      input.env.GATEWAY_PRESENCE_WORK_MS,
      DEFAULT_PRESENCE_WORK_MS,
    ),
    sleepMs: pickPresenceMs(
      input.sleepMs,
      input.env.GATEWAY_PRESENCE_SLEEP_MS,
      DEFAULT_PRESENCE_SLEEP_MS,
    ),
    tickMs: pickPresenceMs(
      input.tickMs,
      input.env.GATEWAY_PRESENCE_TICK_MS,
      DEFAULT_PRESENCE_TICK_MS,
    ),
  };
}

export function createPresenceClock(): PresenceClock {
  const stamps = new Map<BotId, PresenceStamp>();
  return {
    noteSpawn(input) {
      if (stamps.has(input.botId)) {
        return;
      }
      stamps.set(input.botId, {
        at: input.at,
        atMs: Date.parse(input.at),
        source: "spawn",
      });
    },
    noteEvents(events) {
      for (const event of events) {
        const atMs = Date.parse(event.at);
        const current = stamps.get(event.botId);
        if (
          current === undefined ||
          current.source === "spawn" ||
          atMs >= current.atMs
        ) {
          stamps.set(event.botId, {
            at: event.at,
            atMs,
            source: "event",
          });
        }
      }
    },
    noteGone(botId) {
      stamps.delete(botId);
    },
    stamp(botId) {
      return stamps.get(botId);
    },
    stamps() {
      return stamps;
    },
  };
}

export function collectPresenceHints(input: {
  stamps: ReadonlyMap<BotId, PresenceStamp>;
  now: IsoTimestamp;
  nowMs: number;
  workMs: number;
  sleepMs: number;
}): Array<{ botId: BotId; hint: PresenceHint }> {
  const out: Array<{ botId: BotId; hint: PresenceHint }> = [];
  for (const [botId, stamp] of input.stamps) {
    const freshnessMs = Math.max(0, input.nowMs - stamp.atMs);
    out.push({
      botId,
      hint: presenceHintFromQuietClock({
        lastActivityAt: stamp.at,
        now: input.now,
        reason: reasonFromQuietMs({
          freshnessMs,
          workMs: input.workMs,
          sleepMs: input.sleepMs,
        }),
      }),
    });
  }
  return out;
}
