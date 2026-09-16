import type { ActivityEvent, BotId, BotRecord } from "@lorien-stack/contracts";

import { actionFromEvent, nametagFromBotName, pathFromToolEvent } from "../../actions.ts";
import type { ThemeHandle, ThemeMountContext, ThemeRenderInput } from "../registry.ts";
import {
  WORLD_HEIGHT,
  WORLD_WIDTH,
  figureRise,
  hash32,
  layoutFlets,
  unitRect,
  type FletBox,
  type LorienLayout,
} from "./layout.ts";
import {
  actionProp,
  eventSignature,
  inSceneLabel,
  poseFromPulse,
  skyAt,
  type FletPose,
  type Sky,
} from "./model.ts";
import {
  buildSkins,
  drawAmbience,
  drawFlet,
  drawLabel,
  drawLeafDrift,
  drawSign,
  imagesReady,
  loadImages,
  paintBackdrop,
  robeFor,
  type LorienImages,
  type LorienSkins,
  type ScreenBox,
} from "./sprites.ts";

const DEFAULT_FONT = '"IBM Plex Mono", ui-monospace, monospace';
const FULL_LABEL_COLS = 6;

const STYLE = `
.theme-host[data-theme="lorien"] {
  position: relative;
  padding: 0 !important;
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-height: 0;
  background: #07121a;
  overflow: hidden;
}
.theme-host[data-theme="lorien"] canvas[data-testid="theme-canvas"] {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 0;
  cursor: pointer;
}
.theme-host[data-theme="lorien"] .lorien-hits {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.theme-host[data-theme="lorien"] .lorien-hit {
  position: absolute;
  pointer-events: auto;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: transparent;
  font: inherit;
  cursor: pointer;
}
.theme-host[data-theme="lorien"] .lorien-hit:focus-visible {
  outline: 2px solid #e8c378;
  outline-offset: 2px;
}
`;

type Pulse = { signature: string; at: number };

type CacheKey = string;

export function mountLorienTheme(root: HTMLElement, context: ThemeMountContext): ThemeHandle {
  const camera = context.camera;
  const font = context.palette?.font ?? DEFAULT_FONT;
  root.dataset.theme = "lorien";
  root.dataset.themeHost = "lorien";
  root.replaceChildren();

  if (document.head.querySelector("style[data-lorien-style]") === null) {
    const style = document.createElement("style");
    style.dataset.lorienStyle = "true";
    style.textContent = STYLE;
    document.head.append(style);
  }

  const canvas = document.createElement("canvas");
  canvas.dataset.testid = "theme-canvas";
  canvas.dataset.unitCount = "0";
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Lorien forest view");
  const hits = document.createElement("div");
  hits.className = "lorien-hits";
  root.append(canvas, hits);

  const images: LorienImages = loadImages();
  let model: ThemeRenderInput = { roster: [], activity: new Map(), selectedBotId: undefined };
  const pulses = new Map<string, Pulse>();
  const seenAt = new Map<string, number>();
  const unitHits = new Map<string, HTMLButtonElement>();

  let skins: LorienSkins | undefined;
  let skinAmbient = -1;
  let backdrop: HTMLCanvasElement | undefined;
  let foreground: HTMLCanvasElement | undefined;
  let backdropKey: CacheKey = "";
  let frameAcc = 0;
  let frameN = 0;

  function poseFor(bot: BotRecord, now: number): FletPose {
    const events: readonly ActivityEvent[] | undefined = model.activity.get(bot.id);
    const signature = eventSignature(events);
    const prev = pulses.get(bot.id);
    if (prev === undefined || prev.signature !== signature) {
      pulses.set(bot.id, { signature, at: now });
    }
    if (!seenAt.has(bot.id)) {
      seenAt.set(bot.id, now);
    }
    const origin = pulses.get(bot.id)?.at ?? seenAt.get(bot.id) ?? now;
    return poseFromPulse({
      eventCount: events?.length ?? 0,
      msSincePulse: now - origin,
    });
  }

  function lastEvent(botId: BotId): ActivityEvent | undefined {
    const events = model.activity.get(botId);
    if (events === undefined || events.length === 0) {
      return undefined;
    }
    return events[events.length - 1];
  }

  function worldBox(): ScreenBox {
    const origin = camera.worldToScreen({ x: 0, y: 0 });
    return {
      x: origin.x,
      y: origin.y,
      w: WORLD_WIDTH * camera.zoom,
      h: WORLD_HEIGHT * camera.zoom,
      scale: camera.zoom,
    };
  }

  // The clock is bucketed to ten minutes so the cached sky and layer bitmaps
  // survive between frames instead of being rebuilt on every paint.
  function currentSky(): Sky {
    const now = new Date();
    const bucket = Math.floor(now.getMinutes() / 10) / 6;
    return skyAt(now.getHours() + bucket);
  }

  function syncHits(layout: LorienLayout, box: ScreenBox, now: number): void {
    const live = new Set<string>();
    for (const bot of model.roster) {
      const flet = layout.flets.get(bot.id);
      if (flet === undefined) {
        continue;
      }
      live.add(bot.id);
      let button = unitHits.get(bot.id);
      if (button === undefined) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "lorien-hit";
        button.dataset.testid = "theme-unit";
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          context.onSelect?.(bot.id);
        });
        unitHits.set(bot.id, button);
        hits.append(button);
      }
      const rect = unitRect(flet);
      button.dataset.botId = bot.id;
      button.dataset.botName = bot.name;
      button.dataset.pose = poseFor(bot, now);
      button.dataset.selected = String(bot.id === model.selectedBotId);
      button.setAttribute("aria-label", nametagFromBotName(bot.name));
      button.style.left = `${String(box.x + rect.x * box.scale)}px`;
      button.style.top = `${String(box.y + rect.y * box.scale)}px`;
      button.style.width = `${String(Math.max(16, rect.w * box.scale))}px`;
      button.style.height = `${String(Math.max(16, rect.h * box.scale))}px`;
    }
    for (const [id, element] of unitHits) {
      if (!live.has(id)) {
        element.remove();
        unitHits.delete(id);
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
    }
    const ctx = canvas.getContext("2d");
    if (ctx === null) {
      return;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const now = started;
    const t = now / 1000;
    const motion = !context.reducedMotion;
    const sky = currentSky();
    const layout = layoutFlets({ bots: model.roster });
    const box = worldBox();

    if (skins === undefined || skinAmbient !== sky.ambient) {
      if (imagesReady(images) || skins === undefined) {
        skins = buildSkins(images, sky.ambient);
        skinAmbient = imagesReady(images) ? sky.ambient : -1;
      }
    }

    const branchWidth = Math.max(3, 15 * layout.scale);
    const key = [
      cssW,
      cssH,
      box.x.toFixed(1),
      box.y.toFixed(1),
      box.scale.toFixed(4),
      sky.zenith,
      sky.mid,
      sky.horizon,
      layout.tiers,
      layout.cols,
      imagesReady(images),
    ].join("|");
    if (key !== backdropKey || backdrop === undefined || foreground === undefined) {
      const built = paintBackdrop({
        cssW,
        cssH,
        box,
        sky,
        images,
        branches: layout.branches,
        branchWidth,
      });
      backdrop = built.backdrop;
      foreground = built.foreground;
      backdropKey = key;
    }

    ctx.drawImage(backdrop, 0, 0);

    ctx.save();
    ctx.translate(box.x, box.y);
    ctx.scale(box.scale, box.scale);

    if (motion) {
      drawLeafDrift(ctx, { t, ambient: sky.ambient });
    }

    const ordered = [...model.roster]
      .map((bot) => ({ bot, flet: layout.flets.get(bot.id) }))
      .filter((row): row is { bot: BotRecord; flet: FletBox } => row.flet !== undefined)
      .sort((a, b) => a.flet.deckY - b.flet.deckY);

    const activeSkins = skins;
    if (activeSkins !== undefined) {
      for (const { bot, flet } of ordered) {
        const pose = poseFor(bot, now);
        const event = lastEvent(bot.id);
        const action = event === undefined ? "unknown" : actionFromEvent(event);
        const seed = hash32(bot.id);
        const phase = (seed % 628) / 100;
        drawFlet(ctx, {
          box: flet,
          pose,
          prop: actionProp(action),
          robe: robeFor(seed),
          selected: bot.id === model.selectedBotId,
          skins: activeSkins,
          flicker: motion ? 0.86 + 0.14 * Math.sin(t * 3.1 + phase) : 1,
          pulse: motion ? 0.5 + 0.5 * Math.sin(t * 0.9 + phase) : 0.5,
        });
      }

      for (const { bot, flet } of ordered) {
        const pose = poseFor(bot, now);
        const selected = bot.id === model.selectedBotId;
        if (pose !== "sleeping") {
          const event = lastEvent(bot.id);
          const action = event === undefined ? "unknown" : actionFromEvent(event);
          const path = event === undefined ? undefined : pathFromToolEvent(event);
          const detailed = selected || layout.cols <= FULL_LABEL_COLS;
          const text = detailed
            ? inSceneLabel({ pose, action, path })
            : inSceneLabel({ pose, action, path: undefined });
          drawLabel(ctx, {
            box: flet,
            text,
            font,
            maxWidth: layout.cellWidth * (detailed ? 1.04 : 0.8),
            dim: pose === "idle",
          });
        }
        drawSign(ctx, {
          box: flet,
          name: nametagFromBotName(bot.name),
          font,
          selected,
        });
      }
    }

    if (motion) {
      drawAmbience(ctx, {
        t,
        count: model.roster.length,
        seed: model.roster.length,
        ambient: sky.ambient,
      });
    }
    ctx.restore();

    if (foreground !== undefined) {
      ctx.drawImage(foreground, 0, 0);
    }

    canvas.dataset.unitCount = String(model.roster.length);
    canvas.dataset.skyPhase = sky.name;
    if (model.selectedBotId === undefined) {
      delete canvas.dataset.selectedBotId;
    } else {
      canvas.dataset.selectedBotId = model.selectedBotId;
    }
    root.dataset.unitCount = String(model.roster.length);
    syncHits(layout, box, now);

    frameAcc += performance.now() - started;
    frameN += 1;
    if (frameN >= 24) {
      canvas.dataset.avgFrameMs = (frameAcc / frameN).toFixed(2);
      frameAcc = 0;
      frameN = 0;
    }
  }

  function onCanvasClick(event: MouseEvent): void {
    const rect = canvas.getBoundingClientRect();
    const world = camera.screenToWorld({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
    const layout = layoutFlets({ bots: model.roster });
    let best: { botId: BotId; d: number } | undefined;
    for (const bot of model.roster) {
      const flet = layout.flets.get(bot.id);
      if (flet === undefined) {
        continue;
      }
      const dx = flet.x - world.x;
      const dy = flet.deckY - figureRise(flet) * 0.4 - world.y;
      const d = dx * dx + dy * dy;
      const reach = Math.max(flet.width, flet.signMaxWidth) * 0.7;
      if (d < reach * reach && (best === undefined || d < best.d)) {
        best = { botId: bot.id, d };
      }
    }
    if (best !== undefined) {
      context.onSelect?.(best.botId);
    }
  }
  canvas.addEventListener("click", onCanvasClick);

  let raf = 0;
  let alive = true;
  function loop(): void {
    if (!alive) {
      return;
    }
    paint();
    raf = window.requestAnimationFrame(loop);
  }
  paint();
  raf = window.requestAnimationFrame(loop);

  return {
    render(next) {
      model = next;
      for (const id of [...pulses.keys()]) {
        if (!next.roster.some((bot) => bot.id === id)) {
          pulses.delete(id);
          seenAt.delete(id);
        }
      }
      paint();
    },
    unmount() {
      alive = false;
      window.cancelAnimationFrame(raf);
      canvas.removeEventListener("click", onCanvasClick);
      for (const element of unitHits.values()) {
        element.remove();
      }
      unitHits.clear();
      canvas.remove();
      hits.remove();
      delete root.dataset.theme;
      delete root.dataset.themeHost;
      delete root.dataset.unitCount;
    },
  };
}
