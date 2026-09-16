import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseBotId, type BotId, type BotRecord } from "@lorien-stack/contracts";

import {
  ROSTER_GUTTER,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  branchYAt,
  branchesFor,
  cellCentreX,
  cellWidth,
  colsFor,
  fletRect,
  fletScale,
  layoutFlets,
  overlaps,
  signRect,
  tiersFor,
  unitRect,
  type FletBox,
} from "./layout.ts";

function botId(n: number): BotId {
  const parsed = parseBotId(`00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`);
  assert.equal(parsed.ok, true, `bot id ${String(n)} parses`);
  if (!parsed.ok) {
    throw new Error("bot id");
  }
  return parsed.value;
}

function roster(count: number): BotRecord[] {
  const out: BotRecord[] = [];
  for (let n = 1; n <= count; n += 1) {
    out.push({ id: botId(n), name: `Bot ${String(n)}` });
  }
  return out;
}

function boxes(count: number): FletBox[] {
  return [...layoutFlets({ bots: roster(count) }).flets.values()];
}

function worstClearance(list: readonly FletBox[]): number {
  let worst = Number.POSITIVE_INFINITY;
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = unitRect(list[i] as FletBox);
      const b = unitRect(list[j] as FletBox);
      const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
      const gapY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
      worst = Math.min(worst, Math.max(gapX, gapY));
    }
  }
  return worst;
}

describe("lorien branch tiers", () => {
  it("adds a branch tier as the roster grows and keeps a cell for every bot", () => {
    assert.equal(tiersFor(1), 1);
    assert.equal(tiersFor(8), 2);
    assert.equal(tiersFor(18), 3);
    assert.equal(tiersFor(24), 4);
    assert.equal(tiersFor(40), 5);
    assert.equal(colsFor(8), 4);
    assert.equal(colsFor(18), 6);
    assert.equal(colsFor(24), 6);
    assert.equal(colsFor(40), 8);
    for (let n = 1; n <= 40; n += 1) {
      assert.ok(
        tiersFor(n) * colsFor(n) >= n,
        `roster of ${String(n)} has at least ${String(n)} cells`,
      );
    }
  });

  it("caps the tier count at five so a 40-bot forest never stacks thinner", () => {
    assert.equal(tiersFor(40), 5);
    assert.equal(tiersFor(200), 5);
  });

  it("reads a deck height off the branch by interpolating between its columns", () => {
    const branch = branchesFor(2, 4)[0];
    assert.notEqual(branch, undefined);
    if (branch === undefined) {
      throw new Error("branch");
    }
    const first = branch.points[1];
    const second = branch.points[2];
    if (first === undefined || second === undefined) {
      throw new Error("branch points");
    }
    assert.equal(branchYAt(branch, first.x), first.y);
    assert.equal(branchYAt(branch, second.x), second.y);
    assert.equal(
      branchYAt(branch, (first.x + second.x) / 2),
      (first.y + second.y) / 2,
      "midway between two columns the branch is midway between their heights",
    );
    assert.equal(branchYAt(branch, -50), first.y, "the branch runs flat off the left edge");
    assert.equal(
      branchYAt(branch, WORLD_WIDTH + 50),
      branch.points[branch.points.length - 1]?.y,
      "the branch runs flat off the right edge",
    );
  });
});

describe("lorien flet placement", () => {
  it("keeps every flet in place when the same roster arrives in another order", () => {
    const forward = roster(18);
    const seats = (bots: readonly BotRecord[]): Record<string, string> => {
      const out: Record<string, string> = {};
      for (const [id, box] of layoutFlets({ bots }).flets) {
        out[id] = `${String(box.tier)}:${String(box.col)}:${box.x.toFixed(3)}:${box.deckY.toFixed(3)}`;
      }
      return out;
    };
    const expected = seats(forward);
    assert.deepEqual(seats([...forward].reverse()), expected);
    assert.deepEqual(seats([...forward].sort((a, b) => a.name.localeCompare(b.name))), expected);
    const rotated = [...forward.slice(7), ...forward.slice(0, 7)];
    assert.deepEqual(seats(rotated), expected);
  });

  it("gives every bot its own cell", () => {
    for (const n of [1, 8, 18, 24, 32, 40]) {
      const layout = layoutFlets({ bots: roster(n) });
      assert.equal(layout.flets.size, n, `all ${String(n)} bots are placed`);
      const cells = [...layout.flets.values()].map((box) => `${String(box.tier)}:${String(box.col)}`);
      assert.equal(new Set(cells).size, n, `all ${String(n)} cells are distinct`);
    }
  });

  it("never overlaps a flet or a nametag up to 24 bots", () => {
    for (let n = 1; n <= 24; n += 1) {
      const list = boxes(n);
      for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
          const a = list[i] as FletBox;
          const b = list[j] as FletBox;
          assert.equal(overlaps(fletRect(a), fletRect(b)), false, `flets clear at ${String(n)} bots`);
          assert.equal(
            overlaps(signRect(a), signRect(b)),
            false,
            `nametags clear at ${String(n)} bots`,
          );
          assert.equal(
            overlaps(unitRect(a), unitRect(b)),
            false,
            `figure, flet and nametag together clear at ${String(n)} bots`,
          );
        }
      }
    }
  });

  it("shrinks the flet instead of letting 40 bots collide", () => {
    assert.equal(Number(fletScale(4, 6).toFixed(4)), 0.7607, "24 bots keep a three-quarter flet");
    assert.equal(Number(fletScale(5, 8).toFixed(4)), 0.5705, "40 bots shrink to 57 percent");
    const forty = boxes(40);
    const box = forty[0] as FletBox;
    assert.equal(cellWidth(8).toFixed(2), "193.25");
    assert.equal(box.width.toFixed(2), "119.82");
    assert.equal(box.signMaxWidth.toFixed(2), "135.27");
    assert.equal(worstClearance(forty) > 20, true, "40 bots keep more than 20 world px of air");
    for (let i = 0; i < forty.length; i += 1) {
      for (let j = i + 1; j < forty.length; j += 1) {
        assert.equal(
          overlaps(unitRect(forty[i] as FletBox), unitRect(forty[j] as FletBox)),
          false,
          "40 bots do not overlap",
        );
      }
    }
  });

  it("keeps every flet, figure and nametag clear of the roster panel's gutter", () => {
    assert.equal(ROSTER_GUTTER, 296);
    for (let n = 1; n <= 40; n += 1) {
      for (const box of boxes(n)) {
        const rect = unitRect(box);
        assert.equal(
          rect.x >= ROSTER_GUTTER,
          true,
          `unit at x=${rect.x.toFixed(1)} clears the gutter at ${String(n)} bots`,
        );
      }
    }
    assert.equal(cellCentreX(0, 1), 1069, "one cell centres in the space right of the roster");
    const forty = boxes(40).sort((a, b) => a.x - b.x);
    assert.equal(unitRect(forty[0] as FletBox).x.toFixed(2), "305.66", "the leftmost of 40 starts past the gutter");
  });

  it("holds every flet inside the world the camera fits to", () => {
    for (const n of [1, 8, 24, 40]) {
      for (const box of boxes(n)) {
        const rect = unitRect(box);
        assert.equal(rect.x >= 0, true, `left edge inside the world at ${String(n)} bots`);
        assert.equal(rect.x + rect.w <= WORLD_WIDTH, true, `right edge inside at ${String(n)} bots`);
        assert.equal(rect.y >= 0, true, `top inside the world at ${String(n)} bots`);
        assert.equal(rect.y + rect.h <= WORLD_HEIGHT, true, `bottom inside at ${String(n)} bots`);
      }
    }
  });
});
