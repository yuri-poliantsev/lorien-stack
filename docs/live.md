# How to run bot-space against live Grok Bots

You have a Grok Bot host with real agent data on disk. This guide points the gateway at that data, wires a webhook so the prompt bar can wake a bot, and puts the UI on your tailnet. Run every step on the host that holds the agent data.

Two facts to carry through the whole setup:

- A wake is an acknowledged webhook POST. It is not bot completion. The gateway logs `acknowledged` when the routine answers HTTP 200, and it claims nothing about the work.
- `GET /api/bots` and `GET /ws` stay open to anyone who can reach the port. Only `POST /api/prompt` checks the client token and the allowlist. Treat the roster and the activity stream as readable by every peer that can open a socket to your port.

If you have not run the demo yet, run [Quick start (demo)](../README.md#quick-start-demo) first. The demo proves the client, the socket, and the theme work, so anything that breaks after this point is your data or your webhook.

## Before you start

You need Node.js `>=22.14.0`. Check it with `node -v`.

```bash
git clone https://github.com/yuri-poliantsev/bot-space.git
cd bot-space
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
  agent-transcripts/<uuid>/<uuid>.jsonl
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

Copy one bot id out of that listing. The allowlist needs it later.

## Create the webhook

A wake is a POST to a webhook routine on the Grok Bot side. The bot receives that JSON as untrusted input and decides what to do.

Create a routine with a webhook trigger. Write its prompt to treat the POST body as data, to read the fields `botId` and `prompt`, and to do the matching work. If the routine has nothing to report, it sends no message.

Copy the URL and the key by hand. The create result does not include the sender key.

1. Click the agent's name in the chat header, or press **Cmd+Shift+I**.
2. Find the **Routines** list under the computer preview.
3. Open the webhook routine.
4. Copy the webhook URL. That URL is safe to paste in chat.
5. Copy the sender key. Never paste the sender key in chat, in a commit, in a log, or in an issue.

The URL looks like `https://api2.cursor.sh/automations/webhook/<id>` with no query string. Copy it from the routine panel. Do not guess the id.

If an agent runs this setup for you, hand over the key through a secret-request card, never through a message:

```
type: secret-request
secret.label: webhook sender key
secret.connector: <routine folder slug>
secret.field: key
```

The slug is the kebab-case form of the routine name. After you submit the card, the value lands in that connector's credential file and the agent never reads it back. If you run the setup yourself, paste the key into your local `.env` and nowhere else.

The key stays in the gateway process. The gateway sends it as `Authorization: Bearer <key>` and `X-Automation-Key: <key>`, with an 8 second timeout and one try. The browser never receives it, and the gateway redacts it from logs.

## Configure env

Copy the template:

```bash
cp .env.example .env
```

Fill in the five values. Nothing in the repo loads `.env` for you, so export it into the shell that starts each process:

```bash
set -a
. ./.env
set +a
```

| Variable | Read by | What it holds |
| --- | --- | --- |
| `AGENT_DATA` | gateway | Absolute path from Find agent data. `--data` overrides it. |
| `GATEWAY_CLIENT_TOKEN` | gateway | Bearer token that `POST /api/prompt` requires. `--token` overrides it. |
| `VITE_GATEWAY_TOKEN` | client | The same token, as the browser sends it. |
| `WEBHOOK_URL` | gateway | Webhook URL of the routine. `--webhook-url` overrides it. |
| `WEBHOOK_SENDER_KEY` | gateway | Sender key of the routine. Server side only, no flag. |

`GATEWAY_CLIENT_TOKEN` and `VITE_GATEWAY_TOKEN` must hold the same string. One token needs two names because the gateway reads its process environment while Vite exposes only `VITE_` variables to the browser. When the two differ, every wake returns 401.

Generate a token you do not use anywhere else:

```bash
openssl rand -hex 24
```

The allowlist is the second gate, and it is a flag rather than a variable. `POST /api/prompt` returns 403 for any bot id outside it. A live run starts with an empty allowlist, so pass the ids you accept:

```bash
--allowlist <bot-uuid>,<bot-uuid>
```

Keep `.env` out of git. Commit `.env.example` with empty values and nothing else.

## Start

Two processes. Gateway first:

```bash
npm run gateway -- --listen :8040 --allowlist <bot-uuid>
```

That command reads `AGENT_DATA`, `GATEWAY_CLIENT_TOKEN`, `WEBHOOK_URL`, and `WEBHOOK_SENDER_KEY` from the environment you exported. The [gateway README](../apps/gateway/README.md) shows the same command with every variable spelled out inline.

Check the gateway before you open a browser:

```bash
curl -s http://127.0.0.1:8040/health
curl -s http://127.0.0.1:8040/api/bots
```

`/health` answers `{"ok":true}`. `/api/bots` answers a roster snapshot with a `revision`. An empty `bots` array means the gateway runs and finds nothing to read, so fix the data path before you go on.

Client second, in another terminal:

```bash
npm run dev -w apps/client
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Vite proxies `/api`, `/health`, and `/ws` to `http://127.0.0.1:8040`. Set `GATEWAY_ORIGIN` when the gateway runs on another host.

Send a prompt from the bar to a bot you allowlisted. The bar reports `acknowledged` once the routine answers 200. You can send the same wake without the browser:

```bash
curl -si -X POST http://127.0.0.1:8040/api/prompt \
  -H "Authorization: Bearer $GATEWAY_CLIENT_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"botId":"<bot-uuid>","prompt":"status check"}'
```

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

Both URL forms reach the client on port 5173:

- `http://<hostname>.<tailnet>.ts.net:5173`
- `http://100.x.x.x:5173`

Use HTTP. Add HTTPS only if you want it. If this host already runs an online Tailscale node, use that node. Do not create a second hostname for bot-space.

Every tailnet peer that reaches port 8040 can read the roster and the activity stream, because only `POST /api/prompt` is authenticated. If that is wider than you want, bind loopback with `--listen 127.0.0.1:8040` and reach the UI through an SSH tunnel.

## Troubleshoot

| Symptom | Cause | Fix |
| --- | --- | --- |
| `POST /api/prompt` returns 401 `unauthorized` | The request carried no bearer token, or the token did not match `GATEWAY_CLIENT_TOKEN`. The gateway also answers 401 when its own token is empty. | Set `GATEWAY_CLIENT_TOKEN` and `VITE_GATEWAY_TOKEN` to the same string. Restart both processes. |
| `POST /api/prompt` returns 403 `bot not allowlisted` | The bot id is not in the allowlist, which is empty on a live run. | Restart the gateway with `--allowlist <bot-uuid>`. Use the id from `GET /api/bots`, not the bot's name. |
| `POST /api/prompt` returns 503 `failed` | `WEBHOOK_URL` or `WEBHOOK_SENDER_KEY` is missing or empty, so the gateway refused to POST anything. | Export both, then restart the gateway. The gateway logs this as `wake failed` with reason `not configured`. |
| `POST /api/prompt` returns 502 `failed` | The routine answered a status other than 200. | Re-copy the URL and the sender key from the routine panel. A rotated key fails this way. |
| `POST /api/prompt` returns 504 `indeterminate` | The POST hit the 8 second timeout, or the network failed. The bot may still have woken. | Read the routine's own runs before you send the wake again. |
| Roster is empty while `/health` answers 200 | The gateway is reading a directory with no parseable profile, often one level above or below the real root. | Confirm `$AGENT_DATA/agents/<uuid>/profile.json` exists, holds one JSON object with `name`, and sits in a directory named with a UUID. |
| Bots appear, activity stays empty | Transcript directory names are not bot UUIDs, or the files do not end in `.jsonl`. | Rename to `agent-transcripts/<bot-uuid>/<name>.jsonl`. The tailer skips anything else. |
| `curl` wakes the bot, the browser gets 401 | `VITE_GATEWAY_TOKEN` was unset when Vite started, so the client fell back to `demo-token`. | Export `VITE_GATEWAY_TOKEN` and restart the dev server. Vite reads the variable at startup, not per request. |
| The bar shows `acknowledged` and the bot does nothing | Acknowledged means the routine answered 200. Bot work is a separate step that the gateway cannot see. | Read that routine's run. The usual cause is a prompt that ignores the fields the gateway sends, which are `botId`, `prompt`, and `schemaVersion`. |

## Related docs

- [Gateway](../apps/gateway/README.md) for endpoints, flags, and tail behavior.
- [Client](../apps/client/README.md) for the Vite shell and the theme host.
- [Wire contracts](contracts.md) for the roster, activity, and wake payload schema.
