# 02. Action table and ThemeRegistry

## What was decided

The client owns two domain tables. Themes import neither the gateway nor the websocket client. Both tables live under `apps/client/src/`.

### Action vocabulary

`apps/client/src/actions.ts` is the only module that maps an `ActivityEvent` to an in-scene action. Organizing structure: a lookup table plus a role fallback, not a switch that grows per tool.

```ts
type Action =
  | "reading"
  | "writing"
  | "shell"
  | "talking"
  | "thinking"
  | "unknown";

function actionFromEvent(event: ActivityEvent): Action;
function pathFromToolEvent(event: ActivityEvent): string | undefined;
function nametagFromBotName(name: string): string;
```

`actionFromEvent` looks up `toolName` first when `role` is `tool`. Names compare case-insensitively. Unknown tool names return `unknown`. Role fallbacks: `assistant` is `talking`, `user` is `thinking`. `unknown` is the default for every other case.

Path extraction reads `text` only. If `text` is JSON, the first of `path`, `target_file`, `file_path`, `filePath`, `file` that is a non-empty string wins. Otherwise a path-shaped token in the free text wins. Transcript prose never becomes the label.

`nametagFromBotName` returns `name.normalize("NFKC")`. The roster panel keeps the original string.

### ThemeRegistry

`apps/client/src/themes/registry.ts` is a frozen list, not a mutable register API. One theme ships in this step.

```ts
type ThemeRenderInput = {
  roster: readonly BotRecord[];
  activity: ReadonlyMap<BotId, readonly ActivityEvent[]>;
};

type ThemeHandle = {
  render(input: ThemeRenderInput): void;
  unmount(): void;
};

type ThemePreview =
  | { kind: "url"; href: string }
  | { kind: "draw"; paint: (canvas: HTMLCanvasElement) => void };

type ThemeEntry = {
  id: string;
  label: string;
  mount: (
    root: HTMLElement,
    opts: { onSelect?: (botId: BotId) => void },
  ) => ThemeHandle;
  preview: ThemePreview;
};

type ThemeRegistry = {
  entries: readonly [ThemeEntry, ...ThemeEntry[]];
  get(id: string): ThemeEntry | undefined;
};
```

Selection is a pure module, `apps/client/src/themes/choice.ts`, so tests do not load the StarCraft scene. `mountStarCraftTheme` returns `unmount` that stops the animation frame, removes the canvas, hit layer, and listeners it attached, and clears host dataset keys it set. Scene CSS stays scoped to `.theme-host[data-theme="starcraft"]` so `html[data-theme]` does not restyle the document.

### Theme choice

```ts
type ThemeChoiceSource = "query" | "storage" | "default";

type ThemeChoice = {
  id: string;
  source: ThemeChoiceSource;
};

function resolveThemeId(input: {
  search: string;
  stored: string | null;
  ids: readonly string[];
}): ThemeChoice;
```

`?theme=<id>` wins when the id is registered. Then `localStorage` key `lorien.theme`. Then the first registered theme. A switch unmounts the old handle, mounts the new entry into the same host element, and re-renders from the store. The chosen id is written to `history.replaceState` and to `localStorage`. `document.documentElement.dataset.theme` holds the active id.

The picker is a compact segmented control in `<header class="app-header">`. Keyboard `t` cycles when focus is not in an input, textarea, or select. Reduced motion and camera stay out of this step.

## What evidence decided it

Q7, Q8, Q14, Q18, Q19 in `docs/plans/2026-09-15-theme-night.md`. Fixture tool names in `fixtures/demo/agent-transcripts/**` are `read_file`, `shell`, `grep`, `list_dir`. `tool_use` text is `JSON.stringify(block.input)` from `packages/contracts/src/index.ts`, so JSON keys are the path source for live Grok events. `themeHost.ts` on main was a one-line StarCraft wrapper with no unmount. The scene loop in `apps/client/src/themes/starcraft/scene.ts` never cancelled `requestAnimationFrame`.

Client tests at this head pass 29 cases, including a literal row for every mapped tool name, the unknown default, JSON path extraction, fixture free-text path extraction, and NFKC nametags. Playwright against `http://127.0.0.1:5182/?theme=starcraft` set `html[data-theme="starcraft"]` after `html[data-roster-ready="true"]`, wrote `lorien.theme`, showed the hover thumbnail, and a fresh context with only localStorage set reproduced the same theme and wrote `?theme=starcraft` back onto the URL. Screenshots: `/tmp/theme-night/02-registry/starcraft.png`, `starcraft-hover.png`, `starcraft-from-storage.png`.

## What was rejected and why

A mutable `register()` API. One theme this step, and later themes land as list entries in the same file.

A gallery picker. Q14 forbids it.

Threading `Action` through the websocket client. Themes consume roster and activity only. The table stays a pure function of `ActivityEvent`.

Keeping choice helpers in `registry.ts`. That file imports the StarCraft mount, and node tests cannot load canvas.

Restyling the StarCraft scene. Visual output is frozen until step 5.

Reduced-motion and camera utilities. Those are step 3.

## Next step

Step 3. Shell redesign. Overlay roster, header, inspector drawer, stats strip, camera utility, bundled fonts, reduced motion. Keep this header's picker. Do not restyle the StarCraft scene.
