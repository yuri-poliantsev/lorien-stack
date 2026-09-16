# 05b. StarCraft rework, via bakeoff

## What was decided

Candidate a (`theme-night/05b-starcraft-cand-a`, head `8687bfd`) is the base. Ranking a, b, d, c. Registry id stays `starcraft`. This replaces the StarCraft theme already on main.

Both judges scored a 23 and picked it as base. It is the only candidate whose three stills read as the concept outpost: tan sand, layered canyon, steel vaults with shutters, visored workers, occupied night. Judge 1 ranked a > b > d > c (23 / 20 / 14 / 13). Judge 2 ranked a > b > c > d (23 / 19 / 18 / 15); its ranking prose listed C above B once, the score table did not. Root took judge 1's reading of C: buildings overlap at 8 against Q4 (no overlap to 24) and against C's own passing pad test, so C is last and is ruled out as a base. D is not disqualified (under 4 ms, hooks hold) but the keyed diamond ground leaves black void between pads; that is a concept miss, not a graft.

b's chips and 0.95 ms are real. They graft into a. a's canyon and asleep yard do not graft into b.

Grafts, one commit each, in the brief's order:

1. Raise the left gutter so every pad's left edge is at least 296 px at N from 1 to 40.
2. B's opaque working chip into a's label draw. Keep a's gold working line and grey idle.
3. Tighter left-ellipsis paths plus odd-cell nametag stagger at N > 24.
4. Code-drawn idle-steel windows or door glow. Asleep stays dark except the beacon.
5. Optional: b's offscreen terrain blit, only if `avgFrameMs` at 40 after grafts 1 to 4 is over 3.0.

Kept from a: canyon ground, vault and hut rasters, visored code worker, layout/label/pose split, hook contract, reduced-motion gates.

## Data shape

```
Grid      = { cols, rows, cell, originX, originY }
Plot      = { index, col, row, x, y }          pad centre
PlotLabel = { name, status, path }
ROSTER_GUTTER = 296                             pad left edge at every N in 1..40
PAD_HALF      = cell * 0.44
tagLift       = N > 24 && (col + row) % 2 === 1 ? lift : 0
status chip   = working: "WORKING · ACTION" on an opaque plate
                idle: "idle" in grey
                asleep: name only
```

## What evidence decided it

Twelve arena stills under `/tmp/theme-night/arena/starcraft/{a,b,c,d}/`, viewed at full size.

- a at 8: two rows of four on tan sand against a layered canyon, steel vaults next to timber huts, visored workers at working doors. Timber is a peaked cabin, not the boxy prefab in the readback. Idle steel is a brightness shift.
- a at 40: 8x5 field, every name readable, gold working lines vs grey idle. Left column clears the roster in this still because the 8-column span centred; `MARGIN_X = 40` is still a trap at other N.
- a asleep: eight dark buildings, one red beacon each, dim names, no workers. Occupied night.
- b at 40: crisp `WORKING · ACTION` chips, 0.95 ms, brown diamond HUD floor, oversized door blobs.
- c at 8: buildings overlap (Ivo on Lauren on Anouk). Ruled out as base.
- d at 40: names on dark chips, black void between keyed diamond tiles.

Losing 40-bot stills will land at `docs/images/themes/bakeoff/starcraft-{b,c,d}-40.png`. Lever numbers and graft results land below as they run.

## What was rejected and why

- b as base. Its floor throws away the canyon and sand. Those are the hard things to retrofit.
- c as base. Overlap at 8. Do not import `diamondMetric` or peaked sheds.
- d as base. Black-grouted diamonds are a concept miss. Do not take `render.ts` split or the walker sprite.
- B's `DUSTWALL OUTPOST / FLOOR GRID` HUD, oversized door `fillRect`, and dark diamond floor.
- A new Grok call for idle-steel windows. Code-drawn rects or a door slit instead.

## Next step

Graft 1: left gutter 296, literal test for every N from 1 to 40.
