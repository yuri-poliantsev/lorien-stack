import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { WebSocket } from "ws";

import {
  LIVE_TOKEN_REQUIRED_MSG,
  parseAllowlistArg,
  parseGatewayCli,
  resolveAllowlist,
  startGateway,
} from "./main.ts";

const lauren = "af4c6d21-9ef6-4435-8232-bf09ca561583";
const koji = "a77fae77-0494-4981-acf5-2de5bd793fe4";
const outsider = "00000000-0000-4000-8000-000000000000";
const senderKey = "super-secret-sender-key";

const envKeys = [
  "GATEWAY_CLIENT_TOKEN",
  "GATEWAY_ALLOWLIST",
  "WEBHOOK_URL",
  "WEBHOOK_SENDER_KEY",
  "AGENT_DATA",
] as const;

const envPrev: Record<string, string | undefined> = {};

async function makeData(ids: string[]): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "gateway-boot-"));
  for (const id of ids) {
    await mkdir(path.join(root, "agents", id), { recursive: true });
    await writeFile(
      path.join(root, "agents", id, "profile.json"),
      JSON.stringify({ id, name: id.slice(0, 8) }),
    );
  }
  return root;
}

async function prompt(
  url: string,
  input: { botId: string; token?: string },
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (input.token !== undefined) {
    headers.Authorization = `Bearer ${input.token}`;
  }
  const res = await fetch(`${url}/api/prompt`, {
    method: "POST",
    headers,
    body: JSON.stringify({ botId: input.botId, prompt: "hi" }),
  });
  return { status: res.status, body: await res.json() };
}

describe("gateway boot", () => {
  const roots: string[] = [];

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

  it("refuses live start when the client token is empty", async () => {
    const data = await makeData([lauren]);
    roots.push(data);
    await assert.rejects(
      () =>
        startGateway({
          listen: "127.0.0.1:0",
          data,
          log: () => undefined,
        }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, LIVE_TOKEN_REQUIRED_MSG);
        assert.match(error.message, /token/i);
        return true;
      },
    );
  });

  it("allowlists every bot from the first roster scan in discovered mode", async () => {
    const data = await makeData([lauren, koji]);
    roots.push(data);
    const gw = await startGateway({
      listen: "127.0.0.1:0",
      data,
      token: "boot-token",
      allowlist: "discovered",
      coalesceMs: 40,
      log: () => undefined,
    });
    try {
      const boot = gw.logs.find((entry) => entry.msg === "gateway listening");
      assert.equal(boot?.allowlist, "discovered");
      assert.equal(boot?.botCount, 2);
      assert.equal(boot?.mode, "live");
      const laurenWake = await prompt(gw.url, { botId: lauren, token: "boot-token" });
      assert.equal(laurenWake.status, 503);
      const kojiWake = await prompt(gw.url, { botId: koji, token: "boot-token" });
      assert.equal(kojiWake.status, 503);
      const outsiderWake = await prompt(gw.url, { botId: outsider, token: "boot-token" });
      assert.equal(outsiderWake.status, 403);
      await mkdir(path.join(data, "agents", outsider), { recursive: true });
      await writeFile(
        path.join(data, "agents", outsider, "profile.json"),
        JSON.stringify({ id: outsider, name: "Later" }),
      );
      await new Promise((resolve) => {
        setTimeout(resolve, 160);
      });
      const roster = await fetch(`${gw.url}/api/bots`);
      const body: unknown = await roster.json();
      assert.ok(body !== null && typeof body === "object" && "bots" in body);
      assert.ok(Array.isArray(body.bots));
      assert.equal(
        body.bots.some((bot) => {
          return (
            bot !== null &&
            typeof bot === "object" &&
            "id" in bot &&
            bot.id === outsider
          );
        }),
        true,
      );
      const laterWake = await prompt(gw.url, { botId: outsider, token: "boot-token" });
      assert.equal(laterWake.status, 403);
    } finally {
      await gw.close();
    }
  });

  it("keeps an explicit comma allowlist", async () => {
    const data = await makeData([lauren, koji]);
    roots.push(data);
    const gw = await startGateway({
      listen: "127.0.0.1:0",
      data,
      token: "boot-token",
      allowlist: [lauren],
      log: () => undefined,
    });
    try {
      const boot = gw.logs.find((entry) => entry.msg === "gateway listening");
      assert.equal(boot?.allowlist, "explicit");
      const listed = await prompt(gw.url, { botId: lauren, token: "boot-token" });
      assert.equal(listed.status, 503);
      const other = await prompt(gw.url, { botId: koji, token: "boot-token" });
      assert.equal(other.status, 403);
    } finally {
      await gw.close();
    }
  });

  it("wakes over HTTP against a local stub that returns 200 acknowledged", async () => {
    const data = await makeData([lauren]);
    roots.push(data);
    const stub = createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((resolve) => {
      stub.listen(0, "127.0.0.1", () => {
        resolve();
      });
    });
    const address = stub.address();
    assert.ok(address !== null && typeof address !== "string");
    const gw = await startGateway({
      listen: "127.0.0.1:0",
      data,
      token: "boot-token",
      allowlist: [lauren],
      webhookUrl: `http://127.0.0.1:${address.port}/wake`,
      senderKey,
      log: () => undefined,
    });
    try {
      const boot = gw.logs.find((entry) => entry.msg === "gateway listening");
      assert.equal(boot?.webhookConfigured, true);
      const dumped = JSON.stringify(gw.logs);
      assert.equal(dumped.includes(senderKey), false);
      const wake = await prompt(gw.url, { botId: lauren, token: "boot-token" });
      assert.equal(wake.status, 200);
      assert.deepEqual(wake.body, { outcome: "acknowledged" });
    } finally {
      await gw.close();
      await new Promise<void>((resolve, reject) => {
        stub.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
    }
  });

  it("reads GATEWAY_ALLOWLIST=discovered after the first scan", async () => {
    const data = await makeData([lauren]);
    roots.push(data);
    process.env.GATEWAY_ALLOWLIST = "discovered";
    process.env.WEBHOOK_SENDER_KEY = senderKey;
    const gw = await startGateway({
      listen: "127.0.0.1:0",
      data,
      token: "boot-token",
      log: () => undefined,
    });
    try {
      const boot = gw.logs.find((entry) => entry.msg === "gateway listening");
      assert.equal(boot?.allowlist, "discovered");
      assert.equal(JSON.stringify(gw.logs).includes(senderKey), false);
      const listed = await prompt(gw.url, { botId: lauren, token: "boot-token" });
      assert.equal(listed.status, 503);
    } finally {
      delete process.env.GATEWAY_ALLOWLIST;
      delete process.env.WEBHOOK_SENDER_KEY;
      await gw.close();
    }
  });

  it("demo still listens without a token flag", async () => {
    const gw = await startGateway({
      listen: "127.0.0.1:0",
      demo: true,
      coalesceMs: 60_000,
      log: () => undefined,
    });
    try {
      const health = await fetch(`${gw.url}/health`);
      assert.equal(health.status, 200);
      const boot = gw.logs.find((entry) => entry.msg === "gateway listening");
      assert.equal(boot?.mode, "demo");
    } finally {
      await gw.close();
    }
  });

  it("parses --allowlist discovered and GATEWAY_ALLOWLIST", () => {
    assert.equal(parseAllowlistArg("discovered"), "discovered");
    assert.deepEqual(parseAllowlistArg(`${lauren},${koji}`), [lauren, koji]);
    const cli = parseGatewayCli(["--allowlist", "discovered", "--token", "t"]);
    assert.equal(cli.allowlist, "discovered");
    assert.equal(cli.token, "t");
    const equals = parseGatewayCli([`--allowlist=${lauren},${koji}`]);
    assert.deepEqual(equals.allowlist, [lauren, koji]);
    assert.equal(
      resolveAllowlist({ option: undefined, env: "discovered", demoIds: undefined }).mode,
      "discovered",
    );
    assert.deepEqual(
      resolveAllowlist({ option: undefined, env: lauren, demoIds: undefined }),
      { mode: "explicit", ids: [lauren] },
    );
    assert.equal(
      resolveAllowlist({ option: undefined, env: undefined, demoIds: undefined }).mode,
      "empty",
    );
  });

  it("serves /health and a WS snapshot without a token", async () => {
    const data = await makeData([lauren]);
    roots.push(data);
    const gw = await startGateway({
      listen: "127.0.0.1:0",
      data,
      token: "boot-token",
      allowlist: [],
      log: () => undefined,
    });
    try {
      const health = await fetch(`${gw.url}/health`);
      assert.equal(health.status, 200);
      const bots = await fetch(`${gw.url}/api/bots`);
      assert.equal(bots.status, 200);
      const denied = await prompt(gw.url, { botId: lauren, token: "boot-token" });
      assert.equal(denied.status, 403);
      const ws = new WebSocket(`${gw.url.replace("http", "ws")}/ws`);
      const first: unknown = await new Promise((resolve, reject) => {
        ws.once("message", (raw) => {
          resolve(JSON.parse(String(raw)));
        });
        ws.once("error", reject);
      });
      ws.close();
      assert.ok(first !== null && typeof first === "object" && "type" in first);
      assert.equal(first.type, "snapshot");
    } finally {
      await gw.close();
    }
  });
});
