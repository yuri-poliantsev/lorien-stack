import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseBotId, type BotRecord } from "@lorien-stack/contracts";

import {
  PLOT_ABOVE,
  PLOT_BELOW,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  layoutFor,
  planGrid,
  plotAt,
} from "./layout.ts";

function bot(id: string, name: string): BotRecord {
  const parsed = parseBotId(id);
  assert.equal(parsed.ok, true, `${id} is a valid bot id`);
  if (!parsed.ok) {
    throw new Error("bot id");
  }
  return { id: parsed.value, name };
}

const IDS = [
  "af4c6d21-9ef6-4435-8232-bf09ca561583",
  "2b40667e-d345-4db1-bbf0-9b26b7f904e9",
  "7820582a-8fe5-4ef5-8ba5-30bf7641f8cc",
  "a77fae77-0494-4981-acf5-2de5bd793fe4",
  "ae9531d3-ca13-43e2-92eb-3bf156010408",
  "97350d45-cace-4d40-8628-e8bece188dac",
  "7a330915-6d55-4b1c-8fab-80b899126fa0",
  "15aafeb5-603a-4d4b-b25d-8bc5a5287fb9",
];

function roster(n: number): BotRecord[] {
  const out: BotRecord[] = [];
  for (let i = 0; i < n; i += 1) {
    const base = IDS[i % IDS.length] ?? IDS[0] ?? "";
    // Vary the last hex digit block so every generated roster has distinct ids.
    const id = `${base.slice(0, 24)}${i.toString(16).padStart(12, "0")}`;
    out.push(bot(id, `Bot ${String(i)}`));
  }
  return out;
}

describe("starcraft grid plan", () => {
  it("picks two rows of four for the demo roster of eight", () => {
    const grid = planGrid(8);
    assert.equal(grid.cols, 4, "eight plots split into four columns");
    assert.equal(grid.rows, 2, "eight plots split into two rows");
  });

  it("picks eight columns by five rows at the full roster of forty", () => {
    const grid = planGrid(40);
    assert.equal(grid.cols, 8, "forty plots split into eight columns");
    assert.equal(grid.rows, 5, "forty plots split into five rows");
    assert.equal(grid.cols * grid.rows, 40, "the forty-bot grid has no spare cell");
  });

  it("caps the cell size so a single bot does not fill the world", () => {
    assert.equal(planGrid(1).cell, 400, "one bot draws at the cell cap");
    assert.equal(planGrid(0).cell, 400, "an empty roster still plans one capped cell");
  });

  it("shrinks the cell as the roster grows and never below the forty-bot size", () => {
    const eight = planGrid(8).cell;
    const twentyFour = planGrid(24).cell;
    const forty = planGrid(40).cell;
    assert.equal(Math.round(eight), 400, "eight bots sit at the cell cap");
    assert.equal(Math.round(twentyFour), 237, "twenty-four bots shrink to 237");
    assert.equal(Math.round(forty), 190, "forty bots shrink to 190");
    assert.ok(eight > twentyFour && twentyFour > forty, "cell size falls as the roster grows");
  });

  it("keeps every plot inside the world at one, eight, twenty-four and forty", () => {
    for (const n of [1, 8, 24, 40]) {
      const grid = planGrid(n);
      for (let i = 0; i < grid.cols * grid.rows; i += 1) {
        const plot = plotAt(grid, i);
        const half = grid.cell * 0.44;
        assert.ok(plot.x - half >= 0, `n=${String(n)} plot ${String(i)} clears the left edge`);
        assert.ok(
          plot.x + half <= WORLD_WIDTH,
          `n=${String(n)} plot ${String(i)} clears the right edge`,
        );
        assert.ok(
          plot.y - grid.cell * PLOT_ABOVE >= 0,
          `n=${String(n)} plot ${String(i)} clears the top edge`,
        );
        assert.ok(
          plot.y + grid.cell * PLOT_BELOW <= WORLD_HEIGHT,
          `n=${String(n)} plot ${String(i)} clears the bottom edge`,
        );
      }
    }
  });
});

describe("starcraft plot assignment", () => {
  it("gives the same plot to the same id whatever order the roster arrives in", () => {
    const bots = roster(8);
    const forward = layoutFor(bots);
    const backward = layoutFor([...bots].reverse());
    const scrambled = layoutFor([...bots].sort((a, b) => a.name.localeCompare(b.name)));
    for (const row of bots) {
      const seat = forward.plots.get(row.id)?.index;
      assert.equal(backward.plots.get(row.id)?.index, seat, `${row.name} keeps its plot reversed`);
      assert.equal(scrambled.plots.get(row.id)?.index, seat, `${row.name} keeps its plot resorted`);
    }
  });

  it("seats every bot on its own cell up to twenty-four", () => {
    for (const n of [1, 2, 7, 8, 18, 24]) {
      const layout = layoutFor(roster(n));
      assert.equal(layout.plots.size, n, `n=${String(n)} seats every bot`);
      const used = [...layout.plots.values()].map((plot) => plot.index);
      assert.equal(new Set(used).size, n, `n=${String(n)} puts no two bots on one cell`);
    }
  });

  it("keeps plots apart by at least a pad width up to twenty-four", () => {
    for (const n of [8, 18, 24]) {
      const layout = layoutFor(roster(n));
      const seats = [...layout.plots.values()];
      const padW = layout.grid.cell * 0.88;
      const plotH = layout.grid.cell * (PLOT_ABOVE + PLOT_BELOW);
      for (let i = 0; i < seats.length; i += 1) {
        for (let j = i + 1; j < seats.length; j += 1) {
          const a = seats[i];
          const b = seats[j];
          if (a === undefined || b === undefined) {
            continue;
          }
          const apart =
            Math.abs(a.x - b.x) >= padW - 0.001 || Math.abs(a.y - b.y) >= plotH - 0.001;
          assert.ok(apart, `n=${String(n)} plots ${String(i)} and ${String(j)} do not overlap`);
        }
      }
    }
  });

  it("still seats all forty on distinct cells with the grid exactly full", () => {
    const layout = layoutFor(roster(40));
    assert.equal(layout.plots.size, 40, "forty bots are all seated");
    assert.equal(
      new Set([...layout.plots.values()].map((plot) => plot.index)).size,
      40,
      "forty bots hold forty distinct cells",
    );
    assert.equal(layout.grid.cols * layout.grid.rows, 40, "the grid is exactly full at forty");
  });

  it("staggers odd rows by half a column so the field reads as isometric", () => {
    const grid = planGrid(8);
    const first = plotAt(grid, 0);
    const second = plotAt(grid, grid.cols);
    assert.equal(
      Math.round(second.x - first.x),
      Math.round(grid.cell * 0.5),
      "row one sits half a cell to the right of row zero",
    );
    assert.equal(
      Math.round(second.y - first.y),
      Math.round(grid.cell * (PLOT_ABOVE + PLOT_BELOW)),
      "row one sits one plot height below row zero",
    );
  });
});
