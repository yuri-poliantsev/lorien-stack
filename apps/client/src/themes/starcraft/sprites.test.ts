import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assetUrl } from "./sprites.ts";

describe("starcraft assetUrl", () => {
  it("joins a sprite name onto Vite's local and Pages bases", () => {
    assert.equal(assetUrl("hut", "/"), "/themes/starcraft/hut.png");
    assert.equal(assetUrl("vault", "/lorien-stack/"), "/lorien-stack/themes/starcraft/vault.png");
    assert.equal(assetUrl("ground", "/lorien-stack"), "/lorien-stack/themes/starcraft/ground.png");
  });
});
