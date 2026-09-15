# Agent notes

## Cursor Cloud specific instructions

The environment is built by `.cursor/cloud-install.sh` and started by `.cursor/cloud-start.sh`. Node 22 lives at `~/.local/node22/bin` when the base image is older. Grok Build lives at `~/.grok/bin/grok`. Both are on `PATH` through `~/.bashrc`; in a fresh shell run `export PATH="$HOME/.local/node22/bin:$HOME/.grok/bin:$PATH"` first.

Secrets arrive as environment variables. `GROK_AUTH_JSON_B64` is the owner's Grok Build session, written to `~/.grok/auth.json` at start. `GH_TOKEN` is a GitHub token `gh` uses for merges and branch protection. If `GROK_AUTH_JSON_B64` is missing, run `grok login --device-auth`, print the URL and code in the transcript, and continue with Cursor's image tool until the owner completes it.

Overnight programs start from `docs/plans/`. The current one is `docs/plans/2026-09-15-theme-night.md`.

## Verification

`npm test`, `npm run typecheck`, `npm run build -w apps/client`, `npm run docs:smoke`. The demo gateway is `npm run gateway -- --demo --listen :8040` and the client is `npm run dev -w apps/client`.
