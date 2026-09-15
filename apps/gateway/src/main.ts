import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";

import {
  parseIsoTimestamp,
  presenceHintFromQuietClock,
  type ActivityEvent,
  type BotId,
  type IsoTimestamp,
  type PresenceHint,
  type RosterSnapshot,
} from "@lorien-stack/contracts";

import {
  advanceRevision,
  emptyRoster,
  goneBot,
  spawnBot,
  toSnapshot,
  type Roster,
} from "./roster.ts";
import {
  COALESCE_MS,
  createTailer,
  grokDriver,
  type Tailer,
} from "./tail.ts";
import {
  collectPresenceHints,
  createPresenceClock,
  PRESENCE_REASON_SLEEP,
  resolvePresenceConfig,
  type PresenceClock,
} from "./presence.ts";
import {
  DEFAULT_DEMO_BOTS,
  DEFAULT_DEMO_MULTIPLIER,
  DEMO_BOT_MAX,
  DEMO_BOT_MIN,
  loadReplayPlan,
  runReplay,
  seedDemoWorkspace,
  type ReplaySleep,
} from "./replay.ts";

export { DEFAULT_DEMO_BOTS, DEMO_BOT_MAX, DEMO_BOT_MIN };

export type GatewayMessage =
  | { type: "snapshot"; revision: number; snapshot: RosterSnapshot }
  | { type: "event"; revision: number; event: ActivityEvent }
  | { type: "presence"; revision: number; botId: BotId; hint: PresenceHint };

export type LogEntry = {
  msg: string;
  [key: string]: unknown;
};

export type GatewayOptions = {
  listen?: string;
  data?: string;
  demo?: boolean;
  bots?: number;
  replayIdle?: boolean;
  multiplier?: number;
  coalesceMs?: number;
  presenceWorkMs?: number;
  presenceSleepMs?: number;
  presenceTickMs?: number;
  log?: (entry: LogEntry) => void;
};

export type Gateway = {
  close: () => Promise<void>;
  url: string;
  host: string;
  port: number;
  logs: LogEntry[];
  getRoster: () => { snapshot: RosterSnapshot; revision: number };
};

export function parseListen(input: string | undefined): { host: string; port: number } {
  const raw = input === undefined || input.trim() === "" ? ":8040" : input.trim();
  if (/^\d+$/.test(raw)) {
    return { host: "0.0.0.0", port: Number(raw) };
  }
  if (raw.startsWith(":")) {
    return { host: "0.0.0.0", port: Number(raw.slice(1)) };
  }
  const colon = raw.lastIndexOf(":");
  if (colon === -1) {
    return { host: "0.0.0.0", port: 8040 };
  }
  const hostPart = raw.slice(0, colon);
  const portPart = raw.slice(colon + 1);
  const host = hostPart.length === 0 ? "0.0.0.0" : hostPart;
  const port = Number(portPart);
  return { host, port: Number.isFinite(port) ? port : 8040 };
}

export function repoRootFromModule(moduleUrl: string): string {
  return fileURLToPath(new URL("../../..", moduleUrl));
}

function nowIso(): IsoTimestamp {
  const parsed = parseIsoTimestamp(new Date().toISOString());
  if (!parsed.ok) {
    throw new Error("clock produced a non-ISO timestamp");
  }
  return parsed.value;
}

function redactText(text: string, secrets: string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret.length === 0) {
      continue;
    }
    out = out.split(secret).join("[redacted]");
  }
  return out;
}

export function writeLog(input: {
  entry: LogEntry;
  secrets: string[];
  sink: (entry: LogEntry) => void;
}): LogEntry {
  const msg = redactText(String(input.entry.msg), input.secrets);
  const safe: LogEntry = { msg };
  for (const [key, value] of Object.entries(input.entry)) {
    if (key === "msg") {
      continue;
    }
    if (/key|token|authorization|secret|bearer|password/i.test(key)) {
      continue;
    }
    if (typeof value === "string") {
      safe[key] = redactText(value, input.secrets);
    } else {
      safe[key] = value;
    }
  }
  input.sink(safe);
  return safe;
}

export async function startGateway(options: GatewayOptions = {}): Promise<Gateway> {
  const listen = parseListen(options.listen);
  const repoRoot = repoRootFromModule(import.meta.url);
  const fixtureRoot = path.join(repoRoot, "fixtures/demo");
  const demo = options.demo === true;
  const coalesceMs = options.coalesceMs ?? COALESCE_MS;
  const multiplier = options.multiplier ?? DEFAULT_DEMO_MULTIPLIER;
  const secrets: string[] = [];
  const logs: LogEntry[] = [];
  const sink = (entry: LogEntry) => {
    logs.push(entry);
    if (options.log !== undefined) {
      options.log(entry);
    } else {
      process.stdout.write(`${JSON.stringify(entry)}\n`);
    }
  };
  const log = (entry: LogEntry) => {
    writeLog({ entry, secrets, sink });
  };

  let workRoot = options.data ?? process.env.AGENT_DATA;
  let tmpRoot: string | undefined;
  if (demo) {
    tmpRoot = await mkdtemp(path.join(os.tmpdir(), "lorien-stack-demo-"));
    workRoot = tmpRoot;
  }
  if (workRoot === undefined || workRoot.length === 0) {
    throw new Error("set --data, $AGENT_DATA, or --demo");
  }

  const abort = new AbortController();
  let roster: Roster = emptyRoster();
  const sockets = new Set<WebSocket>();
  const presence = resolvePresenceConfig({
    ...(options.presenceWorkMs !== undefined
      ? { workMs: options.presenceWorkMs }
      : {}),
    ...(options.presenceSleepMs !== undefined
      ? { sleepMs: options.presenceSleepMs }
      : {}),
    ...(options.presenceTickMs !== undefined
      ? { tickMs: options.presenceTickMs }
      : {}),
    env: process.env,
  });
  const clock: PresenceClock | undefined = demo ? undefined : createPresenceClock();
  let presenceTimer: ReturnType<typeof setInterval> | undefined;
  const lastDemoHints = new Map<BotId, PresenceHint>();

  function snapshotMessage(): GatewayMessage {
    const snapshot = toSnapshot({ roster, capturedAt: nowIso() });
    return { type: "snapshot", revision: roster.revision, snapshot };
  }

  function send(socket: WebSocket, message: GatewayMessage): void {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  function broadcast(message: GatewayMessage): void {
    for (const socket of sockets) {
      send(socket, message);
    }
  }

  function emitPresence(target: WebSocket | "all"): void {
    if (clock === undefined) {
      return;
    }
    const now = nowIso();
    const hints = collectPresenceHints({
      stamps: clock.stamps(),
      now,
      nowMs: Date.parse(now),
      workMs: presence.workMs,
      sleepMs: presence.sleepMs,
    });
    const bump = target === "all";
    for (const item of hints) {
      if (!roster.bots.has(item.botId)) {
        continue;
      }
      if (bump) {
        roster = advanceRevision(roster);
      }
      const message: GatewayMessage = {
        type: "presence",
        revision: roster.revision,
        botId: item.botId,
        hint: item.hint,
      };
      if (target === "all") {
        broadcast(message);
      } else {
        send(target, message);
      }
    }
  }

  function handleSpawn(bot: Parameters<typeof spawnBot>[1]): void {
    if (clock !== undefined) {
      clock.noteSpawn({ botId: bot.id, at: nowIso() });
    }
    roster = spawnBot(roster, bot);
    broadcast(snapshotMessage());
  }

  function handleGone(botId: BotId): void {
    if (clock !== undefined) {
      clock.noteGone(botId);
    }
    roster = goneBot(roster, botId);
    broadcast(snapshotMessage());
  }

  function handleEvents(events: ActivityEvent[]): void {
    if (clock !== undefined) {
      clock.noteEvents(events);
    }
    for (const event of events) {
      roster = advanceRevision(roster);
      broadcast({ type: "event", revision: roster.revision, event });
    }
  }

  function handleSleep(step: ReplaySleep): void {
    roster = advanceRevision(roster);
    const hint = presenceHintFromQuietClock({
      lastActivityAt: step.lastActivityAt,
      now: nowIso(),
      reason: PRESENCE_REASON_SLEEP,
    });
    lastDemoHints.set(step.botId, hint);
    broadcast({
      type: "presence",
      revision: roster.revision,
      botId: step.botId,
      hint,
    });
  }

  function emitDemoPresence(target: WebSocket): void {
    for (const [botId, hint] of lastDemoHints) {
      send(target, {
        type: "presence",
        revision: roster.revision,
        botId,
        hint,
      });
    }
  }

  const demoPlan = demo
    ? await loadReplayPlan({
        fixtureRoot,
        workRoot,
        multiplier,
        botCount: options.bots ?? DEFAULT_DEMO_BOTS,
        idle: options.replayIdle === true,
      })
    : undefined;
  if (demoPlan !== undefined) {
    await seedDemoWorkspace({ workRoot, bots: demoPlan.seed });
  }

  const tailer: Tailer = createTailer({
    root: workRoot,
    driver: grokDriver,
    coalesceMs,
    handlers: {
      onSpawn: handleSpawn,
      onGone: handleGone,
      onEvents: handleEvents,
    },
  });
  await tailer.tick();

  const server = createServer((req, res) => {
    handleHttp(req, res);
  });
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://gateway.local");
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws: WebSocket) => {
    sockets.add(ws);
    send(ws, snapshotMessage());
    emitPresence(ws);
    emitDemoPresence(ws);
    ws.on("close", () => {
      sockets.delete(ws);
    });
  });

  function json(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  }

  function handleHttp(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? "/", "http://gateway.local");
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      json(res, 200, { ok: true });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/bots") {
      const snapshot = toSnapshot({ roster, capturedAt: nowIso() });
      json(res, 200, { ...snapshot, revision: roster.revision });
      return;
    }
    json(res, 404, { error: "not found" });
  }

  await new Promise<void>((resolve) => {
    server.listen(listen.port, listen.host, () => {
      resolve();
    });
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("server address unavailable");
  }
  const boundHost = listen.host;
  const boundPort = address.port;
  log({
    msg: "gateway listening",
    host: boundHost,
    port: boundPort,
    listen: `${boundHost}:${boundPort}`,
    mode: demo ? "demo" : "live",
    botCount: roster.bots.size,
    driver: grokDriver.name,
  });

  tailer.start();
  if (clock !== undefined) {
    presenceTimer = setInterval(() => {
      emitPresence("all");
    }, presence.tickMs);
  }

  if (demoPlan !== undefined) {
    void (async () => {
      await runReplay({
        plan: demoPlan,
        signal: abort.signal,
        onSleep: handleSleep,
      });
      if (abort.signal.aborted) {
        return;
      }
      if (!demoPlan.loop) {
        log({ msg: "demo replay complete" });
      }
    })();
  }

  return {
    url: `http://${boundHost === "0.0.0.0" ? "127.0.0.1" : boundHost}:${boundPort}`,
    host: boundHost,
    port: boundPort,
    logs,
    getRoster() {
      return {
        snapshot: toSnapshot({ roster, capturedAt: nowIso() }),
        revision: roster.revision,
      };
    },
    async close() {
      abort.abort();
      if (presenceTimer !== undefined) {
        clearInterval(presenceTimer);
        presenceTimer = undefined;
      }
      tailer.stop();
      for (const socket of sockets) {
        socket.close();
      }
      await new Promise<void>((resolve, reject) => {
        wss.close();
        server.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
      if (tmpRoot !== undefined) {
        await rm(tmpRoot, { recursive: true, force: true });
      }
    },
  };
}

function requireFlagValue(flag: string, next: string | undefined): string {
  if (next === undefined || next.startsWith("-")) {
    throw new Error(`${flag} requires a value`);
  }
  return next;
}

function requireFiniteFlag(flag: string, raw: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${flag} requires a finite number`);
  }
  return value;
}

function requireBotCount(raw: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < DEMO_BOT_MIN || value > DEMO_BOT_MAX) {
    throw new Error("--bots must be an integer from 1 to 40");
  }
  return value;
}

function equalsValue(arg: string, flag: string): string {
  const value = arg.slice(`${flag}=`.length);
  if (value.length === 0) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

export function parseGatewayCli(argv: string[]): GatewayOptions {
  const options: GatewayOptions = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) {
      continue;
    }
    if (arg === "--demo") {
      options.demo = true;
      continue;
    }
    if (arg === "--replay-idle") {
      options.replayIdle = true;
      continue;
    }
    if (arg === "--bots") {
      options.bots = requireBotCount(requireFlagValue("--bots", argv[i + 1]));
      i += 1;
      continue;
    }
    if (arg.startsWith("--bots=")) {
      options.bots = requireBotCount(equalsValue(arg, "--bots"));
      continue;
    }
    if (arg === "--listen") {
      options.listen = requireFlagValue("--listen", argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--listen=")) {
      options.listen = equalsValue(arg, "--listen");
      continue;
    }
    if (arg === "--data") {
      options.data = requireFlagValue("--data", argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--multiplier") {
      options.multiplier = requireFiniteFlag(
        "--multiplier",
        requireFlagValue("--multiplier", argv[i + 1]),
      );
      i += 1;
      continue;
    }
    if (arg === "--coalesce-ms") {
      options.coalesceMs = requireFiniteFlag(
        "--coalesce-ms",
        requireFlagValue("--coalesce-ms", argv[i + 1]),
      );
      i += 1;
      continue;
    }
    if (arg === "--presence-work-ms") {
      options.presenceWorkMs = requireFiniteFlag(
        "--presence-work-ms",
        requireFlagValue("--presence-work-ms", argv[i + 1]),
      );
      i += 1;
      continue;
    }
    if (arg.startsWith("--presence-work-ms=")) {
      options.presenceWorkMs = requireFiniteFlag(
        "--presence-work-ms",
        equalsValue(arg, "--presence-work-ms"),
      );
      continue;
    }
    if (arg === "--presence-sleep-ms") {
      options.presenceSleepMs = requireFiniteFlag(
        "--presence-sleep-ms",
        requireFlagValue("--presence-sleep-ms", argv[i + 1]),
      );
      i += 1;
      continue;
    }
    if (arg.startsWith("--presence-sleep-ms=")) {
      options.presenceSleepMs = requireFiniteFlag(
        "--presence-sleep-ms",
        equalsValue(arg, "--presence-sleep-ms"),
      );
      continue;
    }
    if (arg === "--presence-tick-ms") {
      options.presenceTickMs = requireFiniteFlag(
        "--presence-tick-ms",
        requireFlagValue("--presence-tick-ms", argv[i + 1]),
      );
      i += 1;
      continue;
    }
    if (arg.startsWith("--presence-tick-ms=")) {
      options.presenceTickMs = requireFiniteFlag(
        "--presence-tick-ms",
        equalsValue(arg, "--presence-tick-ms"),
      );
      continue;
    }
    if (arg.startsWith("--")) {
      throw new Error(`unknown flag: ${arg}`);
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  if (options.demo === true && options.data !== undefined) {
    throw new Error("--data cannot be used with --demo");
  }
  if (options.multiplier !== undefined && options.demo !== true) {
    throw new Error("--multiplier requires --demo");
  }
  if (options.bots !== undefined && options.demo !== true) {
    throw new Error("--bots requires --demo");
  }
  if (options.replayIdle === true && options.demo !== true) {
    throw new Error("--replay-idle requires --demo");
  }
  if (options.demo === true && options.bots === undefined) {
    options.bots = DEFAULT_DEMO_BOTS;
  }
  return options;
}

function isMain(moduleUrl: string): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  return fileURLToPath(moduleUrl) === path.resolve(entry);
}

if (isMain(import.meta.url)) {
  Promise.resolve()
    .then(() => startGateway(parseGatewayCli(process.argv.slice(2))))
    .catch((error: unknown) => {
      const msg = error instanceof Error ? error.message : "gateway failed";
      process.stderr.write(`${JSON.stringify({ msg })}\n`);
      process.exitCode = 1;
    });
}
