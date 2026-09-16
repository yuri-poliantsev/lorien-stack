import {
  FLET_SPRITE,
  LANTERN_SPRITE,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  branchYAt,
  figureRise,
  fletRect,
  hash32,
  type Branch,
  type FletBox,
} from "./layout.ts";
import { LABEL_SEPARATOR, type ActionProp, type FletPose, type Sky } from "./model.ts";

const ASSET_BASE = "/themes/lorien";

export const PALETTE = {
  sign: "#6d4f2b",
  signEdge: "#2c1d0e",
  signInk: "#f2e6c9",
  chain: "#2a2013",
  lanternWarm: "#ffd7a0",
  ember: "#d1753c",
  eye: "#c2e895",
  lectern: "#5c431f",
  prop: "#efe3c4",
  ink: "#ece4cf",
  inkDim: "#93a5a2",
  accent: "#e8c378",
  firefly: "#d8f0a0",
} as const;

const ROBES = [
  "#31556c",
  "#3c5a51",
  "#484768",
  "#2d4a5e",
  "#53506d",
  "#376060",
  "#414f6a",
  "#2f5750",
] as const;

export type LorienImages = {
  trunks: HTMLImageElement;
  canopy: HTMLImageElement;
  branches: HTMLImageElement;
  flet: HTMLImageElement;
  lantern: HTMLImageElement;
};

export type LorienSkins = {
  flet: Record<FletPose, HTMLCanvasElement>;
  lanternLit: HTMLCanvasElement;
  lanternOut: HTMLCanvasElement;
  glowWarm: HTMLCanvasElement;
  glowEye: HTMLCanvasElement;
};

export type ScreenBox = { x: number; y: number; w: number; h: number; scale: number };

export function loadImages(): LorienImages {
  const load = (name: string): HTMLImageElement => {
    const img = new Image();
    img.decoding = "sync";
    img.src = `${ASSET_BASE}/${name}.png`;
    return img;
  };
  return {
    trunks: load("trunks-far"),
    canopy: load("canopy-mid"),
    branches: load("branches-near"),
    flet: load("flet"),
    lantern: load("lantern"),
  };
}

export function imagesReady(images: LorienImages): boolean {
  return Object.values(images).every((img) => img.complete && img.naturalWidth > 0);
}

export function robeFor(seed: number): string {
  return ROBES[seed % ROBES.length] ?? ROBES[0];
}

export function glowScaleFor(count: number): number {
  return 1.4 * Math.sqrt(12 / Math.max(12, count));
}

function surface(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("2d context unavailable");
  }
  return { canvas, ctx };
}

function skin(input: {
  img: HTMLImageElement;
  src: { sx: number; sy: number; sw: number; sh: number };
  w: number;
  h: number;
  brightness: number;
  tint?: string;
  tintAlpha?: number;
}): HTMLCanvasElement {
  const { canvas, ctx } = surface(input.w, input.h);
  ctx.imageSmoothingQuality = "high";
  ctx.filter = `brightness(${input.brightness.toFixed(3)})`;
  ctx.drawImage(
    input.img,
    input.src.sx,
    input.src.sy,
    input.src.sw,
    input.src.sh,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  ctx.filter = "none";
  const tint = input.tint;
  if (tint !== undefined && (input.tintAlpha ?? 0) > 0) {
    ctx.globalCompositeOperation = "source-atop";
    ctx.globalAlpha = input.tintAlpha ?? 0;
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

function glowBlob(radius: number, core: string, edge: string): HTMLCanvasElement {
  const { canvas, ctx } = surface(radius * 2, radius * 2);
  const gradient = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  gradient.addColorStop(0, core);
  gradient.addColorStop(0.45, edge);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

const LANTERN_TO_FLET = 0.282;

export function buildSkins(images: LorienImages, ambient: number, fletPx: number): LorienSkins {
  const fletW = Math.max(24, Math.round(fletPx));
  const fletH = Math.round((fletW * FLET_SPRITE.sh) / FLET_SPRITE.sw);
  const lampH = Math.max(12, Math.round(fletW * LANTERN_TO_FLET));
  const lampW = Math.round((lampH * LANTERN_SPRITE.sw) / LANTERN_SPRITE.sh);
  return {
    flet: {
      working: skin({
        img: images.flet,
        src: FLET_SPRITE,
        w: fletW,
        h: fletH,
        brightness: 0.34 + ambient * 0.78,
        tint: "#ffcf8a",
        tintAlpha: 0.16,
      }),
      idle: skin({
        img: images.flet,
        src: FLET_SPRITE,
        w: fletW,
        h: fletH,
        brightness: 0.2 + ambient * 0.66,
        tint: "#e8c68a",
        tintAlpha: 0.07,
      }),
      sleeping: skin({
        img: images.flet,
        src: FLET_SPRITE,
        w: fletW,
        h: fletH,
        brightness: 0.06 + ambient * 0.28,
        tint: "#16283a",
        tintAlpha: 0.42,
      }),
    },
    lanternLit: skin({
      img: images.lantern,
      src: LANTERN_SPRITE,
      w: lampW,
      h: lampH,
      brightness: 1.15,
      tint: "#ffd28a",
      tintAlpha: 0.3,
    }),
    lanternOut: skin({
      img: images.lantern,
      src: LANTERN_SPRITE,
      w: lampW,
      h: lampH,
      brightness: 0.1 + ambient * 0.3,
      tint: "#16283a",
      tintAlpha: 0.45,
    }),
    glowWarm: glowBlob(Math.max(24, Math.round(fletW * 0.6)), "rgba(255,226,170,0.95)", "rgba(255,176,96,0.34)"),
    glowEye: glowBlob(Math.max(12, Math.round(fletW * 0.2)), "rgba(198,240,150,0.9)", "rgba(126,196,110,0.26)"),
  };
}

function parallax(box: ScreenBox, cssW: number, cssH: number, depth: number): { dx: number; dy: number } {
  return {
    dx: (1 - depth) * (cssW / 2 - (box.x + box.w / 2)),
    dy: (1 - depth) * (cssH / 2 - (box.y + box.h / 2)),
  };
}

function branchHalfWidth(x: number, maxWidth: number): number {
  const fromCentre = Math.abs(x - WORLD_WIDTH / 2) / (WORLD_WIDTH / 2);
  return (maxWidth * (0.26 + 0.74 * fromCentre * fromCentre)) / 2;
}

function branchRibbon(
  ctx: CanvasRenderingContext2D,
  branch: Branch,
  maxWidth: number,
  offsetY: number,
): void {
  const steps = 48;
  ctx.beginPath();
  for (let i = 0; i <= steps; i += 1) {
    const x = (WORLD_WIDTH * i) / steps;
    ctx.lineTo(x, branchYAt(branch, x) + offsetY - branchHalfWidth(x, maxWidth));
  }
  for (let i = steps; i >= 0; i -= 1) {
    const x = (WORLD_WIDTH * i) / steps;
    ctx.lineTo(x, branchYAt(branch, x) + offsetY + branchHalfWidth(x, maxWidth));
  }
  ctx.closePath();
  ctx.fill();
}

function branchTwigs(ctx: CanvasRenderingContext2D, branch: Branch, maxWidth: number): void {
  for (let i = 0; i < 18; i += 1) {
    const seed = hash32(`twig:${String(branch.tier)}:${String(i)}`);
    const x = ((seed % 1000) / 1000) * WORLD_WIDTH;
    const y = branchYAt(branch, x) + branchHalfWidth(x, maxWidth) * 0.6;
    const dir = seed % 2 === 0 ? -1 : 1;
    const len = maxWidth * (1.1 + ((seed >> 4) % 100) / 60);
    const w = Math.max(1, maxWidth * 0.14);
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.quadraticCurveTo(x + dir * len * 0.4, y + len * 0.5, x + dir * len * 0.5, y + len);
    ctx.lineTo(x + dir * len * 0.5 + w * 0.6, y + len);
    ctx.quadraticCurveTo(x + dir * len * 0.45, y + len * 0.5, x + w, y);
    ctx.closePath();
    ctx.fill();
  }
}

export function paintBackdrop(input: {
  cssW: number;
  cssH: number;
  box: ScreenBox;
  sky: Sky;
  images: LorienImages;
  branches: readonly Branch[];
  branchWidth: number;
}): { backdrop: HTMLCanvasElement; foreground: HTMLCanvasElement; foregroundTop: number } {
  const { cssW, cssH, box, sky, images } = input;
  const back = surface(cssW, cssH);
  const ctx = back.ctx;
  ctx.imageSmoothingQuality = "high";

  const gradient = ctx.createLinearGradient(0, 0, 0, cssH);
  gradient.addColorStop(0, sky.zenith);
  gradient.addColorStop(0.58, sky.mid);
  gradient.addColorStop(1, sky.horizon);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, cssW, cssH);

  const ready = imagesReady(images);
  if (ready) {
    ctx.filter = `brightness(${(0.3 + sky.ambient * 0.62).toFixed(3)})`;
    const far = parallax(box, cssW, cssH, 0.32);
    ctx.drawImage(
      images.trunks,
      box.x + far.dx - box.w * 0.05,
      box.y + far.dy - box.h * 0.02,
      box.w * 1.1,
      box.h * 1.06,
    );
    const mid = parallax(box, cssW, cssH, 0.56);
    ctx.drawImage(
      images.canopy,
      box.x + mid.dx - box.w * 0.06,
      box.y + mid.dy - box.h * 0.06,
      box.w * 1.12,
      box.h * 0.62,
    );
    ctx.filter = "none";
  }

  ctx.save();
  ctx.translate(box.x, box.y);
  ctx.scale(box.scale, box.scale);
  const tone = 64 + sky.ambient * 96;
  const rgb = (r: number, g: number, b: number, a: number): string =>
    `rgba(${String(Math.round(tone * r))},${String(Math.round(tone * g))},${String(
      Math.round(tone * b),
    )},${String(a)})`;
  for (const branch of input.branches) {
    ctx.fillStyle = rgb(0.58, 0.52, 0.46, 0.97);
    branchTwigs(ctx, branch, input.branchWidth);
    branchRibbon(ctx, branch, input.branchWidth, 0);
    ctx.fillStyle = rgb(0.34, 0.31, 0.29, 0.6);
    branchRibbon(ctx, branch, input.branchWidth * 0.42, input.branchWidth * 0.26);
    ctx.fillStyle = rgb(1.02, 1.04, 0.96, 0.5);
    branchRibbon(ctx, branch, input.branchWidth * 0.2, -input.branchWidth * 0.36);
  }
  ctx.restore();

  const near = parallax(box, cssW, cssH, 1.22);
  const frontTop = Math.max(0, Math.floor(box.y + near.dy + box.h * 0.84));
  const front = surface(cssW, Math.max(1, cssH - frontTop));
  if (ready) {
    front.ctx.imageSmoothingQuality = "high";
    front.ctx.filter = `brightness(${(0.22 + sky.ambient * 0.34).toFixed(3)})`;
    front.ctx.globalAlpha = 0.82;
    front.ctx.drawImage(
      images.branches,
      box.x + near.dx - box.w * 0.09,
      box.y + near.dy + box.h * 0.84 - frontTop,
      box.w * 1.18,
      box.h * 0.5,
    );
    front.ctx.filter = "none";
    front.ctx.globalAlpha = 1;
  }

  return { backdrop: back.canvas, foreground: front.canvas, foregroundTop: frontTop };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawProp(
  ctx: CanvasRenderingContext2D,
  input: { x: number; deckY: number; rise: number; prop: ActionProp; side: number; skins: LorienSkins },
): void {
  const { x, deckY, rise, prop, side } = input;
  const chest = deckY - rise * 0.5;
  const px = x - side * rise * 0.24;
  ctx.fillStyle = PALETTE.prop;
  ctx.strokeStyle = PALETTE.signEdge;
  ctx.lineWidth = Math.max(0.6, rise * 0.018);
  if (prop === "forge") {
    ctx.fillStyle = PALETTE.lectern;
    roundRect(ctx, px - rise * 0.12, deckY - rise * 0.2, rise * 0.24, rise * 0.1, rise * 0.03);
    ctx.fill();
    ctx.drawImage(
      input.skins.glowWarm,
      px - rise * 0.3,
      deckY - rise * 0.5,
      rise * 0.6,
      rise * 0.6,
    );
    return;
  }
  if (prop === "scroll") {
    roundRect(ctx, px - rise * 0.13, chest - rise * 0.07, rise * 0.26, rise * 0.15, rise * 0.03);
    ctx.fill();
    ctx.stroke();
    return;
  }
  if (prop === "quill") {
    ctx.beginPath();
    ctx.moveTo(px - rise * 0.1, chest + rise * 0.08);
    ctx.lineTo(px + rise * 0.12, chest - rise * 0.14);
    ctx.strokeStyle = PALETTE.prop;
    ctx.lineWidth = Math.max(0.8, rise * 0.03);
    ctx.stroke();
    return;
  }
  if (prop === "speech") {
    roundRect(ctx, px - rise * 0.14, deckY - rise * 0.98, rise * 0.28, rise * 0.17, rise * 0.06);
    ctx.fill();
    return;
  }
  if (prop === "token") {
    ctx.fillStyle = PALETTE.accent;
    ctx.beginPath();
    ctx.moveTo(px, chest - rise * 0.08);
    ctx.lineTo(px + rise * 0.08, chest);
    ctx.lineTo(px, chest + rise * 0.08);
    ctx.lineTo(px - rise * 0.08, chest);
    ctx.closePath();
    ctx.fill();
  }
}

function drawFigure(
  ctx: CanvasRenderingContext2D,
  input: {
    x: number;
    deckY: number;
    rise: number;
    seated: boolean;
    robe: string;
    prop: ActionProp;
    side: number;
    skins: LorienSkins;
  },
): void {
  const { x, deckY, robe, seated } = input;
  const rise = input.seated ? input.rise * 0.74 : input.rise;
  const hemW = rise * (seated ? 0.34 : 0.27);
  const shoulderW = rise * 0.15;
  const shoulderY = deckY - rise * 0.72;
  const headR = rise * 0.145;

  if (!seated) {
    ctx.fillStyle = PALETTE.lectern;
    const lx = x - input.side * rise * 0.26;
    ctx.fillRect(lx - rise * 0.018, deckY - rise * 0.34, rise * 0.036, rise * 0.34);
    ctx.save();
    ctx.translate(lx, deckY - rise * 0.36);
    ctx.rotate(input.side * 0.22);
    ctx.fillRect(-rise * 0.11, -rise * 0.05, rise * 0.22, rise * 0.05);
    ctx.restore();
  }

  ctx.fillStyle = robe;
  ctx.strokeStyle = "rgba(10,18,24,0.72)";
  ctx.lineWidth = Math.max(0.7, rise * 0.028);
  ctx.beginPath();
  ctx.moveTo(x - hemW, deckY);
  ctx.lineTo(x - shoulderW, shoulderY);
  ctx.quadraticCurveTo(x, shoulderY - rise * 0.06, x + shoulderW, shoulderY);
  ctx.lineTo(x + hemW, deckY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(255,236,204,0.16)";
  ctx.beginPath();
  ctx.moveTo(x + input.side * shoulderW * 0.5, shoulderY);
  ctx.lineTo(x + input.side * hemW * 0.72, deckY);
  ctx.lineTo(x + input.side * hemW * 0.3, deckY);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#e8d8bd";
  ctx.beginPath();
  ctx.arc(x, shoulderY - headR * 1.05, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = robe;
  ctx.beginPath();
  ctx.arc(x, shoulderY - headR * 1.2, headR * 0.92, Math.PI * 1.05, Math.PI * 2.1);
  ctx.fill();

  drawProp(ctx, {
    x,
    deckY,
    rise,
    prop: input.prop,
    side: input.side,
    skins: input.skins,
  });
}

export function drawFlet(
  ctx: CanvasRenderingContext2D,
  input: {
    box: FletBox;
    pose: FletPose;
    prop: ActionProp;
    robe: string;
    selected: boolean;
    skins: LorienSkins;
    flicker: number;
    pulse: number;
    glowScale: number;
  },
): void {
  const { box, pose, skins } = input;
  const rect = fletRect(box);
  const rise = figureRise(box);
  const side = box.lanternSide;
  const lampH = rise * 0.74;
  const lampW = (lampH * LANTERN_SPRITE.sw) / LANTERN_SPRITE.sh;
  const lampX = box.x + side * (box.width * 0.5 - lampW * 0.42);
  const lampTop = box.deckY - rise * 0.86;
  const glassY = lampTop + lampH * LANTERN_SPRITE.glassFraction;

  if (input.selected) {
    const pad = rise * 0.2;
    ctx.strokeStyle = PALETTE.accent;
    ctx.lineWidth = Math.max(1.2, rise * 0.05);
    roundRect(
      ctx,
      rect.x - pad,
      rect.y - rise * 0.95,
      rect.w + pad * 2,
      box.signTop + box.signHeight - rect.y + rise * 1.05,
      rise * 0.14,
    );
    ctx.stroke();
  }

  if (pose !== "sleeping") {
    const radius = rise * input.glowScale * (pose === "working" ? 1 : 0.55);
    ctx.globalAlpha = (pose === "working" ? 0.95 : 0.52) * input.flicker;
    ctx.drawImage(skins.glowWarm, lampX - radius, glassY - radius, radius * 2, radius * 2);
    ctx.globalAlpha = 1;
    drawFigure(ctx, {
      x: box.x - side * box.width * 0.06,
      deckY: box.deckY,
      rise,
      seated: pose === "idle",
      robe: input.robe,
      prop: input.prop,
      side,
      skins,
    });
  }

  ctx.strokeStyle = PALETTE.chain;
  ctx.lineWidth = Math.max(0.8, rise * 0.028);
  ctx.beginPath();
  ctx.moveTo(lampX, lampTop + lampH * 0.06);
  ctx.lineTo(lampX, box.deckY - rise * 0.98);
  ctx.lineTo(box.x + side * box.width * 0.34, box.deckY - rise * 0.98);
  ctx.stroke();

  ctx.drawImage(skins.flet[pose], rect.x, rect.y, rect.w, rect.h);
  ctx.drawImage(
    pose === "sleeping" ? skins.lanternOut : skins.lanternLit,
    lampX - lampW / 2,
    lampTop,
    lampW,
    lampH,
  );

  if (pose === "sleeping") {
    const eyeY = rect.y + rect.h * 0.24;
    const eyeR = Math.max(0.6, rise * 0.032);
    const blob = rise * 0.34;
    ctx.globalAlpha = 0.3 + input.pulse * 0.4;
    ctx.drawImage(skins.glowEye, box.x - blob, eyeY - blob, blob * 2, blob * 2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = PALETTE.eye;
    for (const dx of [-rise * 0.055, rise * 0.055]) {
      ctx.beginPath();
      ctx.arc(box.x + dx, eyeY, eyeR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.5 + input.pulse * 0.5;
    ctx.fillStyle = PALETTE.ember;
    ctx.beginPath();
    ctx.arc(lampX, glassY, Math.max(0.7, rise * 0.045), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

export function drawSign(
  ctx: CanvasRenderingContext2D,
  input: { box: FletBox; name: string; font: string; selected: boolean },
): void {
  const { box } = input;
  const fontPx = Math.max(10, box.signHeight * 0.66);
  const font = `600 ${fontPx.toFixed(1)}px ${input.font}`;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const fitted = measureFitted(ctx, input.name, box.signMaxWidth - fontPx * 0.9, font);
  const w = Math.min(box.signMaxWidth, fitted.width + fontPx * 1.1);
  const x = box.x - w / 2;
  const rect = fletRect(box);

  ctx.strokeStyle = PALETTE.chain;
  ctx.lineWidth = Math.max(0.7, box.scale * 1.4);
  ctx.beginPath();
  ctx.moveTo(box.x - w * 0.34, box.signTop);
  ctx.lineTo(box.x - w * 0.3, rect.y + rect.h);
  ctx.moveTo(box.x + w * 0.34, box.signTop);
  ctx.lineTo(box.x + w * 0.3, rect.y + rect.h);
  ctx.stroke();

  ctx.fillStyle = PALETTE.sign;
  roundRect(ctx, x, box.signTop, w, box.signHeight, box.signHeight * 0.26);
  ctx.fill();
  ctx.strokeStyle = input.selected ? PALETTE.accent : PALETTE.signEdge;
  ctx.lineWidth = Math.max(0.8, box.scale * (input.selected ? 2 : 1.3));
  ctx.stroke();

  ctx.fillStyle = input.selected ? PALETTE.accent : PALETTE.signInk;
  ctx.fillText(fitted.fitted, box.x, box.signTop + box.signHeight * 0.54);
}

const CHIP_INK: Record<FletPose, string> = {
  working: PALETTE.accent,
  idle: PALETTE.ink,
  sleeping: PALETTE.inkDim,
};

export function drawChip(
  ctx: CanvasRenderingContext2D,
  input: {
    box: FletBox;
    text: string;
    pose: FletPose;
    font: string;
    cellLeft: number;
    cellRight: number;
  },
): void {
  const { box } = input;
  const rise = figureRise(box);
  const fontPx = Math.max(8.5, rise * 0.23);
  const font = `700 ${fontPx.toFixed(1)}px ${input.font}`;
  ctx.font = font;
  ctx.textBaseline = "middle";
  const padX = fontPx * 0.5;
  const room = Math.max(fontPx * 3, input.cellRight - input.cellLeft - padX * 2 - 6);
  const fitted = measureFitted(ctx, input.text, room, font);
  const half = fitted.width / 2 + padX;
  const anchor = box.x + box.lanternSide * box.width * 0.36;
  const centre = Math.min(
    input.cellRight - 3 - half,
    Math.max(input.cellLeft + 3 + half, anchor),
  );
  const y = box.deckY - rise * 0.82;
  ctx.globalAlpha = input.pose === "sleeping" ? 0.7 : 1;
  ctx.fillStyle = "rgba(7,25,33,0.83)";
  roundRect(ctx, centre - half, y - fontPx * 0.78, half * 2, fontPx * 1.56, fontPx * 0.3);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.fillStyle = CHIP_INK[input.pose];
  ctx.fillText(fitted.fitted, centre, y);
  ctx.globalAlpha = 1;
}

const fittedText = new Map<string, { fitted: string; width: number }>();

export function measureFitted(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  font: string,
): { fitted: string; width: number } {
  const key = `${font}|${maxWidth.toFixed(1)}|${text}`;
  const hit = fittedText.get(key);
  if (hit !== undefined) {
    return hit;
  }
  const fitted = fitText(ctx, text, maxWidth);
  const value = { fitted, width: ctx.measureText(fitted).width };
  if (fittedText.size > 4000) {
    fittedText.clear();
  }
  fittedText.set(key, value);
  return value;
}

export function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (maxWidth <= 0 || ctx.measureText(text).width <= maxWidth) {
    return text;
  }
  const segments = text.split(LABEL_SEPARATOR);
  if (segments.length >= 3) {
    const head = segments.slice(0, -1).join(LABEL_SEPARATOR) + LABEL_SEPARATOR;
    const path = (segments[segments.length - 1] ?? "").replace(/^\u2026/, "");
    for (let keep = path.length - 1; keep >= 4; keep -= 1) {
      const candidate = `${head}\u2026${path.slice(path.length - keep)}`;
      if (ctx.measureText(candidate).width <= maxWidth) {
        return candidate;
      }
    }
  }
  if (segments.length >= 2) {
    return fitText(ctx, segments.slice(0, -1).join(LABEL_SEPARATOR), maxWidth);
  }
  let cut = text.length;
  while (cut > 1 && ctx.measureText(`${text.slice(0, cut)}\u2026`).width > maxWidth) {
    cut -= 1;
  }
  return `${text.slice(0, cut)}\u2026`;
}

export function drawAmbience(
  ctx: CanvasRenderingContext2D,
  input: { t: number; count: number; seed: number; ambient: number },
): void {
  const flies = Math.min(34, 18 + Math.floor(input.count / 3));
  const dim = 1 - input.ambient * 0.55;
  ctx.fillStyle = PALETTE.firefly;
  for (let bucket = 0; bucket < 4; bucket += 1) {
    ctx.globalAlpha = dim * (0.34 + bucket * 0.22);
    ctx.beginPath();
    for (let i = 0; i < flies; i += 1) {
      const phase = i * 2.399963;
      const blink = Math.abs(Math.sin(input.t * 1.3 + phase * 3.1));
      if (Math.min(3, Math.floor(blink * 4)) !== bucket) {
        continue;
      }
      const x = ((phase * 271) % WORLD_WIDTH) + Math.sin(input.t * 0.21 + phase) * 140;
      const y =
        (((phase * 577) % (WORLD_HEIGHT - 240)) +
          150 +
          Math.cos(input.t * 0.17 + phase * 1.7) * 70) %
        WORLD_HEIGHT;
      ctx.moveTo(x + 2.1, y);
      ctx.arc(x, y, 2.1, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function drawLeafDrift(
  ctx: CanvasRenderingContext2D,
  input: { t: number; ambient: number },
): void {
  ctx.fillStyle = `rgba(198,206,150,${(0.16 + input.ambient * 0.2).toFixed(3)})`;
  for (let i = 0; i < 12; i += 1) {
    const phase = i * 1.7561;
    const fall = (input.t * 22 + phase * 260) % (WORLD_HEIGHT + 200);
    const x = ((phase * 419) % WORLD_WIDTH) + Math.sin(input.t * 0.5 + phase) * 40;
    ctx.beginPath();
    ctx.ellipse(x, fall - 100, 5.2, 2.3, input.t * 0.6 + phase, 0, Math.PI * 2);
    ctx.fill();
  }
}
