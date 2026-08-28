import type { ActivityEvent, BotId, BotRecord, SpatialAnchor } from "@bot-space/contracts";

export const WORLD_WIDTH = 960;
export const WORLD_HEIGHT = 540;

export const WORK_MS = 12_000;
export const SLEEP_MS = 22_000;

export type StationKind =
  | "core"
  | "bay"
  | "well"
  | "depot"
  | "lab"
  | "turret"
  | "works"
  | "bunker"
  | "pad"
  | "silo"
  | "yard"
  | "relay";

export type Station = {
  id: string;
  kind: StationKind;
  x: number;
  y: number;
  label: string;
};

export type Seat = {
  station: Station;
  unitX: number;
  unitY: number;
};

export type UnitPose = "working" | "idle" | "sleeping";

export const STATIONS: readonly Station[] = [
  { id: "core", kind: "core", x: 470, y: 250, label: "Core" },
  { id: "bay-a", kind: "bay", x: 250, y: 180, label: "Bay A" },
  { id: "bay-b", kind: "bay", x: 700, y: 170, label: "Bay B" },
  { id: "well", kind: "well", x: 140, y: 320, label: "Well" },
  { id: "depot", kind: "depot", x: 820, y: 300, label: "Depot" },
  { id: "lab", kind: "lab", x: 560, y: 120, label: "Lab" },
  { id: "turret", kind: "turret", x: 360, y: 400, label: "Turret" },
  { id: "works", kind: "works", x: 640, y: 390, label: "Works" },
  { id: "bunker", kind: "bunker", x: 200, y: 430, label: "Bunker" },
  { id: "pad", kind: "pad", x: 800, y: 430, label: "Pad" },
  { id: "silo", kind: "silo", x: 90, y: 140, label: "Silo" },
  { id: "relay", kind: "relay", x: 880, y: 110, label: "Relay" },
];

export function hash32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function unitOffset(station: Station, botId: string): { x: number; y: number } {
  const h = hash32(`unit:${station.id}:${botId}`);
  const dx = (h % 37) - 18;
  const dy = 28 + (Math.floor(h / 37) % 11);
  return { x: station.x + dx, y: station.y + dy };
}

function stationById(stations: readonly Station[], id: string): Station | undefined {
  return stations.find((station) => station.id === id);
}

function nearestStation(stations: readonly Station[], x: number, y: number): Station {
  const first = stations[0];
  if (first === undefined) {
    throw new Error("stations must not be empty");
  }
  let best = first;
  let bestD = Number.POSITIVE_INFINITY;
  for (const station of stations) {
    const dx = station.x - x;
    const dy = station.y - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = station;
    }
  }
  return best;
}

function preferredStation(
  spatial: SpatialAnchor | undefined,
  stations: readonly Station[],
): Station | undefined {
  if (spatial === undefined) {
    return undefined;
  }
  if (spatial.kind === "seat") {
    return stationById(stations, spatial.seatId);
  }
  const gx = 80 + spatial.gridX * 70;
  const gy = 80 + spatial.gridY * 50;
  return nearestStation(stations, gx, gy);
}

export function assignSeats(input: {
  bots: readonly BotRecord[];
  stations?: readonly Station[];
}): Map<BotId, Seat> {
  const stations = input.stations ?? STATIONS;
  const taken = new Set<string>();
  const seats = new Map<BotId, Seat>();
  const ordered = [...input.bots].sort((a, b) => a.id.localeCompare(b.id));

  function occupy(bot: BotRecord, station: Station): void {
    taken.add(station.id);
    const offset = unitOffset(station, bot.id);
    seats.set(bot.id, {
      station,
      unitX: offset.x,
      unitY: offset.y,
    });
  }

  for (const bot of ordered) {
    const preferred = preferredStation(bot.spatial, stations);
    if (preferred !== undefined && !taken.has(preferred.id)) {
      occupy(bot, preferred);
    }
  }

  for (const bot of ordered) {
    if (seats.has(bot.id)) {
      continue;
    }
    const start = hash32(bot.id) % stations.length;
    let chosen: Station | undefined;
    for (let n = 0; n < stations.length; n += 1) {
      const station = stations[(start + n) % stations.length];
      if (station !== undefined && !taken.has(station.id)) {
        chosen = station;
        break;
      }
    }
    if (chosen === undefined) {
      const fallback = stations[hash32(bot.id) % stations.length] ?? stations[0];
      if (fallback === undefined) {
        continue;
      }
      const offset = unitOffset(fallback, bot.id);
      seats.set(bot.id, {
        station: fallback,
        unitX: offset.x + 22,
        unitY: offset.y + 10,
      });
      continue;
    }
    occupy(bot, chosen);
  }

  return seats;
}

export function poseFromPulse(input: {
  eventCount: number;
  msSincePulse: number;
  workMs?: number;
  sleepMs?: number;
}): UnitPose {
  const workMs = input.workMs ?? WORK_MS;
  const sleepMs = input.sleepMs ?? SLEEP_MS;
  if (input.eventCount === 0) {
    return input.msSincePulse >= sleepMs ? "sleeping" : "idle";
  }
  if (input.msSincePulse < workMs) {
    return "working";
  }
  if (input.msSincePulse < sleepMs) {
    return "idle";
  }
  return "sleeping";
}

export function eventSignature(events: readonly ActivityEvent[] | undefined): string {
  if (events === undefined || events.length === 0) {
    return "0";
  }
  const last = events[events.length - 1];
  if (last === undefined) {
    return String(events.length);
  }
  return `${events.length}:${last.id}`;
}

export function fitLetterbox(input: {
  worldW: number;
  worldH: number;
  viewW: number;
  viewH: number;
}): { x: number; y: number; w: number; h: number; scale: number } {
  const scale = Math.min(input.viewW / input.worldW, input.viewH / input.worldH);
  const w = input.worldW * scale;
  const h = input.worldH * scale;
  return {
    x: (input.viewW - w) / 2,
    y: (input.viewH - h) / 2,
    w,
    h,
    scale,
  };
}
