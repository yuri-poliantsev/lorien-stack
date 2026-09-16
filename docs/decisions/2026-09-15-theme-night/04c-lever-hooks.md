# 04c. Theme-agnostic lever hooks and a busy 40-bot still

## What was decided

The capture lever waits on `theme-canvas` and `theme-unit` with poses `working | idle | sleeping`. A working still shoots when at least `ceil(N / 3)` units are `working`, or after 40 s. The manifest line records `working= idle= sleeping=` from those poses.

Demo start stagger is `min(1600, floor(12000 / N))` ms so every tape starts within about 12 s. Quiet and sleep holds stay at 4000 ms and 3000 ms.

StarCraft switches to the same hook names after PR 13 merges. Constants live in `apps/client/src/themes/hooks.ts`.

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

`.audit/bakeoff-common.md` already names `theme-canvas` and `theme-unit`.

Gates at `d6f5267` plus the follow-up ready tests: `npm test`, `typecheck`, `build -w apps/client`, and `docs:smoke` pass. Injected-clock first emit times are `[0]`, `[0, 1500, …, 10500]`, and `[0, 300, …, 11700]`. `workingNeed` is 1 / 3 / 14 at N=1 / 8 / 40. A still manifest line is `…\tworking=14\tidle=18\tsleeping=8`.

`rg -n "sc-unit|starcraft-canvas" apps scripts docs` still hits `apps/client/src/themes/starcraft/scene.ts` (three lines) and two decision entries. Those scene lines wait for PR 13. Capture no longer names them.

The 40-unit `theme-canvas` / `theme-unit` page assertion and the reshoot of `docs/images/themes/starcraft-{1,8,18,40}.png` wait on the rebase onto 13. This branch does not touch `scene.ts` or `registry.ts` until then.

## What was rejected and why

Keeping `sc-unit` / `starcraft-canvas` as aliases. Bakeoff themes would have to emit two names. The lever reads the contract only.

A fixed 1600 ms clone stagger. At N=40 the last tape starts at 62.4 s.

Waiting on header counts. The 03-shell strip uses its own event window, so header and unit poses can disagree. The lever reads unit poses.

## Next step

Wait for PR 13 to merge. Rebase onto `origin/main` and resolve `scene.ts` toward 13's `ThemeRenderInput.selectedBotId` (no `localSelected`). Switch StarCraft to the hook constants, add the 40-unit page assertion, reshoot the stills, then open the PR. Do not merge until authorized.
