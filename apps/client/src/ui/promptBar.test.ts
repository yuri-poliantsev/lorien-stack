import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseBotId } from "@lorien-stack/contracts";

import { isPromptEnabled } from "./promptBar.ts";

const botId = parseBotId("af4c6d21-9ef6-4435-8232-bf09ca561583");
assert.equal(botId.ok, true);
if (!botId.ok) {
  throw new Error("botId");
}

describe("prompt bar enablement", () => {
  it("is disabled with no selection", () => {
    assert.equal(isPromptEnabled(undefined), false);
  });

  it("is enabled after a bot id is chosen", () => {
    assert.equal(isPromptEnabled(botId.value), true);
  });
});
