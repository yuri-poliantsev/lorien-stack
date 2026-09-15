import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseGatewayCli, writeLog } from "./main.ts";

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

describe("parseGatewayCli demo roster", () => {
  it("defaults --bots to 8 when --demo is set", () => {
    assert.deepEqual(parseGatewayCli(["--demo"]), { demo: true, bots: 8 });
  });

  it("accepts --bots 1 and --bots=40 with demo", () => {
    assert.deepEqual(parseGatewayCli(["--demo", "--bots", "1"]), {
      demo: true,
      bots: 1,
    });
    assert.deepEqual(parseGatewayCli(["--demo", "--bots=40"]), {
      demo: true,
      bots: 40,
    });
  });

  it("parses --replay-idle with the default roster", () => {
    assert.deepEqual(parseGatewayCli(["--demo", "--replay-idle"]), {
      demo: true,
      bots: 8,
      replayIdle: true,
    });
  });

  it("rejects --bots outside 1..40, a non-integer, or without --demo", () => {
    assert.throws(
      () => parseGatewayCli(["--demo", "--bots", "0"]),
      /--bots must be an integer from 1 to 40/,
    );
    assert.throws(
      () => parseGatewayCli(["--demo", "--bots", "41"]),
      /--bots must be an integer from 1 to 40/,
    );
    assert.throws(
      () => parseGatewayCli(["--demo", "--bots", "8.5"]),
      /--bots must be an integer from 1 to 40/,
    );
    assert.throws(
      () => parseGatewayCli(["--bots", "8"]),
      /--bots requires --demo/,
    );
    assert.throws(
      () => parseGatewayCli(["--replay-idle"]),
      /--replay-idle requires --demo/,
    );
  });
});
