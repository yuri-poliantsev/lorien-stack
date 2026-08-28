import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CONTRACTS_SCHEMA_VERSION, parseBotId } from "@bot-space/contracts";

import { gatewayWsUrl, parseGatewayMessage } from "./ws.ts";

const botId = parseBotId("af4c6d21-9ef6-4435-8232-bf09ca561583");
assert.equal(botId.ok, true);
if (!botId.ok) {
  throw new Error("botId");
}

describe("parseGatewayMessage", () => {
  it("accepts a snapshot payload", () => {
    const parsed = parseGatewayMessage({
      type: "snapshot",
      revision: 1,
      snapshot: {
        schemaVersion: CONTRACTS_SCHEMA_VERSION,
        capturedAt: "2026-08-27T09:00:00.000Z",
        bots: [{ id: botId.value, name: "Lauren" }],
      },
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) {
      return;
    }
    assert.equal(parsed.value.type, "snapshot");
    if (parsed.value.type === "snapshot") {
      assert.equal(parsed.value.snapshot.bots[0]?.name, "Lauren");
    }
  });

  it("accepts an event delta", () => {
    const parsed = parseGatewayMessage({
      type: "event",
      revision: 2,
      event: {
        id: "e1",
        botId: botId.value,
        at: "2026-08-27T09:00:01.000Z",
        role: "tool",
        toolName: "grep",
        text: "export type",
      },
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) {
      return;
    }
    assert.equal(parsed.value.type, "event");
  });

  it("rejects an unknown type", () => {
    const parsed = parseGatewayMessage({ type: "chat", revision: 1 });
    assert.equal(parsed.ok, false);
  });
});

describe("gatewayWsUrl", () => {
  it("uses ws on http pages", () => {
    assert.equal(
      gatewayWsUrl({ protocol: "http:", host: "127.0.0.1:5173" }),
      "ws://127.0.0.1:5173/ws",
    );
  });
});
