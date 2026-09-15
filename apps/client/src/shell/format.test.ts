import assert from "node:assert/strict";
import { test } from "node:test";

import { ageLabel, countLabel, timeLabel } from "./format.ts";

// timeLabel renders local wall-clock time, so the expectations below only hold
// under a pinned zone. Node applies this before the first Date call in the process.
process.env.TZ = "UTC";

test("ageLabel picks one unit per magnitude", () => {
  const rows: [number | undefined, string][] = [
    [undefined, "\u2013"],
    [0, "now"],
    [4_999, "now"],
    [5_000, "5s"],
    [59_999, "59s"],
    [60_000, "1m"],
    [3_599_999, "59m"],
    [3_600_000, "1h"],
    [86_399_999, "23h"],
    [86_400_000, "1d"],
    [-10, "now"],
    [Number.NaN, "\u2013"],
  ];
  for (const [ageMs, expected] of rows) {
    assert.equal(ageLabel(ageMs), expected, `ageLabel(${String(ageMs)})`);
  }
});

test("timeLabel renders wall-clock seconds", () => {
  assert.equal(timeLabel("2026-09-15T22:41:07.000Z"), "22:41:07", "utc instant");
  assert.equal(timeLabel("2026-09-15T00:00:00.000Z"), "00:00:00", "midnight");
  assert.equal(timeLabel("not a timestamp"), "\u2013", "unparseable input");
});

test("countLabel never shows a negative or fractional count", () => {
  assert.equal(countLabel(0), "0", "zero");
  assert.equal(countLabel(41), "41", "integer");
  assert.equal(countLabel(2.4), "2", "rounds down");
  assert.equal(countLabel(2.6), "3", "rounds up");
  assert.equal(countLabel(-5), "0", "negative clamps");
  assert.equal(countLabel(Number.NaN), "0", "non-finite");
});
