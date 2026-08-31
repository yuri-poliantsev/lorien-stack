import {
  CONTRACTS_SCHEMA_VERSION,
  type BotId,
  type BotRecord,
  type IsoTimestamp,
  type RosterSnapshot,
} from "@lorien-stack/contracts";

export type Roster = {
  readonly revision: number;
  readonly bots: ReadonlyMap<BotId, BotRecord>;
};

export function emptyRoster(): Roster {
  return { revision: 0, bots: new Map() };
}

export function spawnBot(roster: Roster, bot: BotRecord): Roster {
  const existing = roster.bots.get(bot.id);
  if (existing !== undefined && sameBot(existing, bot)) {
    return roster;
  }
  const bots = new Map(roster.bots);
  bots.set(bot.id, bot);
  return { revision: roster.revision + 1, bots };
}

export function goneBot(roster: Roster, botId: BotId): Roster {
  if (!roster.bots.has(botId)) {
    return roster;
  }
  const bots = new Map(roster.bots);
  bots.delete(botId);
  return { revision: roster.revision + 1, bots };
}

export function advanceRevision(roster: Roster): Roster {
  return { revision: roster.revision + 1, bots: roster.bots };
}

export function toSnapshot(input: {
  roster: Roster;
  capturedAt: IsoTimestamp;
}): RosterSnapshot {
  return {
    schemaVersion: CONTRACTS_SCHEMA_VERSION,
    capturedAt: input.capturedAt,
    bots: [...input.roster.bots.values()],
  };
}

function sameBot(a: BotRecord, b: BotRecord): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
