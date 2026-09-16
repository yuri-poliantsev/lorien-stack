import {
  parseAgentProfile,
  parseBotId,
  parseIsoTimestamp,
  type BotId,
  type BotRecord,
} from "@lorien-stack/contracts";

const DEMO_BOT_MIN = 1;
const DEMO_BOT_MAX = 40;
const DEFAULT_DEMO_BOTS = 8;
const DEMO_MULTIPLIER = 1000;
const DEMO_STAGGER_MS = 3500;
const DEMO_CLONE_STAGGER_MS = 1600;
const DEMO_MIN_STEP_MS = 800;
const DEMO_QUIET_HOLD_MS = 4_000;
const DEMO_SLEEP_HOLD_MS = 3_000;

export type DemoSource = { kind: "live" } | { kind: "demo"; bots: number };

export type DemoFixture = {
  record: BotRecord;
  lines: string[];
};

export type DemoSlot = DemoFixture & { startOffsetMs: number };

export type DemoCue = { atMs: number } & (
  | { kind: "wake" }
  | { kind: "line"; line: string }
  | { kind: "quiet" }
  | { kind: "sleep" }
);

export type DemoTape = {
  botId: BotId;
  startOffsetMs: number;
  cues: DemoCue[];
  periodMs: number;
};

export function resolveDemoSource(input: {
  search: string;
  hostedDemo: boolean;
}): DemoSource {
  const raw = input.search.startsWith("?") ? input.search.slice(1) : input.search;
  const value = new URLSearchParams(raw).get("demo");
  if (value === null) {
    return input.hostedDemo ? { kind: "demo", bots: DEFAULT_DEMO_BOTS } : { kind: "live" };
  }
  return { kind: "demo", bots: parseDemoBots(value) };
}

export function parseDemoBots(raw: string): number {
  if (raw.trim() === "") {
    return DEFAULT_DEMO_BOTS;
  }
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    return DEFAULT_DEMO_BOTS;
  }
  return Math.min(DEMO_BOT_MAX, Math.max(DEMO_BOT_MIN, value));
}

function dirName(modulePath: string): string {
  const parts = modulePath.split("/");
  return parts[parts.length - 2] ?? "";
}

export function demoFixtures(input: {
  profiles: Record<string, unknown>;
  transcripts: Record<string, string>;
}): DemoFixture[] {
  const linesByDir = new Map<string, string[]>();
  for (const key of Object.keys(input.transcripts).sort()) {
    const dir = dirName(key);
    const lines = linesByDir.get(dir) ?? [];
    for (const line of (input.transcripts[key] ?? "").split("\n")) {
      if (line.trim() !== "") {
        lines.push(line);
      }
    }
    linesByDir.set(dir, lines);
  }
  const fixtures: DemoFixture[] = [];
  for (const [key, json] of Object.entries(input.profiles)) {
    const dir = dirName(key);
    const parsed = parseAgentProfile(json, dir);
    if (!parsed.ok) {
      continue;
    }
    fixtures.push({ record: parsed.value, lines: linesByDir.get(parsed.value.id) ?? [] });
  }
  fixtures.sort((a, b) => a.record.id.localeCompare(b.record.id));
  return fixtures;
}

function cloneBotId(sourceId: BotId, wave: number): BotId {
  const raw = `${sourceId.slice(0, 32)}${wave.toString(16).padStart(4, "0")}`;
  const parsed = parseBotId(raw);
  if (!parsed.ok) {
    throw new Error(`clone id is not a bot id: ${raw}`);
  }
  return parsed.value;
}

export function demoRoster(fixtures: DemoFixture[], botCount: number): DemoSlot[] {
  const sorted = [...fixtures].sort((a, b) => a.record.id.localeCompare(b.record.id));
  const slots: DemoSlot[] = [];
  for (let index = 0; index < botCount; index += 1) {
    const source = sorted[index % sorted.length];
    if (source === undefined) {
      break;
    }
    const wave = Math.floor(index / sorted.length);
    const startOffsetMs =
      (index % sorted.length) * DEMO_STAGGER_MS + wave * DEMO_CLONE_STAGGER_MS;
    if (wave === 0) {
      slots.push({ ...source, startOffsetMs });
      continue;
    }
    const id = cloneBotId(source.record.id, wave);
    const name = `${source.record.name} ${String(wave + 1)}`;
    slots.push({
      record: { ...source.record, id, name },
      lines: source.lines,
      startOffsetMs,
    });
  }
  return slots;
}

function lineTimestampMs(line: string): number | undefined {
  try {
    const json = JSON.parse(line) as unknown;
    if (typeof json !== "object" || json === null) {
      return undefined;
    }
    const record = json as Record<string, unknown>;
    const parsed = parseIsoTimestamp(record.at ?? record.timestamp);
    return parsed.ok ? Date.parse(parsed.value) : undefined;
  } catch {
    return undefined;
  }
}

export function demoTape(slot: DemoSlot): DemoTape {
  const lines: DemoCue[] = [];
  let atMs = 0;
  let prevMs: number | undefined;
  for (const line of slot.lines) {
    const stampMs = lineTimestampMs(line);
    if (stampMs === undefined) {
      continue;
    }
    if (prevMs !== undefined) {
      atMs += Math.max(
        DEMO_MIN_STEP_MS,
        Math.max(0, Math.round((stampMs - prevMs) / DEMO_MULTIPLIER)),
      );
    }
    prevMs = stampMs;
    lines.push({ atMs, kind: "line", line });
  }
  const botId = slot.record.id;
  if (lines.length === 0) {
    return {
      botId,
      startOffsetMs: slot.startOffsetMs,
      cues: [{ atMs: 0, kind: "sleep" }],
      periodMs: DEMO_SLEEP_HOLD_MS,
    };
  }
  const sleepAt = atMs + DEMO_QUIET_HOLD_MS;
  return {
    botId,
    startOffsetMs: slot.startOffsetMs,
    cues: [
      { atMs: 0, kind: "wake" },
      ...lines,
      { atMs, kind: "quiet" },
      { atMs: sleepAt, kind: "sleep" },
    ],
    periodMs: sleepAt + DEMO_SLEEP_HOLD_MS,
  };
}
