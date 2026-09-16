import type { ActivityEvent, BotId, BotRecord } from "@lorien-stack/contracts";

import type { Camera } from "../../camera.ts";
import {
  BOARD,
  RAIL,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  cardOrder,
  cardRect,
  cardScale,
  gridFor,
  type CardScale,
  type Rect,
} from "./layout.ts";
import {
  SPARK_BUCKETS,
  accentForHour,
  boardClock,
  cardModel,
  type CardModel,
} from "./model.ts";

export type MissionControlRenderInput = {
  roster: readonly BotRecord[];
  activity: ReadonlyMap<BotId, readonly ActivityEvent[]>;
  selectedBotId: BotId | undefined;
};

export type MissionControlHandle = {
  render: (input: MissionControlRenderInput) => void;
  unmount: () => void;
};

type MissionControlContext = {
  onSelect?: (botId: BotId) => void;
  camera: Camera;
  reducedMotion?: boolean;
  palette?: { fg: string; font: string };
};

const COUNT_MS = 450;

const STYLE = `
.theme-host[data-theme="mission-control"] {
  --mc-accent: #f0b23d;
  --mc-ink: #f4f1ea;
  --mc-muted: #8d8d99;
  --mc-dim: #4e4e58;
  --mc-line: #23232b;
  --mc-board: #101015;
  --mc-name-size: 24px;
  --mc-state-size: 11px;
  --mc-meta-size: 12px;
  --mc-path-size: 11px;
  --mc-pad: 16px;
  --mc-spark-h: 20px;
  display: block;
  padding: 0 !important;
  overflow: hidden;
  color: var(--mc-ink);
  background:
    linear-gradient(0deg, rgba(240, 178, 61, 0.045) 1px, transparent 1px) 0 0 / 100% 64px,
    linear-gradient(90deg, rgba(240, 178, 61, 0.045) 1px, transparent 1px) 0 0 / 64px 100%,
    #07070a;
}
.mc-world {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
}
.mc-board {
  position: absolute;
  border: 1px solid var(--mc-line);
  border-radius: 14px;
  background: var(--mc-board);
}
.mc-rail {
  position: absolute;
  border-right: 1px solid var(--mc-line);
  border-radius: 14px 0 0 14px;
  background: rgba(255, 255, 255, 0.022);
}
.mc-clock {
  position: absolute;
  right: 24px;
  bottom: 20px;
  left: 24px;
  color: #4c4c58;
  text-align: left;
}
.mc-clock-time {
  display: block;
  font-size: 34px;
  font-weight: 500;
  letter-spacing: 0.04em;
  font-variant-numeric: tabular-nums;
}
.mc-clock-phase {
  display: block;
  margin-top: 0.2em;
  color: #3a3a45;
  font-size: 11px;
  letter-spacing: 0.28em;
  text-transform: uppercase;
}
.mc-grid {
  position: absolute;
  inset: 0;
}
.mc-card {
  position: absolute;
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: var(--mc-pad);
  padding-left: calc(var(--mc-pad) + 4px);
  border: 1px solid var(--mc-line);
  border-left: 4px solid var(--mc-dim);
  border-radius: 8px;
  background: #14141a;
  color: var(--mc-ink);
  font: inherit;
  text-align: left;
  overflow: hidden;
  cursor: pointer;
}
.mc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.mc-state {
  color: var(--mc-muted);
  font-size: var(--mc-state-size);
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.mc-dot {
  position: relative;
  flex: 0 0 auto;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--mc-dim);
  overflow: hidden;
}
.mc-name {
  margin-top: 0.35em;
  overflow: hidden;
  font-size: var(--mc-name-size);
  font-weight: 500;
  line-height: 1.12;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.mc-meta {
  display: flex;
  gap: 10px;
  margin-top: 0.5em;
  color: var(--mc-muted);
  font-size: var(--mc-meta-size);
}
.mc-age {
  margin-left: auto;
  color: var(--mc-dim);
  font-variant-numeric: tabular-nums;
}
.mc-path {
  margin-top: 0.3em;
  overflow: hidden;
  color: var(--mc-dim);
  direction: rtl;
  font-size: var(--mc-path-size);
  text-align: left;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.mc-foot {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  margin-top: auto;
  padding-top: 0.6em;
}
.mc-spark {
  display: flex;
  flex: 1 1 auto;
  gap: 2px;
  align-items: flex-end;
  height: var(--mc-spark-h);
  min-width: 0;
  border-bottom: 1px solid #35353f;
}
.mc-spark i {
  flex: 1 1 auto;
  min-width: 2px;
  height: 100%;
  border-radius: 1px 1px 0 0;
  background: #33333e;
  transform: scaleY(0);
  transform-origin: 50% 100%;
}
.mc-count {
  color: var(--mc-muted);
  font-size: var(--mc-meta-size);
  font-variant-numeric: tabular-nums;
}
.mc-card[data-pose="working"] {
  border-left-color: var(--mc-accent);
  background: #1a1a22;
}
.mc-card[data-pose="working"] .mc-state {
  color: var(--mc-accent);
}
.mc-card[data-pose="working"] .mc-dot {
  background: var(--mc-accent);
}
.mc-card[data-pose="working"] .mc-spark i {
  background: var(--mc-accent);
  opacity: 0.9;
}
.mc-card[data-pose="idle"] {
  border-left-color: #3b3b47;
}
.mc-card[data-pose="idle"] .mc-name {
  color: #cdc9c1;
}
.mc-card[data-pose="idle"] .mc-dot {
  background: var(--mc-muted);
}
.mc-card[data-pose="idle"] .mc-spark i {
  background: #3b3b47;
}
.mc-card[data-pose="sleeping"] {
  border-color: #1c1c23;
  border-left-color: #1c1c23;
  background: var(--mc-board);
}
.mc-card[data-pose="sleeping"] .mc-state {
  color: #4a4a54;
}
.mc-card[data-pose="sleeping"] .mc-name {
  color: #63636e;
}
.mc-card[data-pose="sleeping"] .mc-dot {
  background: #5a5a65;
}
.mc-card[data-pose="sleeping"] .mc-dot::after {
  content: "";
  position: absolute;
  inset: -2px -3px -2px 3px;
  border-radius: 50%;
  background: var(--mc-board);
}
.mc-card[data-pose="sleeping"] .mc-age,
.mc-card[data-pose="sleeping"] .mc-count {
  visibility: hidden;
}
.mc-card[data-pose="sleeping"] .mc-spark {
  border-bottom-color: #2b2b34;
}
.mc-card[data-selected="true"] {
  outline: 1px solid var(--mc-accent);
  outline-offset: 1px;
}
.mc-card[data-selected="true"]::after {
  content: "";
  position: absolute;
  top: 0;
  right: 0;
  width: 16px;
  height: 16px;
  background: linear-gradient(225deg, var(--mc-accent) 46%, transparent 46%);
}
.mc-card:focus-visible {
  outline: 2px solid var(--mc-accent);
  outline-offset: 2px;
}
.theme-host[data-theme="mission-control"][data-motion="on"] .mc-spark i {
  transition: transform 320ms ease-out;
}
.theme-host[data-theme="mission-control"][data-motion="on"] .mc-card[data-pose="working"] .mc-dot {
  animation: mc-live 1.7s ease-in-out infinite;
}
.theme-host[data-theme="mission-control"][data-motion="on"] .mc-card[data-pose="sleeping"] .mc-dot {
  animation: mc-breathe 7s ease-in-out infinite;
}
@keyframes mc-live {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.28; }
}
@keyframes mc-breathe {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 0.95; }
}
`;

type Card = {
  el: HTMLButtonElement;
  state: HTMLElement;
  name: HTMLElement;
  action: HTMLElement;
  age: HTMLElement;
  path: HTMLElement;
  count: HTMLElement;
  bars: readonly HTMLElement[];
  written: CardModel | undefined;
  index: number;
  selected: boolean;
};

type Counting = { el: HTMLElement; from: number; to: number; at: number };

function box(el: HTMLElement, rect: Rect): void {
  el.style.left = `${rect.x.toFixed(2)}px`;
  el.style.top = `${rect.y.toFixed(2)}px`;
  el.style.width = `${rect.w.toFixed(2)}px`;
  el.style.height = `${rect.h.toFixed(2)}px`;
}

function span(className: string, parent: HTMLElement): HTMLElement {
  const el = document.createElement("span");
  el.className = className;
  parent.append(el);
  return el;
}

export function mountMissionControlTheme(
  root: HTMLElement,
  context: MissionControlContext,
): MissionControlHandle {
  const camera = context.camera;
  const motion = context.reducedMotion === true ? "off" : "on";
  root.dataset.theme = "mission-control";
  root.dataset.themeHost = "mission-control";
  root.dataset.motion = motion;
  root.replaceChildren();

  if (document.head.querySelector("style[data-mission-control-style]") === null) {
    const style = document.createElement("style");
    style.dataset.missionControlStyle = "true";
    style.textContent = STYLE;
    document.head.append(style);
  }
  if (context.palette !== undefined) {
    root.style.fontFamily = context.palette.font;
    root.style.setProperty("--mc-ink", context.palette.fg);
  }

  const world = document.createElement("div");
  world.className = "mc-world";
  world.style.width = `${String(WORLD_WIDTH)}px`;
  world.style.height = `${String(WORLD_HEIGHT)}px`;

  const board = document.createElement("div");
  board.className = "mc-board";
  box(board, BOARD);

  const rail = document.createElement("div");
  rail.className = "mc-rail";
  box(rail, { x: 0, y: 0, w: RAIL.w, h: RAIL.h });
  const clock = span("mc-clock", rail);
  const clockTime = span("mc-clock-time", clock);
  const clockPhase = span("mc-clock-phase", clock);
  board.append(rail);

  const grid = document.createElement("div");
  grid.className = "mc-grid";
  grid.dataset.testid = "theme-canvas";
  grid.dataset.unitCount = "0";
  grid.setAttribute("role", "group");
  grid.setAttribute("aria-label", "Mission control board");
  world.append(board, grid);
  root.append(world);

  let model: MissionControlRenderInput = {
    roster: [],
    activity: new Map(),
    selectedBotId: undefined,
  };
  const cards = new Map<string, Card>();
  const firstSeen = new Map<string, number>();
  const counting = new Map<string, Counting>();
  let countRaf = 0;
  let gridKey = "";
  let unitCount = -1;
  let selectedKey = "";
  let accentHour = -1;
  let clockKey = "";

  function countAt(item: Counting, nowMs: number): number {
    const t = Math.min(1, Math.max(0, (nowMs - item.at) / COUNT_MS));
    return Math.round(item.from + (item.to - item.from) * t);
  }

  function stepCounts(): void {
    const nowMs = performance.now();
    for (const [key, item] of counting) {
      item.el.textContent = String(countAt(item, nowMs));
      if (nowMs - item.at >= COUNT_MS) {
        counting.delete(key);
      }
    }
    countRaf = counting.size > 0 ? window.requestAnimationFrame(stepCounts) : 0;
  }

  function setCount(key: string, el: HTMLElement, to: number): void {
    const nowMs = performance.now();
    const active = counting.get(key);
    const from = active === undefined ? Number(el.textContent) || 0 : countAt(active, nowMs);
    if (motion === "off" || from === to) {
      counting.delete(key);
      el.textContent = String(to);
      return;
    }
    counting.set(key, { el, from, to, at: nowMs });
    if (countRaf === 0) {
      countRaf = window.requestAnimationFrame(stepCounts);
    }
  }

  function createCard(botId: BotId): Card {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "mc-card";
    el.dataset.testid = "theme-unit";
    el.dataset.botId = botId;
    el.dataset.pose = "idle";
    el.dataset.selected = "false";
    el.addEventListener("click", (event) => {
      event.preventDefault();
      context.onSelect?.(botId);
    });
    const head = span("mc-head", el);
    const state = span("mc-state", head);
    span("mc-dot", head);
    const name = span("mc-name", el);
    const meta = span("mc-meta", el);
    const action = span("mc-action", meta);
    const age = span("mc-age", meta);
    const path = span("mc-path", el);
    const foot = span("mc-foot", el);
    const spark = span("mc-spark", foot);
    const bars: HTMLElement[] = [];
    for (let i = 0; i < SPARK_BUCKETS; i += 1) {
      bars.push(spark.appendChild(document.createElement("i")));
    }
    const count = span("mc-count", foot);
    grid.append(el);
    return {
      el,
      state,
      name,
      action,
      age,
      path,
      count,
      bars,
      written: undefined,
      index: -1,
      selected: false,
    };
  }

  function writeCard(card: Card, next: CardModel): void {
    const prev = card.written;
    if (prev === undefined || prev.pose !== next.pose) {
      card.el.dataset.pose = next.pose;
      card.state.textContent = next.state;
    }
    if (prev === undefined || prev.name !== next.name) {
      card.name.textContent = next.name;
    }
    if (prev === undefined || prev.action !== next.action) {
      card.action.textContent = next.action;
    }
    if (prev === undefined || prev.age !== next.age) {
      card.age.textContent = next.age;
    }
    if (prev === undefined || prev.path !== next.path) {
      card.path.textContent = next.path;
    }
    if (prev === undefined || prev.events !== next.events) {
      setCount(next.botId, card.count, next.events);
    }
    for (let i = 0; i < next.bars.length; i += 1) {
      const height = next.bars[i] ?? 0;
      if (prev !== undefined && prev.bars[i] === height) {
        continue;
      }
      const bar = card.bars[i];
      if (bar !== undefined) {
        bar.style.transform = `scaleY(${height.toFixed(3)})`;
      }
    }
    card.written = next;
  }

  function applyCamera(): void {
    const origin = camera.worldToScreen({ x: 0, y: 0 });
    world.style.transform = `translate(${origin.x.toFixed(2)}px, ${origin.y.toFixed(2)}px) scale(${camera.zoom.toFixed(4)})`;
  }

  function applyScale(scale: CardScale): void {
    grid.style.setProperty("--mc-name-size", `${String(scale.name)}px`);
    grid.style.setProperty("--mc-state-size", `${String(scale.state)}px`);
    grid.style.setProperty("--mc-meta-size", `${String(scale.meta)}px`);
    grid.style.setProperty("--mc-path-size", `${String(scale.path)}px`);
    grid.style.setProperty("--mc-pad", `${String(scale.pad)}px`);
    grid.style.setProperty("--mc-spark-h", `${String(scale.spark)}px`);
  }

  function paint(): void {
    const nowMs = Date.now();
    const hour = new Date(nowMs).getHours();
    if (hour !== accentHour) {
      accentHour = hour;
      root.style.setProperty("--mc-accent", accentForHour(hour));
    }
    const wall = boardClock(nowMs);
    if (clockKey !== wall.time) {
      clockKey = wall.time;
      clockTime.textContent = wall.time;
      clockPhase.textContent = wall.phase;
    }
    const ordered = cardOrder(model.roster);
    const layout = gridFor(ordered.length);
    const scale = cardScale(layout);
    const nextGridKey = `${String(layout.cols)}x${String(layout.rows)}:${layout.cardW.toFixed(2)}:${layout.cardH.toFixed(2)}:${layout.originX.toFixed(2)}:${layout.originY.toFixed(2)}`;
    const reflow = nextGridKey !== gridKey;
    if (reflow) {
      gridKey = nextGridKey;
      applyScale(scale);
    }
    const live = new Set<string>();
    for (let index = 0; index < ordered.length; index += 1) {
      const bot = ordered[index];
      if (bot === undefined) {
        continue;
      }
      live.add(bot.id);
      let card = cards.get(bot.id);
      if (card === undefined) {
        card = createCard(bot.id);
        cards.set(bot.id, card);
      }
      if (!firstSeen.has(bot.id)) {
        firstSeen.set(bot.id, nowMs);
      }
      if (reflow || card.index !== index) {
        card.index = index;
        box(card.el, cardRect(layout, index));
      }
      const isSelected = bot.id === model.selectedBotId;
      if (card.selected !== isSelected) {
        card.selected = isSelected;
        card.el.dataset.selected = String(isSelected);
      }
      writeCard(
        card,
        cardModel({
          bot,
          events: model.activity.get(bot.id),
          nowMs,
          firstSeenMs: firstSeen.get(bot.id) ?? nowMs,
        }),
      );
    }
    for (const [id, card] of cards) {
      if (!live.has(id)) {
        card.el.remove();
        cards.delete(id);
        counting.delete(id);
        firstSeen.delete(id);
      }
    }
    if (unitCount !== ordered.length) {
      unitCount = ordered.length;
      grid.dataset.unitCount = String(ordered.length);
    }
    const nextSelected = model.selectedBotId ?? "";
    if (selectedKey !== nextSelected) {
      selectedKey = nextSelected;
      if (nextSelected === "") {
        delete grid.dataset.selectedBotId;
      } else {
        grid.dataset.selectedBotId = nextSelected;
      }
    }
    applyCamera();
  }

  const stopCamera = camera.onChange(applyCamera);
  applyCamera();

  return {
    render(next) {
      model = next;
      paint();
    },
    unmount() {
      stopCamera();
      if (countRaf !== 0) {
        window.cancelAnimationFrame(countRaf);
        countRaf = 0;
      }
      counting.clear();
      cards.clear();
      firstSeen.clear();
      world.remove();
      root.style.removeProperty("--mc-accent");
      root.style.removeProperty("--mc-ink");
      root.style.removeProperty("font-family");
      delete root.dataset.theme;
      delete root.dataset.themeHost;
      delete root.dataset.motion;
    },
  };
}
