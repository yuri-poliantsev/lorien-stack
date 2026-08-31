import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";

import {
  parseIsoTimestamp,
  parseWakeRequest,
  presenceHintFromQuietClock,
  type ActivityEvent,
  type BotId,
  type IsoTimestamp,
  type PresenceHint,
  type RosterSnapshot,
} from "@lorien-stack/contracts";

import { authorizePrompt, extractBearerToken, type AuthConfig } from "./auth.ts";
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
import { requestWake } from "./wake.ts";
import {
  collectPresenceHints,
  createPresenceClock,
  PRESENCE_REASON_SLEEP,
  resolvePresenceConfig,
  type PresenceClock,
} from "./presence.ts";
import {
  DEFAULT_DEMO_MULTIPLIER,
  loadReplayPlan,
  runReplay,
  seedDemoWorkspace,
  type ReplaySleep,
} from "./replay.ts";

export const DEMO_CLIENT_TOKEN = "demo-token";

export const LIVE_TOKEN_REQUIRED_MSG =
  "live start requires GATEWAY_CLIENT_TOKEN or --token";

export type AllowlistMode = "empty" | "explicit" | "discovered";

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
  multiplier?: number;
  webhookUrl?: string;
  senderKey?: string;
  token?: string;
  allowlist?: readonly string[] | "discovered";
  coalesceMs?: number;
  wakeTimeoutMs?: number;
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

function emptyToUndefined(value: string | undefined): string | undefined {
  if (value === undefined || value.length === 0) {
    return undefined;
  }
  return value;
}

export function parseAllowlistArg(raw: string): "discovered" | string[] {
  const trimmed = raw.trim();
  if (trimmed === "discovered") {
    return "discovered";
  }
  return trimmed
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

export function resolveAllowlist(input: {
  option: GatewayOptions["allowlist"];
  env: string | undefined;
  demoIds: string[] | undefined;
}): { mode: AllowlistMode; ids: string[] } {
  if (input.option === "discovered") {
    return { mode: "discovered", ids: [] };
  }
  if (input.option !== undefined) {
    return input.option.length === 0
      ? { mode: "empty", ids: [] }
      : { mode: "explicit", ids: [...input.option] };
  }
  if (input.env !== undefined && input.env.trim().length > 0) {
    const parsed = parseAllowlistArg(input.env);
    if (parsed === "discovered") {
      return { mode: "discovered", ids: [] };
    }
    if (parsed.length > 0) {
      return { mode: "explicit", ids: parsed };
    }
  }
  if (input.demoIds !== undefined && input.demoIds.length > 0) {
    return { mode: "explicit", ids: input.demoIds };
  }
  return { mode: "empty", ids: [] };
}

export async function startGateway(options: GatewayOptions = {}): Promise<Gateway> {
  const listen = parseListen(options.listen);
  const repoRoot = repoRootFromModule(import.meta.url);
  const fixtureRoot = path.join(repoRoot, "fixtures/demo");
  const demo = options.demo === true;
  const coalesceMs = options.coalesceMs ?? COALESCE_MS;
  const multiplier = options.multiplier ?? DEFAULT_DEMO_MULTIPLIER;
  const token =
    options.token !== undefined
      ? options.token
      : (emptyToUndefined(process.env.GATEWAY_CLIENT_TOKEN) ??
        (demo ? DEMO_CLIENT_TOKEN : ""));
  if (!demo && token.length === 0) {
    throw new Error(LIVE_TOKEN_REQUIRED_MSG);
  }
  const senderKey = options.senderKey ?? process.env.WEBHOOK_SENDER_KEY ?? "";
  const secrets = [senderKey, token].filter((value) => value.length > 0);
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
    broadcast({
      type: "presence",
      revision: roster.revision,
      botId: step.botId,
      hint,
    });
  }

  const demoPlan = demo
    ? await loadReplayPlan({
        fixtureRoot,
        workRoot,
        multiplier,
      })
    : undefined;
  if (demoPlan !== undefined) {
    await seedDemoWorkspace({ fixtureRoot, workRoot, bots: demoPlan.bots });
  }

  const allowlist = resolveAllowlist({
    option: options.allowlist,
    env: process.env.GATEWAY_ALLOWLIST,
    demoIds: demoPlan === undefined ? undefined : demoPlan.bots.map((bot) => bot.id),
  });
  const allowlistedBotIds = new Set<string>(
    allowlist.mode === "discovered" ? [] : allowlist.ids,
  );
  const auth: AuthConfig = {
    clientToken: token,
    allowlistedBotIds,
  };
  const webhookUrl = options.webhookUrl ?? process.env.WEBHOOK_URL;

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
  if (allowlist.mode === "discovered") {
    for (const id of roster.bots.keys()) {
      allowlistedBotIds.add(id);
    }
  }

  const server = createServer((req, res) => {
    void handleHttp(req, res);
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
    ws.on("close", () => {
      sockets.delete(ws);
    });
  });

  async function readBody(req: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString("utf8");
  }

  function json(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  }

  async function handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
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
    if (req.method === "POST" && url.pathname === "/api/prompt") {
      let parsedBody: unknown;
      try {
        const raw = await readBody(req);
        parsedBody = raw.length === 0 ? {} : (JSON.parse(raw) as unknown);
      } catch {
        json(res, 400, { error: "invalid json" });
        return;
      }
      const wake = parseWakeRequest(parsedBody);
      if (!wake.ok) {
        json(res, 400, { error: wake.error });
        return;
      }
      const headerToken =
        extractBearerToken(header(req, "authorization")) ?? header(req, "x-gateway-token");
      const authz = authorizePrompt({
        token: headerToken,
        botId: wake.value.botId,
        config: auth,
      });
      if (!authz.ok) {
        json(res, authz.status, { error: authz.error });
        return;
      }
      if (webhookUrl === undefined || webhookUrl.length === 0 || senderKey.length === 0) {
        log({ msg: "wake failed", botId: authz.botId, outcome: "failed", reason: "not configured" });
        json(res, 503, { outcome: "failed" });
        return;
      }
      const wakeInput = {
        webhookUrl,
        senderKey,
        request: wake.value,
        ...(options.wakeTimeoutMs !== undefined ? { timeoutMs: options.wakeTimeoutMs } : {}),
      };
      const outcome = await requestWake(wakeInput);
      if (outcome.kind === "acknowledged") {
        log({ msg: "wake acknowledged", botId: authz.botId, outcome: "acknowledged" });
        json(res, 200, { outcome: "acknowledged" });
        return;
      }
      if (outcome.kind === "failed") {
        log({
          msg: "wake failed",
          botId: authz.botId,
          outcome: "failed",
          status: outcome.status,
        });
        json(res, 502, { outcome: "failed" });
        return;
      }
      log({
        msg: "wake indeterminate",
        botId: authz.botId,
        outcome: "indeterminate",
        reason: outcome.reason,
      });
      json(res, 504, { outcome: "indeterminate" });
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
    allowlist: allowlist.mode,
    webhookConfigured:
      webhookUrl !== undefined && webhookUrl.length > 0 && senderKey.length > 0,
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
        onSleep: () => undefined,
      });
      if (abort.signal.aborted) {
        return;
      }
      await new Promise((resolve) => {
        setTimeout(resolve, coalesceMs * 2);
      });
      if (abort.signal.aborted) {
        return;
      }
      for (const step of demoPlan.steps) {
        if (step.kind === "sleep") {
          handleSleep(step);
        }
      }
      log({ msg: "demo replay complete" });
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

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export function parseGatewayCli(argv: string[]): GatewayOptions {
  const options: GatewayOptions = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--demo") {
      options.demo = true;
      continue;
    }
    if (arg === "--listen" && next !== undefined) {
      options.listen = next;
      i += 1;
      continue;
    }
    if (arg !== undefined && arg.startsWith("--listen=")) {
      options.listen = arg.slice("--listen=".length);
      continue;
    }
    if (arg === "--data" && next !== undefined) {
      options.data = next;
      i += 1;
      continue;
    }
    if (arg === "--multiplier" && next !== undefined) {
      options.multiplier = Number(next);
      i += 1;
      continue;
    }
    if (arg === "--webhook-url" && next !== undefined) {
      options.webhookUrl = next;
      i += 1;
      continue;
    }
    if (arg === "--token" && next !== undefined) {
      options.token = next;
      i += 1;
      continue;
    }
    if (arg === "--allowlist" && next !== undefined) {
      options.allowlist = parseAllowlistArg(next);
      i += 1;
      continue;
    }
    if (arg !== undefined && arg.startsWith("--allowlist=")) {
      options.allowlist = parseAllowlistArg(arg.slice("--allowlist=".length));
      continue;
    }
    if (arg === "--coalesce-ms" && next !== undefined) {
      options.coalesceMs = Number(next);
      i += 1;
      continue;
    }
    if (arg === "--presence-work-ms" && next !== undefined) {
      options.presenceWorkMs = Number(next);
      i += 1;
      continue;
    }
    if (arg !== undefined && arg.startsWith("--presence-work-ms=")) {
      options.presenceWorkMs = Number(arg.slice("--presence-work-ms=".length));
      continue;
    }
    if (arg === "--presence-sleep-ms" && next !== undefined) {
      options.presenceSleepMs = Number(next);
      i += 1;
      continue;
    }
    if (arg !== undefined && arg.startsWith("--presence-sleep-ms=")) {
      options.presenceSleepMs = Number(arg.slice("--presence-sleep-ms=".length));
      continue;
    }
    if (arg === "--presence-tick-ms" && next !== undefined) {
      options.presenceTickMs = Number(next);
      i += 1;
      continue;
    }
    if (arg !== undefined && arg.startsWith("--presence-tick-ms=")) {
      options.presenceTickMs = Number(arg.slice("--presence-tick-ms=".length));
      continue;
    }
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
  startGateway(parseGatewayCli(process.argv.slice(2))).catch((error: unknown) => {
    const msg = error instanceof Error ? error.message : "gateway failed";
    process.stderr.write(`${JSON.stringify({ msg })}\n`);
    process.exitCode = 1;
  });
}
