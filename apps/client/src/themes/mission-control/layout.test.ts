import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseBotId, type BotRecord } from "@lorien-stack/contracts";

import {
  GRID_AREA,
  cardOrder,
  cardRect,
  cardScale,
  gridColumns,
  gridFor,
  type Rect,
} from "./layout.ts";

function bot(id: string, name: string): BotRecord {
  const parsed = parseBotId(id);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    throw new Error("bot id");
  }
  return { id: parsed.value, name };
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

function rects(count: number): Rect[] {
  const grid = gridFor(count);
  const out: Rect[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(cardRect(grid, i));
  }
  return out;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe("mission control grid columns", () => {
  it("puts eight cards in four columns like the concept frame", () => {
    assert.equal(gridColumns(8), 4);
    assert.equal(gridFor(8).rows, 2);
  });

  it("steps columns up with the roster and tops out at eight by forty", () => {
    assert.deepEqual(
      [1, 2, 3, 4, 6, 12, 18, 24, 32, 40].map((n) => gridColumns(n)),
      [1, 2, 3, 2, 3, 4, 5, 6, 7, 8],
    );
    assert.equal(gridFor(40).rows, 5);
  });

  it("clamps a roster outside one to forty instead of dividing by zero", () => {
    assert.equal(gridColumns(0), 1);
    assert.equal(gridColumns(-3), 1);
    assert.equal(gridColumns(400), 8);
    assert.equal(gridColumns(Number.NaN), 1);
  });
});

describe("mission control card placement", () => {
  it("fits every card inside the grid area at one, twenty-four and forty", () => {
    for (const n of [1, 24, 40]) {
      for (const rect of rects(n)) {
        assert.equal(rect.x >= GRID_AREA.x, true, `card left inside grid area at ${String(n)}`);
        assert.equal(rect.y >= GRID_AREA.y, true, `card top inside grid area at ${String(n)}`);
        assert.equal(
          rect.x + rect.w <= GRID_AREA.x + GRID_AREA.w + 0.001,
          true,
          `card right inside grid area at ${String(n)}`,
        );
        assert.equal(
          rect.y + rect.h <= GRID_AREA.y + GRID_AREA.h + 0.001,
          true,
          `card bottom inside grid area at ${String(n)}`,
        );
      }
    }
  });

  it("never overlaps two cards up to twenty-four", () => {
    for (const n of [1, 4, 8, 18, 24]) {
      const all = rects(n);
      for (let i = 0; i < all.length; i += 1) {
        for (let j = i + 1; j < all.length; j += 1) {
          const a = all[i];
          const b = all[j];
          assert.notEqual(a, undefined);
          assert.notEqual(b, undefined);
          if (a === undefined || b === undefined) {
            continue;
          }
          assert.equal(overlaps(a, b), false, `cards ${String(i)} and ${String(j)} clear at ${String(n)}`);
        }
      }
    }
  });

  it("crowds to forty without overlap and keeps the card above a legible floor", () => {
    const all = rects(40);
    assert.equal(all.length, 40);
    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        const a = all[i];
        const b = all[j];
        if (a === undefined || b === undefined) {
          continue;
        }
        assert.equal(overlaps(a, b), false, `cards ${String(i)} and ${String(j)} clear at forty`);
      }
    }
    const grid = gridFor(40);
    assert.equal(grid.cardW.toFixed(2), "184.50");
    assert.equal(grid.cardH.toFixed(2), "188.80");
  });

  it("caps the card size and centres the block so one bot is not a full-board slab", () => {
    const one = cardRect(gridFor(1), 0);
    assert.deepEqual(
      { w: one.w, h: one.h },
      { w: 440, h: 330 },
      "single card clamps to the maximum card size",
    );
    assert.equal(one.x + one.w / 2, GRID_AREA.x + GRID_AREA.w / 2);
    assert.equal(one.y + one.h / 2, GRID_AREA.y + GRID_AREA.h / 2);
  });

  it("keeps the slot order on id so shuffling the roster does not move a card", () => {
    const forward = cardOrder(demoRoster).map((row) => row.name);
    assert.deepEqual(forward, ["Ivo", "Wren", "Sable", "Reed", "Anouk", "Koji", "Mira", "Lauren"]);
    assert.deepEqual(cardOrder([...demoRoster].reverse()).map((row) => row.name), forward);
    assert.deepEqual(
      cardOrder([ivo, lauren, reed, sable, anouk, wren, mira, koji]).map((row) => row.name),
      forward,
    );
  });
});

describe("mission control type scale", () => {
  it("steps the headline down as the roster crowds and never below fifteen", () => {
    assert.deepEqual(
      [8, 18, 24, 40].map((n) => cardScale(gridFor(n).cardW).name),
      [34, 32, 26, 19],
    );
    assert.equal(cardScale(0).name, 15);
  });

  it("holds the meta and path type at a readable floor at forty", () => {
    const compact = cardScale(gridFor(40).cardW);
    assert.deepEqual(compact, { name: 19, state: 9, meta: 10, path: 9, pad: 10 });
  });

  it("caps the type at one bot so a huge card does not get a poster headline", () => {
    assert.deepEqual(cardScale(gridFor(1).cardW), {
      name: 34,
      state: 13,
      meta: 15,
      path: 13,
      pad: 22,
    });
  });
});
