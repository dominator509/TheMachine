#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

if [ ! -f package.json ]; then
  echo "ERROR: package.json missing. Complete EP-001 foundation first." >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "ERROR: pnpm is required." >&2
  exit 1
fi

if [ -f pnpm-lock.yaml ]; then
  pnpm install --frozen-lockfile
else
  pnpm install
fi

echo "install: ok"
