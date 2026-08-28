# Client

Vite shell that talks to the gateway over `/ws` and `POST /api/prompt`. Roster and activity live in memory by bot id. The theme host is a replaceable mount that currently prints bot names as text. There is no Chat kit.

## Run against the demo gateway

From the repo root, two processes:

```
npm run gateway -- --demo --listen :8040
npm run dev -w apps/client
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` and `/ws` to `:8040`. Demo token is `demo-token` unless `VITE_GATEWAY_TOKEN` is set. Wake needs the gateway's webhook env; without it the bar still sends and shows `failed`.
