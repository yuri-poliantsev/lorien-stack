import type { Action } from "../../actions.ts";
import type { ThemePose } from "../hooks.ts";
import type { PlotLabel } from "./label.ts";
import { hash32 } from "./layout.ts";
import type { Sprite } from "./sprites.ts";

export type BuildKind = "hut" | "vault";

export type PlotView = {
  x: number;
  y: number;
  cell: number;
  kind: BuildKind;
  prop: number;
  pose: ThemePose;
  action: Action;
  label: PlotLabel;
  selected: boolean;
  phase: number;
  t: number;
  motion: boolean;
  font: string;
  sprite: Sprite | undefined;
};

type Point = { x: number; y: number };

// Width of a building as a share of the column pitch, and how far its front corner sits
// below the pad centre. Everything else scales off the sheet's own aspect.
const BUILD_W = 0.68;
const BUILD_DROP = 0.125;

const FALLBACK = {
  hut: { left: "#cb8846", right: "#9d612c", roof: "#4c555c", door: "#ffc85c" },
  vault: { left: "#616a72", right: "#464d54", roof: "#4c555c", door: "#3a4147" },
} as const;

const BEACON_HOT = "#ff4438";
const STEEL_BODY = "#9aa1a8";
const STEEL_LIT = "#c3cad1";
const STEEL_DARK = "#6d757c";
const VISOR = "#1e242a";

function poly(ctx: CanvasRenderingContext2D, points: readonly Point[]): void {
  const first = points[0];
  if (first === undefined) {
    return;
  }
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i += 1) {
    const p = points[i];
    if (p !== undefined) {
      ctx.lineTo(p.x, p.y);
    }
  }
  ctx.closePath();
}

export function kindFor(botId: string): BuildKind {
  return (hash32(`kind:${botId}`) & 1) === 0 ? "hut" : "vault";
}

export function propFor(botId: string): number {
  return hash32(`prop:${botId}`) % 4;
}

function doorSide(view: PlotView): number {
  return view.sprite?.door ?? (view.kind === "hut" ? 1 : -1);
}

function buildingRect(view: PlotView): { x: number; y: number; w: number; h: number } {
  const S = view.cell;
  const aspect = view.sprite === undefined ? 0.9 : view.sprite.box.h / view.sprite.box.w;
  const w = S * BUILD_W;
  const h = w * aspect;
  return { x: view.x - w / 2, y: view.y + S * BUILD_DROP - h, w, h };
}

function drawLightPool(ctx: CanvasRenderingContext2D, view: PlotView): void {
  const S = view.cell;
  const cx = view.x + doorSide(view) * S * 0.15;
  const cy = view.y + S * 0.13;
  const r = S * 0.34;
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  glow.addColorStop(0, "rgba(255, 198, 102, 0.46)");
  glow.addColorStop(1, "rgba(255, 198, 102, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
}

// Drawn only until the keyed sheets decode, or if they never arrive. A plain lit box on a
// pad still says which bot is awake, which is the one thing the scene cannot drop.
function drawFallbackBox(ctx: CanvasRenderingContext2D, view: PlotView, lit: boolean): void {
  const S = view.cell;
  const shade = FALLBACK[view.kind];
  const bw = S * 0.3;
  const bh = bw * 0.5;
  const h = S * 0.34;
  const s: Point = { x: view.x, y: view.y + bh };
  const e: Point = { x: view.x + bw, y: view.y };
  const w: Point = { x: view.x - bw, y: view.y };
  const n: Point = { x: view.x, y: view.y - bh };
  const dim = (colour: string): string => (lit ? colour : `${colour}`);

  ctx.globalAlpha = lit ? 1 : 0.42;
  ctx.fillStyle = dim(shade.left);
  poly(ctx, [w, s, { x: s.x, y: s.y - h }, { x: w.x, y: w.y - h }]);
  ctx.fill();
  ctx.fillStyle = dim(shade.right);
  poly(ctx, [s, e, { x: e.x, y: e.y - h }, { x: s.x, y: s.y - h }]);
  ctx.fill();
  ctx.fillStyle = shade.roof;
  poly(ctx, [
    { x: n.x, y: n.y - h },
    { x: e.x, y: e.y - h },
    { x: s.x, y: s.y - h },
    { x: w.x, y: w.y - h },
  ]);
  ctx.fill();
  if (lit) {
    ctx.fillStyle = shade.door;
    ctx.fillRect(view.x + bw * 0.1, view.y - h * 0.6, bw * 0.4, h * 0.6);
  }
  ctx.globalAlpha = 1;
}

// Crates and drums on the spare corner of a pad. Two building sheets alone make a
// forty-plot field look stamped; this breaks it up without a third generated frame.
function drawPadProp(ctx: CanvasRenderingContext2D, view: PlotView): void {
  if (view.prop === 0) {
    return;
  }
  const S = view.cell;
  const x = view.x - doorSide(view) * S * 0.29;
  const y = view.y + S * 0.045;
  if (view.prop === 1) {
    ctx.fillStyle = "#7d5a32";
    ctx.fillRect(x - S * 0.045, y - S * 0.07, S * 0.09, S * 0.07);
    ctx.fillStyle = "#96703f";
    ctx.fillRect(x - S * 0.045, y - S * 0.07, S * 0.09, S * 0.016);
    ctx.fillStyle = "#6a4b28";
    ctx.fillRect(x - S * 0.026, y - S * 0.108, S * 0.055, S * 0.04);
    return;
  }
  if (view.prop === 2) {
    for (const dx of [-S * 0.03, S * 0.024]) {
      ctx.fillStyle = "#4f6b52";
      ctx.fillRect(x + dx, y - S * 0.062, S * 0.038, S * 0.062);
      ctx.fillStyle = "#648a68";
      ctx.fillRect(x + dx, y - S * 0.062, S * 0.038, S * 0.012);
    }
    return;
  }
  ctx.strokeStyle = "#5c646b";
  ctx.lineWidth = Math.max(1.5, S * 0.012);
  for (const r of [S * 0.028, S * 0.046]) {
    ctx.beginPath();
    ctx.ellipse(x, y - S * 0.012, r, r * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawBeacon(ctx: CanvasRenderingContext2D, view: PlotView): void {
  const sprite = view.sprite;
  if (sprite === undefined || view.pose !== "sleeping") {
    return;
  }
  const rect = buildingRect(view);
  const x = rect.x + sprite.beacon.x * rect.w;
  const y = rect.y + sprite.beacon.y * rect.h;
  const heat = view.motion
    ? 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(view.t * 2.6 + view.phase * Math.PI * 2))
    : 0.9;
  const r = Math.max(2, view.cell * 0.024);
  const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 5);
  glow.addColorStop(0, `rgba(255, 74, 58, ${(0.62 * heat).toFixed(3)})`);
  glow.addColorStop(1, "rgba(255, 74, 58, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, r * 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = BEACON_HOT;
  ctx.globalAlpha = 0.35 + 0.65 * heat;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawWorkerProp(
  ctx: CanvasRenderingContext2D,
  view: PlotView,
  body: { x: number; y: number; hh: number; side: number },
): void {
  const { x, y, hh, side } = body;
  if (view.action === "reading") {
    ctx.fillStyle = "#2b3a46";
    ctx.fillRect(x - hh * 0.26, y - hh * 0.58, hh * 0.52, hh * 0.3);
    ctx.fillStyle = "#79d6f0";
    ctx.fillRect(x - hh * 0.2, y - hh * 0.54, hh * 0.4, hh * 0.2);
    return;
  }
  if (view.action === "writing") {
    ctx.fillStyle = "#3a4249";
    ctx.fillRect(x + side * hh * 0.22 - hh * 0.23, y - hh * 0.52, hh * 0.46, hh * 0.52);
    ctx.fillStyle = "#8ce0a8";
    ctx.fillRect(x + side * hh * 0.22 - hh * 0.18, y - hh * 0.48, hh * 0.36, hh * 0.16);
    return;
  }
  if (view.action === "shell") {
    const tx = x + side * hh * 0.42;
    ctx.fillStyle = "#2f353a";
    ctx.fillRect(tx - hh * 0.08, y - hh * 1.12, hh * 0.16, hh * 0.2);
    const flicker = view.motion ? 0.45 + 0.55 * Math.abs(Math.sin(view.t * 9 + view.phase * 7)) : 1;
    ctx.fillStyle = `rgba(255, 244, 190, ${(0.95 * flicker).toFixed(2)})`;
    for (let i = 0; i < 4; i += 1) {
      const spread = hh * (0.08 + i * 0.1);
      ctx.fillRect(tx - spread * side * 0.5, y - hh * 1.18 + spread * 0.7, hh * 0.08, hh * 0.08);
    }
    return;
  }
  if (view.action === "talking") {
    ctx.fillStyle = "rgba(240, 236, 220, 0.94)";
    ctx.fillRect(x + side * hh * 0.44 - hh * 0.26, y - hh * 1.52, hh * 0.52, hh * 0.32);
    ctx.fillStyle = "#2a2f34";
    ctx.fillRect(x + side * hh * 0.44 - hh * 0.19, y - hh * 1.42, hh * 0.38, hh * 0.08);
    return;
  }
  if (view.action === "thinking") {
    ctx.fillStyle = "rgba(240, 236, 220, 0.9)";
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.arc(x + side * hh * (0.18 + i * 0.18), y - hh * 1.3, hh * 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawWorker(ctx: CanvasRenderingContext2D, view: PlotView): void {
  const S = view.cell;
  const hh = S * 0.2;
  const side = doorSide(view);
  const sway = view.motion ? Math.sin(view.t * 2.1 + view.phase * Math.PI * 2) * S * 0.006 : 0;
  const x = view.x + side * S * 0.2 + sway;
  const y = view.y + S * 0.145;

  ctx.fillStyle = "rgba(44, 28, 12, 0.34)";
  ctx.beginPath();
  ctx.ellipse(x, y, hh * 0.38, hh * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = STEEL_DARK;
  ctx.fillRect(x - hh * 0.21, y - hh * 0.3, hh * 0.16, hh * 0.3);
  ctx.fillRect(x + hh * 0.05, y - hh * 0.3, hh * 0.16, hh * 0.3);

  ctx.fillStyle = STEEL_BODY;
  ctx.fillRect(x - hh * 0.26, y - hh * 0.76, hh * 0.52, hh * 0.48);
  ctx.fillStyle = STEEL_LIT;
  ctx.fillRect(x - hh * 0.26, y - hh * 0.76, hh * 0.18, hh * 0.48);
  ctx.fillStyle = STEEL_DARK;
  ctx.fillRect(x - hh * 0.3, y - hh * 0.8, hh * 0.6, hh * 0.1);

  const head = y - hh * 0.92;
  ctx.fillStyle = STEEL_BODY;
  ctx.beginPath();
  ctx.arc(x, head, hh * 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = VISOR;
  ctx.fillRect(x - hh * 0.15, head - hh * 0.05, hh * 0.3, hh * 0.11);

  const shoulder: Point = { x, y: y - hh * 0.72 };
  let hands: readonly Point[] = [
    { x: x - hh * 0.32, y: y - hh * 0.3 },
    { x: x + hh * 0.32, y: y - hh * 0.3 },
  ];
  if (view.action === "reading") {
    hands = [
      { x: x - hh * 0.3, y: y - hh * 0.5 },
      { x: x + hh * 0.3, y: y - hh * 0.5 },
    ];
  }
  if (view.action === "writing") {
    hands = [
      { x: x - hh * 0.28, y: y - hh * 0.3 },
      { x: x + side * hh * 0.3, y: y - hh * 0.48 },
    ];
  }
  if (view.action === "shell") {
    hands = [
      { x: x - hh * 0.3, y: y - hh * 0.32 },
      { x: x + side * hh * 0.42, y: y - hh * 1.02 },
    ];
  }
  ctx.strokeStyle = STEEL_BODY;
  ctx.lineWidth = Math.max(1.5, hh * 0.13);
  ctx.lineCap = "round";
  for (const hand of hands) {
    ctx.beginPath();
    ctx.moveTo(shoulder.x, shoulder.y);
    ctx.lineTo(hand.x, hand.y);
    ctx.stroke();
  }

  drawWorkerProp(ctx, view, { x, y, hh, side });
}

export function drawPlot(ctx: CanvasRenderingContext2D, view: PlotView): void {
  const S = view.cell;
  const lit = view.pose !== "sleeping";
  if (lit) {
    drawLightPool(ctx, view);
  }

  ctx.fillStyle = "rgba(42, 26, 10, 0.30)";
  ctx.beginPath();
  ctx.ellipse(view.x, view.y + S * 0.055, S * 0.33, S * 0.115, 0, 0, Math.PI * 2);
  ctx.fill();

  drawPadProp(ctx, view);

  const sprite = view.sprite;
  if (sprite === undefined) {
    drawFallbackBox(ctx, view, lit);
  } else {
    const rect = buildingRect(view);
    ctx.drawImage(
      lit ? sprite.lit : sprite.dark,
      sprite.box.x,
      sprite.box.y,
      sprite.box.w,
      sprite.box.h,
      rect.x,
      rect.y,
      rect.w,
      rect.h,
    );
  }

  drawBeacon(ctx, view);
  if (view.pose === "working") {
    drawWorker(ctx, view);
  }
}

export function drawPlotLabel(ctx: CanvasRenderingContext2D, view: PlotView): void {
  const S = view.cell;
  const asleep = view.pose === "sleeping";
  const nameSize = Math.max(9, S * 0.078);
  const plateY = buildingRect(view).y - S * 0.075;

  ctx.font = `600 ${nameSize.toFixed(1)}px ${view.font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const width = ctx.measureText(view.label.name).width + nameSize * 0.9;
  const height = nameSize * 1.5;
  ctx.fillStyle = asleep ? "rgba(222, 217, 200, 0.44)" : "rgba(240, 236, 218, 0.96)";
  ctx.fillRect(view.x - width / 2, plateY - height / 2, width, height);
  ctx.strokeStyle = view.selected ? "#f4c65f" : "rgba(52, 44, 32, 0.6)";
  ctx.lineWidth = view.selected ? Math.max(2, S * 0.012) : Math.max(1, S * 0.005);
  ctx.strokeRect(view.x - width / 2, plateY - height / 2, width, height);
  ctx.fillStyle = asleep ? "rgba(46, 41, 32, 0.66)" : "#201d16";
  ctx.fillText(view.label.name, view.x, plateY + nameSize * 0.04);

  if (view.label.status.length === 0) {
    return;
  }
  const statusSize = Math.max(8, S * 0.068);
  const statusY = view.y + S * 0.3;
  ctx.font = `500 ${statusSize.toFixed(1)}px ${view.font}`;
  ctx.fillStyle = "rgba(22, 14, 4, 0.6)";
  ctx.fillText(view.label.status, view.x + statusSize * 0.09, statusY + statusSize * 0.1);
  ctx.fillStyle = view.pose === "working" ? "#ffdd94" : "#dbe0e6";
  ctx.fillText(view.label.status, view.x, statusY);

  if (view.label.path.length === 0) {
    return;
  }
  const pathSize = Math.max(7, S * 0.058);
  ctx.font = `400 ${pathSize.toFixed(1)}px ${view.font}`;
  ctx.fillStyle = "rgba(22, 14, 4, 0.6)";
  ctx.fillText(view.label.path, view.x + pathSize * 0.09, statusY + statusSize * 1.22);
  ctx.fillStyle = "#cbd3db";
  ctx.fillText(view.label.path, view.x, statusY + statusSize * 1.13);
}
