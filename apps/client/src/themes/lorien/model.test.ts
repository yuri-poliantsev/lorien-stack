import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  actionProp,
  eventSignature,
  inSceneLabel,
  mixHex,
  poseFromPulse,
  shortPath,
  skyFromClock,
} from "./model.ts";

describe("lorien pose", () => {
  it("lights the lantern while the pulse is fresh and puts it out at 22 seconds", () => {
    assert.equal(poseFromPulse({ eventCount: 2, msSincePulse: 0 }), "working");
    assert.equal(poseFromPulse({ eventCount: 2, msSincePulse: 11_999 }), "working");
    assert.equal(poseFromPulse({ eventCount: 2, msSincePulse: 12_000 }), "idle");
    assert.equal(poseFromPulse({ eventCount: 2, msSincePulse: 21_999 }), "idle");
    assert.equal(poseFromPulse({ eventCount: 2, msSincePulse: 22_000 }), "sleeping");
  });

  it("holds a bot we have never heard from as idle, not as working", () => {
    assert.equal(poseFromPulse({ eventCount: 0, msSincePulse: 0 }), "idle");
    assert.equal(poseFromPulse({ eventCount: 0, msSincePulse: 21_999 }), "idle");
    assert.equal(poseFromPulse({ eventCount: 0, msSincePulse: 22_000 }), "sleeping");
  });

  it("changes signature when an event lands so the pulse restarts", () => {
    assert.equal(eventSignature(undefined), "0");
    assert.equal(eventSignature([]), "0");
  });
});

describe("lorien in-scene label", () => {
  it("prints the state word in capitals, then action and path, for a working flet", () => {
    assert.equal(
      inSceneLabel({ pose: "working", action: "reading", path: "apps/gateway/src/presence.ts" }),
      "WORKING \u00b7 reading \u00b7 apps/gateway/src/presence.ts",
    );
    assert.equal(
      inSceneLabel({ pose: "working", action: "shell", path: undefined }),
      "WORKING \u00b7 shell",
    );
    assert.equal(
      inSceneLabel({ pose: "working", action: "unknown", path: undefined }),
      "WORKING \u00b7 unknown",
    );
  });

  it("left-ellipsises a long path down to its trailing directories", () => {
    assert.equal(shortPath("src/a.ts"), "src/a.ts");
    assert.equal(
      shortPath("apps/client/src/themes/lorien/layout.ts"),
      "\u2026src/themes/lorien/layout.ts",
    );
    assert.equal(shortPath("apps/client/src/themes/lorien/layout.ts", 14), "\u2026layout.ts");
    assert.equal(
      shortPath("a/averyveryverylongfilename.ts", 12),
      "\u2026filename.ts",
      "a single segment longer than the budget keeps its tail",
    );
    assert.equal(
      inSceneLabel({
        pose: "working",
        action: "writing",
        path: "packages/contracts/src/schemas/activity-event.ts",
      }),
      "WORKING \u00b7 writing \u00b7 \u2026schemas/activity-event.ts",
    );
  });

  it("spends no action word on an idle or sleeping flet", () => {
    assert.equal(inSceneLabel({ pose: "idle", action: "reading", path: "a/b.ts" }), "IDLE");
    assert.equal(inSceneLabel({ pose: "sleeping", action: "writing", path: "a/b.ts" }), "SLEEPING");
  });

  it("gives every action word its own prop", () => {
    assert.equal(actionProp("reading"), "scroll");
    assert.equal(actionProp("writing"), "quill");
    assert.equal(actionProp("shell"), "forge");
    assert.equal(actionProp("talking"), "speech");
    assert.equal(actionProp("thinking"), "gaze");
    assert.equal(actionProp("unknown"), "token");
  });
});

describe("lorien sky clock", () => {
  const DUSK = {
    name: "dusk",
    zenith: "#1c4a58",
    mid: "#4a3a68",
    horizon: "#163848",
    ambient: 0.55,
  };

  it("holds night until five and reaches the concept's dusk at eight in the evening", () => {
    assert.deepEqual(skyFromClock({ minutes: 0, reducedMotion: false }), {
      name: "night",
      zenith: "#102838",
      mid: "#243050",
      horizon: "#12283c",
      ambient: 0.4,
    });
    assert.equal(skyFromClock({ minutes: 4 * 60 + 59, reducedMotion: false }).zenith, "#102838");
    assert.deepEqual(skyFromClock({ minutes: 20 * 60, reducedMotion: false }), DUSK);
    assert.equal(skyFromClock({ minutes: 12 * 60, reducedMotion: false }).name, "day");
    assert.equal(skyFromClock({ minutes: 12 * 60, reducedMotion: false }).ambient, 0.95);
  });

  it("blends between the phases that bracket the clock", () => {
    assert.deepEqual(skyFromClock({ minutes: 6 * 60, reducedMotion: false }), {
      name: "dawn",
      zenith: "#253850",
      mid: "#574554",
      horizon: "#1e3446",
      ambient: 0.49,
    });
    assert.equal(
      skyFromClock({ minutes: 23 * 60, reducedMotion: false }).name,
      "night",
      "eleven at night reads as night, not dusk",
    );
    assert.deepEqual(
      skyFromClock({ minutes: 1440, reducedMotion: false }),
      skyFromClock({ minutes: 0, reducedMotion: false }),
      "the cycle wraps at midnight",
    );
  });

  it("pins the sky to dusk under reduced motion whatever the clock says", () => {
    assert.deepEqual(skyFromClock({ minutes: 0, reducedMotion: true }), DUSK);
    assert.deepEqual(skyFromClock({ minutes: 12 * 60, reducedMotion: true }), DUSK);
  });

  it("mixes two colours by weight", () => {
    assert.equal(mixHex("#000000", "#ffffff", 0), "#000000");
    assert.equal(mixHex("#000000", "#ffffff", 1), "#ffffff");
    assert.equal(mixHex("#000000", "#ffffff", 0.5), "#808080");
    assert.equal(mixHex("#000000", "#ffffff", 2), "#ffffff", "weight clamps at one");
  });
});
