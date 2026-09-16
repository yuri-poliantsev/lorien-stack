import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assetUrl } from "./sprites.ts";

describe("lorien assetUrl", () => {
  it("joins a sprite name onto Vite's local and Pages bases", () => {
    assert.equal(assetUrl("trunks-far", "/"), "/themes/lorien/trunks-far.png");
    assert.equal(
      assetUrl("canopy-mid", "/lorien-stack/"),
      "/lorien-stack/themes/lorien/canopy-mid.png",
    );
    assert.equal(
      assetUrl("branches-near", "/lorien-stack"),
      "/lorien-stack/themes/lorien/branches-near.png",
    );
  });
});
