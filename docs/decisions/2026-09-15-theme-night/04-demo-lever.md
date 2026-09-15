# 04. Demo as a product surface, plus the capture lever

## What was decided

Demo roster is a CLI number, not the fixture directory count.

`parseGatewayCli` owns the boundary. `--bots N` is an integer from 1 to 40, default 8, and requires `--demo`. `--replay-idle` also requires `--demo`. Internal replay code trusts that number.

Fixture agents stay the existing eight ids and profile files. Extra bots are clones: same profile shape, new id, distinct name. Clone ids are UUID v5 so screenshots stay reproducible. When N is below 8, take the first N after sorting fixture ids.

Replay is a per-bot tape, not one global sorted timeline with a single all-sleep flush. Each tape staggers its start, loops, emits `sleep` at the end of a cycle, then holds long enough for the client pose clock to reach sleeping. `--replay-idle` skips appends and flushes sleep so the all-asleep still is a real state, not a race with the quiet clock.

Capture is the lever. `npm run capture` builds the client once, then for each N starts a demo gateway and a preview server on this step's ports, screenshots 1920x1080, and can record 20 seconds of video.

Ports. Gateway binds the first free port in 8044-8049. Preview binds 5184-5189. Those ranges are this step's isolation from other owners.

Playwright is pinned to 1.62.1 because that release's Chromium revision is 1234. 1.63.0 rolls to 1243. Capture resolves Chromium as `CAPTURE_CHROME` if set, else the mac cache path when that file exists, else Playwright's own installed browser. ffmpeg is `FFMPEG` if set, else `ffmpeg` on PATH, else `/opt/homebrew/bin/ffmpeg`. SIGINT and SIGTERM close the browser and kill every registered child. Record uses `launchServer` plus `connect`, so the video is saved with `video.saveAs` after the page closes. `video.path()` throws on a remote connection.

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

I viewed every PNG with the Read tool after regenerating at the rebased head with `npm run capture -- --theme starcraft --bots 1,8,18,40 --out docs/images/themes --record 20`. The stills show the step 2 header (`StarCraft`, `Kestrel Base · Command View`).

- `starcraft-1.png` (71342 bytes). One roster row, Ivo. Ivo stands at Bunker with a WORK label. The floor is painted. Not blank.
- `starcraft-8.png` (94847 bytes). Eight roster names. Ivo at Bunker is WORK. Reed, Anouk, Mira, Wren, Koji, Sable, Lauren are IDLE. The eight fixture ids are on screen.
- `starcraft-18.png` (132570 bytes). Roster lists clones (`Ivo 2`, `Ivo 3`, `Wren 2`). Units stack on the twelve stations. Ivo, Ivo 2, Ivo 3 show WORK. Clones are real bots, not a second paint of the originals.
- `starcraft-40.png` (189603 bytes). Roster scrolls through Anouk 2-5, Ivo 2-5, Lauren 2-5. Nametags overlap. That is the 12-station layout crowding Q4 accepted for tonight. Units are present. Not empty.
- `starcraft-8-asleep.png` (112204 bytes). Every roster row has a SLEEP badge. Every unit shows REST and a Z. `--replay-idle` produced the all-asleep still.
- `starcraft.mp4` (2200781 bytes). Twenty seconds of the N=18 recording. Mix of WORK, IDLE, and SLEEP. The extracted `starcraft-record.png` still is not committed. It was a second N=18 frame next to `starcraft-18.png`.

`html[data-theme]` was absent, as expected until step 2. `document.documentElement.dataset.avgFrameMs` was absent, as expected until step 3. Manifest printed `avgFrameMs=n/a`. Canvas still had `data-avg-frame-ms` from the current StarCraft loop.

Superseded at `75bba6b` after rebase onto `75b9284`. The byte counts above are the pre-header stills. `ls -l docs/images/themes` at that head:

- `starcraft-1.png` 72672 bytes
- `starcraft-8.png` 95914 bytes
- `starcraft-18.png` 133468 bytes
- `starcraft-40.png` 189934 bytes
- `starcraft-8-asleep.png` 113303 bytes
- `starcraft.mp4` 2471642 bytes

`html[data-theme]` is present since that rebase. Manifest `avgFrameMs` stays `n/a` until step 3 lands. The stills show the step 2 header. The scenes (Ivo WORK at N=1, eight fixture names at N=8, clones at N=18, crowded twelve stations at N=40, all-asleep SLEEP and REST) are unchanged.

## What was rejected and why

Waiting for the live quiet clock to produce the all-asleep still. Demo does not run that timer. A 22-second wait would also make the still a race. `--replay-idle` is explicit.

Appending clone transcripts onto the original timeline with no stagger. Forty clones would fire at once and then all sleep together.

Pinning Playwright 1.63.0. That release rolls Chromium to 1243. The machine has 1234.

Hardcoding only the laptop Homebrew ffmpeg path and the mac Playwright cache. Cloud is Linux with apt ffmpeg and Playwright's own Chromium.

A fourth theme, a gallery picker, or client-side fixture replay. Those belong to later steps.

## Next step

Step 5. Asset lever and the StarCraft rework, via bakeoff. The N=40 still shows twelve stations with stacked nametags. Generative layout is that step's job. Do not merge this PR until the root says `merge authorized at <sha>`.
