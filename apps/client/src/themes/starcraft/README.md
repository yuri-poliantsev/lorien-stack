# StarCraft theme

2D command view for the client floor. Original canvas drawing only. No Blizzard art, no sprite sheets, no CDN.

The host passes roster and activity. This folder does not import the gateway, the websocket client, or the prompt bar. Click a unit or its building and the host selects that bot. The existing activity panel and wake bar then follow that id.

## Layout

`layout.ts` hashes bot ids onto stations. Same ids keep the same seats after a reshuffle. Optional `spatial` on a record can pin a bot to a named station or a grid cell. Those fields are placement only. They are not a 3D scene.

Working bots are the ones whose activity just grew. After a quiet stretch they stand down, then show REST and stay on the floor. A bot with no tape is still drawn.

## Files

- `layout.ts` world size, stations, seat assignment, pose clock
- `sprites.ts` ground, buildings, operators, nametags
- `scene.ts` canvas mount, hits, letterbox scale
- `layout.test.ts` seat stability
