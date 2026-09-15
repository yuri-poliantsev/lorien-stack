export type CameraState = { x: number; y: number; zoom: number };
export type Viewport = { w: number; h: number };
export type Point = { x: number; y: number };

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 8;

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) {
    return 1;
  }
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

export function fitState(viewport: Viewport, world: Viewport): CameraState {
  if (
    !Number.isFinite(viewport.w) ||
    viewport.w <= 0 ||
    !Number.isFinite(viewport.h) ||
    viewport.h <= 0 ||
    !Number.isFinite(world.w) ||
    world.w <= 0 ||
    !Number.isFinite(world.h) ||
    world.h <= 0
  ) {
    return { x: 0, y: 0, zoom: 1 };
  }
  return {
    x: world.w / 2,
    y: world.h / 2,
    zoom: clampZoom(Math.min(viewport.w / world.w, viewport.h / world.h)),
  };
}

export function worldToScreenAt(state: CameraState, viewport: Viewport, p: Point): Point {
  return {
    x: (p.x - state.x) * state.zoom + viewport.w / 2,
    y: (p.y - state.y) * state.zoom + viewport.h / 2,
  };
}

export function screenToWorldAt(state: CameraState, viewport: Viewport, p: Point): Point {
  return {
    x: (p.x - viewport.w / 2) / state.zoom + state.x,
    y: (p.y - viewport.h / 2) / state.zoom + state.y,
  };
}

export function zoomAtState(
  state: CameraState,
  viewport: Viewport,
  anchor: Point,
  nextZoom: number,
): CameraState {
  const zoom = clampZoom(nextZoom);
  const before = screenToWorldAt(state, viewport, anchor);
  return {
    zoom,
    x: before.x - (anchor.x - viewport.w / 2) / zoom,
    y: before.y - (anchor.y - viewport.h / 2) / zoom,
  };
}

export type Camera = {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
  fit(world: Viewport): void;
  onChange(cb: (state: CameraState) => void): () => void;
  worldToScreen(p: Point): Point;
  screenToWorld(p: Point): Point;
  panByScreen(dx: number, dy: number): void;
  zoomAt(anchor: Point, factor: number): void;
  state(): CameraState;
};

export function createCamera(input: { viewport: () => Viewport }): Camera {
  let x = 0;
  let y = 0;
  let zoom = 1;
  const listeners = new Set<(state: CameraState) => void>();

  function snapshot(): CameraState {
    return { x, y, zoom };
  }

  function apply(next: CameraState): void {
    if (next.x === x && next.y === y && next.zoom === zoom) {
      return;
    }
    x = next.x;
    y = next.y;
    zoom = next.zoom;
    for (const cb of listeners) {
      cb(snapshot());
    }
  }

  return {
    get x() {
      return x;
    },
    get y() {
      return y;
    },
    get zoom() {
      return zoom;
    },
    fit(world) {
      apply(fitState(input.viewport(), world));
    },
    onChange(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    worldToScreen(p) {
      return worldToScreenAt({ x, y, zoom }, input.viewport(), p);
    },
    screenToWorld(p) {
      return screenToWorldAt({ x, y, zoom }, input.viewport(), p);
    },
    panByScreen(dx, dy) {
      apply({ x: x - dx / zoom, y: y - dy / zoom, zoom });
    },
    zoomAt(anchor, factor) {
      apply(zoomAtState({ x, y, zoom }, input.viewport(), anchor, zoom * factor));
    },
    state() {
      return snapshot();
    },
  };
}
