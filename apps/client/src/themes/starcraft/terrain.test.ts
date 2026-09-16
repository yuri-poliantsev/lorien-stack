import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { kindFor, propFor } from "./building.ts";
import { skyTint } from "./terrain.ts";

describe("starcraft clock tint", () => {
  it("is a deep blue wash at midnight", () => {
    assert.equal(skyTint(0), "rgba(18, 28, 62, 0.460)");
  });

  it("is almost clear at mid-morning", () => {
    assert.equal(skyTint(9), "rgba(255, 240, 198, 0.060)");
  });

  it("is a warm low sun at dusk", () => {
    assert.equal(skyTint(19), "rgba(178, 82, 42, 0.270)");
  });

  it("interpolates between stops rather than stepping", () => {
    assert.equal(skyTint(7.5), "rgba(176, 151, 128, 0.160)");
  });

  it("clamps an hour outside the day", () => {
    assert.equal(skyTint(-4), skyTint(0));
    assert.equal(skyTint(99), skyTint(24));
  });
});

describe("starcraft building variants", () => {
  it("splits a mixed roster across both shells so a full grid is not uniform", () => {
    const ids = Array.from({ length: 40 }, (_, i) => `bot-${String(i)}`);
    const huts = ids.filter((id) => kindFor(id) === "hut").length;
    assert.ok(huts > 8, "some bots get the timber shell");
    assert.ok(huts < 32, "some bots get the steel shell");
  });

  it("gives one id the same shell and roof prop every time", () => {
    assert.equal(kindFor("bot-7"), kindFor("bot-7"));
    assert.equal(propFor("bot-7"), propFor("bot-7"));
  });

  it("keeps roof props inside the four drawn variants", () => {
    for (let i = 0; i < 40; i += 1) {
      const prop = propFor(`bot-${String(i)}`);
      assert.ok(prop >= 0 && prop <= 3, `bot-${String(i)} has a drawable roof prop`);
    }
  });
});
