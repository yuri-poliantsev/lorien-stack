# Mission control theme

Editorial dark dashboard for the client floor. DOM, not canvas: one card per bot in a
generative grid, big type, one amber accent. No CRT, no game skin, no fake terminal.

The host passes roster and activity. This folder does not import the gateway or the
websocket client. Clicking a card, or pressing Enter on it, reports the bot id through
`context.onSelect`; the highlight is drawn from `selectedBotId` on the next render.

## Layout

`layout.ts` places the board in a fixed 1920x1080 world that `context.camera` pans and
zooms as one CSS transform. Column count steps from roster size, cards clamp to a maximum
size and the block centres in the grid area, so 1 bot and 40 bots both read as composed.
Slot order is bot id, never name, so a card never jumps when a name changes.

The board reserves a 296px rail on the left. The shell floats its roster panel there, and
reserving the band is what keeps the first column of cards out from behind the glass at
every roster size.

## Frame budget

There is no animation loop. The shell already re-renders once a second, which is what
advances the pose clock, so the theme only writes the DOM fields that changed on that
render. The one `requestAnimationFrame` is the number count-up, and it cancels itself the
moment no number is moving.

## Files

- `layout.ts` world and board geometry, column steps, card rects, type scale, slot order
- `model.ts` pose clock, activity sparkline, card model, real-clock accent
- `scene.ts` DOM mount, per-card diff, camera transform, stylesheet
- `layout.test.ts` slot stability, no overlap to 24, bounded crowding at 40, type scale
- `model.test.ts` pose thresholds, sparkline buckets, card labels, accent clock
