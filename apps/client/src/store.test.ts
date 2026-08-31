import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  eventIdForJsonlLine,
  parseBotId,
  parseIsoTimestamp,
  type ActivityEvent,
  type BotRecord,
  type RosterSnapshot,
} from "@lorien-stack/contracts";

import {
  activityFor,
  applyEvent,
  applyMessage,
  applySnapshot,
  emptyStore,
  isPromptEnabled,
  rosterList,
  selectBot,
} from "./store.ts";

const laurenId = parseBotId("af4c6d21-9ef6-4435-8232-bf09ca561583");
const wrenId = parseBotId("2b40667e-d345-4db1-bbf0-9b26b7f904e9");
const at = parseIsoTimestamp("2026-08-27T09:00:00.000Z");
assert.equal(laurenId.ok, true);
assert.equal(wrenId.ok, true);
assert.equal(at.ok, true);
if (!laurenId.ok || !wrenId.ok || !at.ok) {
  throw new Error("fixture ids");
}

const lauren: BotRecord = { id: laurenId.value, name: "Lauren" };
const wren: BotRecord = { id: wrenId.value, name: "Wren" };

function snapshotOf(bots: BotRecord[]): RosterSnapshot {
  return {
    schemaVersion: 1,
    capturedAt: at.value,
    bots,
  };
}

function userEvent(input: {
  index: number;
  botId: BotRecord["id"];
  text: string;
}): ActivityEvent {
  return {
    id: eventIdForJsonlLine({ botId: input.botId, index: input.index }),
    botId: input.botId,
    at: at.value,
    role: "user",
    text: input.text,
  };
}

describe("ws snapshot apply", () => {
  it("replaces roster from a snapshot message", () => {
    const store = emptyStore();
    applyMessage(store, {
      type: "snapshot",
      revision: 4,
      snapshot: snapshotOf([wren, lauren]),
    });
    assert.equal(store.revision, 4);
    assert.equal(store.bots.size, 2);
    const names = rosterList(store).map((bot) => bot.name);
    assert.deepEqual(names, ["Lauren", "Wren"]);
  });

  it("drops activity for bots missing from a later snapshot", () => {
    const store = emptyStore();
    applySnapshot(store, {
      revision: 1,
      snapshot: snapshotOf([lauren, wren]),
    });
    applyEvent(store, {
      revision: 2,
      event: userEvent({
        index: 0,
        botId: wren.id,
        text: "hello",
      }),
    });
    applySnapshot(store, {
      revision: 3,
      snapshot: snapshotOf([lauren]),
    });
    assert.equal(store.bots.has(wren.id), false);
    assert.equal(activityFor(store, wren.id).length, 0);
    assert.equal(store.selectedBotId, undefined);
  });
});

describe("ws delta apply", () => {
  it("appends an event under the bot id", () => {
    const store = emptyStore();
    applySnapshot(store, {
      revision: 1,
      snapshot: snapshotOf([lauren]),
    });
    applyMessage(store, {
      type: "event",
      revision: 2,
      event: userEvent({
        index: 0,
        botId: lauren.id,
        text: "ping",
      }),
    });
    applyMessage(store, {
      type: "event",
      revision: 3,
      event: userEvent({
        index: 1,
        botId: lauren.id,
        text: "pong",
      }),
    });
    const events = activityFor(store, lauren.id);
    assert.equal(events.length, 2);
    assert.equal(events[0]?.text, "ping");
    assert.equal(events[1]?.text, "pong");
  });

  it("ignores a duplicate event id", () => {
    const store = emptyStore();
    const event = userEvent({
      index: 0,
      botId: lauren.id,
      text: "once",
    });
    applyEvent(store, { revision: 1, event });
    applyEvent(store, { revision: 2, event });
    assert.equal(activityFor(store, lauren.id).length, 1);
  });
});

describe("prompt disabled state", () => {
  it("stays disabled until a roster bot is selected", () => {
    const store = emptyStore();
    assert.equal(isPromptEnabled(store.selectedBotId), false);
    applySnapshot(store, {
      revision: 1,
      snapshot: snapshotOf([lauren]),
    });
    assert.equal(isPromptEnabled(store.selectedBotId), false);
    selectBot(store, lauren.id);
    assert.equal(isPromptEnabled(store.selectedBotId), true);
  });

  it("does not select an unknown bot id", () => {
    const store = emptyStore();
    selectBot(store, lauren.id);
    assert.equal(store.selectedBotId, undefined);
    assert.equal(isPromptEnabled(store.selectedBotId), false);
  });
});
