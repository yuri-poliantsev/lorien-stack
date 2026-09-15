import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { writeLog } from "./main.ts";

const lauren = "af4c6d21-9ef6-4435-8232-bf09ca561583";

describe("gateway log redaction", () => {
  it("redacts configured secrets from log records", () => {
    const captured: Array<{ msg: string; [k: string]: unknown }> = [];
    writeLog({
      entry: { msg: "event with super-secret-sender", botId: lauren },
      secrets: ["super-secret-sender"],
      sink: (entry) => {
        captured.push(entry);
      },
    });
    assert.equal(captured[0]?.msg.includes("super-secret-sender"), false);
    assert.equal(captured[0]?.msg.includes("[redacted]"), true);
  });
});
