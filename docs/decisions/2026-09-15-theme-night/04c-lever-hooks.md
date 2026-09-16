# 04c. Theme-agnostic lever hooks and a busy 40-bot still

## What was decided

The capture lever waits on `theme-canvas` and `theme-unit` with poses `working | idle | sleeping`. A working still shoots when at least `ceil(N / 3)` units are `working`, or after 40 s. The manifest line records `working= idle= sleeping=` from those poses.

Right after roster-ready, capture preflights the hooks. Within 5 s there must be one `theme-canvas` whose `data-unit-count` equals N, and N `theme-unit` nodes each with `data-bot-id` and a pose in the set. A miss exits 1 and names the theme, the missing hook, and the counts. A StarCraft build with `dataset.pose` removed, run at N=8, exited 1 in 9.06 s with `theme=starcraft missing data-pose canvases=1 unitCount=8 units=8 withBotId=8 withPose=0`. The scene edit was reverted.

Demo start stagger is `min(1600, floor(12000 / N))` ms so every tape starts within about 12 s. Quiet and sleep holds stay at 4000 ms and 3000 ms.

StarCraft emits the same hook names through constants in `apps/client/src/themes/hooks.ts`. `theme-canvas` is on the canvas before the first paint, with `data-unit-count` updated on every render. Each bot has one `theme-unit` button with `data-bot-id` and `data-pose`. Click (and native Enter on that button) calls `onSelect`.

## Data shape

```
ThemePose = "working" | "idle" | "sleeping"
theme-canvas[data-unit-count]
theme-unit[data-bot-id][data-pose]
staggerMs(N) = min(1600, floor(12000 / N))
startOffsetMs(i) = i * staggerMs(N)
```

## What evidence decided it

40-bot stills on trunk read mostly idle because clones staggered by 1600 ms take 64 s to start and the lever shoots at about 10 s. Live presence over 60 s already showed 13-18 working.

The hook contract is `data-testid="theme-canvas"` with `data-unit-count` on the surface, one `data-testid="theme-unit"` per bot with `data-bot-id` and `data-pose` in `working | idle | sleeping`, and click or Enter calling `onSelect`.

Rebase onto `origin/main` `902731f` (PR 13 `b9dab72`, PR 12 `902731f`) was clean. `ThemeRenderInput.selectedBotId` was already on main. Scene kept that field and dropped the old test ids.

Gates after the hook switch: `npm test`, `typecheck`, `build -w apps/client`, and `docs:smoke` pass. Injected-clock first emit times are `[0]`, `[0, 1500, …, 10500]`, and `[0, 300, …, 11700]`. `workingNeed` is 1 / 3 / 14 at N=1 / 8 / 40.

`scripts/capture/hooks-page.test.mjs` loads a StarCraft page against `--demo --bots 40` and asserts one `theme-canvas` with `data-unit-count="40"` and 40 `theme-unit` nodes. `npm test` ran it in 1.5 s.

`rg -n "sc-unit|starcraft-canvas" apps scripts` is empty. The same search over `docs` hits only `04-demo-lever.md` and this file.

Capture on this head, `npm run capture -- --theme starcraft --bots 1,8,18,40 --out docs/images/themes --record 20`:

```
starcraft-1.png	N=1	working=1	idle=0	sleeping=0	avgFrameMs=1.26
starcraft-8.png	N=8	working=3	idle=5	sleeping=0	avgFrameMs=0.86
starcraft-18.png	N=18	working=7	idle=11	sleeping=0	avgFrameMs=1.04
starcraft-40.png	N=40	working=17	idle=23	sleeping=0	avgFrameMs=1.68
starcraft-8-asleep.png	N=8	working=0	idle=0	sleeping=8	avgFrameMs=0.98
starcraft.mp4	N=18	avgFrameMs=1.12
```

Viewed every still. Header counts: 1/0/0, 3/5/0, 7/11/0, **14/26/0**, 0/0/8. The 40-bot header is 14 working. The manifest line is 17 working. Both are at least 13. Header and unit poses still disagree (step 3 strip vs `poseFromPulse`).

## What was rejected and why

Keeping `sc-unit` / `starcraft-canvas` as aliases. Bakeoff themes would have to emit two names. The lever reads the contract only.

A fixed 1600 ms clone stagger. At N=40 the last tape starts at 62.4 s.

Waiting on header counts. The 03-shell strip uses its own event window, so header and unit poses can disagree. The lever reads unit poses.

## Next step

Wait for merge authorization at this head. Do not merge until the root says `merge authorized at <sha>`.

A later owner should give the shell header strip and the theme's `poseFromPulse` one classification. At N=40 they disagreed (header 14 working, unit poses 17) because the strip uses its own event window.
