import type { ActivityEvent, BotId, BotRecord } from "@lorien-stack/contracts";

import { actionFromEvent } from "../../actions.ts";
import type { Camera } from "../../camera.ts";
import { THEME_CANVAS_TESTID, THEME_UNIT_TESTID, type ThemePose } from "../hooks.ts";
import { drawPlot, drawPlotLabel, kindFor, propFor, type PlotView } from "./building.ts";
import { PATH_CHARS, PATH_CHARS_CROWDED, plotLabel } from "./label.ts";
import {
  PLOT_ABOVE,
  PLOT_HEIGHT,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  hash32,
  layoutFor,
  type Layout,
  type Plot,
} from "./layout.ts";
import { eventSignature, poseFromPulse } from "./pose.ts";
import { loadSprites } from "./sprites.ts";
import { PALETTE, drawDust, drawGround, drawPad, drawSelectionRing } from "./terrain.ts";

export type StarCraftRenderInput = {
  roster: readonly BotRecord[];
  activity: ReadonlyMap<BotId, readonly ActivityEvent[]>;
  selectedBotId: BotId | undefined;
};

export type StarCraftHandle = {
  render: (input: StarCraftRenderInput) => void;
  unmount: () => void;
};

const DEFAULT_FONT = '"IBM Plex Mono", ui-monospace, monospace';
const FRAME_WINDOW = 24;

const STYLE = `
.theme-host[data-theme="starcraft"] {
  position: relative;
  padding: 0 !important;
  width: 100%;
  height: 100%;
  min-height: 0;
  background: ${PALETTE.void};
  overflow: hidden;
}
.theme-host[data-theme="starcraft"] canvas[data-testid="${THEME_CANVAS_TESTID}"] {
  display: block;
  width: 100%;
  height: 100%;
  cursor: pointer;
}
.theme-host[data-theme="starcraft"] .sc-hits {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.theme-host[data-theme="starcraft"] .sc-hit {
  position: absolute;
  pointer-events: auto;
  border: 0;
  padding: 0;
  margin: 0;
  background: transparent;
  color: transparent;
  font-size: 1px;
  overflow: hidden;
  cursor: pointer;
}
.theme-host[data-theme="starcraft"] .sc-hit:focus-visible {
  outline: 2px solid #f4c65f;
  outline-offset: -2px;
}
`;

type Pulse = { signature: string; at: number };
type Box = { x: number; y: number; w: number; h: number; scale: number };

export function mountStarCraftTheme(
  root: HTMLElement,
  context: {
    onSelect?: (botId: BotId) => void;
    camera: Camera;
    reducedMotion?: boolean;
    palette?: { font: string };
  },
): StarCraftHandle {
  const camera = context.camera;
  const motion = context.reducedMotion !== true;
  const font = context.palette?.font ?? DEFAULT_FONT;
  root.dataset.theme = "starcraft";
  root.dataset.themeHost = "starcraft";
  root.replaceChildren();

  if (document.head.querySelector("style[data-starcraft-style]") === null) {
    const style = document.createElement("style");
    style.dataset.starcraftStyle = "true";
    style.textContent = STYLE;
    document.head.append(style);
  }

  const canvas = document.createElement("canvas");
  canvas.dataset.testid = THEME_CANVAS_TESTID;
  canvas.dataset.unitCount = "0";
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Isometric outpost of one building per bot");
  const hits = document.createElement("div");
  hits.className = "sc-hits";
  root.append(canvas, hits);

  const terrain = document.createElement("canvas");
  let terrainKey = "";
  const sprites = loadSprites(() => {
    terrainKey = "";
  });

  let model: StarCraftRenderInput = { roster: [], activity: new Map(), selectedBotId: undefined };
  let layout: Layout = layoutFor([]);
  const pulses = new Map<string, Pulse>();
  const buttons = new Map<string, HTMLButtonElement>();
  let frameAcc = 0;
  let frameN = 0;

  function poseFor(bot: BotRecord, now: number): ThemePose {
    const events = model.activity.get(bot.id);
    const signature = eventSignature(events);
    const prev = pulses.get(bot.id);
    if (prev === undefined || prev.signature !== signature) {
      pulses.set(bot.id, { signature, at: now });
    }
    const pulse = pulses.get(bot.id);
    return poseFromPulse({
      eventCount: events?.length ?? 0,
      msSincePulse: now - (pulse?.at ?? now),
    });
  }

  function viewFor(bot: BotRecord, plot: Plot, now: number, t: number): PlotView {
    const events = model.activity.get(bot.id);
    const pose = poseFor(bot, now);
    const last = events === undefined ? undefined : events[events.length - 1];
    const kind = kindFor(bot.id);
    return {
      x: plot.x,
      y: plot.y,
      cell: layout.grid.cell,
      kind,
      prop: propFor(bot.id),
      pose,
      action: pose === "working" && last !== undefined ? actionFromEvent(last) : "unknown",
      label: plotLabel({
        name: bot.name,
        pose,
        events,
        maxChars: model.roster.length > 24 ? PATH_CHARS_CROWDED : PATH_CHARS,
      }),
      selected: bot.id === model.selectedBotId,
      phase: (hash32(bot.id) % 1000) / 1000,
      t,
      motion,
      font,
      sprite: sprites[kind],
      tagLift: plot.tagLift,
    };
  }

  function worldBox(): Box {
    const origin = camera.worldToScreen({ x: 0, y: 0 });
    return {
      x: origin.x,
      y: origin.y,
      w: WORLD_WIDTH * camera.zoom,
      h: WORLD_HEIGHT * camera.zoom,
      scale: camera.zoom,
    };
  }

  // Ground, rocks and pads change only with the roster and the viewport, so they are
  // rasterised once at device resolution and blitted 1:1. Redrawing 90 scatter rocks
  // and 40 pads per frame was the whole frame budget on its own.
  function syncTerrain(box: Box, dpr: number, seats: readonly Plot[], hour: number): void {
    const pixelW = Math.max(1, Math.floor(box.w * dpr));
    const pixelH = Math.max(1, Math.floor(box.h * dpr));
    const key = `${pixelW}x${pixelH}|${hour.toFixed(2)}|${seats
      .map((plot) => plot.index)
      .join(",")}|${sprites.ground === undefined ? "flat" : "art"}`;
    if (key === terrainKey) {
      return;
    }
    terrainKey = key;
    terrain.width = pixelW;
    terrain.height = pixelH;
    const tctx = terrain.getContext("2d");
    if (tctx === null) {
      return;
    }
    const scale = pixelW / WORLD_WIDTH;
    tctx.setTransform(scale, 0, 0, scale, 0, 0);
    drawGround(tctx, { w: WORLD_WIDTH, h: WORLD_HEIGHT, hour, backdrop: sprites.ground });
    for (const plot of seats) {
      drawPad(tctx, plot, layout.grid.cell);
    }
  }

  function syncButtons(box: Box, now: number): void {
    const live = new Set<string>();
    for (const bot of model.roster) {
      const plot = layout.plots.get(bot.id);
      if (plot === undefined) {
        continue;
      }
      live.add(bot.id);
      let button = buttons.get(bot.id);
      if (button === undefined) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "sc-hit";
        button.dataset.testid = THEME_UNIT_TESTID;
        const id = bot.id;
        button.addEventListener("click", (event) => {
          event.preventDefault();
          context.onSelect?.(id);
        });
        buttons.set(bot.id, button);
        hits.append(button);
      }
      const pose = poseFor(bot, now);
      button.dataset.botId = bot.id;
      button.dataset.pose = pose;
      button.dataset.selected = String(bot.id === model.selectedBotId);
      button.setAttribute("aria-label", `${bot.name}, ${pose}`);
      button.textContent = bot.name;
      const centre = camera.worldToScreen({ x: plot.x, y: plot.y });
      const w = layout.grid.cell * 0.88 * box.scale;
      const h = layout.grid.cell * PLOT_HEIGHT * box.scale;
      button.style.left = `${centre.x - w / 2}px`;
      button.style.top = `${centre.y - layout.grid.cell * PLOT_ABOVE * box.scale}px`;
      button.style.width = `${w}px`;
      button.style.height = `${h}px`;
    }
    for (const [id, button] of buttons) {
      if (!live.has(id)) {
        button.remove();
        buttons.delete(id);
      }
    }
  }

  function paint(): void {
    const started = performance.now();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const cssW = Math.max(1, canvas.clientWidth || root.clientWidth || 640);
    const cssH = Math.max(1, canvas.clientHeight || root.clientHeight || 360);
    const pixelW = Math.floor(cssW * dpr);
    const pixelH = Math.floor(cssH * dpr);
    if (canvas.width !== pixelW || canvas.height !== pixelH) {
      canvas.width = pixelW;
      canvas.height = pixelH;
      terrainKey = "";
    }
    const ctx = canvas.getContext("2d");
    if (ctx === null) {
      return;
    }
    const box = worldBox();
    const t = started / 1000;
    const now = started;
    const clock = new Date();
    // Bucketed to a quarter hour so the cached terrain is not rebuilt every frame.
    const hour = clock.getHours() + Math.floor(clock.getMinutes() / 15) * 0.25;

    const views: PlotView[] = [];
    const seats: Plot[] = [];
    for (const bot of model.roster) {
      const plot = layout.plots.get(bot.id);
      if (plot !== undefined) {
        views.push(viewFor(bot, plot, now, t));
        seats.push(plot);
      }
    }
    seats.sort((a, b) => a.index - b.index);
    views.sort((a, b) => a.y - b.y || a.x - b.x);

    syncTerrain(box, dpr, seats, hour);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.void;
    ctx.fillRect(0, 0, pixelW, pixelH);
    ctx.drawImage(terrain, Math.round(box.x * dpr), Math.round(box.y * dpr));

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
    ctx.translate(box.x, box.y);
    ctx.scale(box.scale, box.scale);

    for (const view of views) {
      if (view.selected) {
        drawSelectionRing(ctx, view, view.cell);
      }
      drawPlot(ctx, view);
    }
    if (motion) {
      drawDust(ctx, { w: WORLD_WIDTH, h: WORLD_HEIGHT, t });
    }
    for (const view of views) {
      drawPlotLabel(ctx, view);
    }
    ctx.restore();

    canvas.dataset.unitCount = String(model.roster.length);
    root.dataset.unitCount = String(model.roster.length);
    syncButtons(box, now);

    frameAcc += performance.now() - started;
    frameN += 1;
    if (frameN >= FRAME_WINDOW) {
      const avg = (frameAcc / frameN).toFixed(2);
      canvas.dataset.avgFrameMs = avg;
      root.dataset.avgFrameMs = avg;
      frameAcc = 0;
      frameN = 0;
    }
  }

  let raf = 0;
  let alive = true;
  function loop(): void {
    if (!alive) {
      return;
    }
    paint();
    raf = window.requestAnimationFrame(loop);
  }
  raf = window.requestAnimationFrame(loop);

  return {
    render(next) {
      const resized =
        next.roster.length !== model.roster.length ||
        next.roster.some((bot) => !layout.plots.has(bot.id));
      model = next;
      if (resized) {
        layout = layoutFor(next.roster);
        terrainKey = "";
      }
      for (const id of [...pulses.keys()]) {
        if (!next.roster.some((bot) => bot.id === id)) {
          pulses.delete(id);
        }
      }
      paint();
    },
    unmount() {
      alive = false;
      window.cancelAnimationFrame(raf);
      canvas.remove();
      hits.remove();
      for (const button of buttons.values()) {
        button.remove();
      }
      buttons.clear();
      delete root.dataset.theme;
      delete root.dataset.themeHost;
      delete root.dataset.unitCount;
      delete root.dataset.avgFrameMs;
    },
  };
}
