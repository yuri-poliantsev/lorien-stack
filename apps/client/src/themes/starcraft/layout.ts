import type { BotId, BotRecord } from "@lorien-stack/contracts";

export const WORLD_WIDTH = 1920;
export const WORLD_HEIGHT = 1040;

const MARGIN_X = 40;
// The back row is meant to crowd the rock wall the backdrop paints across the top, the
// way the concept frame does, so the top margin only keeps nametags on canvas.
const MARGIN_TOP = 56;
const MARGIN_BOTTOM = 16;
const CELL_MAX = 400;
const MAX_BOTS = 40;

// A plot's drawn height as a multiple of the column pitch. Above the pad centre sits
// the building and its nametag, below it the action line, and the row behind has to
// clear both or the grid stops being countable.
export const PLOT_ABOVE = 0.64;
export const PLOT_BELOW = 0.38;
export const PLOT_HEIGHT = PLOT_ABOVE + PLOT_BELOW;

// Odd rows shift half a column, which is what makes a rectangular field of plots read
// as an isometric floor instead of a spreadsheet.
const ROW_STAGGER = 0.5;

export type Grid = {
  cols: number;
  rows: number;
  cell: number;
  originX: number;
  originY: number;
};

export type Plot = { index: number; col: number; row: number; x: number; y: number };

export function hash32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function planGrid(count: number): Grid {
  const n = Math.min(MAX_BOTS, Math.max(1, Math.trunc(count)));
  const availW = WORLD_WIDTH - 2 * MARGIN_X;
  const availH = WORLD_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM;
  let cols = 1;
  let rows = 1;
  let cell = 0;
  for (let r = 1; r <= n; r += 1) {
    const c = Math.ceil(n / r);
    const fit = Math.min(availW / (c + ROW_STAGGER), availH / (r * PLOT_HEIGHT), CELL_MAX);
    if (fit > cell) {
      cell = fit;
      cols = c;
      rows = r;
    }
  }
  const spanX = (cols - 1 + ROW_STAGGER) * cell;
  return {
    cols,
    rows,
    cell,
    originX: (WORLD_WIDTH - spanX) / 2,
    originY: MARGIN_TOP + (availH - rows * PLOT_HEIGHT * cell) / 2 + PLOT_ABOVE * cell,
  };
}

export function plotAt(grid: Grid, index: number): Plot {
  const row = Math.floor(index / grid.cols);
  const col = index - row * grid.cols;
  return {
    index,
    col,
    row,
    x: grid.originX + (col + (row % 2) * ROW_STAGGER) * grid.cell,
    y: grid.originY + row * PLOT_HEIGHT * grid.cell,
  };
}

export type Layout = { grid: Grid; plots: Map<BotId, Plot> };

export function layoutFor(bots: readonly BotRecord[]): Layout {
  const grid = planGrid(bots.length);
  const slots = grid.cols * grid.rows;
  const taken = new Set<number>();
  const plots = new Map<BotId, Plot>();
  // Sorted by id so the same roster produces the same field whatever order it arrives in.
  for (const bot of [...bots].sort((a, b) => a.id.localeCompare(b.id))) {
    const start = hash32(bot.id) % slots;
    let chosen = start;
    for (let step = 0; step < slots; step += 1) {
      const slot = (start + step) % slots;
      if (!taken.has(slot)) {
        chosen = slot;
        break;
      }
    }
    taken.add(chosen);
    plots.set(bot.id, plotAt(grid, chosen));
  }
  return { grid, plots };
}
