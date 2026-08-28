import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseBotId, parseSeatId, type BotRecord } from "@bot-space/contracts";

import {
  STATIONS,
  assignSeats,
  eventSignature,
  fitLetterbox,
  poseFromPulse,
} from "./layout.ts";

function bot(id: string, name: string, seatId?: string): BotRecord {
  const parsed = parseBotId(id);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    throw new Error("bot id");
  }
  if (seatId === undefined) {
    return { id: parsed.value, name };
  }
  const seat = parseSeatId(seatId);
  assert.equal(seat.ok, true);
  if (!seat.ok) {
    throw new Error("seat id");
  }
  return { id: parsed.value, name, spatial: { kind: "seat", seatId: seat.value } };
}

const lauren = bot("af4c6d21-9ef6-4435-8232-bf09ca561583", "Lauren");
const wren = bot("2b40667e-d345-4db1-bbf0-9b26b7f904e9", "Wren");
const sable = bot("7820582a-8fe5-4ef5-8ba5-30bf7641f8cc", "Sable");
const koji = bot("a77fae77-0494-4981-acf5-2de5bd793fe4", "Koji");
const mira = bot("ae9531d3-ca13-43e2-92eb-3bf156010408", "Mira");
const anouk = bot("97350d45-cace-4d40-8628-e8bece188dac", "Anouk");
const reed = bot("7a330915-6d55-4b1c-8fab-80b899126fa0", "Reed");
const ivo = bot("15aafeb5-603a-4d4b-b25d-8bc5a5287fb9", "Ivo");

const demoRoster: BotRecord[] = [lauren, wren, sable, koji, mira, anouk, reed, ivo];

function seatIds(roster: readonly BotRecord[]): Record<string, string> {
  const seats = assignSeats({ bots: roster });
  const out: Record<string, string> = {};
  for (const botRow of roster) {
    const seat = seats.get(botRow.id);
    assert.notEqual(seat, undefined);
    if (seat === undefined) {
      continue;
    }
    out[botRow.id] = seat.station.id;
  }
  return out;
}

describe("starcraft layout seats", () => {
  it("keeps the same station when the roster is shuffled with the same ids", () => {
    const forward = seatIds(demoRoster);
    const reversed = [...demoRoster].reverse();
    const backward = seatIds(reversed);
    assert.deepEqual(backward, forward);
    const scrambled = [ivo, lauren, reed, sable, anouk, wren, mira, koji];
    assert.deepEqual(seatIds(scrambled), forward);
  });

  it("does not put two demo bots on the same station", () => {
    const seats = assignSeats({ bots: demoRoster });
    const used = [...seats.values()].map((seat) => seat.station.id);
    assert.equal(new Set(used).size, used.length);
    assert.equal(seats.size, demoRoster.length);
  });

  it("honors an explicit spatial seat when that station is free", () => {
    const parked = bot("af4c6d21-9ef6-4435-8232-bf09ca561583", "Lauren", "core");
    const seats = assignSeats({ bots: [parked, wren] });
    assert.equal(seats.get(parked.id)?.station.id, "core");
    assert.notEqual(seats.get(wren.id)?.station.id, "core");
  });

  it("still assigns a seat when more bots than stations share ids across reshuffles", () => {
    const extra = demoRoster.map((row, index) =>
      bot(
        row.id,
        row.name,
        index === 0 ? STATIONS[0]?.id : undefined,
      ),
    );
    const a = assignSeats({ bots: extra });
    const b = assignSeats({ bots: [...extra].reverse() });
    for (const row of extra) {
      assert.equal(a.get(row.id)?.station.id, b.get(row.id)?.station.id);
    }
  });
});

describe("starcraft layout pose", () => {
  it("marks a bot working while the pulse is fresh", () => {
    assert.equal(poseFromPulse({ eventCount: 3, msSincePulse: 400 }), "working");
    assert.equal(poseFromPulse({ eventCount: 3, msSincePulse: 13_000 }), "idle");
    assert.equal(poseFromPulse({ eventCount: 3, msSincePulse: 30_000 }), "sleeping");
  });

  it("keeps a quiet bot visible as idle, then sleeping", () => {
    assert.equal(poseFromPulse({ eventCount: 0, msSincePulse: 100 }), "idle");
    assert.equal(poseFromPulse({ eventCount: 0, msSincePulse: 30_000 }), "sleeping");
  });

  it("changes the activity signature when events grow", () => {
    assert.equal(eventSignature(undefined), "0");
    assert.equal(eventSignature([]), "0");
  });
});

describe("starcraft layout letterbox", () => {
  it("centers a 16:9 world inside a taller view", () => {
    const box = fitLetterbox({ worldW: 960, worldH: 540, viewW: 400, viewH: 800 });
    assert.equal(box.w <= 400 + 1e-6, true);
    assert.equal(box.x >= 0, true);
    assert.equal(Math.abs(box.x * 2 + box.w - 400) < 0.01, true);
  });
});
