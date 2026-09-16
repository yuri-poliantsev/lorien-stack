# StarCraft theme

An isometric industrial outpost: one building per bot, each on its own concrete pad. Lit
with a worker at the door means working, lit and empty means idle, dark with a blinking red
roof beacon means asleep. Original art only. No published game's assets.

The host passes roster and activity. This folder imports neither the gateway nor the
websocket client. Selection belongs to the shell: the highlight is drawn from
`selectedBotId` on every render and a click is reported through `context.onSelect`.

Static layers are generated raster keyed to alpha under `apps/client/public/themes/starcraft/`
(Q5 repeals the old no-sprite-sheets rule). Anything animated or stateful is code: the
worker and its action pose, the beacon blink, the door light, the dust, the clock tint, and
the asleep shell, which is the lit sheet with a dark wash composited over it at load.

## Layout

`layout.ts` sizes a staggered isometric grid to the roster count, then hashes bot ids onto
cells and resolves collisions by linear probe. The roster is sorted by id first, so the same
set of bots lands on the same field whatever order it arrives in. Odd rows shift half a
column, which is what makes a rectangular field read as an isometric floor and lets a 16:9
world fill up instead of leaving a diamond's empty corners.

The grid shape is chosen by trying every row count and keeping the one that yields the
largest cell, capped at 400 so a single bot does not fill the screen. The left edge of
every pad stays at or right of 296 so the roster panel never covers a plot. Eight bots
land on four columns by two rows at a 352-unit cell, forty on eight by five at 186.

## Files

- `layout.ts` world size, grid plan, plot assignment
- `pose.ts` working, idle and sleeping from the activity pulse
- `label.ts` nametag, action line and path budget
- `terrain.ts` ground, clock tint, pads, dust
- `sprites.ts` keyed sheet loading and the dark twin
- `building.ts` building, worker poses, beacon, labels
- `scene.ts` canvas mount, cached terrain layer, focus targets
