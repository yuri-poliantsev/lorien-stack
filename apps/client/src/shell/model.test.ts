import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  eventIdForJsonlLine,
  parseBotId,
  parseIsoTimestamp,
  type ActivityEvent,
  type BotRecord,
  type IsoTimestamp,
  type PresenceHint,
} from "@lorien-stack/contracts";

import {
  presenceStateFor,
  rosterRows,
  shellStats,
  tapeRows,
  truncateOneLine,
} from "./model.ts";

const laurenId = parseBotId("af4c6d21-9ef6-4435-8232-bf09ca561583");
const wrenId = parseBotId("2b40667e-d345-4db1-bbf0-9b26b7f904e9");
const adaId = parseBotId("c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f");
const epoch = parseIsoTimestamp("1970-01-01T00:00:00.000Z");
const at10s = parseIsoTimestamp("1970-01-01T00:00:10.000Z");
const at40s = parseIsoTimestamp("1970-01-01T00:00:40.000Z");
const at40s1 = parseIsoTimestamp("1970-01-01T00:00:40.001Z");
const at50s = parseIsoTimestamp("1970-01-01T00:00:50.000Z");
const at100s = parseIsoTimestamp("1970-01-01T00:01:40.000Z");
const at100s1 = parseIsoTimestamp("1970-01-01T00:01:40.001Z");
assert.equal(laurenId.ok, true);
assert.equal(wrenId.ok, true);
assert.equal(adaId.ok, true);
assert.equal(epoch.ok, true);
assert.equal(at10s.ok, true);
assert.equal(at40s.ok, true);
assert.equal(at40s1.ok, true);
assert.equal(at50s.ok, true);
assert.equal(at100s.ok, true);
assert.equal(at100s1.ok, true);
if (
  !laurenId.ok ||
  !wrenId.ok ||
  !adaId.ok ||
  !epoch.ok ||
  !at10s.ok ||
  !at40s.ok ||
  !at40s1.ok ||
  !at50s.ok ||
  !at100s.ok ||
  !at100s1.ok
) {
  throw new Error("fixture ids");
}

const lauren: BotRecord = { id: laurenId.value, name: "Lauren" };
const wren: BotRecord = { id: wrenId.value, name: "Wren" };
const ada: BotRecord = { id: adaId.value, name: "Ada" };
const nowMs = 100_000;

function hint(reason: string, freshnessMs: number): PresenceHint {
  return { lastActivityAt: epoch.value, freshnessMs, reason };
}

let nextIndex = 0;

function event(input: {
  botId: BotRecord["id"];
  at: IsoTimestamp;
  role: "user" | "assistant";
  text: string;
}): ActivityEvent;
function event(input: {
  botId: BotRecord["id"];
  at: IsoTimestamp;
  role: "tool";
  toolName: string;
  text: string;
}): ActivityEvent;
function event(input: {
  botId: BotRecord["id"];
  at: IsoTimestamp;
  role: "user" | "assistant" | "tool";
  toolName?: string;
  text: string;
}): ActivityEvent {
  nextIndex += 1;
  const id = eventIdForJsonlLine({ botId: input.botId, index: nextIndex });
  if (input.role === "tool") {
    return {
      id,
      botId: input.botId,
      at: input.at,
      role: "tool",
      toolName: input.toolName ?? "",
      text: input.text,
    };
  }
  return {
    id,
    botId: input.botId,
    at: input.at,
    role: input.role,
    text: input.text,
  };
}

describe("presenceStateFor", () => {
  const cases: {
    name: string;
    hint: PresenceHint | undefined;
    lastEventAt: IsoTimestamp | undefined;
    nowMs: number;
    expected: "working" | "idle" | "asleep";
  }[] = [
    {
      name: "recent is working",
      hint: hint("recent", 999_999),
      lastEventAt: undefined,
      nowMs,
      expected: "working",
    },
    {
      name: "quiet is idle",
      hint: hint("quiet", 0),
      lastEventAt: undefined,
      nowMs,
      expected: "idle",
    },
    {
      name: "sleep is asleep",
      hint: hint("sleep", 0),
      lastEventAt: undefined,
      nowMs,
      expected: "asleep",
    },
    {
      name: "unknown reason just under 60s is working",
      hint: hint("other", 59_999),
      lastEventAt: undefined,
      nowMs,
      expected: "working",
    },
    {
      name: "unknown reason at 60s is idle",
      hint: hint("other", 60_000),
      lastEventAt: undefined,
      nowMs,
      expected: "idle",
    },
    {
      name: "unknown reason just under 600s is idle",
      hint: hint("other", 599_999),
      lastEventAt: undefined,
      nowMs,
      expected: "idle",
    },
    {
      name: "unknown reason at 600s is asleep",
      hint: hint("other", 600_000),
      lastEventAt: undefined,
      nowMs,
      expected: "asleep",
    },
    {
      name: "no hint, event just under 60s is working",
      hint: undefined,
      lastEventAt: epoch.value,
      nowMs: 59_999,
      expected: "working",
    },
    {
      name: "no hint, event at 60s is idle",
      hint: undefined,
      lastEventAt: epoch.value,
      nowMs: 60_000,
      expected: "idle",
    },
    {
      name: "no hint, event just under 600s is idle",
      hint: undefined,
      lastEventAt: epoch.value,
      nowMs: 599_999,
      expected: "idle",
    },
    {
      name: "no hint, event at 600s is asleep",
      hint: undefined,
      lastEventAt: epoch.value,
      nowMs: 600_000,
      expected: "asleep",
    },
    {
      name: "no hint, unparseable timestamp is idle",
      hint: undefined,
      lastEventAt: "not-a-date" as IsoTimestamp,
      nowMs: 0,
      expected: "idle",
    },
    {
      name: "no hint and no event is idle",
      hint: undefined,
      lastEventAt: undefined,
      nowMs: 0,
      expected: "idle",
    },
  ];

  for (const row of cases) {
    it(row.name, () => {
      assert.equal(
        presenceStateFor({
          hint: row.hint,
          lastEventAt: row.lastEventAt,
          nowMs: row.nowMs,
        }),
        row.expected,
        row.name,
      );
    });
  }
});

describe("rosterRows", () => {
  it("builds one row per bot in roster order with last-event action and age", () => {
    const laurenUser = event({
      botId: lauren.id,
      at: at10s.value,
      role: "user",
      text: "look at main",
    });
    const laurenTool = event({
      botId: lauren.id,
      at: at50s.value,
      role: "tool",
      toolName: "read_file",
      text: '{"path":"apps/client/src/main.ts"}',
    });
    const wrenTalk = event({
      botId: wren.id,
      at: at10s.value,
      role: "assistant",
      text: "on it",
    });
    assert.deepEqual(
      rosterRows({
        roster: [lauren, wren, ada],
        activity: new Map([
          [lauren.id, [laurenUser, laurenTool]],
          [wren.id, [wrenTalk]],
        ]),
        presence: new Map([
          [lauren.id, hint("recent", 1_000)],
          [wren.id, hint("quiet", 90_000)],
        ]),
        nowMs,
      }),
      [
        {
          botId: lauren.id,
          name: "Lauren",
          state: "working",
          action: "reading",
          ageMs: 50_000,
        },
        {
          botId: wren.id,
          name: "Wren",
          state: "idle",
          action: "talking",
          ageMs: 90_000,
        },
        {
          botId: ada.id,
          name: "Ada",
          state: "idle",
          action: "unknown",
          ageMs: undefined,
        },
      ],
    );
  });

  it("keeps a full-width character in the bot name", () => {
    const wide: BotRecord = { id: ada.id, name: "L\uFF21uren" };
    assert.deepEqual(
      rosterRows({
        roster: [wide],
        activity: new Map(),
        presence: new Map(),
        nowMs,
      }),
      [
        {
          botId: ada.id,
          name: "L\uFF21uren",
          state: "idle",
          action: "unknown",
          ageMs: undefined,
        },
      ],
    );
  });
});

describe("shellStats", () => {
  it("counts presence states and events strictly inside the 60s window", () => {
    const insideEarly = event({
      botId: lauren.id,
      at: at40s1.value,
      role: "user",
      text: "inside just after the 60s edge",
    });
    const onEdge = event({
      botId: lauren.id,
      at: at40s.value,
      role: "assistant",
      text: "exactly 60s old",
    });
    const insideNow = event({
      botId: lauren.id,
      at: at100s.value,
      role: "user",
      text: "age 0",
    });
    const insideWren = event({
      botId: wren.id,
      at: at50s.value,
      role: "assistant",
      text: "50s old",
    });
    const tooOld = event({
      botId: ada.id,
      at: epoch.value,
      role: "user",
      text: "100s old",
    });
    const future = event({
      botId: ada.id,
      at: at100s1.value,
      role: "assistant",
      text: "1ms in the future",
    });
    assert.deepEqual(
      shellStats({
        roster: [lauren, wren, ada],
        activity: new Map([
          [lauren.id, [insideEarly, onEdge, insideNow]],
          [wren.id, [insideWren]],
          [ada.id, [tooOld, future]],
        ]),
        presence: new Map([
          [lauren.id, hint("recent", 1)],
          [wren.id, hint("quiet", 1)],
          [ada.id, hint("sleep", 1)],
        ]),
        nowMs,
      }),
      { working: 1, idle: 1, asleep: 1, eventsPerMinute: 3 },
    );
  });
});

describe("tapeRows", () => {
  it("returns newest-first rows, honors limit, and fills tool fields only on tool events", () => {
    const user = event({
      botId: lauren.id,
      at: at10s.value,
      role: "user",
      text: "please read main",
    });
    const tool = event({
      botId: lauren.id,
      at: at40s.value,
      role: "tool",
      toolName: "read_file",
      text: '{"path":"apps/client/src/main.ts"}',
    });
    const assistant = event({
      botId: lauren.id,
      at: at50s.value,
      role: "assistant",
      text: "done reading",
    });
    const grep = event({
      botId: lauren.id,
      at: at100s.value,
      role: "tool",
      toolName: "grep",
      text: "SpatialAnchor",
    });
    const activity = new Map([[lauren.id, [user, tool, assistant, grep]]]);
    assert.deepEqual(tapeRows({ activity, botId: lauren.id, limit: 3 }), [
      {
        eventId: grep.id,
        role: "tool",
        toolName: "grep",
        path: undefined,
        at: at100s.value,
        text: "SpatialAnchor",
      },
      {
        eventId: assistant.id,
        role: "assistant",
        toolName: undefined,
        path: undefined,
        at: at50s.value,
        text: "done reading",
      },
      {
        eventId: tool.id,
        role: "tool",
        toolName: "read_file",
        path: "apps/client/src/main.ts",
        at: at40s.value,
        text: '{"path":"apps/client/src/main.ts"}',
      },
    ]);
    assert.deepEqual(tapeRows({ activity, botId: undefined, limit: 3 }), []);
  });
});

describe("truncateOneLine", () => {
  it("collapses a multi-line string to one trimmed line", () => {
    assert.equal(truncateOneLine("  foo \n\n\t bar  ", 120), "foo bar");
  });

  it("truncates 200 a characters to length 120 ending in an ellipsis", () => {
    const result = truncateOneLine("a".repeat(200), 120);
    assert.equal(result.length, 120);
    assert.equal(result, `${"a".repeat(119)}\u2026`);
  });
});
