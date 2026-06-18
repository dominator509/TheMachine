#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

for f in AGENTS.md COMMANDS.md ARCHITECTURE.md ROADMAP.md .agent/PLANS.md; do
  if [ ! -f "$f" ]; then
    echo "ERROR: required file missing: $f" >&2
    exit 1
  fi
done

if [ ! -d scripts ]; then
  echo "ERROR: scripts directory missing" >&2
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "ERROR: git is required." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js 20+ is required for the default stack." >&2
  exit 1
fi

if [ -f package.json ]; then
  if ! command -v pnpm >/dev/null 2>&1; then
    if command -v corepack >/dev/null 2>&1; then
      echo "ERROR: pnpm is required. Run: corepack enable && corepack prepare pnpm@latest --activate" >&2
    else
      echo "ERROR: pnpm is required and corepack was not found." >&2
    fi
    exit 1
  fi

  for script_name in lint typecheck build; do
    if ! grep -q "\"$script_name\"" package.json; then
      echo "ERROR: package.json missing required script: $script_name" >&2
      exit 1
    fi
  done
fi

echo "preflight: ok"
