#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

./scripts/preflight.sh
./scripts/lint.sh
./scripts/format-check.sh
./scripts/typecheck.sh
./scripts/build.sh
./scripts/test-unit.sh
./scripts/test-integration.sh
./scripts/test-e2e.sh
./scripts/security-check.sh
./scripts/dependency-audit.sh
pnpm run build:release
./scripts/smoke-test.sh

echo "verify: ok"
