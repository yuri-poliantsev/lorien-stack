import type { BotRecord } from "@lorien-stack/contracts";

export const WORLD_WIDTH = 1920;
export const WORLD_HEIGHT = 1080;

const BOARD_INSET = 20;

// The shell floats its roster panel over the left of the scene. Reserving a band
// wide enough for it keeps every card clear of the glass instead of hiding the
// first column behind it, at any roster size.
const RAIL_WIDTH = 296;

const BOARD_PAD = 24;
const GUTTER = 12;
const MAX_CARD_W = 440;
const MAX_CARD_H = 372;

export type Rect = { x: number; y: number; w: number; h: number };

export const BOARD: Rect = {
  x: BOARD_INSET,
  y: BOARD_INSET,
  w: WORLD_WIDTH - BOARD_INSET * 2,
  h: WORLD_HEIGHT - BOARD_INSET * 2,
};

export const RAIL: Rect = {
  x: BOARD.x,
  y: BOARD.y,
  w: RAIL_WIDTH,
  h: BOARD.h,
};

export const GRID_AREA: Rect = {
  x: BOARD.x + RAIL_WIDTH,
  y: BOARD.y + BOARD_PAD,
  w: BOARD.w - RAIL_WIDTH - BOARD_PAD,
  h: BOARD.h - BOARD_PAD * 2,
};

const COLUMN_STEPS: readonly (readonly [number, number])[] = [
  [1, 1],
  [2, 2],
  [3, 3],
  [4, 2],
  [6, 3],
  [16, 4],
  [20, 5],
  [30, 6],
  [35, 7],
  [40, 8],
];

export function clampRosterSize(count: number): number {
  if (!Number.isFinite(count)) {
    return 1;
  }
  return Math.max(1, Math.min(40, Math.trunc(count)));
}

export function gridColumns(count: number): number {
  const n = clampRosterSize(count);
  for (const [ceiling, cols] of COLUMN_STEPS) {
    if (n <= ceiling) {
      return cols;
    }
  }
  return 8;
}

export type Grid = {
  cols: number;
  rows: number;
  cardW: number;
  cardH: number;
  originX: number;
  originY: number;
};

export function gridFor(count: number, area: Rect = GRID_AREA): Grid {
  const n = clampRosterSize(count);
  const cols = gridColumns(n);
  const rows = Math.ceil(n / cols);
  const cardW = Math.min(MAX_CARD_W, (area.w - GUTTER * (cols - 1)) / cols);
  const cardH = Math.min(MAX_CARD_H, (area.h - GUTTER * (rows - 1)) / rows);
  const blockW = cardW * cols + GUTTER * (cols - 1);
  const blockH = cardH * rows + GUTTER * (rows - 1);
  return {
    cols,
    rows,
    cardW,
    cardH,
    originX: area.x + (area.w - blockW) / 2,
    originY: area.y + (area.h - blockH) / 2,
  };
}

export function cardRect(grid: Grid, index: number): Rect {
  const col = index % grid.cols;
  const row = Math.floor(index / grid.cols);
  return {
    x: grid.originX + col * (grid.cardW + GUTTER),
    y: grid.originY + row * (grid.cardH + GUTTER),
    w: grid.cardW,
    h: grid.cardH,
  };
}

export type CardScale = {
  name: number;
  state: number;
  meta: number;
  path: number;
  pad: number;
  spark: number;
};

function step(low: number, value: number, high: number): number {
  return Math.min(high, Math.max(low, Math.round(value)));
}

export function cardScale(card: { cardW: number; cardH: number }): CardScale {
  const w = Number.isFinite(card.cardW) ? Math.max(0, card.cardW) : 0;
  const h = Number.isFinite(card.cardH) ? Math.max(0, card.cardH) : 0;
  return {
    name: step(15, w * 0.105, 34),
    state: step(9, w * 0.042, 13),
    meta: step(10, w * 0.055, 15),
    path: step(9, w * 0.05, 13),
    pad: step(10, w * 0.05, 22),
    // The chart is the card's body, not a footnote: it takes the slack the header
    // leaves, so a roomy card reads as a plot and a crowded one still reads as bars.
    spark: step(20, h * 0.42, 176),
  };
}

export function cardOrder(roster: readonly BotRecord[]): readonly BotRecord[] {
  return [...roster].sort((a, b) => a.id.localeCompare(b.id));
}
