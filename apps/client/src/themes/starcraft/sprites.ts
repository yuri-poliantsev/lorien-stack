import type { Station, StationKind, UnitPose } from "./layout.ts";

export const PALETTE = {
  void: "#070a06",
  bar: "#050704",
  dirt: "#2a331c",
  dirt2: "#3a4424",
  dirt3: "#1c2412",
  grass: "#4a5a2c",
  path: "#5a4a28",
  steel: "#6d7468",
  steelDark: "#3a4038",
  steelLite: "#9aa392",
  rust: "#8a5a32",
  amber: "#e0b24a",
  amberDim: "#8a6a28",
  teal: "#4aa090",
  visor: "#7ec8c0",
  sleep: "#7c9a90",
  work: "#d2b36a",
  ink: "#ece7d4",
  muted: "#9aa186",
  shadow: "rgba(0,0,0,0.45)",
  select: "#f0d078",
} as const;

export function unitAccent(botId: string): string {
  let h = 2166136261;
  for (let i = 0; i < botId.length; i += 1) {
    h ^= botId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hue = 28 + (h % 70);
  return `hsl(${hue} 42% 42%)`;
}

export function fillNoiseRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = PALETTE.dirt;
  ctx.fillRect(x, y, w, h);
  for (let i = 0; i < 90; i += 1) {
    const n = (Math.imul(seed + i * 1103515245, 1664525) + 1013904223) >>> 0;
    const px = x + (n % Math.max(1, Math.floor(w)));
    const py = y + (Math.floor(n / 4096) % Math.max(1, Math.floor(h)));
    const s = 6 + (n % 18);
    ctx.fillStyle = n % 3 === 0 ? PALETTE.dirt2 : n % 3 === 1 ? PALETTE.dirt3 : PALETTE.grass;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(px, py, s, s * 0.7);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

export function drawTerrain(ctx: CanvasRenderingContext2D, t: number): void {
  fillNoiseRect(ctx, 0, 0, 960, 540, 42);
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 1;
  for (let gx = 40; gx < 960; gx += 40) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, 540);
    ctx.stroke();
  }
  for (let gy = 30; gy < 540; gy += 30) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(960, gy);
    ctx.stroke();
  }
  ctx.fillStyle = PALETTE.path;
  ctx.globalAlpha = 0.55;
  ctx.fillRect(120, 248, 720, 18);
  ctx.fillRect(468, 80, 18, 380);
  ctx.globalAlpha = 1;
  drawResourcePatch(ctx, 70, 360, t);
  drawResourcePatch(ctx, 860, 360, t + 1.2);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, 0, 960, 36);
  ctx.fillRect(0, 504, 960, 36);
  ctx.fillStyle = PALETTE.amber;
  ctx.font = "600 11px 'IBM Plex Sans', 'Segoe UI', sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText("KESTREL BASE  ·  COMMAND VIEW", 14, 18);
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText("original floor art  ·  no remote sheets", 14, 522);
}

function drawResourcePatch(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#2c4a38";
  ctx.beginPath();
  ctx.ellipse(0, 8, 38, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 5; i += 1) {
    const a = i * 1.1 + t * 0.2;
    ctx.fillStyle = i % 2 === 0 ? PALETTE.teal : "#3d7a68";
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 10, Math.sin(a) * 4 - 4);
    ctx.lineTo(Math.cos(a) * 18, Math.sin(a) * 8 - 18);
    ctx.lineTo(Math.cos(a + 0.6) * 12, Math.sin(a + 0.6) * 5 - 6);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function box(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  d: number,
  h: number,
  top: string,
  side: string,
): void {
  ctx.fillStyle = PALETTE.shadow;
  ctx.beginPath();
  ctx.ellipse(x, y + 6, w * 0.62, d * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = side;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.lineTo(x, y + d / 2);
  ctx.lineTo(x, y + d / 2 - h);
  ctx.lineTo(x - w / 2, y - h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PALETTE.steelDark;
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y);
  ctx.lineTo(x, y + d / 2);
  ctx.lineTo(x, y + d / 2 - h);
  ctx.lineTo(x + w / 2, y - h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = top;
  ctx.beginPath();
  ctx.moveTo(x, y - h - d / 2);
  ctx.lineTo(x + w / 2, y - h);
  ctx.lineTo(x, y - h + d / 2);
  ctx.lineTo(x - w / 2, y - h);
  ctx.closePath();
  ctx.fill();
}

function kindColors(kind: StationKind): { top: string; side: string } {
  switch (kind) {
    case "core":
      return { top: "#6a7a52", side: "#3e4a32" };
    case "bay":
      return { top: "#6e6858", side: "#3c382e" };
    case "well":
      return { top: "#4e7a68", side: "#2c4a40" };
    case "depot":
      return { top: "#8a6a3a", side: "#4a3820" };
    case "lab":
      return { top: "#5a6e7a", side: "#2e3c44" };
    case "turret":
      return { top: "#7a5a4a", side: "#443028" };
    case "works":
      return { top: "#7a6848", side: "#443828" };
    case "bunker":
      return { top: "#4a5240", side: "#2a3024" };
    case "pad":
      return { top: "#5a5a52", side: "#32322c" };
    case "silo":
      return { top: "#6a7a6a", side: "#384438" };
    case "yard":
      return { top: "#5a4a32", side: "#32281c" };
    case "relay":
      return { top: "#4a6a7a", side: "#283844" };
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function drawStation(
  ctx: CanvasRenderingContext2D,
  station: Station,
  input: { selected: boolean; occupied: boolean; t: number; pose: UnitPose | undefined },
): void {
  const colors = kindColors(station.kind);
  const pulse = input.pose === "working" ? 1 + Math.sin(input.t * 6) * 0.04 : 1;
  ctx.save();
  ctx.translate(station.x, station.y);
  if (input.selected) {
    ctx.strokeStyle = PALETTE.select;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.ellipse(0, 8, 48, 18, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.scale(pulse, pulse);
  switch (station.kind) {
    case "core":
      box(ctx, 0, 0, 88, 48, 28, colors.top, colors.side);
      ctx.fillStyle = PALETTE.amber;
      ctx.beginPath();
      ctx.arc(0, -34, 7, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "bay":
      box(ctx, 0, 0, 96, 36, 18, colors.top, colors.side);
      ctx.fillStyle = PALETTE.steelDark;
      ctx.fillRect(-28, -22, 18, 10);
      ctx.fillRect(10, -22, 18, 10);
      break;
    case "well":
      ctx.fillStyle = colors.side;
      ctx.beginPath();
      ctx.ellipse(0, 6, 28, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colors.top;
      ctx.beginPath();
      ctx.arc(0, -8, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PALETTE.teal;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, -8, 10, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "depot":
      box(ctx, -12, 0, 28, 22, 16, colors.top, colors.side);
      box(ctx, 14, 4, 24, 18, 12, PALETTE.rust, "#4a3020");
      break;
    case "lab":
      box(ctx, 0, 0, 54, 32, 16, colors.top, colors.side);
      ctx.strokeStyle = PALETTE.visor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -28, 10, Math.PI, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -28);
      ctx.lineTo(0, -40);
      ctx.stroke();
      break;
    case "turret":
      box(ctx, 0, 0, 40, 28, 10, colors.top, colors.side);
      ctx.fillStyle = PALETTE.steel;
      ctx.beginPath();
      ctx.arc(0, -16, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.steelLite;
      ctx.fillRect(-2, -36, 4, 18);
      break;
    case "works":
      box(ctx, 0, 0, 70, 36, 20, colors.top, colors.side);
      ctx.fillStyle = PALETTE.steelDark;
      ctx.fillRect(-18, -42, 8, 18);
      ctx.fillRect(6, -48, 8, 24);
      ctx.fillStyle = input.pose === "working" ? PALETTE.amber : PALETTE.steel;
      ctx.globalAlpha = input.pose === "working" ? 0.7 + Math.sin(input.t * 8) * 0.3 : 0.4;
      ctx.beginPath();
      ctx.arc(-14, -46, 5, 0, Math.PI * 2);
      ctx.arc(10, -52, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    case "bunker":
      box(ctx, 0, 0, 64, 28, 10, colors.top, colors.side);
      ctx.fillStyle = PALETTE.steelDark;
      ctx.fillRect(-16, -16, 8, 6);
      ctx.fillRect(6, -16, 8, 6);
      break;
    case "pad":
      ctx.fillStyle = colors.side;
      ctx.beginPath();
      ctx.ellipse(0, 4, 36, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PALETTE.amberDim;
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
    case "silo":
      ctx.fillStyle = colors.side;
      ctx.fillRect(-12, -36, 24, 40);
      ctx.fillStyle = colors.top;
      ctx.beginPath();
      ctx.ellipse(0, -36, 12, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "yard":
      box(ctx, 0, 0, 50, 30, 8, colors.top, colors.side);
      break;
    case "relay":
      box(ctx, 0, 0, 36, 24, 12, colors.top, colors.side);
      ctx.strokeStyle = PALETTE.visor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -16);
      ctx.lineTo(0, -44);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -48, 6, 0, Math.PI * 2);
      ctx.stroke();
      break;
    default: {
      const _exhaustive: never = station.kind;
      return _exhaustive;
    }
  }
  ctx.restore();
  ctx.fillStyle = input.occupied ? PALETTE.ink : PALETTE.muted;
  ctx.font = "600 9px 'IBM Plex Sans', 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(station.label.toUpperCase(), station.x, station.y + 16);
  ctx.textAlign = "start";
}

export function drawUnit(
  ctx: CanvasRenderingContext2D,
  input: {
    x: number;
    y: number;
    name: string;
    pose: UnitPose;
    selected: boolean;
    accent: string;
    t: number;
    stale: boolean;
  },
): void {
  const bob =
    input.pose === "working" ? Math.sin(input.t * 10) * 2 : input.pose === "idle" ? Math.sin(input.t * 2) * 0.4 : 0;
  ctx.save();
  ctx.translate(input.x, input.y);
  if (input.selected) {
    ctx.strokeStyle = PALETTE.select;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 6, 16, 7, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = PALETTE.shadow;
  ctx.beginPath();
  ctx.ellipse(0, 8, 11, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  if (input.pose === "sleeping") {
    ctx.translate(0, 4);
    ctx.rotate(-0.55);
    drawOperatorBody(ctx, input.accent, 0);
    ctx.rotate(0.55);
    ctx.fillStyle = PALETTE.sleep;
    ctx.font = "700 11px 'IBM Plex Sans', 'Segoe UI', sans-serif";
    const z = 0.5 + (Math.sin(input.t * 2) + 1) / 4;
    ctx.globalAlpha = 0.7 + z * 0.3;
    ctx.fillText("z", 10, -18 - (input.t * 12) % 16);
    ctx.fillText("Z", 16, -28 - (input.t * 10) % 18);
    ctx.globalAlpha = 1;
    ctx.fillStyle = PALETTE.sleep;
    ctx.font = "700 8px 'IBM Plex Sans', 'Segoe UI', sans-serif";
    ctx.fillText("REST", -12, 16);
  } else {
    ctx.translate(0, bob);
    const toolSwing = input.pose === "working" ? Math.sin(input.t * 10) * 0.55 : 0.15;
    drawOperatorBody(ctx, input.accent, toolSwing);
    if (input.pose === "working") {
      ctx.strokeStyle = PALETTE.amber;
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(12, -8);
      ctx.lineTo(18 + Math.sin(input.t * 20) * 3, -18);
      ctx.stroke();
      ctx.fillStyle = PALETTE.amber;
      ctx.beginPath();
      ctx.arc(18, -18, 2 + Math.abs(Math.sin(input.t * 16)), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = PALETTE.work;
      ctx.font = "700 8px 'IBM Plex Sans', 'Segoe UI', sans-serif";
      ctx.fillText("WORK", -14, 16);
    } else {
      ctx.fillStyle = PALETTE.muted;
      ctx.font = "700 8px 'IBM Plex Sans', 'Segoe UI', sans-serif";
      ctx.fillText(input.stale ? "STALE" : "IDLE", -12, 16);
    }
  }
  ctx.restore();

  ctx.save();
  ctx.translate(input.x, input.y);
  const tag = input.name.length === 0 ? "unnamed" : input.name;
  ctx.font = "600 11px 'IBM Plex Sans', 'Segoe UI', sans-serif";
  const tw = ctx.measureText(tag).width;
  ctx.fillStyle = "rgba(8,10,6,0.82)";
  ctx.fillRect(-tw / 2 - 5, -36, tw + 10, 14);
  ctx.strokeStyle = input.selected ? PALETTE.select : "rgba(236,231,212,0.25)";
  ctx.strokeRect(-tw / 2 - 5, -36, tw + 10, 14);
  ctx.fillStyle = PALETTE.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(tag, 0, -29);
  ctx.restore();
}

function drawOperatorBody(ctx: CanvasRenderingContext2D, accent: string, toolSwing: number): void {
  ctx.fillStyle = accent;
  ctx.fillRect(-6, -14, 12, 14);
  ctx.fillStyle = PALETTE.steelLite;
  ctx.beginPath();
  ctx.arc(0, -20, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.visor;
  ctx.fillRect(-4, -21, 8, 3);
  ctx.save();
  ctx.translate(6, -8);
  ctx.rotate(toolSwing);
  ctx.fillStyle = PALETTE.steel;
  ctx.fillRect(0, -2, 12, 3);
  ctx.fillStyle = PALETTE.amberDim;
  ctx.fillRect(10, -4, 4, 7);
  ctx.restore();
  ctx.fillStyle = PALETTE.steelDark;
  ctx.fillRect(-5, 0, 4, 8);
  ctx.fillRect(1, 0, 4, 8);
}

export function worldToView(
  worldX: number,
  worldY: number,
  box: { x: number; y: number; scale: number },
): { x: number; y: number } {
  return {
    x: box.x + worldX * box.scale,
    y: box.y + worldY * box.scale,
  };
}
