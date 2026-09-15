import {
  applyMessage,
  emptyStore,
  rosterList,
  selectBot,
} from "./store.ts";
import { mountThemeHost } from "./themeHost.ts";
import { mountBotList } from "./ui/botList.ts";
import { connectGateway, gatewayWsUrl } from "./ws.ts";
import "./styles.css";

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
app.append(botListEl, themeEl);

const store = emptyStore();
const paintOrigin = performance.now();
let rosterPainted = false;

const theme = mountThemeHost(themeEl, {
  onSelect(botId) {
    selectBot(store, botId);
    render();
  },
});
const bots = mountBotList(botListEl, {
  onSelect(botId) {
    selectBot(store, botId);
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
