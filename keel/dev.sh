#!/usr/bin/env bash
# Start the local Keel stack: web app (Keel UI + Fake Box) on :3000 and the runner on :8787.
#
#   ./dev.sh                 start (next dev)
#   ./dev.sh --prod          build and start (next start) — smoother for demos
#   ./dev.sh --seed          start, then reset and seed the Project Lantern folder (not connected)
#   ./dev.sh --seed-connected  same, and connect it to Keel (run #1 happens immediately)
set -euo pipefail
cd "$(dirname "$0")"

MODE=dev; SEED=""
for arg in "$@"; do
  case "$arg" in
    --prod) MODE=prod ;;
    --seed) SEED=plain ;;
    --seed-connected) SEED=connected ;;
    *) echo "unknown option $arg" >&2; exit 2 ;;
  esac
done

[ -f .env ] || cp .env.example .env
[ -d web/node_modules ] || (cd web && npm install)
mkdir -p .data

pids=()
cleanup() { for p in "${pids[@]}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT INT TERM

(cd runner && exec python3 -m keel_runner.local) &
pids+=($!)

if [ "$MODE" = prod ]; then
  (cd web && npx next build >/dev/null && exec npx next start -p 3000) &
else
  (cd web && exec npx next dev -p 3000) &
fi
pids+=($!)

if [ -n "$SEED" ]; then
  (cd runner && python3 -m keel_runner.seed $([ "$SEED" = connected ] && echo --connect))
fi

echo
echo "  Keel      http://localhost:3000"
echo "  Fake Box  http://localhost:3000/box"
echo
wait
