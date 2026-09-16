import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";

import {
  parseAgentProfile,
  parseBotId,
  parseIsoTimestamp,
  type BotId,
  type BotRecord,
  type IsoTimestamp,
} from "@lorien-stack/contracts";

import { grokDriver } from "./tail.ts";

export const DEFAULT_DEMO_MULTIPLIER = 1000;
export const DEMO_BOT_MIN = 1;
export const DEMO_BOT_MAX = 40;
export const DEFAULT_DEMO_BOTS = 8;
export const DEMO_CLONE_NAMESPACE = "a11ce000-10e1-41e0-8000-c10de0000001";
export const DEMO_STAGGER_MS = 3500;
export const DEMO_CLONE_STAGGER_MS = 1600;
export const DEMO_MIN_STEP_MS = 800;
export const DEMO_QUIET_HOLD_MS = 4_000;
export const DEMO_SLEEP_HOLD_MS = 3_000;

export type ReplayAppend = {
  kind: "append";
  botId: BotId;
  waitMs: number;
  line: string;
  filePath: string;
};

export type ReplaySleep = {
  kind: "sleep";
  botId: BotId;
  lastActivityAt: IsoTimestamp;
};

export type ReplayWake = {
  kind: "wake";
  botId: BotId;
  lastActivityAt: IsoTimestamp;
};

export type ReplayQuiet = {
  kind: "quiet";
  botId: BotId;
  lastActivityAt: IsoTimestamp;
};

export type BotTape = {
  botId: BotId;
  startOffsetMs: number;
  appends: ReplayAppend[];
  lastActivityAt: IsoTimestamp;
};

export type ReplayPlan = {
  bots: BotRecord[];
  seed: Array<{ id: BotId; profileJson: string }>;
  tapes: BotTape[];
  loop: boolean;
};

export type LoadedFixtureAgent = {
  id: BotId;
  name: string;
  record: BotRecord;
  profileRaw: Record<string, unknown>;
  transcriptLines: string[];
  transcriptFile: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function uuidV5(namespace: string, name: string): string {
  const ns = Buffer.from(namespace.replaceAll("-", ""), "hex");
  const hash = createHash("sha1").update(ns).update(name).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  const version = bytes.at(6);
  const variant = bytes.at(8);
  if (version === undefined || variant === undefined) {
    throw new Error("sha1 digest was shorter than 16 bytes");
  }
  bytes[6] = (version & 0x0f) | 0x50;
  bytes[8] = (variant & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function cloneBotId(input: { sourceId: string; wave: number }): BotId {
  const raw = uuidV5(DEMO_CLONE_NAMESPACE, `${input.sourceId}:${String(input.wave)}`);
  const parsed = parseBotId(raw);
  if (!parsed.ok) {
    throw new Error(`clone id is not a bot id: ${raw}`);
  }
  return parsed.value;
}

export function expandDemoRoster(input: {
  fixtures: LoadedFixtureAgent[];
  botCount: number;
}): Array<{
  id: BotId;
  name: string;
  record: BotRecord;
  profileRaw: Record<string, unknown>;
  transcriptLines: string[];
  transcriptFile: string;
  startOffsetMs: number;
}> {
  const fixtures = [...input.fixtures].sort((a, b) => a.id.localeCompare(b.id));
  if (fixtures.length === 0) {
    return [];
  }
    const slots: Array<{
      id: BotId;
      name: string;
      record: BotRecord;
      profileRaw: Record<string, unknown>;
      transcriptLines: string[];
      transcriptFile: string;
      startOffsetMs: number;
    }> = [];
  for (let index = 0; index < input.botCount; index += 1) {
    const source = fixtures[index % fixtures.length];
    if (source === undefined) {
      continue;
    }
    const wave = Math.floor(index / fixtures.length);
    const startOffsetMs =
      (index % fixtures.length) * DEMO_STAGGER_MS + wave * DEMO_CLONE_STAGGER_MS;
    if (wave === 0) {
      slots.push({
        id: source.id,
        name: source.name,
        record: source.record,
        profileRaw: source.profileRaw,
        transcriptLines: source.transcriptLines,
        transcriptFile: source.transcriptFile,
        startOffsetMs,
      });
      continue;
    }
    const id = cloneBotId({ sourceId: source.id, wave });
    const name = `${source.name} ${String(wave + 1)}`;
    const profileRaw = { ...source.profileRaw, id, name };
    slots.push({
      id,
      name,
      record: { ...source.record, id, name },
      profileRaw,
      transcriptLines: source.transcriptLines,
      transcriptFile: `${id}.jsonl`,
      startOffsetMs,
    });
  }
  return slots;
}

export async function loadFixtureAgents(fixtureRoot: string): Promise<LoadedFixtureAgent[]> {
  const agentsRoot = grokDriver.agentsDir(fixtureRoot);
  const transcriptsRoot = grokDriver.transcriptsDir(fixtureRoot);
  const names = await readdir(agentsRoot);
  const fixtures: LoadedFixtureAgent[] = [];
  for (const name of names) {
    const rawText = await readFile(path.join(agentsRoot, name, "profile.json"), "utf8");
    let json: unknown;
    try {
      json = JSON.parse(rawText) as unknown;
    } catch {
      continue;
    }
    if (!isRecord(json)) {
      continue;
    }
    const parsed = parseAgentProfile(json, name);
    if (!parsed.ok) {
      continue;
    }
    const botId = parsed.value.id;
    const srcDir = path.join(transcriptsRoot, botId);
    let files: string[] = [];
    try {
      files = (await readdir(srcDir)).filter((file) => file.endsWith(".jsonl"));
    } catch {
      files = [];
    }
    files.sort();
    const transcriptLines: string[] = [];
    let transcriptFile = `${botId}.jsonl`;
    for (const file of files) {
      transcriptFile = file;
      const text = await readFile(path.join(srcDir, file), "utf8");
      const rawLines = text.endsWith("\n") ? text.slice(0, -1).split("\n") : text.split("\n");
      for (const line of rawLines) {
        if (line === undefined || line.trim() === "") {
          continue;
        }
        transcriptLines.push(line);
      }
    }
    fixtures.push({
      id: botId,
      name: parsed.value.name,
      record: parsed.value,
      profileRaw: json,
      transcriptLines,
      transcriptFile,
    });
  }
  fixtures.sort((a, b) => a.id.localeCompare(b.id));
  return fixtures;
}

function tapeFromLines(input: {
  botId: BotId;
  lines: string[];
  filePath: string;
  multiplier: number;
  startOffsetMs: number;
}): BotTape {
  const appends: ReplayAppend[] = [];
  let prevMs: number | undefined;
  let lastActivityAt: IsoTimestamp | undefined;
  for (const line of input.lines) {
    const at = firstTimestamp(line);
    if (at === undefined) {
      continue;
    }
    const atMs = Date.parse(at);
    const waitMs =
      prevMs === undefined
        ? 0
        : Math.max(
            DEMO_MIN_STEP_MS,
            Math.max(0, Math.round((atMs - prevMs) / input.multiplier)),
          );
    prevMs = atMs;
    lastActivityAt = at;
    appends.push({
      kind: "append",
      botId: input.botId,
      waitMs,
      line,
      filePath: input.filePath,
    });
  }
  if (lastActivityAt === undefined) {
    const fallback = parseIsoTimestamp("2026-08-27T09:00:00.000Z");
    if (!fallback.ok) {
      throw new Error("fallback timestamp");
    }
    lastActivityAt = fallback.value;
  }
  return {
    botId: input.botId,
    startOffsetMs: input.startOffsetMs,
    appends,
    lastActivityAt,
  };
}

export async function loadReplayPlan(input: {
  fixtureRoot: string;
  workRoot: string;
  multiplier: number;
  botCount?: number;
  idle?: boolean;
}): Promise<ReplayPlan> {
  const multiplier = input.multiplier > 0 ? input.multiplier : DEFAULT_DEMO_MULTIPLIER;
  const botCount = input.botCount ?? DEFAULT_DEMO_BOTS;
  const fixtures = await loadFixtureAgents(input.fixtureRoot);
  const slots = expandDemoRoster({ fixtures, botCount });
  const bots: BotRecord[] = [];
  const seed: Array<{ id: BotId; profileJson: string }> = [];
  const tapes: BotTape[] = [];
  for (const slot of slots) {
    bots.push(slot.record);
    seed.push({ id: slot.id, profileJson: JSON.stringify(slot.profileRaw) });
    const destPath = path.join(
      grokDriver.transcriptsDir(input.workRoot),
      slot.id,
      slot.transcriptFile,
    );
    tapes.push(
      tapeFromLines({
        botId: slot.id,
        lines: input.idle === true ? [] : slot.transcriptLines,
        filePath: destPath,
        multiplier,
        startOffsetMs: input.idle === true ? 0 : slot.startOffsetMs,
      }),
    );
  }
  return {
    bots,
    seed,
    tapes,
    loop: input.idle !== true,
  };
}

export async function seedDemoWorkspace(input: {
  workRoot: string;
  bots: Array<{ id: BotId; profileJson: string }>;
}): Promise<void> {
  for (const bot of input.bots) {
    const destDir = path.join(grokDriver.agentsDir(input.workRoot), bot.id);
    await mkdir(destDir, { recursive: true });
    await writeFile(path.join(destDir, "profile.json"), bot.profileJson);
    await mkdir(path.join(grokDriver.transcriptsDir(input.workRoot), bot.id), {
      recursive: true,
    });
  }
}

function wallNow(): IsoTimestamp {
  const parsed = parseIsoTimestamp(new Date().toISOString());
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.value;
}

export async function runReplay(input: {
  plan: ReplayPlan;
  signal: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
  now?: () => IsoTimestamp;
  onSleep: (step: ReplaySleep) => void;
  onWake?: (step: ReplayWake) => void;
  onQuiet?: (step: ReplayQuiet) => void;
  onAppend?: (step: ReplayAppend) => void;
}): Promise<void> {
  const sleep = input.sleep ?? ((ms: number) => delay(ms, input.signal));
  const now = input.now ?? wallNow;
  await Promise.all(
    input.plan.tapes.map((tape) =>
      runTape({
        tape,
        loop: input.plan.loop,
        signal: input.signal,
        sleep,
        now,
        onSleep: input.onSleep,
        ...(input.onWake !== undefined ? { onWake: input.onWake } : {}),
        ...(input.onQuiet !== undefined ? { onQuiet: input.onQuiet } : {}),
        ...(input.onAppend !== undefined ? { onAppend: input.onAppend } : {}),
      }),
    ),
  );
}

async function runTape(input: {
  tape: BotTape;
  loop: boolean;
  signal: AbortSignal;
  sleep: (ms: number) => Promise<void>;
  now: () => IsoTimestamp;
  onSleep: (step: ReplaySleep) => void;
  onWake?: (step: ReplayWake) => void;
  onQuiet?: (step: ReplayQuiet) => void;
  onAppend?: (step: ReplayAppend) => void;
}): Promise<void> {
  const opened = new Set<string>();
  let lastEmittedAt: IsoTimestamp | undefined;
  if (input.tape.startOffsetMs > 0) {
    await input.sleep(input.tape.startOffsetMs);
  }
  do {
    if (input.signal.aborted) {
      return;
    }
    if (input.tape.appends.length > 0) {
      input.onWake?.({
        kind: "wake",
        botId: input.tape.botId,
        lastActivityAt: input.now(),
      });
    }
    for (const step of input.tape.appends) {
      if (input.signal.aborted) {
        return;
      }
      if (step.waitMs > 0) {
        await input.sleep(step.waitMs);
      }
      if (input.signal.aborted) {
        return;
      }
      await mkdir(path.dirname(step.filePath), { recursive: true });
      if (!opened.has(step.filePath)) {
        opened.add(step.filePath);
        await writeFile(step.filePath, `${step.line}\n`);
      } else {
        await appendFile(step.filePath, `${step.line}\n`);
      }
      lastEmittedAt = input.now();
      input.onAppend?.(step);
    }
    const sleepAt = lastEmittedAt ?? input.now();
    if (input.loop && input.tape.appends.length > 0) {
      input.onQuiet?.({
        kind: "quiet",
        botId: input.tape.botId,
        lastActivityAt: sleepAt,
      });
      await input.sleep(DEMO_QUIET_HOLD_MS);
      if (input.signal.aborted) {
        return;
      }
    }
    input.onSleep({
      kind: "sleep",
      botId: input.tape.botId,
      lastActivityAt: sleepAt,
    });
    if (!input.loop) {
      return;
    }
    await input.sleep(DEMO_SLEEP_HOLD_MS);
  } while (!input.signal.aborted);
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

function firstTimestamp(line: string): IsoTimestamp | undefined {
  try {
    const json = JSON.parse(line) as unknown;
    if (typeof json !== "object" || json === null) {
      return undefined;
    }
    const record = json as Record<string, unknown>;
    const raw = record.at ?? record.timestamp;
    const parsed = parseIsoTimestamp(raw);
    return parsed.ok ? parsed.value : undefined;
  } catch {
    return undefined;
  }
}

export function demoBotIds(bots: BotRecord[]): BotId[] {
  return bots.map((bot) => bot.id);
}
