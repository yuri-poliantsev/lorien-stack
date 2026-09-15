# 04. Demo as a product surface, plus the capture lever

## What was decided

Demo roster is a CLI number, not the fixture directory count.

`parseGatewayCli` owns the boundary. `--bots N` is an integer from 1 to 40, default 8, and requires `--demo`. `--replay-idle` also requires `--demo`. Internal replay code trusts that number.

Fixture agents stay the existing eight ids and profile files. Extra bots are clones: same profile shape, new id, distinct name. Clone ids are UUID v5 so screenshots stay reproducible. When N is below 8, take the first N after sorting fixture ids.

Replay is a per-bot tape, not one global sorted timeline with a single all-sleep flush. Each tape staggers its start, loops, emits `sleep` at the end of a cycle, then holds long enough for the client pose clock to reach sleeping. `--replay-idle` skips appends and flushes sleep so the all-asleep still is a real state, not a race with the quiet clock.

Capture is the lever. `npm run capture` builds the client once, then for each N starts a demo gateway and a preview server on this step's ports, screenshots 1920x1080, and can record 20 seconds of video.

Playwright is pinned to 1.62.1 because that release's Chromium revision is 1234, which is the binary already cached at `~/Library/Caches/ms-playwright/chromium-1234`.

## Data shape

```
DemoBotCount = integer 1..40   # default 8, parsed at CLI
DemoReplayMode = loop | idle

LoadedFixtureAgent = {
  id, name, profileRaw, transcriptLines
}

DemoAgentSlot =
  | fixture LoadedFixtureAgent
  | clone { source, id, name, wave }

BotTape = { botId, startOffsetMs, appends[] }
ReplayPlan = { bots[], tapes[], loop }
```

## What evidence decided it

Q4, Q22, Q25 in `docs/plans/2026-09-15-theme-night.md`. The current demo hardcodes eight fixture dirs in `loadReplayPlan` and flushes every bot to sleep after one pass (`apps/gateway/src/main.ts` around the `demo replay complete` path). That cannot keep one bot working and some asleep, and it cannot produce 18 or 40 bots for the marketing stills.

`gatewayWsUrl` always connects to `ws://<page-host>/ws`. Vite proxies that in `server.proxy` today. Preview needs the same proxy, so capture can serve the built client without editing `apps/client/src/**`.

StarCraft already writes `data-pose` on `[data-testid=sc-unit]`. Capture waits on that, not on a guess about pixels.

## What was rejected and why

Waiting for the live quiet clock to produce the all-asleep still. Demo does not run that timer. A 22-second wait would also make the still a race. `--replay-idle` is explicit.

Appending clone transcripts onto the original timeline with no stagger. Forty clones would fire at once and then all sleep together.

Pinning Playwright 1.63.0. That release rolls Chromium to 1243. The machine has 1234.

A fourth theme, a gallery picker, or client-side fixture replay. Those belong to later steps.

## Next step

Land `--bots` and `--replay-idle` with literal CLI tests. Enrich the eight transcripts. Loop the replay. Ship `scripts/capture`. Run it for `starcraft` at 1, 8, 18, 40 plus the 20-second recording. View every PNG. Do not merge until the root says `merge authorized at <sha>`.
