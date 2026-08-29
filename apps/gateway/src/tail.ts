import { open, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import {
  parseActivityJsonl,
  parseAgentProfile,
  parseBotId,
  type ActivityEvent,
  type BotId,
  type BotRecord,
} from "@bot-space/contracts";

export const GROK_DRIVER_NAME = "grok" as const;
export const COALESCE_MS = 250;
/** First sight of a larger transcript skips older bytes so live boot survives multi‑hundred‑MB files. */
export const MAX_INITIAL_CATCHUP_BYTES = 1_048_576;
export const READ_CHUNK_BYTES = 256 * 1024;

export type GrokDriver = {
  name: typeof GROK_DRIVER_NAME;
  agentsDir(root: string): string;
  transcriptsDir(root: string): string;
};

export const grokDriver: GrokDriver = {
  name: GROK_DRIVER_NAME,
  agentsDir(root) {
    return path.join(root, "agents");
  },
  transcriptsDir(root) {
    return path.join(root, "agent-transcripts");
  },
};

export type FileCursor = {
  offset: number;
  pending: string;
  lineIndex: number;
};

export type TailHandlers = {
  onSpawn: (bot: BotRecord) => void;
  onGone: (botId: BotId) => void;
  onEvents: (events: ActivityEvent[]) => void;
};

export type Tailer = {
  tick: () => Promise<void>;
  start: () => void;
  stop: () => void;
  cursors: () => ReadonlyMap<string, FileCursor>;
};

export function createTailer(input: {
  root: string;
  driver?: GrokDriver;
  coalesceMs?: number;
  handlers: TailHandlers;
}): Tailer {
  const driver = input.driver ?? grokDriver;
  const coalesceMs = input.coalesceMs ?? COALESCE_MS;
  const cursors = new Map<string, FileCursor>();
  const knownBots = new Map<BotId, BotRecord>();
  let timer: ReturnType<typeof setInterval> | undefined;
  let ticking = false;

  async function tick(): Promise<void> {
    if (ticking) {
      return;
    }
    ticking = true;
    try {
      await scanRoster();
      await scanTranscripts();
    } finally {
      ticking = false;
    }
  }

  async function scanRoster(): Promise<void> {
    const agentsRoot = driver.agentsDir(input.root);
    const found = new Map<BotId, BotRecord>();
    let entries: string[] = [];
    try {
      entries = await readdir(agentsRoot);
    } catch {
      entries = [];
    }
    for (const name of entries) {
      const profilePath = path.join(agentsRoot, name, "profile.json");
      let raw: string;
      try {
        raw = await readFile(profilePath, "utf8");
      } catch {
        continue;
      }
      let json: unknown;
      try {
        json = JSON.parse(raw) as unknown;
      } catch {
        continue;
      }
      const parsed = parseAgentProfile(json, name);
      if (!parsed.ok) {
        continue;
      }
      found.set(parsed.value.id, parsed.value);
    }
    for (const [id, bot] of found) {
      const prev = knownBots.get(id);
      if (prev === undefined) {
        knownBots.set(id, bot);
        input.handlers.onSpawn(bot);
      }
    }
    for (const id of [...knownBots.keys()]) {
      if (!found.has(id)) {
        knownBots.delete(id);
        input.handlers.onGone(id);
      }
    }
  }

  async function scanTranscripts(): Promise<void> {
    const transcriptsRoot = driver.transcriptsDir(input.root);
    let botDirs: string[] = [];
    try {
      botDirs = await readdir(transcriptsRoot);
    } catch {
      return;
    }
    const batch: ActivityEvent[] = [];
    for (const botDir of botDirs) {
      const botIdResult = parseBotId(botDir);
      if (!botIdResult.ok) {
        continue;
      }
      const dir = path.join(transcriptsRoot, botDir);
      let files: string[] = [];
      try {
        files = (await readdir(dir)).filter((name) => name.endsWith(".jsonl"));
      } catch {
        continue;
      }
      for (const file of files) {
        const filePath = path.join(dir, file);
        const events = await readNewEvents(filePath, botIdResult.value);
        batch.push(...events);
      }
    }
    if (batch.length > 0) {
      input.handlers.onEvents(batch);
    }
  }

  async function readNewEvents(filePath: string, botId: BotId): Promise<ActivityEvent[]> {
    let fileStat;
    try {
      fileStat = await stat(filePath);
    } catch {
      return [];
    }
    const existing = cursors.get(filePath);
    const cursor = existing ?? { offset: 0, pending: "", lineIndex: 0 };
    if (fileStat.size < cursor.offset) {
      cursor.offset = 0;
      cursor.pending = "";
      cursor.lineIndex = 0;
    }
    if (existing === undefined && fileStat.size > MAX_INITIAL_CATCHUP_BYTES) {
      cursor.offset = fileStat.size - MAX_INITIAL_CATCHUP_BYTES;
      cursor.pending = "";
      cursor.lineIndex = 0;
    }
    if (fileStat.size === cursor.offset) {
      cursors.set(filePath, cursor);
      return [];
    }

    const readFrom = cursor.offset;
    const maxChunk =
      existing === undefined && readFrom > 0 ? MAX_INITIAL_CATCHUP_BYTES : READ_CHUNK_BYTES;
    const toRead = Math.min(fileStat.size - readFrom, maxChunk);
    const handle = await open(filePath, "r");
    let slice: Buffer;
    try {
      const buf = Buffer.alloc(toRead);
      const { bytesRead } = await handle.read(buf, 0, toRead, readFrom);
      slice = buf.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
    cursor.offset = readFrom + slice.length;

    let text = cursor.pending + slice.toString("utf8");
    if (existing === undefined && readFrom > 0 && cursor.pending === "") {
      const firstNl = text.indexOf("\n");
      if (firstNl === -1) {
        cursor.pending = text;
        cursors.set(filePath, cursor);
        return [];
      }
      text = text.slice(firstNl + 1);
    }

    const lastNl = text.lastIndexOf("\n");
    if (lastNl === -1) {
      cursor.pending = text;
      cursors.set(filePath, cursor);
      return [];
    }
    const complete = text.slice(0, lastNl + 1);
    cursor.pending = text.slice(lastNl + 1);
    const events = parseActivityJsonl({
      text: complete,
      botId,
      lineOffset: cursor.lineIndex,
    });
    cursor.lineIndex += complete.split("\n").length - 1;
    cursors.set(filePath, cursor);
    return events;
  }

  return {
    tick,
    start() {
      if (timer !== undefined) {
        return;
      }
      timer = setInterval(() => {
        void tick();
      }, coalesceMs);
    },
    stop() {
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    },
    cursors() {
      return cursors;
    },
  };
}
