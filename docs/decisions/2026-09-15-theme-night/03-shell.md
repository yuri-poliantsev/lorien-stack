# 03. Shell redesign

## What was decided

The shell is the frame every theme lives inside. The watcher reads status from the shell, not from the scene, so the shell carries the roster, the aggregate counts, and the tape. The theme owns the scene and nothing else.

Seven surfaces from Q3, Q9, Q13, Q14, Q20, Q21. Five new modules under `apps/client/src/`, one of them pure and tested, plus a camera module the host owns and every theme receives.

### ThemeMountContext

Step 2 merged `mount: (root, opts: { onSelect?: (botId: BotId) => void }) => ThemeHandle`. This step widens `opts` into a named context rather than forking the signature, so step 2's `mountStarCraftTheme` keeps working and later themes read one type.

```ts
type ThemePalette = {
  panelBg: string;
  fg: string;
  accent: string;
  font: string;
};

type ThemeMountContext = {
  onSelect?: (botId: BotId) => void;
  camera: Camera;
  reducedMotion: boolean;
  palette?: ThemePalette;
};

type ThemeEntry = {
  id: string;
  label: string;
  mount: (root: HTMLElement, context: ThemeMountContext) => ThemeHandle;
  preview: ThemePreview;
  palette?: ThemePalette;
};
```

`palette` is declared on the entry, applied by the host, and handed back to the theme in the context. One source, two consumers. The host writes it onto the shell root as `--shell-panel-bg`, `--shell-fg`, `--shell-accent`, `--shell-font`; the theme reads the same values from the context when it paints canvas pixels. A theme that declares no palette inherits the `:root` defaults.

This is a deviation from the brief's wording, which says the theme sets those custom properties on the host element. It cannot. `mountStarCraftTheme` calls `root.replaceChildren()`, so the overlay panel cannot live inside the host element, and a custom property set on the host element does not reach a sibling overlay. Declaring the palette on the registry entry keeps the values theme-owned, which is what the wording is for, and puts them on an element the overlay actually inherits from.

### Camera

`apps/client/src/camera.ts`. One module, host-owned, shared by every theme. Split into pure transform maths and a stateful controller, because the maths is what tests assert on with literal expectations.

```ts
type CameraState = { x: number; y: number; zoom: number };
type Viewport = { w: number; h: number };
type Point = { x: number; y: number };

function fitState(viewport: Viewport, world: Viewport): CameraState;
function worldToScreenAt(state: CameraState, viewport: Viewport, p: Point): Point;
function screenToWorldAt(state: CameraState, viewport: Viewport, p: Point): Point;
function zoomAtState(
  state: CameraState,
  viewport: Viewport,
  anchor: Point,
  nextZoom: number,
): CameraState;

type Camera = {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
  fit(world: Viewport): void;
  onChange(cb: (state: CameraState) => void): () => void;
  worldToScreen(p: Point): Point;
  screenToWorld(p: Point): Point;
};
```

`x` and `y` are the world point under the viewport centre, not a top-left offset. Centre anchoring makes `fitState` one expression (`zoom = min(viewport.w / world.w, viewport.h / world.h)`, centre on the world's middle) and makes zoom-around-cursor a subtraction rather than a chain of offset corrections. A top-left origin needs the pan offset rewritten on every zoom step, which is where off-by-a-half bugs live.

`zoomAtState` holds the world point under `anchor` fixed: read the world point before the zoom change, then set `x`, `y` so `screenToWorldAt` returns it again at the new zoom. Zoom clamps to `[0.25, 8]`.

The host attaches drag, wheel, and `Home` to the scene element and drives the controller. Themes never touch DOM events for the camera. Zoom-to-fit runs on mount and whenever the roster count changes, so a roster growing from 8 to 40 reframes instead of cropping.

### ShellStats

`apps/client/src/shell/model.ts`. Every derivation the shell renders is a pure function of the store plus `now`, so the three DOM surfaces hold no logic and the tests never touch a canvas.

```ts
type PresenceState = "working" | "idle" | "asleep";

type RosterRow = {
  botId: BotId;
  name: string;
  state: PresenceState;
  action: Action;
  ageMs: number | undefined;
};

type ShellStats = {
  working: number;
  idle: number;
  asleep: number;
  eventsPerMinute: number;
};

type TapeRow = {
  eventId: EventId;
  role: ActivityEvent["role"];
  toolName: string | undefined;
  path: string | undefined;
  at: IsoTimestamp;
  text: string;
};

function presenceStateFor(input: {
  hint: PresenceHint | undefined;
  lastEventAt: IsoTimestamp | undefined;
  nowMs: number;
}): PresenceState;

function rosterRows(input: ShellModelInput): readonly RosterRow[];
function shellStats(input: ShellModelInput): ShellStats;
function tapeRows(input: ShellModelInput & { limit: number }): readonly TapeRow[];
```

`presenceStateFor` reads the hint's `reason` first, because the gateway already decided: `recent` is working, `quiet` is idle, `sleep` is asleep. An unrecognised reason falls back to `freshnessMs` against 60s and 600s thresholds. No hint at all falls back to the age of the bot's last event. Neither present is `idle`, because a bot we have heard nothing about is not evidence of sleep.

The client keeps those three reason strings as wire data, not as an import. `apps/client` importing `apps/gateway/src/presence.ts` would put a server module in the browser bundle and break the rule that themes consume roster and activity only.

`eventsPerMinute` counts events across every bot with `at` inside the last 60 seconds. A count, not a rate extrapolated from a shorter window, so the number a watcher reads is a number that happened.

`ageMs` is `undefined` rather than `0` when a bot has no events. The roster renders that as a dash. Zero would read as "active one millisecond ago".

### Roster panel state

```ts
type RosterPanelState = { collapsed: boolean };
```

Persisted under the localStorage key `lorien.roster.collapsed` as `"1"` or `"0"`, matching step 2's `lorien.theme` prefix.

### Frame budget

`apps/client/src/shell/frameBudget.ts`. The rolling window is pure and tested; the DOM wrapper is four lines around it.

```ts
type RollingAverage = {
  push(atMs: number, sampleMs: number): void;
  average(): number;
  count(): number;
};

function rollingAverage(windowMs: number): RollingAverage;
function startFrameBudget(root: HTMLElement): () => void;
```

`avgFrameMs` is work per frame, not the interval between frames. Q21's 4ms target cannot be an inter-frame interval, since vsync pins that near 16.7ms. The host samples `performance.now() - timestamp` inside its own `requestAnimationFrame` callback, which is the elapsed time from the frame's start to the moment the host's callback runs. The host registers its loop after the theme mounts, so the theme's paint has already run inside that span and the sample is the frame's real work.

Window is 2 seconds. The dataset write is throttled to once per second, so a capture tool reads a settled number instead of a value that changes under it.

## What evidence decided it

Q2, Q3, Q9, Q13, Q14, Q18, Q20, Q21 in `docs/plans/2026-09-15-theme-night.md`, and step 2's merged contract in `docs/decisions/2026-09-15-theme-night/02-registry.md`.

`apps/client/src/themes/starcraft/scene.ts` on `75b9284` calls `root.replaceChildren()` at mount and already writes `root.dataset.avgFrameMs` from its own per-paint timing. That forced the palette decision above and means two `avgFrameMs` values exist: the theme's paint cost on the host element, and the host's frame cost on `document.documentElement`. The capture lever reads the host's.

`apps/gateway/src/presence.ts` lines 13 to 15 define the reason strings as `recent`, `quiet`, `sleep`.

`apps/client/src/styles.css` names `IBM Plex Sans` and `IBM Plex Mono` with no `@font-face` at this head.

## What was rejected and why

A second `opts` parameter alongside step 2's. Two shapes for one call site is a fork, and later themes would have to read both.

Top-left camera origin. Centre anchoring makes fit and zoom-at-cursor one expression each.

Importing the gateway's presence reason constants. It would put a server module in the browser bundle.

Rendering the overlay panel inside `.theme-host`. The StarCraft mount clears that element.

Restyling the StarCraft scene. Step 5 owns it.

## Next step

Step 4 merges `scripts/capture/` and gateway `--bots N`. Rebase onto it and recapture the committed stills through the lever. Step 5 is the StarCraft rework, which is the first theme to consume `ThemeMountContext.palette` for real.
