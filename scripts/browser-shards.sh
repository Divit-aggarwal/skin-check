#!/usr/bin/env bash
# Browser tests in parallel (owner 2026-10-14): PW_SHARDS (default 2) complete,
# isolated stacks, each running one Playwright shard. Every shard has its own
# copy of this tree (.local-stack/shards/<i>, gitignored; node_modules is an
# APFS clone, so it costs no disk), its own ports (PORT_BASE + 20 * i), its
# own emulators, engine and S3Mock containers, seed data, `.next` and
# .local-stack state. Nothing is shared, so shards cannot affect each other.
#
#   npm run test:browser:parallel            two shards
#   PW_SHARDS=3 npm run test:browser:parallel
#
# Baseline screenshots (AFTER_SHOTS=1) would land in the shard copies, so that
# mode stays on the single-stack `npm run test:browser`.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"

[ -z "${AFTER_SHOTS:-}" ] || { echo "AFTER_SHOTS: use npm run test:browser (one stack)" >&2; exit 2; }
[ -f .env.lane ] && . ./.env.lane
B="${PORT_BASE:-3100}"
N="${PW_SHARDS:-2}"
DIR=.local-stack/shards
# Fixtures outside the repo are named relative to it; a shard copy sits deeper.
export LOCAL_STACK_FACE="${LOCAL_STACK_FACE:-$(cd "$ROOT/.." && pwd)/skin-scan/fixtures/input_face.png}"
[ -f "$LOCAL_STACK_FACE" ] || { echo "no test face at $LOCAL_STACK_FACE" >&2; exit 1; }
mkdir -p "$DIR"

pids=()
for i in $(seq 1 "$N"); do
  S="$DIR/$i"
  rm -rf "$S" && mkdir -p "$S"
  # No .env files except the two local-only ones: production values never enter a shard.
  rsync -a --exclude node_modules --exclude .next --exclude .local-stack --exclude .git --exclude tsconfig.tsbuildinfo --exclude '.env*' ./ "$S/"
  cp .env.development.example "$S/"
  [ -f .env.development.local ] && cp .env.development.local "$S/"
  cp -cR node_modules "$S/node_modules" 2>/dev/null || cp -R node_modules "$S/node_modules"
  echo "PORT_BASE=$((B + 20 * i))" > "$S/.env.lane"
  echo "== shard $i/$N on PORT_BASE $((B + 20 * i)), log $DIR/$i.log"
  (cd "$S" && PW_ARGS="--shard=$i/$N" bash scripts/local-stack.sh browser > "$ROOT/$DIR/$i.log" 2>&1) &
  pids+=($!)
done

fail=0
for i in $(seq 1 "$N"); do
  if wait "${pids[$((i - 1))]}"; then echo "== shard $i/$N passed"; else echo "== shard $i/$N FAILED (see $DIR/$i.log)"; fail=1; fi
  grep -E "^\s+[0-9]+ (passed|failed|flaky|skipped)|^\s+[0-9]+\) |✘" "$DIR/$i.log" | sed "s/^/   [$i] /" || true
done
exit $fail
