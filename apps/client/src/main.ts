import {
  activityFor,
  applyMessage,
  emptyStore,
  rosterList,
  selectBot,
} from "./store.ts";
import { mountThemeHost } from "./themeHost.ts";
import { mountActivityPanel } from "./ui/activityPanel.ts";
import { mountBotList } from "./ui/botList.ts";
import { mountPromptBar, type WakeStatus } from "./ui/promptBar.ts";
import { connectGateway, gatewayWsUrl } from "./ws.ts";
import "./styles.css";

const token =
  import.meta.env.VITE_GATEWAY_TOKEN === undefined ||
  import.meta.env.VITE_GATEWAY_TOKEN.length === 0
    ? "demo-token"
    : import.meta.env.VITE_GATEWAY_TOKEN;

const appNode = document.querySelector("#app");
if (!(appNode instanceof HTMLElement)) {
  throw new Error("missing #app");
}
const app: HTMLElement = appNode;

const botListEl = document.createElement("aside");
botListEl.className = "bot-list";
const themeEl = document.createElement("section");
themeEl.className = "theme-host";
themeEl.id = "theme-mount";
const activityEl = document.createElement("section");
activityEl.className = "activity-panel";
const promptEl = document.createElement("footer");
promptEl.className = "prompt-bar";
app.append(botListEl, themeEl, activityEl, promptEl);

const store = emptyStore();
let wakeStatus: WakeStatus = { kind: "idle" };
const paintOrigin = performance.now();
let rosterPainted = false;

const theme = mountThemeHost(themeEl);
const bots = mountBotList(botListEl, {
  onSelect(botId) {
    selectBot(store, botId);
    wakeStatus = { kind: "idle" };
    render();
  },
});
const activity = mountActivityPanel(activityEl);
const prompt = mountPromptBar(promptEl, {
  token,
  promptUrl: "/api/prompt",
  selectedBotId() {
    return store.selectedBotId;
  },
  onStatus(status) {
    wakeStatus = status;
    render();
  },
});

function render(): void {
  const roster = rosterList(store);
  bots.update({
    bots: roster,
    selectedBotId: store.selectedBotId,
    presence: store.presence,
  });
  const selected =
    store.selectedBotId === undefined
      ? undefined
      : store.bots.get(store.selectedBotId);
  activity.update({
    bot: selected,
    events: activityFor(store, store.selectedBotId),
  });
  prompt.update({
    selectedBotId: store.selectedBotId,
    status: wakeStatus,
  });
  theme.render({
    roster,
    activity: store.activity,
  });
  if (!rosterPainted && roster.length > 0) {
    rosterPainted = true;
    const ms = Math.round(performance.now() - paintOrigin);
    app.dataset.rosterReady = "true";
    app.dataset.rosterCount = String(roster.length);
    app.dataset.rosterPaintMs = String(ms);
    document.documentElement.dataset.rosterReady = "true";
  }
}

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

render();
