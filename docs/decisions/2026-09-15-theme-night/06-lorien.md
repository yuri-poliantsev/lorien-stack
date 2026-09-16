# 06. Lórien, via bakeoff

## What was decided

Candidate a (`theme-night/06-lorien-cand-a`, head `1d92302`) is the base. Four grafts follow, one commit each: b's left gutter, b's state chip and bolder sign text, c's left-ellipsis path, c's clock-to-sky palette with dusk pinned under reduced motion. Ranking a, b, c, d.

d is disqualified. Its three runtime backdrop PNGs carry no alpha, every still shows raw magenta sky, and its own manifest reads 5.95 ms at 40 against the 4 ms budget. c is not the base because its 8-bot still draws three flets deck to deck on the upper branch, against the no-overlap-to-24 rule and against its own passing overlap test.

The two judges disagreed on the base. Judge 1 ranked a 22, b 20, c 11, d 8 and picked a as the only candidate whose three frames read as the concept and the only convincing all-asleep night forest. Judge 2 ranked b 23, a 21, c 14, d 8 and picked b for dense legibility, frame margin and code size. Judge 2's own scores gave a 5/5 on concept and 5/5 on asleep, and the rubric puts concept match first. b's advantages are a margin constant, a text style and a string function. a's art does not graft into b. The root reconciled on a.

Kept from a: the layered forest with pale trunks, the graded sky, the dark sleeper flets with green eyes and an ember, the model/test split (`layout.ts` pure and tested, `model.ts` pure and tested, `scene.ts` and `sprites.ts` drawing), and the real-mouse selection proof.

## Data shape

`FletBox` in `layout.ts` is unchanged. `ROSTER_GUTTER = 296` replaces the symmetric `MARGIN_X = 78` on the left; the right margin stays 78. `Sky` in `model.ts` keeps `{ name, zenith, mid, horizon, ambient }`; `skyFromClock({ minutes, reducedMotion })` replaces `skyAt(hours)` and its blended anchors with c's four palettes and piecewise schedule. `inSceneLabel` returns the state word in capitals, then action, then `shortPath(path)`, joined by `LABEL_SEPARATOR`. The chip renderer treats that string as segments in priority order and drops from the right when it overflows.

## What evidence decided it

Twelve arena stills under `/tmp/theme-night/arena/lorien/{a,b,c,d}/`, viewed at full size. The three losing 40-bot stills are committed at `docs/images/themes/bakeoff/lorien-{b,c,d}-40.png`.

- b at 40: a tidy 10x4 grid, every name readable, nothing under the roster, but a pixelated 256x144 upscale with no trunks or sky.
- c at 40: flets and captions pile along every branch, names near six pixels, most bots unidentifiable.
- d at 40: a magenta field with four ruled lines; the forest is absent.

Lever runs at 1920x1080 from this branch, all with `CAPTURE_GATEWAY_PORTS=8210..8215 CAPTURE_PREVIEW_PORTS=5210..5215`:

Before grafts, at the rebased head `2e89b98` (`/tmp/theme-night/06-lorien/baseline/`):

```
lorien-8.png        N=8   avgFrameMs=0.41  pose_working=3   pose_idle=5   pose_sleeping=0
lorien-40.png       N=40  avgFrameMs=0.88  pose_working=16  pose_idle=24  pose_sleeping=0
lorien-8-asleep.png N=8   avgFrameMs=0.40  pose_working=0   pose_idle=0   pose_sleeping=8
```

The baseline 40 still shows the leftmost column (Sable 3, Reed, Koji 2, Reed 5, Mira 3) under the roster panel, the defect graft 1 removes.

After grafts 1 to 4, the deliverable run into `docs/images/themes/` at code head `9d191d9`:

```
lorien-8.png        N=8   avgFrameMs=7.11  pose_working=3   pose_idle=5   pose_sleeping=0
lorien-40.png       N=40  avgFrameMs=1.82  pose_working=17  pose_idle=23  pose_sleeping=0
lorien-8-asleep.png N=8   avgFrameMs=0.75  pose_working=0   pose_idle=0   pose_sleeping=8
lorien.mp4          N=18  avgFrameMs=1.43
```

A second run of the same head to `/tmp/theme-night/06-lorien/rerun/` read 1.31 at 8, 1.37 at 40, 1.21 asleep. The 7.11 at 8 did not reproduce, and the runs after grafts 2 and 4 read 1.37 and 1.20 at 8, so it is a one-off first-window sample. At 40 the number the brief asks for is 1.82 ms (1.37 on the re-run), against 0.88 before grafts and the 3.5 ms trigger for perf work. No perf work was done. a's rationale measured 3.05 with its own Playwright script and recorded that bitmap caches for figures and plaques made it worse (4.1 to 7.2 ms); that was not repeated.

Stills at the final head, one sentence each:

- `lorien-8.png`: two branch tiers of four flets right of the roster, WORKING chips in gold with `…rc/store.ts` and `…rc/index.ts` paths, IDLE chips in ink, bolder wooden name plaques, a blue-grey over rose dawn sky at 07:42.
- `lorien-40.png`: five tiers of eight, every plaque and chip readable, the first column starting at x=306 clear of the roster, paths truncated to tails like `…tail.ts` and `…teway/src` inside their cells.
- `lorien-8-asleep.png`: eight dark flets with unlit lanterns, paired green eyes and a dim SLEEPING chip each, still a forest.
- `lorien.mp4`: 23.8 s at 1920x1080, 25 fps; the frame at 10 s shows 18 bots on three tiers with lit lanterns and mostly WORKING chips.

Live proof (`/tmp/theme-night/06-lorien/prove.mjs`, output under `/tmp/theme-night/06-lorien/proof/`), on ports 8216/5216 against the built client:

- With `prefers-reduced-motion: reduce`, `theme-canvas[data-sky-phase]` reads `dusk` and the still shows the concept's teal-to-purple sky at about 07:47 local time. Without it the phase reads `dawn`.
- A real mouse click on the fourth `theme-unit` sets `data-selected-bot-id` on the canvas to that bot, marks the hit target `data-selected="true"`, opens the inspector for Lauren and draws the gold outline.
- Eight `theme-unit` buttons, each with a pose in `working | idle | sleeping`. The header picker shows Lórien pressed at `?theme=lorien`.

Tests: `layout.test.ts` walks every N from 1 to 40 asserting no unit rect starts left of the gutter; that test was red on the old layout (x=273 at 4 bots) before the constant moved. Literal expectations updated for the narrower cells at 40 (cell 193.25, flet 119.82, scale 0.5705). `model.test.ts` pins `skyFromClock` at midnight, 20:00, one blend at 06:00, the wrap, and the reduced-motion pin, plus `shortPath` and `inSceneLabel` literals.

Runtime assets under `apps/client/public/themes/lorien/`: five PNGs, colour type 3 with `tRNS`, 7 to 69 KB, all under 256 KB.

## What was rejected and why

- b as base. Its backdrop is a 256x144 upscale with no trunks, sky or stars, and its all-asleep frame does not darken. Those are the two hardest things to retrofit; a's deficits were a constant and a palette.
- Moving the chip above the figure, b's placement. The spec puts action and path beside the lantern, and lifting the chip out of the figure's rise would grow `UNIT_EXTENT` and cost about ten percent of flet size at 24 (0.817 to 0.736 by the height bound). Kept a's beside-the-lantern anchor and restyled it.
- A symmetric 296 margin. Only the left has an overlay to clear; a symmetric gutter would waste 218 px on the right.
- c's `shortPath` verbatim. It drops leading directories without an ellipsis, so a truncated path looks whole. The graft adds the ellipsis and literal tests.
- a's `fitText` slash-tail fallback. It showed only the file name when a label overflowed, which would have eaten the WORKING word once paths were always present. Replaced with segment-priority trimming.
- Bitmap caches for figures and plaques, per a's own measurement.
- A sleeping-tinted plaque from b. The brief keeps a's wooden plaque look; the dim SLEEPING chip carries the state.

## Asset ledger

Candidates could not touch `scripts/**`. a, c and d left their `calls.tsv` and `manifest.tsv` rows uncommitted in their worktrees; b kept only the per-directory manifests the lever writes beside outputs and no root rows. All 28 calls (a 10, b 6, c 5, d 7) and 28 manifest rows are appended in call order in commit `240c4ab`. b's six call rows are rebuilt from prompt and output mtimes in its worktree; its rationale confirms six calls for five images, one flet call landing no file.

Every candidate wrote `sprite/flet.jpg` and `sprite/lantern.jpg` to `docs/images/assets/lorien/` with different hashes, so the losers' outputs cannot sit at their original paths, and `discardsFor(theme, id)` would count d's two `fail` rows against the shipped `lorien/flet` and `lorien/lantern`. The losers' rows carry theme `lorien-cand-{b,c,d}` and their outputs, prompts, specs and per-directory manifests live under `docs/images/assets/lorien-cand-{b,c,d}/`. `npm run assets -- ledger --verify` reports 0 bad rows. Only a's five keyed PNGs ship at runtime.

Grok calls this step: 0. Images generated: 0.

## Pages prefix

`ASSET_BASE = "/themes/lorien"` is a root-absolute URL. A Pages build with `--base /lorien-stack/` copies the five PNGs to `/lorien-stack/themes/lorien/`, so the hosted demo 404s them and paints flets on a bare sky. Vite-served at `/` hid this.

`assetUrl(name, base)` joins the sprite name onto the Vite base. `loadImages` passes `import.meta.env.BASE_URL`. A unit test pins `/`, `/lorien-stack/`, and `/lorien-stack` to literal URLs.

Hosted proof, no gateway, static serve on 5210:

- curl 200 for all five PNGs under `/lorien-stack/themes/lorien/`
- Playwright at `/lorien-stack/?theme=lorien&demo=40`: 40 units, zero sockets, page requests those five URLs at 200
- `/tmp/theme-night/06-lorien/proof/hosted-40-before.png` has flets and no trunks
- `/tmp/theme-night/06-lorien/proof/hosted-40-after.png` has trunks and canopy

Vite preview at base `/` on 5211: `/?theme=lorien` requests `/themes/lorien/*.png` at 200, trunks and canopy still paint.

## Deviations

- Losers' ledger rows are re-themed and their raw outputs relocated as above, rather than appended verbatim under `docs/images/assets/lorien/`.
- The lever on `main` prints manifest lines to stdout and writes no `manifest.tsv` in `--out`; the lines are saved by hand beside each run under `/tmp/theme-night/06-lorien/`.
- One commit for the Pages prefix, not a failing-test commit then a fix. The wrap-up asked for one.

## Next step

Merge on the root's authorization, then delete `theme-night/06-lorien-cand-{a,b,c,d}` on origin after the root confirms. Step 7 (Mission control) runs on its own branch. The README gallery in step 9 picks up `docs/images/themes/lorien-8.png` and `lorien.mp4`.
