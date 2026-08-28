import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import { startGateway, writeLog } from "./main.ts";

const allowlisted = "af4c6d21-9ef6-4435-8232-bf09ca561583";
const outsider = "00000000-0000-4000-8000-000000000000";

async function makeData(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "gateway-http-"));
  await mkdir(path.join(root, "agents", allowlisted), { recursive: true });
  await writeFile(
    path.join(root, "agents", allowlisted, "profile.json"),
    JSON.stringify({ id: allowlisted, name: "Lauren" }),
  );
  return root;
}

describe("gateway auth edge", () => {
  const roots: string[] = [];
  after(async () => {
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  });

  it("rejects POST /api/prompt without a token", async () => {
    const data = await makeData();
    roots.push(data);
    const gw = await startGateway({
      listen: "127.0.0.1:0",
      data,
      token: "edge-token",
      allowlist: [allowlisted],
      log: () => undefined,
    });
    try {
      const res = await fetch(`${gw.url}/api/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botId: allowlisted, prompt: "hi" }),
      });
      assert.equal(res.status, 401);
    } finally {
      await gw.close();
    }
  });

  it("rejects a non-allowlisted bot with 403", async () => {
    const data = await makeData();
    roots.push(data);
    const gw = await startGateway({
      listen: "127.0.0.1:0",
      data,
      token: "edge-token",
      allowlist: [allowlisted],
      log: () => undefined,
    });
    try {
      const res = await fetch(`${gw.url}/api/prompt`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer edge-token",
        },
        body: JSON.stringify({ botId: outsider, prompt: "hi" }),
      });
      assert.equal(res.status, 403);
    } finally {
      await gw.close();
    }
  });

  it("redacts sender keys from log records", () => {
    const captured: Array<{ msg: string; [k: string]: unknown }> = [];
    writeLog({
      entry: { msg: "wake with super-secret-sender", botId: allowlisted },
      secrets: ["super-secret-sender"],
      sink: (entry) => {
        captured.push(entry);
      },
    });
    assert.equal(captured[0]?.msg.includes("super-secret-sender"), false);
    assert.equal(captured[0]?.msg.includes("[redacted]"), true);
  });
});
