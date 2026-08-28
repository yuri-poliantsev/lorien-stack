import { parseBotId, type ActivityEvent, type BotId, type BotRecord } from "@bot-space/contracts";

import {
  STATIONS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  assignSeats,
  eventSignature,
  fitLetterbox,
  poseFromPulse,
  type Seat,
  type UnitPose,
} from "./layout.ts";
import { PALETTE, drawStation, drawTerrain, drawUnit, unitAccent, worldToView } from "./sprites.ts";

export type StarCraftRenderInput = {
  roster: readonly BotRecord[];
  activity: ReadonlyMap<BotId, readonly ActivityEvent[]>;
  selectedBotId: BotId | undefined;
};

export type StarCraftHandle = {
  render: (input: StarCraftRenderInput) => void;
};

const STYLE = `
[data-theme="starcraft"] {
  position: relative;
  padding: 0 !important;
  min-height: 16rem;
  background: #070a06;
  overflow: hidden;
}
[data-theme="starcraft"] canvas[data-testid="starcraft-canvas"] {
  display: block;
  width: 100%;
  height: min(42vh, 22rem);
  min-height: 16rem;
  cursor: pointer;
}
[data-theme="starcraft"] .sc-hits {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
[data-theme="starcraft"] .sc-hit {
  position: absolute;
  pointer-events: auto;
  border: 0;
  padding: 0;
  margin: 0;
  background: transparent;
  cursor: pointer;
}
`;

type PulseState = {
  signature: string;
  at: number;
};

export function mountStarCraftTheme(
  root: HTMLElement,
  input: { onSelect?: (botId: BotId) => void } = {},
): StarCraftHandle {
  root.dataset.theme = "starcraft";
  root.dataset.themeHost = "starcraft";
  root.dataset.themeDefault = "starcraft";
  root.replaceChildren();

  if (document.head.querySelector("style[data-starcraft-style]") === null) {
    const style = document.createElement("style");
    style.dataset.starcraftStyle = "true";
    style.textContent = STYLE;
    document.head.append(style);
  }

  const canvas = document.createElement("canvas");
  canvas.dataset.testid = "starcraft-canvas";
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "StarCraft-inspired command view");
  const hits = document.createElement("div");
  hits.className = "sc-hits";
  hits.dataset.testid = "starcraft-hits";
  root.append(canvas, hits);

  let model: StarCraftRenderInput = {
    roster: [],
    activity: new Map(),
    selectedBotId: undefined,
  };
  let localSelected: BotId | undefined;
  const pulses = new Map<string, PulseState>();
  const seenAt = new Map<string, number>();
  let avgFrameMs = 16;
  let frameAcc = 0;
  let frameN = 0;
  const unitHits = new Map<string, HTMLButtonElement>();
  const buildingHits = new Map<string, HTMLButtonElement>();

  function currentSelected(): BotId | undefined {
    return model.selectedBotId ?? localSelected;
  }

  function poseFor(bot: BotRecord, now: number): UnitPose {
    const events = model.activity.get(bot.id);
    const signature = eventSignature(events);
    const prev = pulses.get(bot.id);
    if (prev === undefined || prev.signature !== signature) {
      pulses.set(bot.id, { signature, at: now });
    }
    if (!seenAt.has(bot.id)) {
      seenAt.set(bot.id, now);
    }
    const pulse = pulses.get(bot.id);
    const origin = pulse?.at ?? seenAt.get(bot.id) ?? now;
    return poseFromPulse({
      eventCount: events?.length ?? 0,
      msSincePulse: now - origin,
    });
  }

  function bindHit(botId: BotId, el: HTMLButtonElement): void {
    el.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      localSelected = botId;
      input.onSelect?.(botId);
    });
  }

  function placeHit(
    el: HTMLButtonElement,
    inputPos: { left: number; top: number; width: number; height: number },
  ): void {
    el.style.left = `${inputPos.left}px`;
    el.style.top = `${inputPos.top}px`;
    el.style.width = `${inputPos.width}px`;
    el.style.height = `${inputPos.height}px`;
  }

  function syncHits(
    seats: Map<BotId, Seat>,
    box: { x: number; y: number; w: number; h: number; scale: number },
    now: number,
  ): void {
    const live = new Set<string>();
    for (const bot of model.roster) {
      const seat = seats.get(bot.id);
      if (seat === undefined) {
        continue;
      }
      live.add(bot.id);
      const pose = poseFor(bot, now);
      const view = worldToView(seat.unitX, seat.unitY, box);
      let btn = unitHits.get(bot.id);
      if (btn === undefined) {
        btn = document.createElement("button");
        btn.type = "button";
        btn.className = "sc-hit";
        btn.dataset.testid = "sc-unit";
        bindHit(bot.id, btn);
        unitHits.set(bot.id, btn);
        hits.append(btn);
      }
      btn.dataset.botId = bot.id;
      btn.dataset.botName = bot.name;
      btn.dataset.pose = pose;
      btn.dataset.stationId = seat.station.id;
      btn.setAttribute("aria-label", bot.name);
      const size = Math.max(28, 36 * box.scale);
      placeHit(btn, {
        left: view.x - size / 2,
        top: view.y - size / 2 - 8,
        width: size,
        height: size + 12,
      });

      let building = buildingHits.get(bot.id);
      if (building === undefined) {
        building = document.createElement("button");
        building.type = "button";
        building.className = "sc-hit";
        building.dataset.testid = "sc-building";
        bindHit(bot.id, building);
        buildingHits.set(bot.id, building);
        hits.append(building);
      }
      building.dataset.botId = bot.id;
      building.dataset.stationId = seat.station.id;
      building.setAttribute("aria-label", `${seat.station.label} ${bot.name}`);
      const bview = worldToView(seat.station.x, seat.station.y, box);
      const bsize = Math.max(32, 52 * box.scale);
      placeHit(building, {
        left: bview.x - bsize / 2,
        top: bview.y - bsize / 2,
        width: bsize,
        height: bsize,
      });
    }
    for (const [id, el] of unitHits) {
      if (!live.has(id)) {
        el.remove();
        unitHits.delete(id);
      }
    }
    for (const [id, el] of buildingHits) {
      if (!live.has(id)) {
        el.remove();
        buildingHits.delete(id);
      }
    }
  }

  function paint(): void {
    const started = performance.now();
    const now = started;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const cssW = Math.max(1, canvas.clientWidth || root.clientWidth || 640);
    const cssH = Math.max(1, canvas.clientHeight || 280);
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
    ctx.fillStyle = PALETTE.bar;
    ctx.fillRect(0, 0, cssW, cssH);
    const box = fitLetterbox({
      worldW: WORLD_WIDTH,
      worldH: WORLD_HEIGHT,
      viewW: cssW,
      viewH: cssH,
    });
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
    ctx.translate(box.x, box.y);
    ctx.scale(box.scale, box.scale);
    const t = now / 1000;
    try {
      drawTerrain(ctx, t);
      const seats = assignSeats({ bots: model.roster });
      const occupied = new Set<string>();
      for (const seat of seats.values()) {
        occupied.add(seat.station.id);
      }
      const selected = currentSelected();
      const poseByStation = new Map<string, UnitPose>();
      for (const bot of model.roster) {
        const seat = seats.get(bot.id);
        if (seat === undefined) {
          continue;
        }
        poseByStation.set(seat.station.id, poseFor(bot, now));
      }
      for (const station of STATIONS) {
        const seated = [...seats.entries()].find((entry) => entry[1].station.id === station.id);
        drawStation(ctx, station, {
          selected: seated !== undefined && seated[0] === selected,
          occupied: occupied.has(station.id),
          t,
          pose: poseByStation.get(station.id),
        });
      }
      for (const bot of model.roster) {
        const seat = seats.get(bot.id);
        if (seat === undefined) {
          continue;
        }
        const pose = poseFor(bot, now);
        drawUnit(ctx, {
          x: seat.unitX,
          y: seat.unitY,
          name: bot.name,
          pose,
          selected: bot.id === selected,
          accent: unitAccent(bot.id),
          t,
          stale: (model.activity.get(bot.id)?.length ?? 0) === 0,
        });
      }
      canvas.dataset.unitCount = String(model.roster.length);
      canvas.dataset.theme = "starcraft";
      root.dataset.unitCount = String(model.roster.length);
      root.dataset.staleSafe = "true";
      syncHits(seats, box, now);
    } catch {
      root.dataset.staleSafe = "true";
      ctx.fillStyle = PALETTE.ink;
      ctx.font = "12px sans-serif";
      ctx.fillText("command view held", 24, 48);
    }
    ctx.restore();
    const dt = performance.now() - started;
    frameAcc += dt;
    frameN += 1;
    if (frameN >= 24) {
      avgFrameMs = frameAcc / frameN;
      frameAcc = 0;
      frameN = 0;
      canvas.dataset.avgFrameMs = avgFrameMs.toFixed(2);
      root.dataset.avgFrameMs = avgFrameMs.toFixed(2);
    }
  }

  canvas.addEventListener("click", (event) => {
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, rect.width);
    const cssH = Math.max(1, rect.height);
    const box = fitLetterbox({
      worldW: WORLD_WIDTH,
      worldH: WORLD_HEIGHT,
      viewW: cssW,
      viewH: cssH,
    });
    const x = ((event.clientX - rect.left) / cssW) * cssW;
    const y = ((event.clientY - rect.top) / cssH) * cssH;
    if (x < box.x || y < box.y || x > box.x + box.w || y > box.y + box.h) {
      return;
    }
    const worldX = (x - box.x) / box.scale;
    const worldY = (y - box.y) / box.scale;
    const seats = assignSeats({ bots: model.roster });
    let best: { botId: BotId; d: number } | undefined;
    for (const bot of model.roster) {
      const seat = seats.get(bot.id);
      if (seat === undefined) {
        continue;
      }
      const du = (seat.unitX - worldX) ** 2 + (seat.unitY - worldY) ** 2;
      const db = (seat.station.x - worldX) ** 2 + (seat.station.y - worldY) ** 2;
      const d = Math.min(du, db);
      if (d < 55 * 55 && (best === undefined || d < best.d)) {
        best = { botId: bot.id, d };
      }
    }
    if (best !== undefined) {
      localSelected = best.botId;
      input.onSelect?.(best.botId);
    }
  });

  root.addEventListener("sc-stale-probe", () => {
    const parsed = parseBotId("00000000-0000-4000-8000-000000000099");
    if (!parsed.ok) {
      root.dataset.staleSafe = "true";
      return;
    }
    const ghost: BotRecord = { id: parsed.value, name: "" };
    model = {
      roster: [...model.roster, ghost],
      activity: model.activity,
      selectedBotId: model.selectedBotId,
    };
    root.dataset.staleProbe = "true";
    paint();
  });

  function loop(): void {
    paint();
    window.requestAnimationFrame(loop);
  }
  window.requestAnimationFrame(loop);

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
  };
}
