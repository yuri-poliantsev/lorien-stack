type Spot = { x: number; y: number };

export const PALETTE = {
  void: "#1b1409",
  sandFar: "#b98b4c",
  sandNear: "#d7ad73",
  rockDeep: "#5d3b23",
  rockMid: "#6f4728",
  stone: "#8c7355",
  stoneLit: "#a68a67",
  padTop: "#b4b8bc",
  padSeam: "#9aa0a5",
  padLip: "#83888d",
  padShade: "#6d7176",
} as const;

type Stop = { hour: number; r: number; g: number; b: number; a: number };

const TINTS: readonly Stop[] = [
  { hour: 0, r: 18, g: 28, b: 62, a: 0.46 },
  { hour: 6, r: 96, g: 62, b: 58, a: 0.26 },
  { hour: 9, r: 255, g: 240, b: 198, a: 0.06 },
  { hour: 16, r: 255, g: 224, b: 166, a: 0.11 },
  { hour: 19, r: 178, g: 82, b: 42, a: 0.27 },
  { hour: 22, r: 18, g: 28, b: 62, a: 0.44 },
  { hour: 24, r: 18, g: 28, b: 62, a: 0.46 },
];

export function skyTint(hour: number): string {
  const at = Math.min(24, Math.max(0, hour));
  let lo = TINTS[0] as Stop;
  let hi = TINTS[TINTS.length - 1] as Stop;
  for (let i = 0; i < TINTS.length - 1; i += 1) {
    const a = TINTS[i] as Stop;
    const b = TINTS[i + 1] as Stop;
    if (at >= a.hour && at <= b.hour) {
      lo = a;
      hi = b;
      break;
    }
  }
  const span = hi.hour - lo.hour;
  const k = span === 0 ? 0 : (at - lo.hour) / span;
  const mix = (from: number, to: number): number => Math.round(from + (to - from) * k);
  const alpha = lo.a + (hi.a - lo.a) * k;
  return `rgba(${mix(lo.r, hi.r)}, ${mix(lo.g, hi.g)}, ${mix(lo.b, hi.b)}, ${alpha.toFixed(3)})`;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poly(ctx: CanvasRenderingContext2D, points: readonly { x: number; y: number }[]): void {
  ctx.beginPath();
  const first = points[0];
  if (first === undefined) {
    return;
  }
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i += 1) {
    const p = points[i];
    if (p !== undefined) {
      ctx.lineTo(p.x, p.y);
    }
  }
  ctx.closePath();
}

function drawRockWall(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const rnd = mulberry32(0x5c17);
  const bands = [
    { depth: h * 0.105, fill: PALETTE.rockDeep },
    { depth: h * 0.068, fill: PALETTE.rockMid },
  ];
  for (const band of bands) {
    const points: { x: number; y: number }[] = [{ x: 0, y: 0 }];
    const steps = 24;
    for (let i = 0; i <= steps; i += 1) {
      points.push({
        x: (w * i) / steps,
        y: band.depth * (0.62 + rnd() * 0.5),
      });
    }
    points.push({ x: w, y: 0 });
    ctx.fillStyle = band.fill;
    poly(ctx, points);
    ctx.fill();
  }
}

function drawScatter(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const rnd = mulberry32(0x9e21);
  for (let i = 0; i < 90; i += 1) {
    const x = rnd() * w;
    const y = h * 0.1 + rnd() * h * 0.92;
    const r = 3 + rnd() * 13;
    ctx.fillStyle = "rgba(60, 42, 24, 0.20)";
    ctx.beginPath();
    ctx.ellipse(x + r * 0.35, y + r * 0.3, r * 1.1, r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.stone;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.66, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.stoneLit;
    ctx.beginPath();
    ctx.ellipse(x - r * 0.2, y - r * 0.22, r * 0.6, r * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawPad(ctx: CanvasRenderingContext2D, plot: Spot, cell: number): void {
  const hw = cell * 0.44;
  const hh = hw * 0.5;
  const lip = cell * 0.022;
  const top = { x: plot.x, y: plot.y - hh };
  const right = { x: plot.x + hw, y: plot.y };
  const bottom = { x: plot.x, y: plot.y + hh };
  const left = { x: plot.x - hw, y: plot.y };

  ctx.fillStyle = PALETTE.padShade;
  poly(ctx, [
    left,
    bottom,
    right,
    { x: right.x, y: right.y + lip },
    { x: bottom.x, y: bottom.y + lip },
    { x: left.x, y: left.y + lip },
  ]);
  ctx.fill();

  ctx.fillStyle = PALETTE.padTop;
  poly(ctx, [top, right, bottom, left]);
  ctx.fill();

  ctx.strokeStyle = PALETTE.padSeam;
  ctx.lineWidth = Math.max(1, cell * 0.005);
  for (const k of [0.34, 0.66]) {
    ctx.beginPath();
    ctx.moveTo(left.x + (top.x - left.x) * k, left.y + (top.y - left.y) * k);
    ctx.lineTo(bottom.x + (right.x - bottom.x) * k, bottom.y + (right.y - bottom.y) * k);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(left.x + (bottom.x - left.x) * k, left.y + (bottom.y - left.y) * k);
    ctx.lineTo(top.x + (right.x - top.x) * k, top.y + (right.y - top.y) * k);
    ctx.stroke();
  }

  ctx.strokeStyle = PALETTE.padLip;
  ctx.lineWidth = Math.max(1, cell * 0.007);
  poly(ctx, [top, right, bottom, left]);
  ctx.stroke();
}

export function drawSelectionRing(
  ctx: CanvasRenderingContext2D,
  plot: Spot,
  cell: number,
): void {
  const gw = cell * 0.44 + cell * 0.032;
  const gh = gw * 0.5;
  ctx.strokeStyle = "#f4c65f";
  ctx.lineWidth = Math.max(2, cell * 0.014);
  poly(ctx, [
    { x: plot.x, y: plot.y - gh },
    { x: plot.x + gw, y: plot.y },
    { x: plot.x, y: plot.y + gh },
    { x: plot.x - gw, y: plot.y },
  ]);
  ctx.stroke();
}

export function drawGround(
  ctx: CanvasRenderingContext2D,
  input: { w: number; h: number; hour: number; backdrop: HTMLImageElement | undefined },
): void {
  if (input.backdrop === undefined) {
    const sand = ctx.createLinearGradient(0, 0, 0, input.h);
    sand.addColorStop(0, PALETTE.sandFar);
    sand.addColorStop(1, PALETTE.sandNear);
    ctx.fillStyle = sand;
    ctx.fillRect(0, 0, input.w, input.h);
    drawRockWall(ctx, input.w, input.h);
    drawScatter(ctx, input.w, input.h);
  } else {
    ctx.drawImage(input.backdrop, 0, 0, input.w, input.h);
  }
  // The clock tint rides in the cached terrain rather than over the whole scene, so a
  // night capture darkens the ground without washing out the nametags.
  ctx.fillStyle = skyTint(input.hour);
  ctx.fillRect(0, 0, input.w, input.h);
}

const DUST_COUNT = 70;

// Seeded once at module load rather than per frame; the loop runs sixty times a second and
// the particles are meant to be the same specks drifting, not a new field each frame.
const DUST = ((): readonly { speed: number; size: number; x: number; y: number }[] => {
  const rnd = mulberry32(0x3af1);
  const out: { speed: number; size: number; x: number; y: number }[] = [];
  for (let i = 0; i < DUST_COUNT; i += 1) {
    out.push({ speed: 12 + rnd() * 46, size: 1.4 + rnd() * 3.1, x: rnd(), y: rnd() });
  }
  return out;
})();

export function drawDust(
  ctx: CanvasRenderingContext2D,
  input: { w: number; h: number; t: number },
): void {
  ctx.fillStyle = "rgba(240, 222, 188, 0.30)";
  for (let i = 0; i < DUST.length; i += 1) {
    const mote = DUST[i];
    if (mote === undefined) {
      continue;
    }
    const x = (mote.x * input.w + input.t * mote.speed) % input.w;
    const y = mote.y * input.h + Math.sin(input.t * 0.5 + i) * input.h * 0.012;
    ctx.fillRect(x, y, mote.size, mote.size);
  }
}
