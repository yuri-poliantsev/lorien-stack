# 04b. Demo presence follows the rewritten tape clock

## What was decided

Demo sleep hints use the rewritten `at` of the last event that bot actually emitted in the current cycle, not the fixture timestamp baked into `BotTape.lastActivityAt`.

When a tape loops after the hold, replay emits a wake hint with reason `recent`. During a short quiet hold after the last line, it emits `quiet`. During the sleep hold it emits `sleep`. Those are the same reason strings live mode uses (`recent`, `quiet`, `sleep`). The step 3 shell maps them to working, idle, and asleep.

Hold and stagger (chosen after measuring tape length):

- Stream is 3200 to 4800ms at multiplier 1000.
- `DEMO_QUIET_HOLD_MS` = 4000
- `DEMO_SLEEP_HOLD_MS` = 3000 (was 24000; 4000 still peaked at 17 of 40 asleep)
- `DEMO_STAGGER_MS` = 3500 (unchanged)
- `DEMO_CLONE_STAGGER_MS` = 1600 (was 400)

A cycle is about 12s. Sleep is a quarter of that. `--replay-idle` still sleeps everyone with no tape.

## Data shape

```
ReplayPresence = {
  kind: "sleep" | "wake" | "quiet"
  botId
  lastActivityAt   # now() at last write, or now() at wake
}

Presence reason vocabulary = recent | quiet | sleep
```

## What evidence decided it

The root reproduced `--demo --bots 8` on main. Events arrive with `at` rewritten to now. After the first cycle, `runReplay` called `onSleep` with `2026-08-27T09:30:03Z`. The gateway emitted `freshnessMs` in the billions. The loop kept writing. The shell stayed asleep. At N=40 the header read 0 working / 0 idle / 40 asleep while ev/min was 185.

Tape waits are 3.2s to 4.8s. The old 24s hold meant each bot spent most of the cycle in `sleep` even after the timestamp fix.

60s WS logs on 8078 and 8079 (`/tmp/theme-night/04b/presence-8.log`, `presence-40.log`): 97 and 451 presence lines, reasons `recent,quiet,sleep`, no `2026-08-27` timestamps, freshness 0 on wake/quiet and about 4000ms on sleep.

A 45s remeasure at hold=3000 (`/tmp/theme-night/04b/presence-40-hold3.log`) peaked at 14 of 40 asleep at 39.9s. Last snapshot was 18 recent / 13 quiet / 9 sleep.

Capture with `origin/theme-night/03-shell` merged locally at `/tmp/theme-night/04b/scratch` (not pushed):

- `/tmp/theme-night/04b/starcraft-8.png`: header 4 working / 2 idle / 2 asleep
- `/tmp/theme-night/04b/starcraft-40.png`: header 21 working / 11 idle / 8 asleep
- `/tmp/theme-night/04b/starcraft-8-asleep.png`: `--replay-idle` still 0 / 0 / 8

## What was rejected and why

Fixing this in the client. The gateway minted the stale hint. The shell already maps live reasons correctly.

Keeping the 24s hold and only correcting `lastActivityAt`. The duty cycle would still leave more than a third of 40 bots asleep.

Driving idle from freshness aging on a live clock during demo. Demo does not run that timer. Explicit `quiet` and `sleep` hints are the same vocabulary without a second clock.

## Next step

Do not merge until the root says `merge authorized at <sha>`.
