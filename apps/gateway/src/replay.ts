import { mkdir, readFile, readdir, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";

import {
  parseActivityJsonl,
  parseAgentProfile,
  parseIsoTimestamp,
  type BotId,
  type BotRecord,
  type IsoTimestamp,
} from "@lorien-stack/contracts";

import { grokDriver } from "./tail.ts";

export const DEFAULT_DEMO_MULTIPLIER = 1000;

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

export type ReplayStep = ReplayAppend | ReplaySleep;

export type ReplayPlan = {
  bots: BotRecord[];
  steps: ReplayStep[];
};

export async function loadReplayPlan(input: {
  fixtureRoot: string;
  workRoot: string;
  multiplier: number;
}): Promise<ReplayPlan> {
  const multiplier = input.multiplier > 0 ? input.multiplier : DEFAULT_DEMO_MULTIPLIER;
  const agentsRoot = grokDriver.agentsDir(input.fixtureRoot);
  const transcriptsRoot = grokDriver.transcriptsDir(input.fixtureRoot);
  const names = await readdir(agentsRoot);
  const bots: BotRecord[] = [];
  const timed: Array<{ botId: BotId; atMs: number; line: string; filePath: string }> = [];

  for (const name of names) {
    const raw = await readFile(path.join(agentsRoot, name, "profile.json"), "utf8");
    const parsed = parseAgentProfile(JSON.parse(raw) as unknown, name);
    if (!parsed.ok) {
      continue;
    }
    bots.push(parsed.value);
    const botId = parsed.value.id;
    const srcDir = path.join(transcriptsRoot, botId);
    let files: string[] = [];
    try {
      files = (await readdir(srcDir)).filter((file) => file.endsWith(".jsonl"));
    } catch {
      continue;
    }
    const destDir = path.join(grokDriver.transcriptsDir(input.workRoot), botId);
    for (const file of files) {
      const text = await readFile(path.join(srcDir, file), "utf8");
      const destPath = path.join(destDir, file);
      const events = parseActivityJsonl({ text, botId });
      const rawLines = text.endsWith("\n") ? text.slice(0, -1).split("\n") : text.split("\n");
      for (let index = 0; index < rawLines.length; index += 1) {
        const line = rawLines[index];
        if (line === undefined || line.trim() === "") {
          continue;
        }
        const event = events.find((item) => item.id === `${botId}:${index}`);
        const at = event?.at ?? firstTimestamp(line);
        if (at === undefined) {
          continue;
        }
        timed.push({
          botId,
          atMs: Date.parse(at),
          line,
          filePath: destPath,
        });
      }
    }
  }

  timed.sort((a, b) => a.atMs - b.atMs);
  const steps: ReplayStep[] = [];
  let prevMs: number | undefined;
  const lastAt = new Map<BotId, IsoTimestamp>();
  for (const item of timed) {
    const waitMs =
      prevMs === undefined ? 0 : Math.max(0, Math.round((item.atMs - prevMs) / multiplier));
    prevMs = item.atMs;
    const at = parseIsoTimestamp(new Date(item.atMs).toISOString());
    if (at.ok) {
      lastAt.set(item.botId, at.value);
    }
    steps.push({
      kind: "append",
      botId: item.botId,
      waitMs,
      line: item.line,
      filePath: item.filePath,
    });
  }
  for (const bot of bots) {
    const lastActivityAt = lastAt.get(bot.id);
    if (lastActivityAt === undefined) {
      continue;
    }
    steps.push({ kind: "sleep", botId: bot.id, lastActivityAt });
  }
  return { bots, steps };
}

export async function seedDemoWorkspace(input: {
  fixtureRoot: string;
  workRoot: string;
  bots: BotRecord[];
}): Promise<void> {
  for (const bot of input.bots) {
    const src = path.join(grokDriver.agentsDir(input.fixtureRoot), bot.id, "profile.json");
    const destDir = path.join(grokDriver.agentsDir(input.workRoot), bot.id);
    await mkdir(destDir, { recursive: true });
    await writeFile(path.join(destDir, "profile.json"), await readFile(src));
    await mkdir(path.join(grokDriver.transcriptsDir(input.workRoot), bot.id), {
      recursive: true,
    });
  }
}

export async function runReplay(input: {
  plan: ReplayPlan;
  signal: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
  onSleep: (step: ReplaySleep) => void;
}): Promise<void> {
  const sleep = input.sleep ?? delay;
  const opened = new Set<string>();
  for (const step of input.plan.steps) {
    if (input.signal.aborted) {
      return;
    }
    if (step.kind === "sleep") {
      input.onSleep(step);
      continue;
    }
    if (step.waitMs > 0) {
      await sleep(step.waitMs);
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
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
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
