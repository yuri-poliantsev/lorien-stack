import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clampZoom,
  createCamera,
  fitState,
  screenToWorldAt,
  worldToScreenAt,
  zoomAtState,
} from "./camera.ts";

describe("fitState", () => {
  it("fits a 1600x900 world into an 800x600 viewport at zoom 0.5", () => {
    assert.deepEqual(fitState({ w: 800, h: 600 }, { w: 1600, h: 900 }), {
      x: 800,
      y: 450,
      zoom: 0.5,
    });
  });

  it("returns the identity camera when the viewport width is 0", () => {
    assert.deepEqual(fitState({ w: 0, h: 600 }, { w: 1600, h: 900 }), {
      x: 0,
      y: 0,
      zoom: 1,
    });
  });
});

describe("worldToScreenAt", () => {
  it("maps the camera centre to the viewport centre and the world origin to 0,75", () => {
    const state = { x: 800, y: 450, zoom: 0.5 };
    const viewport = { w: 800, h: 600 };
    assert.deepEqual(worldToScreenAt(state, viewport, { x: 800, y: 450 }), {
      x: 400,
      y: 300,
    });
    assert.deepEqual(worldToScreenAt(state, viewport, { x: 0, y: 0 }), {
      x: 0,
      y: 75,
    });
  });
});

describe("screenToWorldAt", () => {
  it("round-trips worldToScreenAt for a non-centre point", () => {
    const state = { x: 800, y: 450, zoom: 0.5 };
    const viewport = { w: 800, h: 600 };
    const world = { x: 1000, y: 200 };
    const screen = worldToScreenAt(state, viewport, world);
    assert.deepEqual(screen, { x: 500, y: 175 });
    assert.deepEqual(screenToWorldAt(state, viewport, screen), { x: 1000, y: 200 });
  });
});

describe("zoomAtState", () => {
  it("doubles zoom around a bottom-right anchor to an exact state", () => {
    // Anchor sits 200px right and 150px below centre at zoom 1, so it is over
    // world (600, 450). Doubling halves that offset in world units, which walks
    // the centre to (500, 375) and leaves the anchor over the same world point.
    const next = zoomAtState({ x: 400, y: 300, zoom: 1 }, { w: 800, h: 600 }, { x: 600, y: 450 }, 2);
    assert.deepEqual(next, { x: 500, y: 375, zoom: 2 });
  });

  it("holds the world point under a non-centre anchor fixed", () => {
    const state = { x: 800, y: 450, zoom: 0.5 };
    const viewport = { w: 800, h: 600 };
    const anchor = { x: 100, y: 80 };
    const before = screenToWorldAt(state, viewport, anchor);
    const next = zoomAtState(state, viewport, anchor, 2);
    assert.equal(next.zoom, 2);
    const after = screenToWorldAt(next, viewport, anchor);
    assert.ok(Math.abs(after.x - before.x) < 1e-9, "zoom keeps anchor world x");
    assert.ok(Math.abs(after.y - before.y) < 1e-9, "zoom keeps anchor world y");
  });
});

describe("clampZoom", () => {
  it("clamps, passes the edges, and replaces non-positive or non-finite with 1", () => {
    assert.equal(clampZoom(0.1), 0.25);
    assert.equal(clampZoom(0.25), 0.25);
    assert.equal(clampZoom(8), 8);
    assert.equal(clampZoom(99), 8);
    assert.equal(clampZoom(0), 1);
    assert.equal(clampZoom(Number.NaN), 1);
  });
});

describe("createCamera", () => {
  const viewport = { w: 800, h: 600 };

  it("panByScreen(100, 0) at zoom 2 moves x by -50", () => {
    const camera = createCamera({ viewport: () => viewport });
    camera.zoomAt({ x: 400, y: 300 }, 2);
    camera.panByScreen(100, 0);
    assert.deepEqual(camera.state(), { x: -50, y: 0, zoom: 2 });
  });

  it("onChange fires once for a real change and not for panByScreen(0, 0)", () => {
    const camera = createCamera({ viewport: () => viewport });
    const seen: { x: number; y: number; zoom: number }[] = [];
    camera.onChange((state) => {
      seen.push(state);
    });
    camera.panByScreen(100, 0);
    assert.deepEqual(seen, [{ x: -100, y: 0, zoom: 1 }]);
    camera.panByScreen(0, 0);
    assert.deepEqual(seen, [{ x: -100, y: 0, zoom: 1 }]);
  });

  it("unsubscribe stops further onChange calls", () => {
    const camera = createCamera({ viewport: () => viewport });
    const seen: { x: number; y: number; zoom: number }[] = [];
    const stop = camera.onChange((state) => {
      seen.push(state);
    });
    camera.panByScreen(10, 0);
    stop();
    camera.panByScreen(10, 0);
    assert.deepEqual(seen, [{ x: -10, y: 0, zoom: 1 }]);
  });

  it("mutating the object from state() does not change the camera", () => {
    const camera = createCamera({ viewport: () => viewport });
    const copy = camera.state();
    copy.x = 999;
    copy.y = 999;
    copy.zoom = 4;
    assert.deepEqual(camera.state(), { x: 0, y: 0, zoom: 1 });
  });
});
