# 05b. StarCraft rework, via bakeoff

## What was decided

Candidate a is the base. Its branch is `theme-night/05b-starcraft-cand-a`, head `8687bfd`. Ranking a, b, d, c. Registry id stays `starcraft`. This replaces the StarCraft theme already on main.

Both judges scored a 23 and picked it as base. It is the only candidate whose three stills read as the concept outpost. Tan sand, layered canyon, steel vaults with shutters, visored workers, occupied night. Judge 1 ranked a 23, b 20, d 14, c 13. Judge 2 ranked a 23, b 19, c 18, d 15. Judge 2's ranking prose listed C above B once. The score table did not. Root took judge 1's reading of C. Buildings overlap at 8 against Q4, which forbids overlap to 24, and against C's own passing pad test, so C is last and is ruled out as a base. D is not disqualified. It stays under 4 ms and its hooks hold. The keyed diamond ground leaves black void between pads. That is a concept miss, not a graft.

b's chips and 0.95 ms are real. They graft into a. a's canyon and asleep yard do not graft into b.

Four grafts landed, one commit each, in the brief's order.

1. Left gutter 296. `planGrid` sizes the field in `WORLD_WIDTH - 296 - 40` and places `originX` from that gutter, so every pad's left edge is at least 296 from N=1 through 40. The red test failed first at n=3, left edge 284.
2. B's opaque working chip. Status is `WORKING · ACTION` in gold on a dark plate. Idle stays grey outlined `idle`. Asleep stays the name plate only.
3. Path budget 16 at N>24, with `shortenPath` keeping the filename, plus odd-cell nametag lift of 22 world units at 40.
4. Code-drawn yellow shutter slats and three side windows on idle and working vaults. Asleep stays the dark wash plus the beacon.

Graft 5 was not taken. That graft is b's offscreen terrain blit. `avgFrameMs` at 40 after grafts 1 to 4 is 1.28, under the 3.0 ms trigger. a already caches ground, rocks, tint and pads.

Kept from a: canyon ground, vault and hut rasters, visored code worker, layout/label/pose split, hook contract, reduced-motion gates.

A later commit joins sprite URLs onto `import.meta.env.BASE_URL` so a Pages build with `--base /lorien-stack/` still finds the three PNGs.

## Data shape

```
Grid      = { cols, rows, cell, originX, originY }
Plot      = { index, col, row, x, y, tagLift }
PlotLabel = { name, status, path }
ROSTER_GUTTER = 296
MARGIN_RIGHT  = 40
PAD_HALF      = cell * 0.44
tagLift       = N > 24 && (col + row) % 2 === 1 ? cell * 0.12 : 0
PATH_CHARS            = 24
PATH_CHARS_CROWDED    = 16
status        = working: "WORKING · ACTION" on an opaque plate
                idle: "idle" in grey
                asleep: name only
steelLightRects(rect) = 4 shutter slats + 3 side windows, drawn when kind is vault and pose is not sleeping
assetUrl(name, base)  = `${base}/themes/starcraft/${name}.png`
```

## What evidence decided it

Twelve arena stills under `/tmp/theme-night/arena/starcraft/{a,b,c,d}/`, viewed at full size. The three losing 40-bot stills are committed at `docs/images/themes/bakeoff/starcraft-{b,c,d}-40.png`.

- a at 8: two rows of four on tan sand against a layered canyon, steel vaults next to timber huts, visored workers at working doors. Timber is a peaked cabin, not the boxy prefab in the readback. Idle steel was a brightness shift.
- a at 40: an eight-by-five field, every name readable, gold working lines vs grey idle. Left column cleared the roster in that still because the 8-column span centred. `MARGIN_X = 40` still failed at n=3, left edge 284.
- a asleep: eight dark buildings, one red beacon each, dim names, no workers. Occupied night.
- b at 40: crisp `WORKING · ACTION` chips, 0.95 ms, brown diamond HUD floor, oversized door blobs.
- c at 8: buildings overlap. Ivo sits on Lauren on Anouk. Ruled out as base.
- d at 40: names on dark chips, black void between keyed diamond tiles.

Lever at this branch, `CAPTURE_GATEWAY_PORTS=8260..8265 CAPTURE_PREVIEW_PORTS=5260..5265`, `--bots 8,40 --record 20 --out docs/images/themes`. Code head after grafts 1 to 4 and the Pages prefix. Saved at `/tmp/theme-night/05b-starcraft/capture.log`. A follow-up `--bots 1,18` replaced the old-theme gallery stills that `--bots 8,40` left in place.

```
starcraft-1.png        N=1   avgFrameMs=0.77  pose_working=1   pose_idle=0   pose_sleeping=0
starcraft-8.png        N=8   avgFrameMs=0.66  pose_working=3   pose_idle=5   pose_sleeping=0
starcraft-18.png       N=18  avgFrameMs=0.87  pose_working=7   pose_idle=11  pose_sleeping=0
starcraft-40.png       N=40  avgFrameMs=1.28  pose_working=16  pose_idle=24  pose_sleeping=0
starcraft-8-asleep.png N=8   avgFrameMs=0.70  pose_working=0   pose_idle=0   pose_sleeping=8
starcraft.mp4          N=18  avgFrameMs=0.63
```

Candidate a's own arena manifest read 2.79 ms at 40. After grafts the lever reads 1.28 ms. Both under 4 ms. Graft 5's 3.0 ms trigger did not fire.

Stills at the final head, one sentence each:

- `starcraft-1.png`: Ivo's timber hut on tan sand against the canyon, visored worker at the open door, opaque `WORKING · READING` chip with `…/src/presence.ts`.
- `starcraft-8.png`: two rows of four on tan sand against the canyon, opaque `WORKING · READING` chips, idle steel showing yellow shutter slats and three side windows, first column well right of the roster.
- `starcraft-18.png`: three staggered rows of six, working chips on dark plates, idle steel lit, idle timber with grey `idle`, first column clear of the roster.
- `starcraft-40.png`: an eight-by-five field, every name readable, working chips on dark plates, paths cut to tails such as `/presence.ts`, odd nametags lifted, leftmost pad clear of the 296 px rail.
- `starcraft-8-asleep.png`: eight dark buildings, timber windows out, steel unlit except one red roof beacon each, dim names, no workers. Occupied night.
- `starcraft.mp4`: 24.2 s at 1920x1080, 25 fps. The frame at 10 s shows 18 bots on three staggered rows with working chips and visored workers.

Runtime PNGs under `apps/client/public/themes/starcraft/`: `ground.png` 192 KB, 1280x720, opaque indexed, no alpha. `hut.png` 48 KB and `vault.png` 36 KB, 512x512 with alpha. All under 256 KB.

`npm run assets -- ledger --verify` reports 0 bad rows, 107/500 calls, 65/400 images.

## What was rejected and why

- b as base. Its floor throws away the canyon and sand. Those are the hard things to retrofit.
- c as base. Overlap at 8. Do not import `diamondMetric` or peaked sheds.
- d as base. Black-grouted diamonds are a concept miss. Do not take `render.ts` split or the walker sprite.
- B's `DUSTWALL OUTPOST / FLOOR GRID` HUD, oversized door `fillRect`, and dark diamond floor.
- A new Grok call for idle-steel windows. Code-drawn rects instead.
- Graft 5, b's extra blit path. a already caches the terrain layer. 1.28 ms at 40 is under 3.0 ms.
- A symmetric 296 margin. Only the left has an overlay to clear.

## Asset ledger

A committed its six call rows and six manifest rows, three gen and three passing read-backs, on cand-a. They already sit on this branch from the rebase.

C committed four gen rows for `sand`, `wood`, `steel`, and `pad`, plus four unread manifest rows. D committed four gen rows for `wood-lit`, `ground`, `pad`, and `steel-dark`, plus four unread manifest rows. Those ids collide with each other and with `starcraft`. `pad` collides in particular. The losers' rows carry theme `starcraft-cand-c` and `starcraft-cand-d`. Their outputs, prompts, specs and per-directory manifests live under `docs/images/assets/starcraft-cand-c/` and `docs/images/assets/starcraft-cand-d/`.

B committed no `calls.tsv` or `manifest.tsv` rows. Its rationale claims two gen calls for `timber-depot.png` and `steel-depot.png`. Those keyed PNGs are copied to `docs/images/assets/starcraft-cand-b/building/` with two rebuilt call rows stamped from the file mtime `2026-09-16T06:28:21Z` and empty `seconds`. No prompt files existed to copy. Prompt path is empty.

Call order in the ledger is d, then c, then a, then b.

Grok calls this step: 0. Images generated: 0.

## Pages prefix

`assetUrl(name, base)` joins the sprite name onto the Vite base. `loadSprites` passes `import.meta.env.BASE_URL`. A unit test pins `/`, `/lorien-stack/`, and `/lorien-stack` to literal URLs.

Hosted proof, no gateway, static serve of `vite build --base /lorien-stack/` on 5266:

- curl 200 for hut, vault, and ground under `/lorien-stack/themes/starcraft/`
- Playwright at `/lorien-stack/?theme=starcraft&demo=40`: 40 units, zero sockets, page requests those three URLs at 200
- `/tmp/theme-night/05b-starcraft/proof/hosted-40.png` shows the canyon, vaults, huts, and working chips

## Deviations

- Losers' ledger rows are re-themed and their raw outputs relocated as above, rather than appended verbatim under `docs/images/assets/starcraft/`.
- B's two call rows are rebuilt from PNG mtimes because b never wrote the ledger.
- One commit for the Pages prefix, not a failing-test commit then a fix. Lorien did the same.
- Graft 5 skipped on the measured number, not implemented then reverted.

## Outcome

Squash-merged to `main` as `f393ac1` from PR head `e6307b5` on the root's authorization, https://github.com/yuri-poliantsev/lorien-stack/pull/24. The merge commit's workflow run is https://github.com/yuri-poliantsev/lorien-stack/actions/runs/35073201775. `ci` succeeded in 28s and `pages` in 29s.

## Next step

Candidate branches `theme-night/05b-starcraft-cand-a` through `theme-night/05b-starcraft-cand-d` stay on origin until the root confirms deletion. The README gallery in step 9 picks up `docs/images/themes/starcraft-8.png` and `starcraft.mp4`.
