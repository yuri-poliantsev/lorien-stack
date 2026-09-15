# Gateway

Tails Grok Bot `$AGENT_DATA` (or a demo replay of `fixtures/demo`) and serves a roster plus activity over HTTP and WebSocket. There is no write path. Peers that can reach the bind address can read the stream.

## Run

From the repo root:

```
npm run gateway -- --demo --listen :8040
npm run gateway -- --demo --bots 18 --listen :8040
npm run gateway -- --demo --bots 8 --replay-idle --listen :8040
```

`--listen :8040` binds `0.0.0.0:8040`. Loopback-only bind is opt-in (`--listen 127.0.0.1:8040`). Demo copies fixture profiles into a temp tree, then appends transcript lines on a compressed clock. `--bots N` (1 to 40, default 8) sets the roster size. Extra bots clone fixture profiles with deterministic ids and names (`Ivo 2`, `Lauren 2`). Sleeps follow event timestamps divided by `--multiplier` (default 1000), not wall time, with a 800ms floor so a line stays visible. Each bot starts on a stagger, loops its tape, and emits a `presence` hint with reason `sleep` between cycles. `--replay-idle` skips the tape and sleeps every bot, which is the all-asleep still.

Live mode emits the same `presence` messages from a quiet clock. Last activity comes from roster spawn and tailed transcript lines. `--presence-tick-ms` (default 1000, or `GATEWAY_PRESENCE_TICK_MS`) is the emit interval. Reason is `recent` below `--presence-work-ms` (default 12000, or `GATEWAY_PRESENCE_WORK_MS`), `quiet` until `--presence-sleep-ms` (default 22000, or `GATEWAY_PRESENCE_SLEEP_MS`), then `sleep`. Those defaults match `WORK_MS` and `SLEEP_MS` on the StarCraft floor. A hint is not lifecycle. Quiet bots stay on the roster.

Live data. This form is copy-paste complete. Live boot needs `AGENT_DATA` (or `--data`) and nothing else.

```
AGENT_DATA=/path/to/agent-data \
npm run gateway -- --listen :8040
```

`--data /path/to/agent-data` replaces `AGENT_DATA`. Layout is the grok driver: `agents/<uuid>/profile.json` and `agent-transcripts/<uuid>/*.jsonl`.

Live start without `AGENT_DATA` or `--data` exits without listening. Demo still uses `--demo`.

`.env.example` in the repo root lists the one setup variable, and [Live setup](../../docs/live.md) walks through a first live run.

## Endpoints

- `GET /` and `GET /health` return 200.
- `GET /api/bots` returns `RosterSnapshot` plus monotonic `revision`.
- `GET /ws` sends `{ type: "snapshot", revision, snapshot }` first, then `{ type: "event", revision, event }` and `{ type: "presence", revision, botId, hint }`.

On listen the gateway logs a boot summary: listen address, demo or live, bot count, and driver name. Unknown CLI flags fail before boot.

## Tail

The grok driver polls on a 250ms coalesce. Byte offsets and a partial-line buffer make rereads idempotent. A truncated last line stays in the buffer until a newline arrives.

## Presence

Live presence is a quiet-clock hint. `freshnessMs` is wall time since last activity. The gateway never uses a presence reason to drop a bot.

| Flag | Env | Default | Reason when freshness crosses it |
| --- | --- | --- | --- |
| `--presence-work-ms` | `GATEWAY_PRESENCE_WORK_MS` | 12000 | `recent` below this, then `quiet` |
| `--presence-sleep-ms` | `GATEWAY_PRESENCE_SLEEP_MS` | 22000 | `sleep` at or above this |
| `--presence-tick-ms` | `GATEWAY_PRESENCE_TICK_MS` | 1000 | emit interval |

Demo does not run that timer. Looping replay flushes `sleep` at the end of each bot's cycle. `--replay-idle` flushes `sleep` for the whole roster and logs `demo replay complete`.
