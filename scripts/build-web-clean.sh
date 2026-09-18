#!/usr/bin/env bash
set -euo pipefail

ROOT="/workspaces/HIDI-ecommerce"

echo "HIDI clean web build"
echo "Stopping HIDI dev/watch processes..."

mapfile -t PIDS < <(
  ps -eo pid=,args= |
    awk -v root="$ROOT" '
      index($0, root) &&
      ($0 ~ /next dev/ || $0 ~ /nest start --watch/ || $0 ~ /dist\/src\/main/) {
        print $1
      }'
)

if ((${#PIDS[@]})); then
  kill "${PIDS[@]}" 2>/dev/null || true
  sleep 2
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  done
fi

fuser -k 3000/tcp 3001/tcp 4000/tcp 2>/dev/null || true
sleep 1

echo "Clearing generated Next.js build output..."
rm -rf "$ROOT/apps/web/.next"
rm -f "$ROOT/apps/web/tsconfig.tsbuildinfo"

echo "Memory before build:"
free -h || true

export NEXT_TELEMETRY_DISABLED=1
export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=4096"

echo "Building HIDI web..."
cd "$ROOT"
pnpm --filter @hidi/web build
