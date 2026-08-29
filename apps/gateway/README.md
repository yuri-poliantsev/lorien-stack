# Gateway

Tails Grok Bot `$AGENT_DATA` (or a demo replay of `fixtures/demo`) and serves a roster plus activity over HTTP and WebSocket. The only write path is `requestWake`: a server-side POST to a Grok webhook. That is an ack, a fail, or indeterminate. It is not `sendToAgent` and it does not claim the bot ran.

## Run

From the repo root:

```
npm run gateway -- --demo --listen :8040
```

`--listen :8040` binds `0.0.0.0:8040`. Loopback-only bind is opt-in (`--listen 127.0.0.1:8040`). Demo copies fixture profiles into a temp tree, then appends transcript lines on a compressed clock. Sleeps follow event timestamps divided by `--multiplier` (default 1000), not wall time. After the last line, bots stay on the roster and the socket gets a `presence` hint with reason `sleep`.

Live data. This form is copy-paste complete: a wake needs the client token, the allowlist, and both webhook variables, not `AGENT_DATA` alone.

```
AGENT_DATA=/path/to/agent-data \
GATEWAY_CLIENT_TOKEN=<client-token> \
WEBHOOK_URL=https://api2.cursor.sh/automations/webhook/<id> \
WEBHOOK_SENDER_KEY=<sender-key> \
npm run gateway -- --listen :8040 --allowlist <bot-uuid>
```

`--data /path/to/agent-data` replaces `AGENT_DATA`, `--token` replaces `GATEWAY_CLIENT_TOKEN`, and `--webhook-url` replaces `WEBHOOK_URL`. `WEBHOOK_SENDER_KEY` has no flag, so the key stays out of `argv` and out of `ps` output. Layout is the grok driver: `agents/<uuid>/profile.json` and `agent-transcripts/<uuid>/*.jsonl`.

Live start without `GATEWAY_CLIENT_TOKEN` or `--token` exits without listening. Demo still defaults to `demo-token`.

An empty allowlist denies every wake. `--allowlist <bot-uuid>,<bot-uuid>` names the bots that may wake. `--allowlist discovered` or `GATEWAY_ALLOWLIST=discovered` allowlists every bot id present after the first roster scan. Live does not discover by default. Bots that appear after that scan stay off the list until you restart.

Without `WEBHOOK_URL` and `WEBHOOK_SENDER_KEY`, an authorized prompt returns 503. `.env.example` in the repo root lists the five setup variables, and [Live setup](../../docs/live.md) walks through a first live run.

## Endpoints

- `GET /` and `GET /health` — 200
- `GET /api/bots` — `RosterSnapshot` plus monotonic `revision`
- `GET /ws` — first message `{ type: "snapshot", revision, snapshot }`, then `{ type: "event", revision, event }` and `{ type: "presence", revision, botId, hint }`
- `POST /api/prompt` — `{ botId, prompt }`. Requires `Authorization: Bearer <client token>` and an allowlisted bot id. The server then calls `requestWake` (8s timeout, one try).

Auth lives at this edge. The webhook sender key never leaves the process. Set `WEBHOOK_SENDER_KEY` and `WEBHOOK_URL` (or `--webhook-url`). Demo client token is `demo-token` unless `GATEWAY_CLIENT_TOKEN` / `--token` is set. Demo allowlist is every fixture bot; pass `--allowlist` to shrink it, or `--allowlist discovered` to use the ids from the first scan.

On listen the gateway logs a boot summary: listen address, demo or live, bot count, allowlist mode, and whether the webhook is configured. Wake logs use `acknowledged`, `failed`, or `indeterminate`. Neither log prints the sender key, the client token, or `Authorization` headers.

## Tail

The grok driver polls on a 250ms coalesce. Byte offsets and a partial-line buffer make rereads idempotent. A truncated last line stays in the buffer until a newline arrives.
