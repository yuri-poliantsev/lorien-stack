import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseBotId, parseIsoTimestamp } from "@lorien-stack/contracts";

import {
  advanceRevision,
  emptyRoster,
  goneBot,
  spawnBot,
  toSnapshot,
} from "./roster.ts";

const lauren = parseBotId("af4c6d21-9ef6-4435-8232-bf09ca561583");
const koji = parseBotId("a77fae77-0494-4981-acf5-2de5bd793fe4");
assert.equal(lauren.ok, true);
assert.equal(koji.ok, true);
if (!lauren.ok || !koji.ok) {
  throw new Error("fixture bot id");
}

const capturedAt = parseIsoTimestamp("2026-08-27T09:00:00.000Z");
assert.equal(capturedAt.ok, true);
if (!capturedAt.ok) {
  throw new Error("timestamp");
}

describe("roster spawn/gone", () => {
  it("starts at revision 0", () => {
    const roster = emptyRoster();
    assert.equal(roster.revision, 0);
    assert.equal(roster.bots.size, 0);
  });

  it("bumps revision on spawn and keeps the bot", () => {
    let roster = emptyRoster();
    roster = spawnBot(roster, { id: lauren.value, name: "Lauren" });
    assert.equal(roster.revision, 1);
    assert.equal(roster.bots.get(lauren.value)?.name, "Lauren");
    const again = spawnBot(roster, { id: lauren.value, name: "Lauren" });
    assert.equal(again.revision, 1);
    roster = spawnBot(roster, { id: koji.value, name: "Koji" });
    assert.equal(roster.revision, 2);
    assert.equal(roster.bots.size, 2);
  });

  it("bumps revision on gone and drops the bot", () => {
    let roster = emptyRoster();
    roster = spawnBot(roster, { id: lauren.value, name: "Lauren" });
    roster = spawnBot(roster, { id: koji.value, name: "Koji" });
    roster = goneBot(roster, lauren.value);
    assert.equal(roster.revision, 3);
    assert.equal(roster.bots.has(lauren.value), false);
    assert.equal(roster.bots.has(koji.value), true);
    const again = goneBot(roster, lauren.value);
    assert.equal(again.revision, 3);
  });

  it("captures a snapshot at the current revision", () => {
    let roster = emptyRoster();
    roster = spawnBot(roster, { id: lauren.value, name: "Lauren" });
    roster = advanceRevision(roster);
    const snapshot = toSnapshot({ roster, capturedAt: capturedAt.value });
    assert.equal(snapshot.schemaVersion, 1);
    assert.equal(snapshot.bots.length, 1);
    assert.equal(roster.revision, 2);
  });
});
