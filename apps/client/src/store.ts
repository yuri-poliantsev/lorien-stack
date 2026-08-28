import type {
  ActivityEvent,
  BotId,
  BotRecord,
  PresenceHint,
  RosterSnapshot,
} from "@bot-space/contracts";

export type ClientStore = {
  revision: number;
  bots: Map<BotId, BotRecord>;
  activity: Map<BotId, ActivityEvent[]>;
  presence: Map<BotId, PresenceHint>;
  selectedBotId: BotId | undefined;
};

export function emptyStore(): ClientStore {
  return {
    revision: 0,
    bots: new Map(),
    activity: new Map(),
    presence: new Map(),
    selectedBotId: undefined,
  };
}

export function rosterList(store: ClientStore): BotRecord[] {
  return [...store.bots.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function activityFor(
  store: ClientStore,
  botId: BotId | undefined,
): ActivityEvent[] {
  if (botId === undefined) {
    return [];
  }
  return store.activity.get(botId) ?? [];
}

export function applySnapshot(
  store: ClientStore,
  input: { revision: number; snapshot: RosterSnapshot },
): void {
  store.revision = input.revision;
  const next = new Map<BotId, BotRecord>();
  for (const bot of input.snapshot.bots) {
    next.set(bot.id, bot);
  }
  store.bots = next;
  for (const id of [...store.activity.keys()]) {
    if (!next.has(id)) {
      store.activity.delete(id);
    }
  }
  for (const id of [...store.presence.keys()]) {
    if (!next.has(id)) {
      store.presence.delete(id);
    }
  }
  if (store.selectedBotId !== undefined && !next.has(store.selectedBotId)) {
    store.selectedBotId = undefined;
  }
}

export function applyEvent(
  store: ClientStore,
  input: { revision: number; event: ActivityEvent },
): void {
  store.revision = input.revision;
  const existing = store.activity.get(input.event.botId) ?? [];
  if (existing.some((item) => item.id === input.event.id)) {
    return;
  }
  store.activity.set(input.event.botId, [...existing, input.event]);
}

export function applyPresence(
  store: ClientStore,
  input: { revision: number; botId: BotId; hint: PresenceHint },
): void {
  store.revision = input.revision;
  store.presence.set(input.botId, input.hint);
}

export type StoreMessage =
  | { type: "snapshot"; revision: number; snapshot: RosterSnapshot }
  | { type: "event"; revision: number; event: ActivityEvent }
  | { type: "presence"; revision: number; botId: BotId; hint: PresenceHint };

export function applyMessage(store: ClientStore, message: StoreMessage): void {
  switch (message.type) {
    case "snapshot":
      applySnapshot(store, message);
      return;
    case "event":
      applyEvent(store, message);
      return;
    case "presence":
      applyPresence(store, message);
      return;
    default: {
      const _exhaustive: never = message;
      return _exhaustive;
    }
  }
}

export function selectBot(store: ClientStore, botId: BotId): void {
  if (!store.bots.has(botId)) {
    return;
  }
  store.selectedBotId = botId;
}

export function isPromptEnabled(selectedBotId: BotId | undefined): boolean {
  return selectedBotId !== undefined;
}
