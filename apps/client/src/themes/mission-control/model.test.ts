import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  eventIdForJsonlLine,
  parseBotId,
  parseIsoTimestamp,
  type ActivityEvent,
  type BotId,
  type BotRecord,
} from "@lorien-stack/contracts";

import {
  SPARK_BUCKETS,
  accentForHour,
  activityBars,
  boardClock,
  cardModel,
  metricText,
  poseFor,
  tallyPoses,
} from "./model.ts";

const NOW = Date.parse("2026-09-15T21:00:00.000Z");

function botId(): BotId {
  const parsed = parseBotId("97350d45-cace-4d40-8628-e8bece188dac");
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    throw new Error("bot id");
  }
  return parsed.value;
}

function bot(name: string): BotRecord {
  return { id: botId(), name };
}

function toolEvent(input: {
  seq: number;
  agoMs: number;
  toolName: string;
  text: string;
}): ActivityEvent {
  const id = botId();
  const at = parseIsoTimestamp(new Date(NOW - input.agoMs).toISOString());
  assert.equal(at.ok, true);
  if (!at.ok) {
    throw new Error("event timestamp");
  }
  return {
    id: eventIdForJsonlLine({ botId: id, index: input.seq }),
    botId: id,
    at: at.value,
    role: "tool",
    toolName: input.toolName,
    text: input.text,
  };
}

describe("mission control pose", () => {
  it("reads working while the last event is fresh, then idle, then asleep", () => {
    assert.equal(poseFor({ eventCount: 4, msSinceActivity: 500 }), "working");
    assert.equal(poseFor({ eventCount: 4, msSinceActivity: 11_999 }), "working");
    assert.equal(poseFor({ eventCount: 4, msSinceActivity: 12_000 }), "idle");
    assert.equal(poseFor({ eventCount: 4, msSinceActivity: 21_999 }), "idle");
    assert.equal(poseFor({ eventCount: 4, msSinceActivity: 22_000 }), "sleeping");
  });

  it("holds a bot we have never heard from as idle before it settles to asleep", () => {
    assert.equal(poseFor({ eventCount: 0, msSinceActivity: 0 }), "idle");
    assert.equal(poseFor({ eventCount: 0, msSinceActivity: 21_999 }), "idle");
    assert.equal(poseFor({ eventCount: 0, msSinceActivity: 22_000 }), "sleeping");
  });
});

describe("mission control activity bars", () => {
  it("returns one flat bucket per five seconds of the last minute when nothing happened", () => {
    const bars = activityBars({ events: [], nowMs: NOW });
    assert.equal(bars.length, SPARK_BUCKETS);
    assert.deepEqual([...bars], new Array<number>(SPARK_BUCKETS).fill(0));
  });

  it("puts the newest event in the last bucket and scales every bar to the busiest one", () => {
    const bars = activityBars({
      events: [
        toolEvent({ seq: 1, agoMs: 2_000, toolName: "read_file", text: "{}" }),
        toolEvent({ seq: 2, agoMs: 1_000, toolName: "read_file", text: "{}" }),
        toolEvent({ seq: 3, agoMs: 27_000, toolName: "shell", text: "{}" }),
      ],
      nowMs: NOW,
    });
    const expected = new Array<number>(SPARK_BUCKETS).fill(0);
    expected[SPARK_BUCKETS - 1] = 1;
    expected[SPARK_BUCKETS - 10] = 0.5;
    assert.deepEqual([...bars], expected);
  });

  it("drops events older than the window and events dated in the future", () => {
    const bars = activityBars({
      events: [
        toolEvent({ seq: 4, agoMs: 60_000, toolName: "shell", text: "{}" }),
        toolEvent({ seq: 5, agoMs: -5_000, toolName: "shell", text: "{}" }),
      ],
      nowMs: NOW,
    });
    assert.deepEqual([...bars], new Array<number>(SPARK_BUCKETS).fill(0));
  });
});

describe("mission control card model", () => {
  it("labels a working card with pose, action word, path and age, never transcript text", () => {
    const model = cardModel({
      bot: bot("Anouk"),
      events: [
        toolEvent({
          seq: 6,
          agoMs: 6_000,
          toolName: "read_file",
          text: '{"path":"apps/gateway/src/presence.ts"}',
        }),
      ],
      nowMs: NOW,
      firstSeenMs: NOW - 90_000,
    });
    assert.deepEqual(
      {
        pose: model.pose,
        state: model.state,
        action: model.action,
        path: model.path,
        age: model.age,
        events: model.events,
      },
      {
        pose: "working",
        state: "working",
        action: "reading",
        path: "apps/gateway/src/presence.ts",
        age: "6s",
        events: 1,
      },
    );
  });

  it("normalises the nametag to NFKC", () => {
    const model = cardModel({
      bot: bot("Luci\u0301a"),
      events: undefined,
      nowMs: NOW,
      firstSeenMs: NOW,
    });
    assert.equal(model.name, "Luc\u00EDa");
  });

  it("keeps an idle card on its last action with an age", () => {
    const model = cardModel({
      bot: bot("Reed"),
      events: [toolEvent({ seq: 7, agoMs: 15_000, toolName: "shell", text: "{}" })],
      nowMs: NOW,
      firstSeenMs: NOW - 300_000,
    });
    assert.deepEqual(
      { pose: model.pose, action: model.action, path: model.path, age: model.age },
      { pose: "idle", action: "shell", path: "", age: "15s" },
    );
  });

  it("strips an asleep card back to the name and drops the stale action line", () => {
    const model = cardModel({
      bot: bot("Reed"),
      events: [
        toolEvent({
          seq: 8,
          agoMs: 130_000,
          toolName: "read_file",
          text: '{"path":"apps/client/src/main.ts"}',
        }),
      ],
      nowMs: NOW,
      firstSeenMs: NOW - 300_000,
    });
    assert.deepEqual(
      { pose: model.pose, state: model.state, name: model.name, action: model.action, path: model.path, age: model.age },
      { pose: "sleeping", state: "asleep", name: "Reed", action: "", path: "", age: "\u2013" },
    );
  });

  it("keeps a never-heard-from bot as a named idle card with a dash for age", () => {
    const model = cardModel({
      bot: bot("Ivo"),
      events: undefined,
      nowMs: NOW,
      firstSeenMs: NOW - 3_000,
    });
    assert.deepEqual(
      {
        pose: model.pose,
        state: model.state,
        name: model.name,
        age: model.age,
        events: model.events,
      },
      { pose: "idle", state: "idle", name: "Ivo", age: "\u2013", events: 0 },
    );
  });
});

describe("mission control status band", () => {
  it("counts the roster, the live cards and the sleepers off the card poses", () => {
    assert.deepEqual(tallyPoses(["working", "idle", "sleeping", "working", "idle", "idle"]), {
      roster: 6,
      working: 2,
      sleeping: 1,
    });
    assert.deepEqual(tallyPoses([]), { roster: 0, working: 0, sleeping: 0 });
  });

  it("zero-pads the band numbers to two digits like the concept frame", () => {
    assert.deepEqual([0, 7, 40].map(metricText), ["00", "07", "40"]);
  });
});

describe("mission control accent clock", () => {
  it("peaks in the early afternoon and deepens after midnight", () => {
    assert.equal(accentForHour(13), "hsl(44.0 88% 58.0%)");
    assert.equal(accentForHour(1), "hsl(26.0 88% 48.0%)");
  });

  it("wraps an out-of-range hour instead of leaving the accent undefined", () => {
    assert.equal(accentForHour(25), accentForHour(1));
    assert.equal(accentForHour(-11), accentForHour(13));
  });

  it("reads the board clock off the same curve as the accent", () => {
    assert.deepEqual(boardClock(new Date(2026, 8, 15, 13, 5).getTime()), {
      time: "13:05",
      phase: "day",
    });
    assert.deepEqual(boardClock(new Date(2026, 8, 15, 4, 37).getTime()), {
      time: "04:37",
      phase: "night",
    });
    assert.equal(boardClock(new Date(2026, 8, 15, 8, 0).getTime()).phase, "day");
    assert.equal(boardClock(new Date(2026, 8, 15, 20, 0).getTime()).phase, "night");
  });
});
