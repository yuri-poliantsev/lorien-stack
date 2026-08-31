import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  eventIdForJsonlLine,
  parseBotId,
  parseIsoTimestamp,
  type ActivityEvent,
} from "@lorien-stack/contracts";

import { MAX_ABS_PATH_CHARS, summarizeEvent } from "./safeSnippet.ts";

const botId = parseBotId("af4c6d21-9ef6-4435-8232-bf09ca561583");
const at = parseIsoTimestamp("2026-08-27T09:00:02.000Z");
assert.equal(botId.ok, true);
assert.equal(at.ok, true);
if (!botId.ok || !at.ok) {
  throw new Error("fixture");
}

describe("safe snippets", () => {
  it("summarizes a tool row without dumping the payload", () => {
    const event: ActivityEvent = {
      id: eventIdForJsonlLine({ botId: botId.value, index: 2 }),
      botId: botId.value,
      at: at.value,
      role: "tool",
      toolName: "read_file",
      text: JSON.stringify({
        path: "/opt/cursor/agents/very/long/absolute/host/path/to/secret.ts",
        bytes: 120000,
        content: "function leak() { return process.env.WEBHOOK_SENDER_KEY }",
      }),
    };
    const row = summarizeEvent(event);
    assert.equal(row.role, "tool");
    assert.equal(row.toolName, "read_file");
    assert.equal(row.snippet.includes("/opt/cursor/agents/very/long/absolute"), false);
    assert.equal(row.snippet.includes("WEBHOOK_SENDER_KEY"), false);
    const longs = (row.snippet.match(
      /(?:\/(?:home|opt|usr|var|tmp|Users|root|workspace)\/[^\s"'<>]{20,})/g,
    ) ?? []).filter((match) => match.length > MAX_ABS_PATH_CHARS);
    assert.deepEqual(longs, []);
  });
});
