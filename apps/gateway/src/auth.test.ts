import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseBotId } from "@bot-space/contracts";

import { authorizePrompt, extractBearerToken } from "./auth.ts";

const botIdResult = parseBotId("af4c6d21-9ef6-4435-8232-bf09ca561583");
assert.equal(botIdResult.ok, true);
if (!botIdResult.ok) {
  throw new Error("fixture bot id");
}
const botId = botIdResult.value;
const otherResult = parseBotId("00000000-0000-4000-8000-000000000000");
assert.equal(otherResult.ok, true);
if (!otherResult.ok) {
  throw new Error("other bot id");
}
const otherId = otherResult.value;

const config = {
  clientToken: "secret-token",
  allowlistedBotIds: new Set([botId]),
};

describe("auth reject", () => {
  it("extracts a bearer token", () => {
    assert.equal(extractBearerToken("Bearer secret-token"), "secret-token");
    assert.equal(extractBearerToken("bearer secret-token"), "secret-token");
    assert.equal(extractBearerToken(undefined), undefined);
    assert.equal(extractBearerToken("Basic nope"), undefined);
  });

  it("rejects a missing token", () => {
    const result = authorizePrompt({ token: undefined, botId, config });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 401);
    }
  });

  it("rejects a wrong token", () => {
    const result = authorizePrompt({ token: "nope", botId, config });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 401);
    }
  });

  it("rejects a bot that is not allowlisted", () => {
    const result = authorizePrompt({ token: "secret-token", botId: otherId, config });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
    }
  });

  it("accepts a token plus an allowlisted bot", () => {
    const result = authorizePrompt({ token: "secret-token", botId, config });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.botId, botId);
    }
  });
});
