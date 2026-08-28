import assert from "node:assert/strict";
import { createServer } from "node:http";
import { describe, it } from "node:test";

import { parseWakeRequest } from "@bot-space/contracts";

import { requestWake } from "./wake.ts";

const wake = parseWakeRequest({
  botId: "af4c6d21-9ef6-4435-8232-bf09ca561583",
  prompt: "ping",
});
assert.equal(wake.ok, true);
if (!wake.ok) {
  throw new Error("wake fixture");
}

describe("requestWake", () => {
  it("reports acknowledged on HTTP 200", async () => {
    const outcome = await requestWake({
      webhookUrl: "http://webhook.test/wake",
      senderKey: "super-secret-sender",
      request: wake.value,
      fetchImpl: async () => new Response("ok", { status: 200 }),
    });
    assert.equal(outcome.kind, "acknowledged");
  });

  it("reports failed on a non-200 status", async () => {
    const outcome = await requestWake({
      webhookUrl: "http://webhook.test/wake",
      senderKey: "super-secret-sender",
      request: wake.value,
      fetchImpl: async () => new Response("no", { status: 500 }),
    });
    assert.equal(outcome.kind, "failed");
    if (outcome.kind === "failed") {
      assert.equal(outcome.status, 500);
    }
  });

  it("reports indeterminate on timeout", async () => {
    const server = createServer((_req, res) => {
      setTimeout(() => {
        res.writeHead(200);
        res.end("late");
      }, 400);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        resolve();
      });
    });
    const address = server.address();
    assert.ok(address !== null && typeof address !== "string");
    try {
      const outcome = await requestWake({
        webhookUrl: `http://127.0.0.1:${address.port}/wake`,
        senderKey: "super-secret-sender",
        request: wake.value,
        timeoutMs: 50,
      });
      assert.equal(outcome.kind, "indeterminate");
      if (outcome.kind === "indeterminate") {
        assert.equal(outcome.reason, "timeout");
      }
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
    }
  });
});
