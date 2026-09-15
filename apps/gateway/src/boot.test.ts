import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { WebSocket } from "ws";

import { parseGatewayCli, startGateway } from "./main.ts";

const lauren = "af4c6d21-9ef6-4435-8232-bf09ca561583";

const envKeys = ["AGENT_DATA"] as const;

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

  it("starts live with only a data root", async () => {
    const data = await makeData([lauren]);
    roots.push(data);
    const gw = await startGateway({
      listen: "127.0.0.1:0",
      data,
      log: () => undefined,
    });
    try {
      const boot = gw.logs.find((entry) => entry.msg === "gateway listening");
      assert.equal(boot?.mode, "live");
      assert.equal(boot?.botCount, 1);
      assert.equal("allowlist" in (boot ?? {}), false);
      assert.equal("webhookConfigured" in (boot ?? {}), false);
      const health = await fetch(`${gw.url}/health`);
      assert.equal(health.status, 200);
      assert.deepEqual(await health.json(), { ok: true });
      const prompt = await fetch(`${gw.url}/api/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botId: lauren, prompt: "hi" }),
      });
      assert.equal(prompt.status, 404);
      assert.deepEqual(await prompt.json(), { error: "not found" });
    } finally {
      await gw.close();
    }
  });

  it("starts live from AGENT_DATA with no token in the environment", async () => {
    const data = await makeData([lauren]);
    roots.push(data);
    process.env.AGENT_DATA = data;
    const gw = await startGateway({
      listen: "127.0.0.1:0",
      log: () => undefined,
    });
    try {
      const boot = gw.logs.find((entry) => entry.msg === "gateway listening");
      assert.equal(boot?.mode, "live");
      const bots = await fetch(`${gw.url}/api/bots`);
      assert.equal(bots.status, 200);
    } finally {
      delete process.env.AGENT_DATA;
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

  it("demo --bots 1 seeds Ivo only", async () => {
    const gw = await startGateway({
      listen: "127.0.0.1:0",
      demo: true,
      bots: 1,
      replayIdle: true,
      coalesceMs: 60_000,
      log: () => undefined,
    });
    try {
      const snapshot = gw.getRoster().snapshot;
      assert.equal(snapshot.bots.length, 1);
      assert.equal(snapshot.bots[0]?.id, "15aafeb5-603a-4d4b-b25d-8bc5a5287fb9");
      assert.equal(snapshot.bots[0]?.name, "Ivo");
    } finally {
      await gw.close();
    }
  });

  it("rejects leftover CLI flags as unknown", () => {
    assert.throws(() => parseGatewayCli(["--token", "t"]), /unknown flag: --token/);
    assert.throws(
      () => parseGatewayCli(["--allowlist", "discovered"]),
      /unknown flag: --allowlist/,
    );
    assert.throws(
      () => parseGatewayCli(["--webhook-url", "http://example.test"]),
      /unknown flag: --webhook-url/,
    );
    assert.throws(
      () => parseGatewayCli([`--allowlist=${lauren}`]),
      /unknown flag: --allowlist=/,
    );
  });

  it("rejects --data with --demo and --multiplier without --demo", () => {
    assert.throws(
      () => parseGatewayCli(["--demo", "--data", "/tmp/agent-data"]),
      /--data cannot be used with --demo/,
    );
    assert.throws(
      () => parseGatewayCli(["--multiplier", "10"]),
      /--multiplier requires --demo/,
    );
  });

  it("serves /health and a WS snapshot", async () => {
    const data = await makeData([lauren]);
    roots.push(data);
    const gw = await startGateway({
      listen: "127.0.0.1:0",
      data,
      log: () => undefined,
    });
    try {
      const health = await fetch(`${gw.url}/health`);
      assert.equal(health.status, 200);
      const bots = await fetch(`${gw.url}/api/bots`);
      assert.equal(bots.status, 200);
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
