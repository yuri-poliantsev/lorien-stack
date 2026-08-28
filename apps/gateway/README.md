# Gateway

Tails Grok Bot `$AGENT_DATA` (or a demo replay of `fixtures/demo`) and serves a roster plus activity over HTTP and WebSocket. The only write path is `requestWake`: a server-side POST to a Grok webhook. That is an ack, a fail, or indeterminate. It is not `sendToAgent` and it does not claim the bot ran.

## Run

From the repo root:

```
npm run gateway -- --demo --listen :8040
```

`--listen :8040` binds `0.0.0.0:8040`. Loopback-only bind is opt-in (`--listen 127.0.0.1:8040`). Demo copies fixture profiles into a temp tree, then appends transcript lines on a compressed clock. Sleeps follow event timestamps divided by `--multiplier` (default 1000), not wall time. After the last line, bots stay on the roster and the socket gets a `presence` hint with reason `sleep`.

Live data:

```
AGENT_DATA=/path/to/agent-data npm run gateway -- --listen :8040
```

or `--data /path/to/agent-data`. Layout is the grok driver: `agents/<uuid>/profile.json` and `agent-transcripts/<uuid>/*.jsonl`.

## Endpoints

- `GET /` and `GET /health` — 200
- `GET /api/bots` — `RosterSnapshot` plus monotonic `revision`
- `GET /ws` — first message `{ type: "snapshot", revision, snapshot }`, then `{ type: "event", revision, event }` and `{ type: "presence", revision, botId, hint }`
- `POST /api/prompt` — `{ botId, prompt }`. Requires `Authorization: Bearer <client token>` and an allowlisted bot id. The server then calls `requestWake` (8s timeout, one try).

Auth lives at this edge. The webhook sender key never leaves the process. Set `WEBHOOK_SENDER_KEY` and `WEBHOOK_URL` (or `--webhook-url`). Demo client token is `demo-token` unless `GATEWAY_CLIENT_TOKEN` / `--token` is set. Demo allowlist is every fixture bot; pass `--allowlist` to shrink it.

Wake logs use `acknowledged`, `failed`, or `indeterminate`. They do not print the sender key, the client token, or `Authorization` headers.

## Tail

The grok driver polls on a 250ms coalesce. Byte offsets and a partial-line buffer make rereads idempotent. A truncated last line stays in the buffer until a newline arrives.
