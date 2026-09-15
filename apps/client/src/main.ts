import type { BotId } from "@lorien-stack/contracts";

import { createCamera } from "./camera.ts";
import { mountHeader } from "./shell/header.ts";
import { mountInspector } from "./shell/inspector.ts";
import { rosterRows, shellStats, tapeRows } from "./shell/model.ts";
import { bindCameraInput } from "./shell/cameraInput.ts";
import { startFrameBudget } from "./shell/frameBudget.ts";
import { mountRosterPanel } from "./shell/rosterPanel.ts";
import {
  applyMessage,
  emptyStore,
  rosterList,
  selectBot,
} from "./store.ts";
import { mountThemeHost } from "./themeHost.ts";
import { THEMES } from "./themes/registry.ts";
import { mountThemePicker } from "./ui/themePicker.ts";
import { connectGateway, gatewayWsUrl } from "./ws.ts";
import "./styles.css";

const TAPE_LIMIT = 40;
const TICK_MS = 1000;

const appNode = document.querySelector("#app");
if (!(appNode instanceof HTMLElement)) {
  throw new Error("missing #app");
}
const app: HTMLElement = appNode;

const headerEl = document.createElement("header");
headerEl.className = "app-header";
const sceneStack = document.createElement("div");
sceneStack.className = "scene-stack";
sceneStack.dataset.testid = "scene-stack";
const themeEl = document.createElement("section");
themeEl.className = "theme-host";
themeEl.id = "theme-mount";
sceneStack.append(themeEl);
app.append(headerEl, sceneStack);

const store = emptyStore();
const paintOrigin = performance.now();
let rosterPainted = false;
let rosterCount = -1;
let inspectorOpen = false;

const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
function reducedMotion(): boolean {
  return motion.matches;
}
function writeMotionFlag(): void {
  document.documentElement.dataset.reducedMotion = reducedMotion()
    ? "true"
    : "false";
}
writeMotionFlag();

const camera = createCamera({
  viewport: () => ({
    w: Math.max(1, sceneStack.clientWidth),
    h: Math.max(1, sceneStack.clientHeight),
  }),
});
camera.onChange((state) => {
  const html = document.documentElement.dataset;
  html.cameraX = state.x.toFixed(2);
  html.cameraY = state.y.toFixed(2);
  html.cameraZoom = state.zoom.toFixed(4);
});

const theme = mountThemeHost(themeEl, {
  onSelect: selectAndInspect,
  camera,
  reducedMotion,
  shellRoot: app,
});

let stopFrameBudget = startFrameBudget(document.documentElement);
function restartFrameBudget(): void {
  stopFrameBudget();
  stopFrameBudget = startFrameBudget(document.documentElement);
}

function activeWorld(): { w: number; h: number } {
  const entry = THEMES.get(theme.themeId()) ?? THEMES.entries[0];
  return entry.world;
}
function refit(): void {
  camera.fit(activeWorld());
}

const header = mountHeader(headerEl, {
  onToggleInspector() {
    inspectorOpen = !inspectorOpen;
    render();
  },
});
mountThemePicker(header.pickerSlot, {
  getId() {
    return theme.themeId();
  },
  onSelect(id) {
    theme.setTheme(id);
    restartFrameBudget();
    refit();
    render();
  },
});
const roster = mountRosterPanel(sceneStack, {
  onSelect: selectAndInspect,
  storage: window.localStorage,
});
const inspector = mountInspector(sceneStack, {
  onClose() {
    inspectorOpen = false;
    render();
  },
});

function selectAndInspect(botId: BotId): void {
  selectBot(store, botId);
  inspectorOpen = true;
  render();
}

function render(): void {
  const bots = rosterList(store);
  const nowMs = Date.now();
  const model = {
    roster: bots,
    activity: store.activity,
    presence: store.presence,
    nowMs,
  };
  const rows = rosterRows(model);
  roster.update({ rows, selectedBotId: store.selectedBotId });
  header.update(shellStats(model));
  const selected =
    store.selectedBotId === undefined
      ? undefined
      : store.bots.get(store.selectedBotId);
  inspector.update({
    open: inspectorOpen,
    title: selected?.name ?? "Inspector",
    rows: tapeRows({
      activity: store.activity,
      botId: store.selectedBotId,
      limit: TAPE_LIMIT,
    }),
  });
  theme.render({ roster: bots, activity: store.activity });
  if (bots.length !== rosterCount) {
    rosterCount = bots.length;
    refit();
  }
  if (!rosterPainted && bots.length > 0) {
    rosterPainted = true;
    const ms = Math.round(performance.now() - paintOrigin);
    app.dataset.rosterReady = "true";
    app.dataset.rosterCount = String(bots.length);
    app.dataset.rosterPaintMs = String(ms);
    document.documentElement.dataset.rosterReady = "true";
  }
}

motion.addEventListener("change", () => {
  writeMotionFlag();
  theme.remount();
  restartFrameBudget();
  render();
});

bindCameraInput(sceneStack, camera, { onRefit: refit });
window.addEventListener("resize", refit);
window.setInterval(render, TICK_MS);

connectGateway({
  url: gatewayWsUrl({
    protocol: window.location.protocol,
    host: window.location.host,
  }),
  onMessage(message) {
    applyMessage(store, message);
    render();
  },
});

refit();
render();
