#!/usr/bin/env bash
set -uo pipefail

NODE_DIR="$HOME/.local/node22"
if ! node -v 2>/dev/null | grep -Eq '^v(2[2-9]|[3-9][0-9])\.'; then
  VER=v22.15.1
  case $(uname -m) in x86_64) NARCH=x64;; arm64|aarch64) NARCH=arm64;; *) echo "unsupported arch"; exit 1;; esac
  if ! "$NODE_DIR/bin/node" -v 2>/dev/null | grep -q '^v22'; then
    mkdir -p "$HOME/.local"
    curl -fsSL "https://nodejs.org/dist/${VER}/node-${VER}-linux-${NARCH}.tar.gz" -o /tmp/node22.tar.gz
    rm -rf "$NODE_DIR"
    mkdir -p "$NODE_DIR"
    tar -xzf /tmp/node22.tar.gz -C "$NODE_DIR" --strip-components=1
  fi
  export PATH="$NODE_DIR/bin:$PATH"
  grep -q 'local/node22/bin' "$HOME/.bashrc" 2>/dev/null || echo 'export PATH="$HOME/.local/node22/bin:$PATH"' >> "$HOME/.bashrc"
fi
node -v

npm ci

if ! command -v grok >/dev/null 2>&1 && [ ! -x "$HOME/.grok/bin/grok" ]; then
  curl -fsSL https://x.ai/cli/install.sh | bash || echo "grok install failed, coordinator falls back to Cursor image generation"
fi
grep -q '.grok/bin' "$HOME/.bashrc" 2>/dev/null || echo 'export PATH="$HOME/.grok/bin:$PATH"' >> "$HOME/.bashrc"

if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
  sudo -n apt-get update -qq || true
  sudo -n apt-get install -y -qq gh ffmpeg jq >/dev/null 2>&1 || true
fi
command -v gh >/dev/null 2>&1 || echo "gh missing, coordinator installs it from the GitHub CLI release tarball"

npx --yes playwright@1 install chromium >/dev/null 2>&1 || echo "playwright chromium not preinstalled, lever installs on demand"

echo "cloud install done"
