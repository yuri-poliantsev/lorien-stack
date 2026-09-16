import {
  CONTRACTS_SCHEMA_VERSION,
  parseActivityJsonl,
  presenceHintFromQuietClock,
  type BotRecord,
  type IsoTimestamp,
} from "@lorien-stack/contracts";

import type { StoreMessage } from "../store.ts";
import type { DemoCue, DemoTape } from "./plan.ts";

export const DEMO_TICK_MS = 100;

export type DemoPlayer = {
  advance: (elapsedMs: number) => StoreMessage[];
};

type Cursor = {
  tape: DemoTape;
  cycle: number;
  next: number;
  lineIndex: number;
  lastActivityAt: IsoTimestamp | undefined;
};

const REASON_FOR_CUE = { wake: "recent", quiet: "quiet", sleep: "sleep" } as const;

function wallNow(): IsoTimestamp {
  return new Date().toISOString() as IsoTimestamp;
}

export function createDemoPlayer(input: {
  bots: BotRecord[];
  tapes: DemoTape[];
  now?: () => IsoTimestamp;
}): DemoPlayer {
  const now = input.now ?? wallNow;
  const cursors: Cursor[] = input.tapes.map((tape) => ({
    tape,
    cycle: 0,
    next: 0,
    lineIndex: 0,
    lastActivityAt: undefined,
  }));
  let revision = 0;
  let started = false;

  function nextRevision(): number {
    revision += 1;
    return revision;
  }

  function messagesFor(cursor: Cursor, cue: DemoCue, out: StoreMessage[]): void {
    const at = now();
    if (cue.kind === "line") {
      const events = parseActivityJsonl({
        text: cue.line,
        botId: cursor.tape.botId,
        lineOffset: cursor.lineIndex,
        at,
      });
      cursor.lineIndex += 1;
      for (const event of events) {
        cursor.lastActivityAt = at;
        out.push({ type: "event", revision: nextRevision(), event });
      }
      return;
    }
    if (cue.kind === "wake") {
      cursor.lastActivityAt = at;
    }
    out.push({
      type: "presence",
      revision: nextRevision(),
      botId: cursor.tape.botId,
      hint: presenceHintFromQuietClock({
        lastActivityAt: cursor.lastActivityAt ?? at,
        now: at,
        reason: REASON_FOR_CUE[cue.kind],
      }),
    });
  }

  return {
    advance(elapsedMs) {
      const out: StoreMessage[] = [];
      if (!started) {
        started = true;
        out.push({
          type: "snapshot",
          revision: nextRevision(),
          snapshot: {
            schemaVersion: CONTRACTS_SCHEMA_VERSION,
            capturedAt: now(),
            bots: input.bots,
          },
        });
      }
      const due: Array<{ absMs: number; cursor: Cursor; cue: DemoCue }> = [];
      for (const cursor of cursors) {
        const { tape } = cursor;
        for (;;) {
          const cycleStart = tape.startOffsetMs + cursor.cycle * tape.periodMs;
          if (cursor.next === 0) {
            const missed = Math.floor((elapsedMs - cycleStart) / tape.periodMs);
            if (missed > 0) {
              cursor.cycle += missed;
              continue;
            }
          }
          const cue = tape.cues[cursor.next];
          if (cue === undefined || cycleStart + cue.atMs > elapsedMs) {
            break;
          }
          due.push({ absMs: cycleStart + cue.atMs, cursor, cue });
          cursor.next += 1;
          if (cursor.next >= tape.cues.length) {
            cursor.next = 0;
            cursor.cycle += 1;
          }
        }
      }
      due.sort((a, b) => a.absMs - b.absMs);
      for (const item of due) {
        messagesFor(item.cursor, item.cue, out);
      }
      return out;
    },
  };
}
