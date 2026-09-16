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

`ThemeEntry` also gains a required `world: Viewport`. The camera cannot fit to a world it cannot measure, and a default would be a guess about a theme nobody has written yet. StarCraft declares its existing `960x540`.

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

`zoomAtState` holds the world point under `anchor` fixed. Read the world point before the zoom change, then set `x`, `y` so `screenToWorldAt` returns it again at the new zoom. Zoom clamps to `[0.25, 8]`.

The DOM bindings live next door in `apps/client/src/shell/cameraInput.ts` as `bindCameraInput(target, camera, { onRefit })`, so `camera.ts` stays free of DOM types and its maths runs under `node --test` without a document. The host attaches drag, wheel, and `Home` to the scene element and drives the controller. Themes never touch DOM events for the camera. Zoom-to-fit runs on mount and whenever the roster count changes, so a roster growing from 8 to 40 reframes instead of cropping.

Shell controls layered over the scene carry `data-shell-overlay`, and `bindCameraInput` ignores pointer and wheel events from inside them. Without that, `setPointerCapture` on the scene swallowed the click on every roster row and the panel never selected a bot.

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

### Selection

`ThemeRenderInput` carries the current selection, so a theme draws it rather than tracking it:

```ts
type ThemeRenderInput = {
  roster: readonly BotRecord[];
  activity: ReadonlyMap<BotId, readonly ActivityEvent[]>;
  selectedBotId: BotId | undefined;
};
```

A theme still reports a click through `ThemeMountContext.onSelect`, but it learns the result from the next `render`. The store is the only place a selection lives. Step 5 should draw its highlight from this field and keep no selection state of its own.

## What evidence decided it

Q2, Q3, Q9, Q13, Q14, Q18, Q20, Q21 in `docs/plans/2026-09-15-theme-night.md`, and step 2's merged contract in `docs/decisions/2026-09-15-theme-night/02-registry.md`.

### Measured at this head

Client tests went from 29 cases to 62, all passing, alongside contracts at 11 and gateway at 41. `npm run typecheck`, `npm run build -w apps/client` and `npm run docs:smoke` pass.

Step 4 merged as `17e0b14` while this step was building, so the committed stills come from its lever. `npm run capture -- --theme starcraft --bots 1,8,18,40 --out docs/images/themes --record 20` at the rebased head measured `avgFrameMs` of 1.01 at 1 bot, 1.02 at 8, 1.30 at 18, and **1.42 at 40**, against Q21's 4ms target. `docs/images/themes/` is regenerated because the stills there showed the old sidebar, which step 4's entry set the precedent for after the step 2 header landed.

Before the lever existed, `/tmp/theme-night/03-shell/capture.mjs` ran the same sweep in a 1440x900 viewport against a gateway it started itself, reading 0.64, 0.77, 0.93 and 1.29. That script also asserted that the roster panel lists every bot and that the stats strip's working, idle and asleep counts sum to the roster size, so the two surfaces cannot disagree.

At 40 bots in that viewport the panel is 775px tall inside an 860px scene, so all 40 rows are visible without scrolling at a 18.6px row height. Its 40-bot frame read 7 working, 33 idle and 26 events per minute in the strip, with exactly 7 rows carrying a green dot and an action word.

The all-asleep still reads 0 working, 0 idle, 8 asleep, 0 events per minute, with every row on the muted dot and no action word. That is Q2's all-asleep constraint.

`/tmp/theme-night/03-shell/proof.mjs` asserted the seven surfaces against the live client. `document.fonts.check` returned true for `400 14px "IBM Plex Mono"` and `500 14px "IBM Plex Mono"`. The camera fit to `x 480, y 270, zoom 1.5000`, which is the world's centre and `min(1440/960, 860/540)`. A drag moved it to `373.33, 210.00` with zoom unchanged, a wheel up raised zoom to `2.7332`, and `Home` restored the fit values exactly. Clicking a roster row opened the drawer with three tape rows, the newest showing tool `Read`, path `apps/gateway/src/presence.ts`, role `tool`, a timestamp, and one truncated text line. Collapsing the roster and reloading kept `data-collapsed="true"`. A context with `reducedMotion: "reduce"` set `data-reduced-motion="true"` and computed the panel's `transition-duration` as `0s`.

### What the screenshot caught that an assertion did not

The first 40-bot capture showed the inspector drawer painted over a quarter of the frame while its own `data-open` read `false`. An author `display: flex` outranks the user-agent rule for `[hidden]`, so the element was flagged closed and still on screen. The dataset assertion had passed. `.inspector[hidden] { display: none }` fixes it, and the proof now asserts computed `display` and a zero width rather than the flag.

The same capture showed the action column printing `unknown` on 33 of 40 rows, which reads as an error rather than as silence. The roster now spends that column only on an observed action and lets the presence dot carry the rest. `data-action` still holds the real value for the capture lever.

The first lever run reported `avgFrameMs=42.10` at 1 bot. The instrument published its first sample immediately, and that sample was page load rather than a frame. The value now appears only once the window holds at least 20 frames, which took the same run to 1.01. A number that is briefly absent is better than one that is wrong, and step 4's lever already warns when the dataset key is missing.

### What the review round found

The proof clicked roster rows and called `HTMLElement.click()` on units, and both passed while a real mouse click on a unit selected nothing. `bindCameraInput` took `setPointerCapture` on every pointerdown over the scene, which retargets every later event in the sequence to the scene stack, so the unit button under the cursor never saw its click. The overlay guard added earlier in this step spared the roster and the drawer and left the units, which sit inside the scene, exposed. Capture now waits for the drag threshold, the only point where it earns anything.

That is the second time this step a dataset assertion passed over a broken surface, after the drawer's `display`. Both were caught by looking at the artifact instead of the flag. The proof now drives `page.mouse.move/down/move/up` and `page.mouse.click`.

The same round showed the ring on a stale unit after a roster pick, because `scene.ts` kept a `localSelected` beside the store's `selectedBotId` and only the scene's own clicks wrote to it. Two copies of one fact will disagree eventually; `localSelected` is gone.

Measured at `0e6dc81`: a drag from the scene centre moved the camera from `480.00, 270.00` to `373.33, 210.00` with zoom held at `1.5000`. A `page.mouse.click` on the first unit, Anouk, set its roster row to `aria-current="true"` and `data-selected="true"`, opened the drawer titled `Anouk`, and left exactly one unit carrying `data-selected="true"`, that unit being Anouk. Picking Ivo from the roster kept the count at one and moved it to Ivo, with the canvas's `data-selected-bot-id` and the drawer title following. The roster row carries `aria-current`, not `aria-selected`, because the rows are buttons in a list rather than options in a listbox.

`bindCameraInput` has no DOM-free seam worth testing. It is `getBoundingClientRect`, `closest`, `setPointerCapture` and listener registration, and the defect was the ordering of a capture call against the browser's event retargeting. An extracted threshold predicate would have passed both before and after the fix, so this one rests on the Playwright proof.

Client tests went from 62 cases to 64, for 116 across the repo: `startFrameBudget` now takes an injected clock, so a test can preload `9.99`, watch it vanish at start, hold at nothing through 19 frames, and read exactly `5.50` on the twentieth. Each of that test's three assertions was confirmed to fail against a deliberately broken instrument. `zoomAtState` gained a literal case: state `400, 300, 1` with a `600, 450` anchor doubled is exactly `500, 375, 2`.

An export audit of `camera.ts` and `shell/**` by resolved import specifier found 19 of 46 exports with no importer outside their own file, all of them used internally, so each kept its declaration and lost the keyword. The surface is now 27 exports and every one has an importer. Matching names alone was not enough: `shell/model.ts` and `starcraft/layout.ts` both declare `WORK_MS` and `SLEEP_MS`, neither imports the other, and the values differ because the shell's thresholds are presence at 60s and 10min while the theme's are pose at 12s and 22s.

`npm run capture` at this head reads `avgFrameMs` of **1.36 at 40 bots**.

### A note for step 4

The demo gateway streams its replay live and keeps no history, so a browser that connects more than about two seconds after boot receives a roster snapshot and no events. Both proof scripts therefore start the gateway themselves and navigate immediately. Q22's replay tuning is what makes this unnecessary.

`apps/client/src/themes/starcraft/scene.ts` on `75b9284` calls `root.replaceChildren()` at mount and already writes `root.dataset.avgFrameMs` from its own per-paint timing. That forced the palette decision above and means two `avgFrameMs` values exist: the theme's paint cost on the host element, and the host's frame cost on `document.documentElement`. The capture lever reads the host's.

`apps/gateway/src/presence.ts` lines 13 to 15 define the reason strings as `recent`, `quiet`, `sleep`.

`apps/client/src/styles.css` names `IBM Plex Sans` and `IBM Plex Mono` with no `@font-face` at this head.

## What was rejected and why

A second `opts` parameter alongside step 2's. Two shapes for one call site is a fork, and later themes would have to read both.

Top-left camera origin. Centre anchoring makes fit and zoom-at-cursor one expression each.

Importing the gateway's presence reason constants. It would put a server module in the browser bundle.

Rendering the overlay panel inside `.theme-host`. The StarCraft mount clears that element.

Restyling the StarCraft scene. Step 5 owns it. Nametags still crowd at 40 bots, which Q4 and Q15 fix by replacing the twelve fixed stations with a generative layout.

Renaming the roster row's test hook to `roster-row`. Step 4's `scripts/capture/capture.mjs` counts `[data-testid=bot-row]`, and `scripts/**` is not this step's to edit, so the hook stays.

Adding `playwright` to the root `devDependencies`. Step 4's open PR already adds it at `1.62.1`, and a second entry would collide on merge. The proof scripts resolve it from that worktree instead.

Insetting the camera fit by the roster panel's width. The panel is translucent and collapsible, and both the panel and the drawer change width at runtime, so a dynamic inset would make the scene lurch every time the watcher opened a drawer.

## Outcome

Squash-merged to `main` as `b9dab72` after a rebase onto `f257b46`. At that sha `npm test` is 118 passing across client 64, contracts 11 and gateway 43, `npm run typecheck`, `npm run build -w apps/client` and `npm run docs:smoke` pass, CI on `main` is green, and `npm run capture` reads `avgFrameMs` of **1.36 at 40 bots** against Q21's 4ms budget.

Two rounds of review preceded it. The first found the shell sound but the scene unreachable by mouse: capture on pointerdown retargeted the click away from the unit. That round also found the ring following a second copy of the selection inside `scene.ts`. Both are fixed and proven with `page.mouse` rather than `HTMLElement.click()`, which is the lesson worth carrying: a synthetic click routes around the event plumbing that was broken, so it proved nothing about the surface a watcher touches.

## Next step

Step 5, the StarCraft rework, via the bakeoff in the plan's Process section. It is the first theme to consume `ThemeMountContext.palette` and `ThemeEntry.world` for real, and the first to apply the camera transform to art rather than to the placeholder scene. It also owns the crowding this step left alone: 40 nametags overlap on the twelve fixed stations, and Q4 replaces them with a generative layout. Judge its candidates at 8 and 40 bots with `npm run capture`, and hold them to the same 4ms budget, which the shell now leaves 2.5ms of headroom under.
