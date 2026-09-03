# Watch Grok Bots work

![Bots at play](docs/images/childrens-games.jpg)

Open-source gateway and reference UI for watching Grok Bots work.

lorien-stack tails Grok Bot `$AGENT_DATA` on disk, streams roster and activity to a browser, and wakes a bot by POSTing a Grok webhook from the server. The default UI is a StarCraft-inspired 2D command view with an activity panel and a one-line prompt bar.

It is **not** a Chat kit, a theme marketplace, or a 3D engine. Wake means the webhook acknowledged. It does not mean the bot finished the work.

## Vision

One shared runtime for many looks. Keep discovery, activity, and wake stable. Let themes change freely.

Inspiration is one-shot generated villages that burn tokens to rebuild the whole app. lorien-stack inverts that. The gateway and contracts stay in git. A theme is a consumer of roster and activity events, not a generated rewrite of the stack. 2D ships first. 3D stays possible later because spatial fields on the wire are optional, not because the core embeds a scene graph.

The prompt bar stays an activity panel plus a slim wake. Full Grok chat waits on a real duplex API.

## Status

Shipped and exercised on real Grok Bot hosts.

- Contracts, gateway, Vite client, and StarCraft theme on `main`
- Demo mode with fixture bots and compressed replay
- Live mode against `$AGENT_DATA`, including large transcript files
- Live presence hints from a quiet clock (heuristic, not lifecycle)
- OSS live how-to and a paste-ready setup prompt for a Grok Bot on the host
- Live start refuses an empty client token. Allowlist stays explicit or `discovered`

Known limits.

- `GET /api/bots` and `GET /ws` are reachable by anyone who can open the port
- Client falls back to `demo-token` unless `VITE_GATEWAY_TOKEN` is set. That value must match `GATEWAY_CLIENT_TOKEN`
- Wake ack is not proof the bot ran
- Presence is a quiet-time hint. Long tool calls with no JSONL growth can look asleep
- No WebSocket reconnect. Reload the page after a gateway restart
- One disk layout (grok driver). One default theme mount

## Next steps

In priority order for maintainers and contributors.

1. Prove wake on a live host if you have only watched the roster so far. Select a bot, send a short prompt, confirm gateway `acknowledged`, then confirm the bot actually moves.
2. Fix friction from real runs. Reconnect, allowlist UX, presence feel, and doc gaps beat new features.
3. Optional read-path auth for roster and `/ws` when the UI sits on a wide Tailscale ACL.
4. A second theme only after wake and security feel solid. That is how the theme host earns its keep.

## Requirements

- Node.js `>=22.14.0`

## Quick start (demo)

```bash
npm install
npm run gateway -- --demo --listen :8040
```

In a second terminal:

```bash
npm run dev -w apps/client
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173).

Demo client token is `demo-token`. Without `WEBHOOK_URL` and `WEBHOOK_SENDER_KEY`, the prompt bar still sends and shows a failed wake. That is expected.

## What you get

| Piece | Path | Role |
| --- | --- | --- |
| Contracts | `packages/contracts` | Versioned wire types and parsers |
| Gateway | `apps/gateway` | Disk tail, WebSocket fan-out, authenticated `requestWake` |
| Client | `apps/client` | Vite UI, activity panel, slim prompt, StarCraft canvas |
| Demo data | `fixtures/demo` | Eight fake bots in the on-disk `$AGENT_DATA` layout |

Themes consume roster and activity only. Swap the mount in `apps/client/src/themeHost.ts`. Do not import the gateway from a theme.

## Live bots

[Live setup](docs/live.md) is the full walkthrough for a real Grok Bot host: agent data, webhook routine, env, Tailscale, and a troubleshooting table. [Setup prompt](docs/prompts/lorien-stack-setup.md) is the same walkthrough as one block you paste to a Grok Bot on that host. The short version points the gateway at real agent data:

```bash
AGENT_DATA=/path/to/agent-data npm run gateway -- --listen :8040 --allowlist <bot-uuid>
```

Expected layout:

- `agents/<uuid>/profile.json`
- `agent-transcripts/<uuid>/*.jsonl`

Live wakes need matching client tokens, an allowlist, and webhook env:

```bash
export GATEWAY_CLIENT_TOKEN=...
export VITE_GATEWAY_TOKEN=...   # same string; client defaults to demo-token otherwise
export WEBHOOK_URL=...
export WEBHOOK_SENDER_KEY=...
```

See `.env.example` for the full template. The sender key stays in the gateway process. The browser never receives it.

Default listen address is `0.0.0.0` so Tailscale peers can reach the port. Use `--listen 127.0.0.1:8040` for loopback only.

`GET /api/bots` and `GET /ws` are open to anyone who can reach the port. Only `POST /api/prompt` checks the client token and allowlist.

## Docs

- [Live setup](docs/live.md)
- [Wire contracts](docs/contracts.md)
- [Gateway](apps/gateway/README.md)
- [Client](apps/client/README.md)
- [StarCraft theme](apps/client/src/themes/starcraft/README.md)

## Tests

```bash
npm test -w packages/contracts
npm test -w @lorien-stack/gateway
npm test -w @lorien-stack/client
```

Root `npm test` runs contracts only.

## License

See [LICENSE](LICENSE).
