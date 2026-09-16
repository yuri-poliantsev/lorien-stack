import type { BotId, BotRecord } from "@lorien-stack/contracts";

export const WORLD_WIDTH = 1920;
export const WORLD_HEIGHT = 1080;

const MARGIN_X = 78;
const CANOPY_TOP = 168;
const FOREST_FLOOR = 980;
const MAX_TIERS = 5;

const FLET_BASE_WIDTH = 210;
const FIGURE_RISE = 64;
const SIGN_GAP = 16;
const SIGN_HEIGHT = 34;
const SIGN_MAX_SPAN = 1.5;

const CELL_FILL = 0.62;
const SIGN_FILL = 0.7;
const X_JITTER = 0.1;
const Y_JITTER = 0.06;

// The keyed flet raster's opaque bounding box, and where the deck surface falls
// inside it. Every vertical measurement below hangs off the deck line, because
// that is the line a figure stands on and a nametag hangs under.
export const FLET_SPRITE = { sx: 13, sy: 88, sw: 232, sh: 113, deckFraction: 0.301 } as const;
export const LANTERN_SPRITE = { sx: 79, sy: 47, sw: 98, sh: 159, glassFraction: 0.616 } as const;

const FLET_ASPECT = FLET_SPRITE.sh / FLET_SPRITE.sw;

export type Point = { x: number; y: number };

export type Branch = {
  tier: number;
  points: readonly Point[];
};

export type FletBox = {
  botId: BotId;
  tier: number;
  col: number;
  x: number;
  deckY: number;
  width: number;
  height: number;
  scale: number;
  signTop: number;
  signHeight: number;
  signMaxWidth: number;
  lanternSide: -1 | 1;
};

export type LorienLayout = {
  count: number;
  tiers: number;
  cols: number;
  scale: number;
  cellWidth: number;
  branches: readonly Branch[];
  flets: ReadonlyMap<BotId, FletBox>;
};

export type Rect = { x: number; y: number; w: number; h: number };

export function hash32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function tiersFor(count: number): number {
  if (count <= 0) {
    return 1;
  }
  return Math.min(MAX_TIERS, Math.max(1, Math.ceil(Math.sqrt(count / 2))));
}

export function colsFor(count: number): number {
  return Math.max(1, Math.ceil(Math.max(1, count) / tiersFor(count)));
}

export function tierSpacing(tiers: number): number {
  return (FOREST_FLOOR - CANOPY_TOP) / tiers;
}

export function cellWidth(cols: number): number {
  return (WORLD_WIDTH - 2 * MARGIN_X) / cols;
}

export function cellCentreX(col: number, cols: number): number {
  return MARGIN_X + cellWidth(cols) * (col + 0.5);
}

// A flet shrinks when its cell does, in whichever axis runs out first, so
// crowding above 24 bots costs size rather than clearance.
export function fletScale(tiers: number, cols: number): number {
  const byWidth = (cellWidth(cols) * CELL_FILL) / FLET_BASE_WIDTH;
  const byHeight = (tierSpacing(tiers) * 0.52) / (FLET_BASE_WIDTH * FLET_ASPECT);
  return Math.min(1, byWidth, byHeight);
}

function branchOffset(tier: number, col: number, spacing: number): number {
  const h = hash32(`branch:${String(tier)}:${String(col)}`);
  return ((h % 2001) / 1000 - 1) * spacing * Y_JITTER;
}

export function branchesFor(tiers: number, cols: number): readonly Branch[] {
  const spacing = tierSpacing(tiers);
  const out: Branch[] = [];
  for (let tier = 0; tier < tiers; tier += 1) {
    const base = CANOPY_TOP + spacing * (tier + 0.5);
    const inner: Point[] = [];
    for (let col = 0; col < cols; col += 1) {
      inner.push({
        x: cellCentreX(col, cols),
        y: base + branchOffset(tier, col, spacing),
      });
    }
    const first = inner[0];
    const last = inner[inner.length - 1];
    if (first === undefined || last === undefined) {
      continue;
    }
    out.push({
      tier,
      points: [{ x: 0, y: first.y }, ...inner, { x: WORLD_WIDTH, y: last.y }],
    });
  }
  return out;
}

export function branchYAt(branch: Branch, x: number): number {
  const points = branch.points;
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) {
    return CANOPY_TOP;
  }
  if (x <= first.x) {
    return first.y;
  }
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (a === undefined || b === undefined) {
      continue;
    }
    if (x <= b.x) {
      const span = b.x - a.x;
      const t = span === 0 ? 0 : (x - a.x) / span;
      return a.y + (b.y - a.y) * t;
    }
  }
  return last.y;
}

export function layoutFlets(input: { bots: readonly BotRecord[] }): LorienLayout {
  const count = input.bots.length;
  const tiers = tiersFor(count);
  const cols = colsFor(count);
  const scale = fletScale(tiers, cols);
  const cell = cellWidth(cols);
  const branches = branchesFor(tiers, cols);
  const width = FLET_BASE_WIDTH * scale;
  const height = width * FLET_ASPECT;
  const cells = tiers * cols;

  const flets = new Map<BotId, FletBox>();
  const taken = new Set<number>();
  // Sorted by id so a reshuffled roster of the same bots probes the cells in
  // the same order and every flet keeps its place.
  const ordered = [...input.bots].sort((a, b) => a.id.localeCompare(b.id));

  for (const bot of ordered) {
    const start = hash32(`flet:${bot.id}`) % cells;
    let cellIndex = start;
    for (let n = 0; n < cells; n += 1) {
      const candidate = (start + n) % cells;
      if (!taken.has(candidate)) {
        cellIndex = candidate;
        break;
      }
    }
    taken.add(cellIndex);
    const tier = Math.floor(cellIndex / cols);
    const col = cellIndex % cols;
    const branch = branches[tier];
    const jitter = hash32(`x:${bot.id}`) % 2001;
    const x = cellCentreX(col, cols) + (jitter / 1000 - 1) * cell * X_JITTER;
    const deckY = branch === undefined ? CANOPY_TOP : branchYAt(branch, x);
    flets.set(bot.id, {
      botId: bot.id,
      tier,
      col,
      x,
      deckY,
      width,
      height,
      scale,
      signTop: deckY + height * (1 - FLET_SPRITE.deckFraction) + SIGN_GAP * scale,
      signHeight: SIGN_HEIGHT * scale,
      signMaxWidth: Math.min(cell * SIGN_FILL, FLET_BASE_WIDTH * SIGN_MAX_SPAN * scale),
      lanternSide: hash32(`lantern:${bot.id}`) % 2 === 0 ? -1 : 1,
    });
  }

  return { count, tiers, cols, scale, cellWidth: cell, branches, flets };
}

export function fletRect(box: FletBox): Rect {
  return {
    x: box.x - box.width / 2,
    y: box.deckY - box.height * FLET_SPRITE.deckFraction,
    w: box.width,
    h: box.height,
  };
}

export function signRect(box: FletBox): Rect {
  return {
    x: box.x - box.signMaxWidth / 2,
    y: box.signTop,
    w: box.signMaxWidth,
    h: box.signHeight,
  };
}

export function figureRise(box: FletBox): number {
  return FIGURE_RISE * box.scale;
}

export function unitRect(box: FletBox): Rect {
  const w = Math.max(box.width, box.signMaxWidth);
  const top = box.deckY - figureRise(box);
  return { x: box.x - w / 2, y: top, w, h: box.signTop + box.signHeight - top };
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
