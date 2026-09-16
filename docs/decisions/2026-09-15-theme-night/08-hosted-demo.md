# 08. Hosted demo on GitHub Pages

## What was decided

Step 8 is built, not struck. The client already funnels every surface through `StoreMessage` and `applyMessage`, so a second message source is a small module, and the fixtures are 64K on disk, cheap to bundle.

The client gains a demo source under `apps/client/src/demo/`. `?demo=<n>` selects it, with `n` an integer from 1 to 40, default 8. A build with `VITE_HOSTED_DEMO=1` makes demo the default when the URL has no `?demo`, so the bare Pages URL opens a live floor. Everything downstream of the store is untouched. The shell and the themes cannot tell the two sources apart.

The demo source is a thin client-side player, not a shared `packages/replay`. The step 4c owner is editing `apps/gateway/src/replay.ts` on `theme-night/04c-lever-hooks` and has not opened a PR, so an extraction would leave two copies of the tape logic in the tree until that branch lands. The player mirrors the gateway's shapes and constants, and a client test cross-checks its roster expansion against the gateway's `expandDemoRoster` on the real fixtures, so a timing change on either side fails CI instead of drifting.

The Pages deploy is a `pages` job in `.github/workflows/ci.yml` with `needs: ci`, gated to pushes on `main`, as step 1's entry reserved. It builds the client with `--base /lorien-stack/` and `VITE_HOSTED_DEMO=1`, uploads `apps/client/dist` with `actions/upload-pages-artifact`, and deploys with `actions/deploy-pages`. The `ci` job that PRs require is unchanged.

## Data shape

```
DemoBotCount = integer 1..40            # default 8, parsed from ?demo=
DemoSource = { kind: "live" } | { kind: "demo"; bots: DemoBotCount }

DemoFixture = { id: BotId; name: string; lines: string[] }   # bundled at build by import.meta.glob
DemoSlot    = DemoFixture & { startOffsetMs: number }         # clones renamed "<name> <wave+1>"

DemoCue =
  | { atMs; kind: "wake" }
  | { atMs; kind: "line"; line: string }
  | { atMs; kind: "quiet" }
  | { atMs; kind: "sleep" }
DemoTape = { botId; startOffsetMs; cues: DemoCue[]; periodMs }   # one cycle, atMs relative to cycle start

DemoPlayer = { advance(elapsedMs): StoreMessage[] }   # cursor per tape, revision counter, line index per bot
```

The player is a pure cue schedule advanced by elapsed milliseconds. `advance` returns the store messages due since the last call, in time order, so tests assert literal sequences with no timers. The runner in `main.ts` is one `setInterval` that applies those messages and renders.

## What evidence decided it

Q22, Q23, Q26 in `docs/plans/2026-09-15-theme-night.md`. Step 1's entry reserved the `pages` sibling job with `needs: ci`. Step 4's entry named the per-bot tape and clone naming. Step 4b's entry named the presence vocabulary `recent`, `quiet`, `sleep` and the hold constants.

`apps/client/src/main.ts` at `902731f` has one `connectGateway` call whose `onMessage` is `applyMessage(store, message); render()`. `apps/client/src/store.ts` dedupes events by id, and `apps/gateway/src/tail.ts` mints ids as `${botId}:${lineIndex}` with a growing offset, so the player must keep a per-bot line counter across loops or the second cycle is dropped.

`apps/client/src/themes/choice.ts` writes `?theme=` with `url.searchParams.set`, so `?demo=` survives a theme switch.

`gh pr list --state all` at 02:20Z shows no PR for `theme-night/04c-lever-hooks`. `git diff 902731f..theme-night/04c-lever-hooks -- apps/gateway/src/replay.ts` replaces `DEMO_STAGGER_MS` and `DEMO_CLONE_STAGGER_MS` with `demoStaggerMs(botCount) = min(1600, floor(12000 / botCount))` and `startOffsetMs = index * staggerMs`.

## What was rejected and why

Striking the step. The measure in the plan is a hosted demo link a stranger can open. The client's message seam makes the cost one module and one CI job.

Extracting `packages/replay` now. Two copies until 4c lands, and a gateway edit against a file another owner is changing tonight.

Async sleep loops in the browser, mirroring `runTape`. A pure `advance(elapsedMs)` needs no fake timers to test and cannot leak a loop when the tab is backgrounded.

Falling back to demo when the WebSocket fails. A gateway that is down would look like a demo. The build flag is explicit.

## Next step

Open until the build lands.
