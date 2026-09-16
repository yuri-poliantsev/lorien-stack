# 07. Mission control theme, via bakeoff

## What was decided

Four candidates built the theme against one spec on `theme-night/07-mission-control-cand-{a,b,c,d}`. The spec (an untracked working note during the night) required: a modern editorial dark dashboard, big type, cards, one accent, no CRT, no game skin, no fake terminal (Q17); one card per bot in a generative grid for a roster of 1 to 40, all cards fitting 1920x1080 without scrolling, slot order by bot id; three poses, `working` with an accent edge and the action word plus file path, `idle` with the last action greyed and an age, `sleeping` dimmed to the name with a moon or dot, and an all-asleep board that still reads as a finished dashboard; the NFKC name as the card headline; nothing drawn under the shell's roster panel at any N, which a's 296px rail reservation is the answer to; camera pan and zoom honoured as a transform on the grid; ambience gated by `reducedMotion`; `avgFrameMs` under 4 at 40 bots with per-card DOM diffs; and the lever's hook contract, `data-testid="theme-canvas"` with `data-unit-count`, one `data-testid="theme-unit"` button per bot with `data-bot-id` and `data-pose` in `working | idle | sleeping`, click or Enter calling `context.onSelect`.

Two judges read the code and the stills blind. Judge 1 ranked a > b > d > c and chose a as the base (scores 21, 20, 16, 13 of 25). Judge 2 ranked b > a > c > d and chose b as the base (scores 17 for a, 22 for b, 14 for c, 18 for d before disqualification). Root reconciled their verdicts. Candidate a (head `7af6826`) is the base. The final ranking is a, b, c, d.

Both judges disqualified d as a base. Its pure layout function centres the grid in the full 1920 world with no left reservation, so the shell's roster panel covers the first column at every roster size. The judges' disagreement on the top slot was about b's two visible defects. Judge 1 saw both in every still. The `.mc-card-copy` span had no display, so the action and path ran together as `TALKINGNO FILE TARGET`, and the `LORIEN / MC` wordmark sat under the roster panel and read as `EN / MC`. Judge 2 saw only the wordmark clip and scored b on concept match. Root took judge 1's reading of the stills. Judge 2's grafts were not taken because they moved a's parts into b; with a as the base they are already present.

Four grafts landed, one commit each, in the brief's order.

1. From b, the status band. `ROSTER / LIVE NOW / ASLEEP`, zero-padded, recomputed from the pose tally on every render. It sits with the `Operational overview` eyebrow and the `Mission Control` title in a 136px header strip at the top of the grid area. b's `.mc-rail` aside and `.mc-kicker` were not taken; both lived under the roster panel.
2. From d, the action line. `<glyph> <action> · <path>` on one line, with the path cut from the left by string logic so the file name survives. This replaces a's `direction: rtl` ellipsis, which a's own rationale flagged as a bidi reordering risk. The character budget comes from the card width.
3. From c, the gold grid. Two `rgba(212, 168, 72, 0.055)` gradient layers at 48px on the theme canvas. a's own 64px backdrop on the host, hidden under the solid board, was removed rather than stacked.
4. From c, the card-height cap. `MAX_CARD_H` went from 372 to 292. Above twelve bots the rows are already shorter than 292, so one constant covers the brief's below-24 cap and no count branch is needed.

Kept from a: the 296px rail reservation, the model and test split, the asleep treatment, the real-mouse proofs.

## Data shape

```
HEADER   = { x: 316, y: 44, w: 1560, h: 136 }        header strip, right of the rail
GRID_AREA = { x: 316, y: 204, w: 1560, h: 832 }      cards, below the header
Tally    = { roster, working, sleeping }              from tallyPoses(ThemePose[])
METRICS  = [roster "roster", working "live now", sleeping "asleep"]
ACTION_GLYPHS: Record<Action, string>                 → ✎ $ … ? ·
CardModel.line = actionLine({ action, path, maxChars })  "" when asleep
CardScale.chars = floor((w - 2 pad - 9 - 10 - 3 × 0.6 × meta) / (0.6 × meta)), floor 8
MAX_CARD_H = 292
```

## What evidence decided it

The losing 40-bot stills, copied from the arena directories:

- `docs/images/themes/bakeoff/mission-control-b-40.png`. Readable names and amber `LIVE` pills, with `UNKNOWNNO FILE TARGET` on most cards and the wordmark clipped at the left.
- `docs/images/themes/bakeoff/mission-control-c-40.png`. Every card clears the panel, but the state word is near illegible and working versus idle rests on a thin gold edge.
- `docs/images/themes/bakeoff/mission-control-d-40.png`. Largest type of the four, and the whole first column is behind the roster panel.

Per-graft checks, each on the real page through `shoot.mjs` (a's stand-in for the lever, ports 8200 and 5200) until the rebase onto `9e34df7`, then through `npm run capture`:

- Graft 1 at 40 bots showed the name clipped on cards that carried a path line. The card's flex column shrank the name to fit. Graft 2 removed the separate path line and set `flex-shrink: 0` on the text rows, so a crowded card clips its chart, never its name.
- Graft 2's first character budget overran by 4px at 40 bots. A live measurement (`/tmp/theme-night/07-mission-control/measure.mjs`) read the mono advance at 0.58em and the arrow and ellipsis glyphs falling back to a proportional font. `CARD_EDGE` went to 9 and the budget at 40 to 21 characters. The rerun reported no `.mc-line` with `scrollWidth > clientWidth`.
- Graft 4's 8-bot still shows the 292px cards with the 123px chart still reading as bars.

Real-mouse proofs from a's `proof.mjs` at the graft-4 head, 7 of 7 passed. A mouse click selected Sable only and the drawer and board agreed. Enter moved the selection to Koji. Camera fit reported zoom 0.9694. A drag panned to x 1166.30. Home restored the fit. Reduced motion reported `data-motion=off`, no animation, no transition.

Live check of the registry at the graft-4 head, `?theme=mission-control`. The theme host carried `data-theme="mission-control"` and the header picker listed `StarCraft:false` and `Mission control:true`. Lórien is not on `main` yet, so the picker shows two themes on this branch and three once step 6 merges.

Lever run at the merge-ready head, rebased on `origin/main` `3ae8d4f`, `npm run capture -- --theme mission-control --bots 8,40 --record 20 --out docs/images/themes`:

```
mission-control-8.png	N=8	avgFrameMs=0.73	pose_working=3	pose_idle=5	pose_sleeping=0
mission-control-40.png	N=40	avgFrameMs=0.67	pose_working=16	pose_idle=24	pose_sleeping=0
mission-control-8-asleep.png	N=8	avgFrameMs=0.57	pose_working=0	pose_idle=0	pose_sleeping=8
mission-control.mp4	N=18	avgFrameMs=1.04
```

An earlier run at the last theme commit before the rebase read 0.16 / 0.31 / 0.63 / 0.23 for the same four artifacts.

`avgFrameMs` at 40 over five lever runs at the graft-4 head: 0.20, 0.25, 0.57, 0.74, 0.67. The budget is 4. Those lever windows are a few seconds. They hid a climb.

Production preview, N=40, headless 1920x1080, before the CSS change. `working` reached 40 at 10s. DOM nodes stayed at 1545. CSS animations rose from 36 to about 370:

```
t     avgFrameMs  anims  working
5s    1.79        36     23
10s   11.41       84     40
20s   19.45       141    40
40s   26.63       235    40
60s   24.10       373    40
120s  24.00       367    40
```

CDP split those animations. All of the extras were `CSSTransition` on `.mc-spark i`. Each bar had `transition: transform 320ms ease-out`. Activity paints kept giving the bars new `scaleY` targets before 320ms ended, so hundreds of transitions stayed in flight. Dropping that rule and leaving the 40 live-dot pulses still read 4 to 12 ms after 20s. `will-change: opacity` plus `transform: translateZ(0)` on `.mc-dot` put each pulse on its own compositor layer. That held 0.24 to 0.53 ms over 30s.

After those two CSS changes, the same 120s series:

```
t     avgFrameMs  anims  cssAnims  transitions  working  nodes  events
5s    0.22        21     21        0            21       1545   77
10s   0.90        36     36        0            36       1545   185
15s   0.66        40     40        0            40       1545   299
20s   0.61        40     40        0            40       1545   409
30s   0.53        40     40        0            40       1545   637
40s   0.48        40     40        0            40       1545   867
60s   0.67        40     40        0            40       1545   1319
90s   0.78        40     40        0            40       1545   2003
120s  0.70        40     40        0            40       1545   2683
```

StarCraft on the same machine, same load, same 120s stayed at 1.13 at 5s, 1.51 at 15s, 1.47 at 60s, and 2.10 at 120s.

Reduced motion on Mission Control, 45s, was 0.63 to 0.85 with zero animations and the same event growth. The event scan is not the climb. Stills were not reshot. The live pulse remains. Bars snap instead of easing.

Gates at the head: `npm test`, `npm run typecheck`, `npm run build -w apps/client`, `npm run docs:smoke`.

## What was rejected and why

- d as base. Cards under the roster panel at every N, baked into the pure layout.
- b as base. Judge 2's pick on concept match; two visible defects in every still.
- b's `.mc-rail` and `.mc-kicker`. Decorative chrome under the roster panel.
- Graft 5, c's whole-card render-signature guard. The brief allowed it only if `avgFrameMs` at 40 dropped. Before, five lever runs read 0.20, 0.25, 0.57, 0.74, 0.67 (mean 0.49). With the guard, four runs read 0.84, 0.54, 0.32, 0.27 (mean 0.49). a already diffs each field, so the guard only skipped a 20-element bars comparison. Reverted.
- A count branch for the height cap (`count >= 24 ? 236 : 292`). Rows above twelve bots are already below 292.
- Stacking c's grid on top of a's host grid. One backdrop, on the canvas.
- Judge 2's grafts (a's `activityBars` and `cardScale` into b, c's `clockAccent`). With a as base the first two are already present, and a has its own `accentForHour` curve.
- A whole-card render skip on a fresh `bars` array. `writeCard` already skips a bar whose height matches the last write. CDP showed the extra `getAnimations()` entries were spark transitions, not extra style writes from array identity.
- Capping or rewriting `activityBars` because the event arrays look unbounded. Event counts grew from 77 to 2683 over 120s. DOM nodes stayed at 1545. Reduced-motion frame time stayed under 1 ms.

## Outcome

Squash-merged to `main` as `99d1970` from PR head `22146d9` on the root's authorization, https://github.com/yuri-poliantsev/lorien-stack/pull/20. The merge commit's workflow run is https://github.com/yuri-poliantsev/lorien-stack/actions/runs/35066904185. `ci` succeeded in 26s and `pages` in 17s.

## Next step

Candidate branches `theme-night/07-mission-control-cand-{a,b,c,d}` stay on origin until the root confirms deletion. Step 8, hosted demo on GitHub Pages (`theme-night/08-hosted-demo` is already pushed). The README gallery in step 9 takes `docs/images/themes/mission-control-{8,40,8-asleep}.png` and `mission-control.mp4`.
