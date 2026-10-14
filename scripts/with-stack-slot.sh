#!/usr/bin/env bash
# Runs a command that starts a local stack only while a stack slot is free.
# This Mac's Docker has about 8 GB and each stack's engine needs about 2 GB, so
# every checkout (the redesign lanes, the integration branch) shares STACK_SLOTS
# (default 2) slots, taken by mkdir (atomic) and released on exit.
#
#   bash scripts/with-stack-slot.sh npm run test:browser
#   PW_ARGS="tests/browser/routine.spec.ts" bash scripts/with-stack-slot.sh npm run test:browser
set -euo pipefail
LOCKS="${TMPDIR:-/tmp}/skin-check-stack-slots"
mkdir -p "$LOCKS"
SLOT=""
while [ -z "$SLOT" ]; do
  for i in $(seq 1 "${STACK_SLOTS:-2}"); do
    if mkdir "$LOCKS/$i" 2>/dev/null; then SLOT="$LOCKS/$i"; echo "$PWD $$" > "$SLOT/owner"; break; fi
  done
  [ -n "$SLOT" ] || { echo "waiting for a stack slot ($(cat "$LOCKS"/*/owner 2>/dev/null | tr '\n' ';'))"; sleep 20; }
done
trap 'rm -rf "$SLOT"' EXIT INT TERM
"$@"
