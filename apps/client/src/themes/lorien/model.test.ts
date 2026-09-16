import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { actionProp, eventSignature, inSceneLabel, mixHex, poseFromPulse, skyAt } from "./model.ts";

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
  it("prints pose, action and path for a working flet", () => {
    assert.equal(
      inSceneLabel({ pose: "working", action: "reading", path: "apps/gateway/src/presence.ts" }),
      "working \u00b7 reading \u00b7 apps/gateway/src/presence.ts",
    );
    assert.equal(
      inSceneLabel({ pose: "working", action: "shell", path: undefined }),
      "working \u00b7 shell",
    );
    assert.equal(
      inSceneLabel({ pose: "working", action: "unknown", path: undefined }),
      "working \u00b7 unknown",
    );
  });

  it("spends no action word on an idle or sleeping flet", () => {
    assert.equal(inSceneLabel({ pose: "idle", action: "reading", path: "a/b.ts" }), "idle");
    assert.equal(inSceneLabel({ pose: "sleeping", action: "writing", path: "a/b.ts" }), "asleep");
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
  it("lands exactly on an anchor palette at that anchor's hour", () => {
    assert.deepEqual(skyAt(0), {
      name: "night",
      zenith: "#08131d",
      mid: "#15243a",
      horizon: "#0d1c26",
      ambient: 0.4,
    });
    assert.deepEqual(skyAt(19), {
      name: "dusk",
      zenith: "#1d4350",
      mid: "#5c4468",
      horizon: "#1b3b48",
      ambient: 0.55,
    });
    assert.equal(skyAt(12.5).name, "day");
    assert.equal(skyAt(12.5).ambient, 0.95);
  });

  it("blends between the two anchors that bracket the clock", () => {
    assert.deepEqual(skyAt(3.25), {
      name: "dawn",
      zenith: "#162a3d",
      mid: "#484760",
      horizon: "#6b5748",
      ambient: 0.5,
    });
    assert.equal(skyAt(21.5).name, "night", "half past nine reads as night, not dusk");
    assert.deepEqual(skyAt(24), skyAt(0), "the cycle wraps at midnight");
  });

  it("mixes two colours by weight", () => {
    assert.equal(mixHex("#000000", "#ffffff", 0), "#000000");
    assert.equal(mixHex("#000000", "#ffffff", 1), "#ffffff");
    assert.equal(mixHex("#000000", "#ffffff", 0.5), "#808080");
    assert.equal(mixHex("#000000", "#ffffff", 2), "#ffffff", "weight clamps at one");
  });
});
