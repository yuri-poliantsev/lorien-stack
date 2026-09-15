#!/usr/bin/env bash
set -uo pipefail

if [ -n "${GROK_AUTH_JSON_B64:-}" ]; then
  mkdir -p "$HOME/.grok"
  umask 077
  printf '%s' "$GROK_AUTH_JSON_B64" | base64 -d > "$HOME/.grok/auth.json"
  chmod 600 "$HOME/.grok/auth.json"
  echo "grok auth materialised"
else
  echo "GROK_AUTH_JSON_B64 not set, coordinator runs grok login --device-auth"
fi

if [ -n "${GH_TOKEN:-}" ]; then
  echo "GH_TOKEN present"
else
  echo "GH_TOKEN not set, merges and branch protection will fail"
fi
