#!/usr/bin/env bash
# Inner half of `npm run test:local`, run by scripts/local-stack.sh inside
# `firebase emulators:exec`: start next dev in the background, wait for it,
# run the rules and end-to-end tests, stop next dev.
set -euo pipefail
cd "$(dirname "$0")/.."
LOG=.local-stack/next-dev.log

npx next dev -p "$PORT" > "$LOG" 2>&1 &
NEXT_PID=$!
trap 'kill $NEXT_PID 2>/dev/null || true; wait $NEXT_PID 2>/dev/null || true' EXIT

for _ in $(seq 1 120); do
  curl -s -o /dev/null "$LOCAL_STACK_WEB/skin-check" && break
  kill -0 $NEXT_PID 2>/dev/null || { echo "next dev exited; see $LOG" >&2; tail -20 "$LOG" >&2; exit 1; }
  sleep 1
done

# Every rules test (tests/firestore-rules*.test.ts) and every end-to-end test
# (tests/*.e2e.test.ts), so a lane adds its own files instead of editing this one.
npx vitest run firestore-rules e2e.test
