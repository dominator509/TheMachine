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

echo "=== The Machine — Production Readiness Check (Shell) ==="
echo ""

# Check all 12 subsystems exist
passed=0
failed=0
subsystems="packages/core packages/storage packages/service packages/providers packages/mcp packages/security packages/observability packages/agent-runtime packages/plugin-sdk apps/cli apps/desktop packages/ui-components"

for dir in $subsystems; do
  if [ -f "$dir/package.json" ] && [ -d "$dir/src" ]; then
    echo "  \xE2\x9C\x93 $dir"
    passed=$((passed + 1))
  else
    echo "  \xE2\x9C\x97 $dir"
    failed=$((failed + 1))
  fi
done

echo ""
echo "Subsystems: $passed/12 present, $failed/12 missing"

# Run the Node.js readiness check for detailed validation
pnpm run production:readiness

echo ""
echo "production readiness: ok"
