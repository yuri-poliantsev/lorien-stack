import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { rollingAverage } from "./frameBudget.ts";

describe("rollingAverage", () => {
  it("returns 0 for an empty window", () => {
    const avg = rollingAverage(2000);
    assert.equal(avg.count(), 0);
    assert.equal(avg.average(), 0);
  });

  it("evicts samples at or behind newestAtMs minus the 2000ms window", () => {
    const avg = rollingAverage(2000);
    avg.push(0, 10);
    avg.push(1000, 20);
    avg.push(1999, 30);
    avg.push(3000, 40);
    assert.equal(avg.count(), 2);
    assert.equal(avg.average(), 35);
  });
});
