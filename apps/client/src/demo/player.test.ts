import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { IsoTimestamp } from "@lorien-stack/contracts";

import { applyMessage, emptyStore } from "../store.ts";
import { demoRoster, demoTape } from "./plan.ts";
import { loadDemoFixtures } from "./fixturesFromDisk.ts";
import { createDemoPlayer } from "./player.ts";

const NOW = "2026-09-16T02:00:00.000Z" as IsoTimestamp;

function ivoPlayer() {
  const slots = demoRoster(loadDemoFixtures(), 1);
  return createDemoPlayer({
    bots: slots.map((s) => s.record),
    tapes: slots.map(demoTape),
    now: () => NOW,
  });
}

function summary(messages: ReturnType<ReturnType<typeof ivoPlayer>["advance"]>): string[] {
  return messages.map((m) => {
    if (m.type === "snapshot") {
      return `snapshot:${String(m.snapshot.bots.length)}`;
    }
    if (m.type === "event") {
      return `event:${m.event.id.split(":")[1] ?? ""}:${m.event.role === "tool" ? m.event.toolName : m.event.role}`;
    }
    return `presence:${m.hint.reason}:${String(m.hint.freshnessMs)}`;
  });
}

describe("createDemoPlayer", () => {
  it("emits the snapshot, the wake, and the first line at elapsed 0", () => {
    const player = ivoPlayer();
    assert.deepEqual(summary(player.advance(0)), [
      "snapshot:1",
      "presence:recent:0",
      "event:0:user",
    ]);
  });

  it("emits only the cues that became due since the last call, in order", () => {
    const player = ivoPlayer();
    player.advance(0);
    assert.deepEqual(summary(player.advance(799)), []);
    assert.deepEqual(summary(player.advance(1650)), [
      "event:1:assistant",
      "event:2:Read",
    ]);
    assert.deepEqual(summary(player.advance(4800)), [
      "event:3:Read",
      "event:4:read_file",
      "event:5:read_file",
      "event:6:assistant",
      "presence:quiet:0",
    ]);
    assert.deepEqual(summary(player.advance(8800)), ["presence:sleep:0"]);
    assert.deepEqual(summary(player.advance(11799)), []);
  });

  it("loops with growing event ids so the store keeps the second cycle", () => {
    const player = ivoPlayer();
    const store = emptyStore();
    for (const message of [...player.advance(0), ...player.advance(11800)]) {
      applyMessage(store, message);
    }
    const events = store.activity.get(
      "15aafeb5-603a-4d4b-b25d-8bc5a5287fb9" as never,
    );
    assert.equal(events?.length, 8);
    assert.equal(events?.[7]?.id, "15aafeb5-603a-4d4b-b25d-8bc5a5287fb9:7");
    assert.equal(store.revision, 1 + 1 + 7 + 2 + 1 + 1);
  });

  it("skips whole missed cycles instead of replaying them in a burst", () => {
    const player = ivoPlayer();
    player.advance(0);
    player.advance(8800);
    assert.deepEqual(summary(player.advance(11800 * 3 + 850)), [
      "presence:recent:0",
      "event:7:user",
      "event:8:assistant",
    ]);
  });

  it("staggers a second bot by its start offset", () => {
    const slots = demoRoster(loadDemoFixtures(), 2);
    const player = createDemoPlayer({
      bots: slots.map((s) => s.record),
      tapes: slots.map(demoTape),
      now: () => NOW,
    });
    const botOf = (m: (typeof first)[number]) =>
      m.type === "snapshot" ? undefined : m.type === "event" ? m.event.botId : m.botId;
    const first = player.advance(3499);
    assert.deepEqual(new Set(first.map(botOf)), new Set([undefined, slots[0]?.record.id]));
    assert.deepEqual(
      player.advance(3500).map((m) => [m.type, botOf(m)]),
      [
        ["presence", slots[1]?.record.id],
        ["event", slots[1]?.record.id],
      ],
    );
  });
});
