# Client

Vite shell that talks to the gateway over `/ws`. Roster and activity live in memory by bot id. The page mounts a bot list, a theme host, and an activity panel. The theme host mounts the StarCraft 2D canvas by default.

## Run against the demo gateway

From the repo root, two processes:

```
npm run gateway -- --demo --listen :8040
npm run dev -w apps/client
```

Open `http://127.0.0.1:5173`. Vite proxies `/ws` to `:8040`.
