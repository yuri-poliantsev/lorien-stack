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

DemoFixture = { record: BotRecord; lines: string[] }   # bundled at build by import.meta.glob
DemoSlot    = DemoFixture & { startOffsetMs: number }   # clones renamed "<name> <wave+1>"

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

`gh pr list --state all` at 02:20Z showed no PR for `theme-night/04c-lever-hooks`. By 02:40Z it was open as #18 and unmerged. `git diff 902731f..theme-night/04c-lever-hooks -- apps/gateway/src/replay.ts` replaces `DEMO_STAGGER_MS` and `DEMO_CLONE_STAGGER_MS` with `demoStaggerMs(botCount) = min(1600, floor(12000 / botCount))` and `startOffsetMs = index * staggerMs`. The client ships the formula on `main` at this head. When #18 merges, `demoRoster` in `apps/client/src/demo/plan.ts` must take the new one, and the cross-check test in `plan.test.ts` says so with literal offsets.

### Measured at this head

Client tests went from 64 to 80 cases, 134 across the repo. Every new case asserts a literal: Ivo's tape is `wake 0, line 0, 800, 1600, 2400, 3200, 4000, 4800, quiet 4800, sleep 8800`, period 11800ms, which is the 3.2 to 4.8s stream step 4b measured plus the 4s and 3s holds. Two deliberate breaks each turned a test red: freezing the per-bot line counter failed the loop test at `expected: 8` events, and a clone stagger of 1601 failed the gateway cross-check at 18 bots.

`VITE_HOSTED_DEMO=1 npm run build -w apps/client -- --base /lorien-stack/` emits `index.html` with `/lorien-stack/assets/...` for the script and stylesheet and `url(/lorien-stack/fonts/IBMPlexMono-Regular.woff2)` in the CSS. The bundle is 58.16 kB, up from 58.15 kB before the fixtures, since the JSONL is 64K uncompressed and mostly repeated keys. The string `VITE_HOSTED_DEMO` does not appear in the bundle, so the flag was inlined.

`/tmp/theme-night/08-hosted-demo/proof.mjs` ran Playwright at 1920x1080 against `vite preview --base /lorien-stack/ --port 5164` of that build and wrote `preview-manifest.json`:

- `http://127.0.0.1:5164/lorien-stack/` with no query. `html[data-source]` is `demo`, `html[data-theme]` is `starcraft`, roster ready at 380ms, first working bot at 427ms. After a 6s settle the strip read 1 working / 7 idle / 0 asleep / 11 ev/min, eight `sc-unit` elements, two in the `working` pose, `avgFrameMs` 1.06. No WebSocket was opened and no request failed. `preview-8.png` shows Ivo and Wren at WORK and six IDLE.
- `?demo=40`. Roster 40, names `Anouk, Anouk 2..5, Ivo, Ivo 2..5, ...`, ready at 211ms, working at 227ms, strip 5 working / 35 idle / 0 asleep / 25 ev/min, forty units, six working, `avgFrameMs` 1.69. `preview-40.png` shows the clones stacked on the twelve stations, which is the crowding step 5 owns.

The strip's idle count is the seven bots whose tape has not started yet. They carry no presence hint and no events, and `presenceStateFor` reads that as idle. The gateway demo produces the same reading before a bot's first wake.

`gh api repos/yuri-poliantsev/lorien-stack/pages` returned 404 before this step and now returns `build_type: workflow`, `html_url: https://yuri-poliantsev.github.io/lorien-stack/`. Nothing has deployed yet. The first deploy is the merge of this PR.

## What was rejected and why

Striking the step. The measure in the plan is a hosted demo link a stranger can open. The client's message seam makes the cost one module and one CI job.

Extracting `packages/replay` now. Two copies until 4c lands, and a gateway edit against a file another owner is changing tonight.

Async sleep loops in the browser, mirroring `runTape`. A pure `advance(elapsedMs)` needs no fake timers to test and cannot leak a loop when the tab is backgrounded.

Falling back to demo when the WebSocket fails. A gateway that is down would look like a demo. The build flag is explicit.

Reproducing the gateway's SHA-1 UUID v5 clone ids. The browser has no synchronous SHA-1, ids are invisible to the watcher, and the shared package that eventually replaces both copies cannot use `node:crypto` either. Clone ids here are the source UUID with its last four hex digits replaced by the wave. A test asserts 40 distinct ids that pass `parseBotId`.

Replaying missed cycles in a burst after a backgrounded tab throttles the interval. The player skips to the cycle that contains the current elapsed time when a tape is a whole period or more behind, so the store does not fill with thousands of same-timestamp events.

`actions/configure-pages`. Pages is enabled once through `gh api`, and the job has nothing to configure per run.

## Next step

Wait for `merge authorized at <sha>`. After the squash merge, watch `gh run list --branch main --limit 1` until the `pages` job deploys, then run `BASE=https://yuri-poliantsev.github.io/lorien-stack/ LABEL=hosted node /tmp/theme-night/08-hosted-demo/proof.mjs` and record the hosted numbers here.

When #18 (`theme-night/04c-lever-hooks`) merges, update `demoRoster` to `index * min(1600, floor(12000 / botCount))`. The cross-check test fails until then. Once both are on `main`, the follow-up that earns its place is a `packages/replay` holding `expandDemoRoster`, the tape builder and the constants, imported by both the gateway and the client, so the cross-check test becomes unnecessary and is deleted.

Step 9 links `https://yuri-poliantsev.github.io/lorien-stack/` from the README. `?demo=40` and `?theme=<id>` compose.
