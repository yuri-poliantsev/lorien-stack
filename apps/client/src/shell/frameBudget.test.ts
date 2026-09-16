import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FRAME_BUDGET_MIN_SAMPLES,
  type FrameBudgetClock,
  rollingAverage,
  startFrameBudget,
} from "./frameBudget.ts";

// Frames land 100ms apart and alternate 7ms and 4ms of work, so once the window
// holds 20 of them the average is a fixed 5.50 and the reading is exact.
function fakeClock(): FrameBudgetClock & {
  pumpFrame(index: number): void;
  cancelled: number[];
} {
  let pending: ((timestamp: number) => void) | undefined;
  let handle = 0;
  let nowMs = 0;
  const cancelled: number[] = [];
  return {
    cancelled,
    requestAnimationFrame(callback) {
      pending = callback;
      handle += 1;
      return handle;
    },
    cancelAnimationFrame(id) {
      cancelled.push(id);
      pending = undefined;
    },
    now: () => nowMs,
    pumpFrame(index) {
      const callback = pending;
      assert.ok(callback !== undefined, `frame ${index} has no pending callback`);
      pending = undefined;
      nowMs = index * 100 + (index % 2 === 0 ? 4 : 7);
      callback(index * 100);
    },
  };
}

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

describe("startFrameBudget", () => {
  it("drops a stale reading on start and publishes nothing until the window fills", () => {
    const root = { dataset: { avgFrameMs: "9.99" } as DOMStringMap };
    const clock = fakeClock();

    const stop = startFrameBudget(root, clock);
    assert.equal(
      root.dataset.avgFrameMs,
      undefined,
      "the previous instrument's reading is gone before the first frame",
    );

    // 19 frames is 1.8s of wall clock, so the write interval has long passed and
    // the sample count is the only thing still holding the reading back.
    for (let index = 0; index < FRAME_BUDGET_MIN_SAMPLES - 1; index += 1) {
      clock.pumpFrame(index);
    }
    assert.equal(
      root.dataset.avgFrameMs,
      undefined,
      "one sample short of the window, nothing is published",
    );

    clock.pumpFrame(FRAME_BUDGET_MIN_SAMPLES - 1);
    assert.equal(root.dataset.avgFrameMs, "5.50");

    stop();
    assert.equal(root.dataset.avgFrameMs, undefined, "stopping takes the reading down with it");
    assert.deepEqual(clock.cancelled.length, 1, "stopping cancels the pending frame exactly once");
  });
});
