# How to run lorien-stack against live Grok Bots

You have a Grok Bot host with real agent data on disk. This guide points the gateway at that data and puts the UI on your tailnet. Run every step on the host that holds the agent data.

The stack observes Grok Bots. It does not send commands. `GET /health`, `GET /api/bots`, and `GET /ws` answer anyone who can open the port. The bind address plus your Tailscale ACL are the access control. Use `--listen 127.0.0.1:8040` when you want loopback only.

If you have not run the demo yet, run [Quick start (demo)](../README.md#quick-start-demo) first. The demo proves the client, the socket, and the theme work, so anything that breaks after this point is your data path or your network.

You can hand this whole setup to a Grok Bot instead. [Setup prompt](prompts/lorien-stack-setup.md) is one block to paste into a chat with a bot running on the same host, and it covers the same steps in the same order.

## Before you start

You need Node.js `>=22.14.0`. Check it with `node -v`.

If `node -v` is below that floor, install Node 22.15.1 into `$HOME/.local/node22` with the official `.tar.gz` tarball. Do not use nvm or fnm. Non-interactive shells do not load those tools. Do not switch to bun.

```bash
VER=v22.15.1
NODE_DIR=$HOME/.local/node22
case $(uname -m) in x86_64) NARCH=x64;; arm64|aarch64) NARCH=arm64;; *) echo "unsupported arch"; exit 1;; esac
case $(uname -s) in Linux) NOS=linux;; Darwin) NOS=darwin;; *) echo "unsupported OS"; exit 1;; esac
if ! "$NODE_DIR/bin/node" -v 2>/dev/null | grep -q '^v22'; then
  mkdir -p "$HOME/.local"
  curl -fsSL "https://nodejs.org/dist/${VER}/node-${VER}-${NOS}-${NARCH}.tar.gz" -o /tmp/node22.tar.gz
  rm -rf "$NODE_DIR"
  mkdir -p "$NODE_DIR"
  tar -xzf /tmp/node22.tar.gz -C "$NODE_DIR" --strip-components=1
fi
export PATH="$HOME/.local/node22/bin:$PATH"
node -v
```

The commands skip the download when `$HOME/.local/node22/bin/node -v` already reports v22. Continue only when `node -v` reports 22.14.0 or later.

Before you run npm or the gateway in a new shell, export the PATH again:

```bash
export PATH="$HOME/.local/node22/bin:$PATH"
```

After Node passes the version check, clone the repo and install the dependencies:

```bash
git clone https://github.com/yuri-poliantsev/lorien-stack.git
cd lorien-stack
npm install
```

## Find agent data

The gateway reads one directory, called `$AGENT_DATA` in Grok Bot terms, and it never writes there.

Print the variable first:

```bash
echo "$AGENT_DATA"
```

If the variable is empty in your shell, the process that runs the bots holds it in its own environment. Find the directory pair instead:

```bash
find / -maxdepth 6 -type d -name agent-transcripts 2>/dev/null
```

The parent of `agent-transcripts` is your `$AGENT_DATA`. The layout is the grok driver:

```
$AGENT_DATA/
  agents/<uuid>/profile.json
  agent-transcripts/<uuid>/*.jsonl
```

The tailer applies four rules, so you can tell a broken path from an idle bot:

- One bot per directory under `agents/`. The directory name is the bot id when `profile.json` omits `id`, so that name has to be a UUID.
- `profile.json` is one JSON object, and `name` is required.
- Transcript directories are named by bot id. Files end in `.jsonl`, one JSON object per line.
- A directory that fails a rule is skipped with no error.

Confirm you can read one profile:

```bash
ls "$AGENT_DATA/agents" | head
cat "$AGENT_DATA/agents/<uuid>/profile.json"
```

## Configure env

Copy the template:

```bash
cp .env.example .env
```

Set `AGENT_DATA` to the absolute path from Find agent data. `--data` overrides it. The gateway reads its environment and never reads a file, so export the value into the shell that starts each process:

```bash
set -a
. ./.env
set +a
```

| Variable | Read by | What it holds |
| --- | --- | --- |
| `AGENT_DATA` | gateway | Absolute path from Find agent data. `--data` overrides it. |

Keep `.env` out of git. Commit `.env.example` with an empty value and nothing else.

## Start

Two processes. Gateway first:

```bash
npm run gateway -- --listen :8040
```

That command reads `AGENT_DATA` from the environment you exported. If `AGENT_DATA` and `--data` are both empty, the process exits without listening with `set --data, $AGENT_DATA, or --demo`. The [gateway README](../apps/gateway/README.md) shows the same command with the variable spelled out inline.

Check the gateway before you open a browser:

```bash
curl -s http://127.0.0.1:8040/health
curl -s http://127.0.0.1:8040/api/bots
```

`/health` answers `{"ok":true}`. `/api/bots` answers a roster snapshot with a `revision`. An empty `bots` array means the gateway runs and finds nothing to read, so fix the data path before you go on.

The WebSocket also sends `presence` hints. `--presence-work-ms` and `GATEWAY_PRESENCE_WORK_MS` default to 12 000. `--presence-sleep-ms` and `GATEWAY_PRESENCE_SLEEP_MS` default to 22 000. Those values match the StarCraft floor. `--presence-tick-ms` and `GATEWAY_PRESENCE_TICK_MS` default to 1000. Bots stay on the roster. Presence is not lifecycle. The [gateway README](../apps/gateway/README.md) lists the flags.

Client second, in another terminal:

```bash
npm run dev -w apps/client
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Vite proxies `/ws` to `http://127.0.0.1:8040`. Set `GATEWAY_ORIGIN` when the gateway runs on another host.

## Tailscale

`--listen :8040` binds `0.0.0.0`, so tailnet peers reach the gateway with no extra flag. The Vite dev server binds `127.0.0.1` and needs one:

```bash
npm run dev -w apps/client -- --host 0.0.0.0
```

Read the hostname and the address from Tailscale:

```bash
tailscale status
tailscale ip -4
```

Reach the UI at the `100.x` address. Vite 6 serves an IPv4 host and refuses a hostname that is not in `server.allowedHosts`, which this repo leaves empty:

- `http://100.x.x.x:5173` serves the UI.
- `http://<hostname>.<tailnet>.ts.net:5173` answers `Blocked request. This host is not allowed.` To use the name, add it to `server.allowedHosts` in `apps/client/vite.config.ts`.

The gateway runs a plain Node server with no host check, so both forms reach it on port 8040:

- `http://<hostname>.<tailnet>.ts.net:8040/api/bots`
- `http://100.x.x.x:8040/api/bots`

Use HTTP. Add HTTPS only if you want it. If this host already runs an online Tailscale node, use that node. Do not create a second hostname for lorien-stack.

Every peer that reaches the bind address can read the roster and the activity stream. Port 5173 carries the same data, because Vite proxies `/ws` to the gateway. If that is wider than you want, bind the gateway with `--listen 127.0.0.1:8040`, leave the dev server on its default `127.0.0.1`, and reach the UI through an SSH tunnel.

## Verify observation

Confirm the read path before you walk away:

```bash
curl -s http://127.0.0.1:8040/health
curl -s http://127.0.0.1:8040/api/bots
```

You should see `{"ok":true}` and a roster whose `bots` array is not empty. Open the UI. The bot list, theme, and activity panel should show the same roster. Selecting a bot changes the activity detail and theme focus.

The first WebSocket frame is a `snapshot`. Presence hints follow on the same socket. If the UI is empty while `/api/bots` has bots, the client is not reaching `/ws`.

## Troubleshoot

| Symptom | Cause | Fix |
| --- | --- | --- |
| `node -v` is below 22.14.0, or `npm run gateway` dies with `bad option: --experimental-strip-types` | The process is still using a Node older than 22.6. The gateway runs TypeScript through `--experimental-strip-types`. | Install the user-local Node 22 from [Before you start](#before-you-start). Run `export PATH="$HOME/.local/node22/bin:$PATH"` in the shell, then start again. |
| The gateway process exits and the message names `--data` or `$AGENT_DATA` | Live start has no data root. | Set `AGENT_DATA` or pass `--data`, then start again. Demo still uses `--demo`. |
| Roster is empty while `/health` answers 200 | The gateway is reading a directory with no parseable profile, often one level above or below the real root. | Confirm `$AGENT_DATA/agents/<uuid>/profile.json` exists, holds one JSON object with `name`, and sits in a directory named with a UUID. |
| Bots appear, activity stays empty | Transcript directory names are not bot UUIDs, or the files do not end in `.jsonl`. | Rename to `agent-transcripts/<bot-uuid>/<name>.jsonl`. The tailer skips anything else. |
| Presence looks asleep during a long tool call | Presence is a quiet-time hint. It tracks JSONL growth, not process lifecycle. | Wait for a new transcript line, or treat the hint as stale until then. |
| The client answers `Blocked request. This host is not allowed.` | Vite refuses a Host header it does not know, and `server.allowedHosts` is empty in this repo. | Open the UI at `http://100.x.x.x:5173`, or add the tailnet name to `server.allowedHosts` in `apps/client/vite.config.ts`. |
| The UI is empty while `/api/bots` has bots | The browser never received the WebSocket snapshot. Vite proxies `/ws` only. | Confirm the gateway is on `:8040`, or set `GATEWAY_ORIGIN` and restart the dev server. |

## Related docs

- [Setup prompt](prompts/lorien-stack-setup.md) to hand these steps to a Grok Bot on the host.
- [Gateway](../apps/gateway/README.md) for endpoints, flags, and tail behavior.
- [Client](../apps/client/README.md) for the Vite shell and the theme host.
- [Wire contracts](contracts.md) for the roster, activity, and presence schema.
