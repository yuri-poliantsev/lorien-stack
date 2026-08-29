import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile, appendFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { WebSocket } from "ws";

import {
  eventIdForJsonlLine,
  parseBotId,
  parseIsoTimestamp,
  type ActivityEvent,
  type BotId,
  type IsoTimestamp,
} from "@bot-space/contracts";

import { parseGatewayCli, startGateway } from "./main.ts";
import {
  collectPresenceHints,
  createPresenceClock,
  DEFAULT_PRESENCE_SLEEP_MS,
  DEFAULT_PRESENCE_TICK_MS,
  DEFAULT_PRESENCE_WORK_MS,
  PRESENCE_REASON_QUIET,
  PRESENCE_REASON_RECENT,
  PRESENCE_REASON_SLEEP,
  reasonFromQuietMs,
  resolvePresenceConfig,
} from "./presence.ts";

const lauren = "af4c6d21-9ef6-4435-8232-bf09ca561583";
const koji = "a77fae77-0494-4981-acf5-2de5bd793fe4";

const laurenId = parseBotId(lauren);
const kojiId = parseBotId(koji);
assert.equal(laurenId.ok, true);
assert.equal(kojiId.ok, true);
if (!laurenId.ok || !kojiId.ok) {
  throw new Error("fixture bot id");
}

const envKeys = [
  "GATEWAY_PRESENCE_WORK_MS",
  "GATEWAY_PRESENCE_SLEEP_MS",
  "GATEWAY_PRESENCE_TICK_MS",
] as const;

function iso(raw: string): IsoTimestamp {
  const parsed = parseIsoTimestamp(raw);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    throw new Error("timestamp");
  }
  return parsed.value;
}

function userEvent(input: {
  botId: BotId;
  at: IsoTimestamp;
  text: string;
  index: number;
}): ActivityEvent {
  return {
    id: eventIdForJsonlLine({ botId: input.botId, index: input.index }),
    botId: input.botId,
    at: input.at,
    role: "user",
    text: input.text,
  };
}

async function makeLiveRoot(ids: string[]): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "gateway-presence-"));
  for (const id of ids) {
    await mkdir(path.join(root, "agents", id), { recursive: true });
    await writeFile(
      path.join(root, "agents", id, "profile.json"),
      JSON.stringify({ id, name: id.slice(0, 8) }),
    );
    await mkdir(path.join(root, "agent-transcripts", id), { recursive: true });
    await writeFile(
      path.join(root, "agent-transcripts", id, "tape.jsonl"),
      `${JSON.stringify({
        role: "user",
        content: "hello",
        at: "2026-08-20T10:00:00.000Z",
      })}\n`,
    );
  }
  return root;
}

function presenceMessages(raw: unknown[]): Array<{
  botId: string;
  hint: { lastActivityAt: string; freshnessMs: number; reason: string };
}> {
  const out: Array<{
    botId: string;
    hint: { lastActivityAt: string; freshnessMs: number; reason: string };
  }> = [];
  for (const item of raw) {
    if (item === null || typeof item !== "object" || !("type" in item)) {
      continue;
    }
    if (item.type !== "presence") {
      continue;
    }
    if (!("botId" in item) || !("hint" in item)) {
      continue;
    }
    const hint = item.hint;
    if (hint === null || typeof hint !== "object") {
      continue;
    }
    if (
      !("lastActivityAt" in hint) ||
      !("freshnessMs" in hint) ||
      !("reason" in hint)
    ) {
      continue;
    }
    if (
      typeof item.botId !== "string" ||
      typeof hint.lastActivityAt !== "string" ||
      typeof hint.freshnessMs !== "number" ||
      typeof hint.reason !== "string"
    ) {
      continue;
    }
    out.push({
      botId: item.botId,
      hint: {
        lastActivityAt: hint.lastActivityAt,
        freshnessMs: hint.freshnessMs,
        reason: hint.reason,
      },
    });
  }
  return out;
}

async function waitFor(
  predicate: () => boolean,
  ms: number,
  label: string,
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > ms) {
      throw new Error(`timeout: ${label}`);
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 15);
    });
  }
}

function openWs(url: string): {
  messages: unknown[];
  close: () => void;
  ready: Promise<void>;
} {
  const messages: unknown[] = [];
  const ws = new WebSocket(`${url.replace("http", "ws")}/ws`);
  const ready = new Promise<void>((resolve, reject) => {
    ws.once("open", () => {
      resolve();
    });
    ws.once("error", reject);
  });
  ws.on("message", (raw) => {
    messages.push(JSON.parse(String(raw)));
  });
  return {
    messages,
    ready,
    close() {
      ws.close();
    },
  };
}

describe("quiet-clock thresholds", () => {
  it("maps freshness onto StarCraft-aligned recent, quiet, and sleep", () => {
    const workMs = DEFAULT_PRESENCE_WORK_MS;
    const sleepMs = DEFAULT_PRESENCE_SLEEP_MS;
    assert.equal(workMs, 12_000);
    assert.equal(sleepMs, 22_000);
    assert.equal(
      reasonFromQuietMs({ freshnessMs: 0, workMs, sleepMs }),
      PRESENCE_REASON_RECENT,
    );
    assert.equal(
      reasonFromQuietMs({ freshnessMs: workMs - 1, workMs, sleepMs }),
      PRESENCE_REASON_RECENT,
    );
    assert.equal(
      reasonFromQuietMs({ freshnessMs: workMs, workMs, sleepMs }),
      PRESENCE_REASON_QUIET,
    );
    assert.equal(
      reasonFromQuietMs({ freshnessMs: sleepMs - 1, workMs, sleepMs }),
      PRESENCE_REASON_QUIET,
    );
    assert.equal(
      reasonFromQuietMs({ freshnessMs: sleepMs, workMs, sleepMs }),
      PRESENCE_REASON_SLEEP,
    );
    for (const reason of [
      reasonFromQuietMs({ freshnessMs: 0, workMs, sleepMs }),
      reasonFromQuietMs({ freshnessMs: workMs, workMs, sleepMs }),
      reasonFromQuietMs({ freshnessMs: sleepMs, workMs, sleepMs }),
    ]) {
      assert.notEqual(reason, "idle");
      assert.notEqual(reason, "alive");
      assert.notEqual(reason, "dead");
      assert.notEqual(reason, "running");
    }
  });

  it("emits one hint per bot per tick, never two reasons in one collect", () => {
    const clock = createPresenceClock();
    const spawnAt = iso("2026-08-29T00:00:00.000Z");
    clock.noteSpawn({ botId: laurenId.value, at: spawnAt });
    clock.noteSpawn({ botId: kojiId.value, at: spawnAt });
    clock.noteEvents([
      userEvent({
        botId: laurenId.value,
        at: iso("2026-08-29T00:00:05.000Z"),
        text: "later",
        index: 0,
      }),
    ]);
    const now = iso("2026-08-29T00:00:10.000Z");
    const hints = collectPresenceHints({
      stamps: clock.stamps(),
      now,
      nowMs: Date.parse(now),
      workMs: 12_000,
      sleepMs: 22_000,
    });
    const ids = hints.map((item) => item.botId);
    assert.deepEqual([...ids].sort(), [koji, lauren].sort());
    assert.equal(new Set(ids).size, ids.length);
    for (const item of hints) {
      assert.equal(typeof item.hint.reason, "string");
      assert.equal(typeof item.hint.freshnessMs, "number");
      assert.equal(Number.isFinite(item.hint.freshnessMs), true);
    }
    const laurenHint = hints.find((item) => item.botId === laurenId.value);
    const kojiHint = hints.find((item) => item.botId === kojiId.value);
    assert.equal(laurenHint?.hint.lastActivityAt, "2026-08-29T00:00:05.000Z");
    assert.equal(laurenHint?.hint.freshnessMs, 5_000);
    assert.equal(laurenHint?.hint.reason, PRESENCE_REASON_RECENT);
    assert.equal(kojiHint?.hint.lastActivityAt, spawnAt);
    assert.equal(kojiHint?.hint.reason, PRESENCE_REASON_RECENT);
  });

  it("lets tape events replace spawn time even when the tape is older", () => {
    const clock = createPresenceClock();
    clock.noteSpawn({
      botId: laurenId.value,
      at: iso("2026-08-29T12:00:00.000Z"),
    });
    clock.noteEvents([
      userEvent({
        botId: laurenId.value,
        at: iso("2026-08-20T10:00:00.000Z"),
        text: "old tape",
        index: 0,
      }),
    ]);
    const stamp = clock.stamp(laurenId.value);
    assert.equal(stamp?.source, "event");
    assert.equal(stamp?.at, "2026-08-20T10:00:00.000Z");
  });

  it("drops a gone bot so later ticks omit that id", () => {
    const clock = createPresenceClock();
    clock.noteSpawn({
      botId: laurenId.value,
      at: iso("2026-08-29T00:00:00.000Z"),
    });
    clock.noteGone(laurenId.value);
    const now = iso("2026-08-29T00:00:01.000Z");
    const hints = collectPresenceHints({
      stamps: clock.stamps(),
      now,
      nowMs: Date.parse(now),
      workMs: 12_000,
      sleepMs: 22_000,
    });
    assert.equal(hints.length, 0);
  });
});

describe("presence config", () => {
  it("prefers flags, then env, then StarCraft defaults", () => {
    const defaults = resolvePresenceConfig({ env: {} });
    assert.equal(defaults.workMs, DEFAULT_PRESENCE_WORK_MS);
    assert.equal(defaults.sleepMs, DEFAULT_PRESENCE_SLEEP_MS);
    assert.equal(defaults.tickMs, DEFAULT_PRESENCE_TICK_MS);
    const fromEnv = resolvePresenceConfig({
      env: {
        GATEWAY_PRESENCE_WORK_MS: "50",
        GATEWAY_PRESENCE_SLEEP_MS: "80",
        GATEWAY_PRESENCE_TICK_MS: "20",
      },
    });
    assert.deepEqual(fromEnv, { workMs: 50, sleepMs: 80, tickMs: 20 });
    const fromFlags = resolvePresenceConfig({
      workMs: 9,
      sleepMs: 11,
      tickMs: 7,
      env: {
        GATEWAY_PRESENCE_WORK_MS: "50",
        GATEWAY_PRESENCE_SLEEP_MS: "80",
        GATEWAY_PRESENCE_TICK_MS: "20",
      },
    });
    assert.deepEqual(fromFlags, { workMs: 9, sleepMs: 11, tickMs: 7 });
  });

  it("parses presence threshold flags", () => {
    const cli = parseGatewayCli([
      "--presence-work-ms",
      "40",
      "--presence-sleep-ms=90",
      "--presence-tick-ms",
      "15",
    ]);
    assert.equal(cli.presenceWorkMs, 40);
    assert.equal(cli.presenceSleepMs, 90);
    assert.equal(cli.presenceTickMs, 15);
  });
});

describe("live presence emission", () => {
  const roots: string[] = [];
  const envPrev: Record<string, string | undefined> = {};

  before(() => {
    for (const key of envKeys) {
      envPrev[key] = process.env[key];
      delete process.env[key];
    }
  });

  after(async () => {
    for (const key of envKeys) {
      const value = envPrev[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  });

  it("sends a presence hint over WS with reason string and freshnessMs", async () => {
    const data = await makeLiveRoot([lauren]);
    roots.push(data);
    const gw = await startGateway({
      listen: "127.0.0.1:0",
      data,
      token: "presence-token",
      allowlist: [lauren],
      coalesceMs: 40,
      presenceWorkMs: 50,
      presenceSleepMs: 80,
      presenceTickMs: 40,
      log: () => undefined,
    });
    const sock = openWs(gw.url);
    try {
      await sock.ready;
      await waitFor(() => presenceMessages(sock.messages).length > 0, 1500, "presence");
      const first = presenceMessages(sock.messages)[0];
      assert.ok(first !== undefined);
      assert.equal(first.botId, lauren);
      assert.equal(typeof first.hint.reason, "string");
      assert.ok(first.hint.reason.length > 0);
      assert.equal(typeof first.hint.freshnessMs, "number");
      assert.equal(Number.isFinite(first.hint.freshnessMs), true);
      assert.equal(typeof first.hint.lastActivityAt, "string");
    } finally {
      sock.close();
      await gw.close();
    }
  });

  it("advances lastActivityAt after a new JSONL line", async () => {
    const data = await makeLiveRoot([lauren]);
    roots.push(data);
    const gw = await startGateway({
      listen: "127.0.0.1:0",
      data,
      token: "presence-token",
      allowlist: [lauren],
      coalesceMs: 40,
      presenceWorkMs: 50,
      presenceSleepMs: 80,
      presenceTickMs: 40,
      log: () => undefined,
    });
    const sock = openWs(gw.url);
    try {
      await sock.ready;
      await waitFor(() => presenceMessages(sock.messages).length > 0, 1500, "first presence");
      const before = presenceMessages(sock.messages).at(-1);
      assert.ok(before !== undefined);
      const laterAt = new Date().toISOString();
      await appendFile(
        path.join(data, "agent-transcripts", lauren, "tape.jsonl"),
        `${JSON.stringify({ role: "assistant", content: "ping", at: laterAt })}\n`,
      );
      await waitFor(() => {
        const last = presenceMessages(sock.messages).at(-1);
        return (
          last !== undefined &&
          Date.parse(last.hint.lastActivityAt) > Date.parse(before.hint.lastActivityAt)
        );
      }, 2000, "newer lastActivityAt");
      const after = presenceMessages(sock.messages).at(-1);
      assert.ok(after !== undefined);
      assert.ok(
        Date.parse(after.hint.lastActivityAt) > Date.parse(before.hint.lastActivityAt),
      );
    } finally {
      sock.close();
      await gw.close();
    }
  });

  it("stops emitting hints for a bot whose agent dir is gone", async () => {
    const data = await makeLiveRoot([lauren, koji]);
    roots.push(data);
    const gw = await startGateway({
      listen: "127.0.0.1:0",
      data,
      token: "presence-token",
      allowlist: "discovered",
      coalesceMs: 40,
      presenceWorkMs: 50,
      presenceSleepMs: 80,
      presenceTickMs: 40,
      log: () => undefined,
    });
    const sock = openWs(gw.url);
    try {
      await sock.ready;
      await waitFor(
        () => presenceMessages(sock.messages).some((item) => item.botId === lauren),
        1500,
        "lauren presence",
      );
      await rm(path.join(data, "agents", lauren), { recursive: true, force: true });
      await waitFor(() => {
        return sock.messages.some((item) => {
          if (item === null || typeof item !== "object" || !("type" in item)) {
            return false;
          }
          if (item.type !== "snapshot" || !("snapshot" in item)) {
            return false;
          }
          const snapshot = item.snapshot;
          if (snapshot === null || typeof snapshot !== "object" || !("bots" in snapshot)) {
            return false;
          }
          if (!Array.isArray(snapshot.bots)) {
            return false;
          }
          return snapshot.bots.every((bot) => {
            return (
              bot !== null &&
              typeof bot === "object" &&
              "id" in bot &&
              bot.id !== lauren
            );
          });
        });
      }, 2000, "gone snapshot");
      const afterGone = presenceMessages(sock.messages).length;
      await new Promise((resolve) => {
        setTimeout(resolve, 200);
      });
      const later = presenceMessages(sock.messages).slice(afterGone);
      assert.equal(
        later.some((item) => item.botId === lauren),
        false,
      );
      assert.equal(gw.getRoster().snapshot.bots.some((bot) => bot.id === koji), true);
    } finally {
      sock.close();
      await gw.close();
    }
  });

  it("keeps demo post-tape sleep and does not tick live reasons during replay", async () => {
    const gw = await startGateway({
      listen: "127.0.0.1:0",
      demo: true,
      coalesceMs: 20,
      multiplier: 50_000,
      presenceTickMs: 20,
      presenceWorkMs: 60_000,
      presenceSleepMs: 120_000,
      log: () => undefined,
    });
    const sock = openWs(gw.url);
    try {
      await sock.ready;
      await waitFor(
        () => gw.logs.some((entry) => entry.msg === "demo replay complete"),
        8000,
        "demo complete",
      );
      await waitFor(() => presenceMessages(sock.messages).length > 0, 2000, "demo sleep");
      const hints = presenceMessages(sock.messages);
      assert.ok(hints.length > 0);
      assert.equal(
        hints.every((item) => item.hint.reason === PRESENCE_REASON_SLEEP),
        true,
      );
      assert.equal(
        hints.some((item) => item.hint.reason === PRESENCE_REASON_RECENT),
        false,
      );
      assert.equal(gw.getRoster().snapshot.bots.length > 0, true);
    } finally {
      sock.close();
      await gw.close();
    }
  });
});

describe("presence tick cpu", () => {
  it("averages under 5ms per collect for eight idle bots", () => {
    const clock = createPresenceClock();
    const spawnAt = iso("2026-08-29T00:00:00.000Z");
    const ids = [
      "af4c6d21-9ef6-4435-8232-bf09ca561583",
      "a77fae77-0494-4981-acf5-2de5bd793fe4",
      "2b40667e-d345-4db1-bbf0-9b26b7f904e9",
      "15aafeb5-603a-4d4b-b25d-8bc5a5287fb9",
      "ae9531d3-ca13-43e2-92eb-3bf156010408",
      "97350d45-cace-4d40-8628-e8bece188dac",
      "7a330915-6d55-4b1c-8fab-80b899126fa0",
      "7820582a-8fe5-4ef5-8ba5-30bf7641f8cc",
    ];
    for (const id of ids) {
      const parsed = parseBotId(id);
      assert.equal(parsed.ok, true);
      if (!parsed.ok) {
        continue;
      }
      clock.noteSpawn({ botId: parsed.value, at: spawnAt });
    }
    const now = iso("2026-08-29T00:00:30.000Z");
    const nowMs = Date.parse(now);
    const stamps = clock.stamps();
    const ticks = 20_000;
    const started = process.cpuUsage();
    for (let i = 0; i < ticks; i += 1) {
      collectPresenceHints({
        stamps,
        now,
        nowMs,
        workMs: DEFAULT_PRESENCE_WORK_MS,
        sleepMs: DEFAULT_PRESENCE_SLEEP_MS,
      });
    }
    const cpu = process.cpuUsage(started);
    const cpuMs = (cpu.user + cpu.system) / 1000;
    const averageMs = cpuMs / ticks;
    assert.ok(
      averageMs < 5,
      `average ${String(averageMs)}ms over ${String(ticks)} ticks, cpu ${String(cpuMs)}ms`,
    );
  });
});
