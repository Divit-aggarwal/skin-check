#!/usr/bin/env bash
# Local stack with no production keys (tracker B01).
#
#   npm run dev:local    emulators (Auth + Firestore, real rules) + engine 0.1.6
#                        + S3Mock + seed data + next dev, in the foreground
#   npm run test:local   unit tests, then the same stack in the background and
#                        the rules + end-to-end tests against it
#
# Ports come from PORT_BASE (default 3100; a lane worktree sets it in .env.lane):
#   web +0, auth +1, firestore +2, firestore ws +3, hub +4, logging +5,
#   emulator UI +6, engine +7, S3Mock +8
set -euo pipefail
cd "$(dirname "$0")/.."

MODE="${1:-}"
case "$MODE" in up|test) ;; *) echo "usage: $0 up|test" >&2; exit 2 ;; esac

[ -f .env.lane ] && . ./.env.lane
B="${PORT_BASE:-3100}"
WEB=$B AUTH=$((B + 1)) FS=$((B + 2)) FSWS=$((B + 3)) HUB=$((B + 4)) LOGP=$((B + 5)) UI=$((B + 6)) ENGINE=$((B + 7)) S3=$((B + 8))
PROJECT=demo-skin-check
ENGINE_IMAGE=sha256:9a8f96c0a54025c4137b89dee181ba7fb140db1431fa95156cc20d8880e1fc2c   # tested 0.1.6 image, by ID
S3MOCK_IMAGE=adobe/s3mock@sha256:ab01a6946750f451ca215a47e91030695b260e4003b8a5a6201d25029b8fca92
FIREBASE="npx -y firebase-tools@15.32.1"
STATE=.local-stack
mkdir -p "$STATE"

[ -f .env.development.local ] || { cp .env.development.example .env.development.local; echo "created .env.development.local from the example"; }

# Unit tests first, outside the emulators: with emulator variables set, the
# Admin tests would take the emulator path.
if [ "$MODE" = test ]; then
  echo "== unit tests (no emulators)"
  env -u FIRESTORE_EMULATOR_HOST -u FIREBASE_AUTH_EMULATOR_HOST npx vitest run
fi

for p in $WEB $AUTH $FS $FSWS $HUB $LOGP $UI $ENGINE $S3; do
  if lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "port $p is busy: is the stack already running for PORT_BASE=$B? Stop it first." >&2
    exit 1
  fi
done

# Secret shared by the app and the engine, read from the same file the app
# reads. Never printed.
SCAN_SECRET="$(grep -E '^SCAN_API_SECRET=' .env.development.local | tail -1 | cut -d= -f2-)"
[ -n "$SCAN_SECRET" ] || { echo "SCAN_API_SECRET missing in .env.development.local" >&2; exit 1; }

ENGINE_C="skin-scan-dev-$B" S3_C="s3mock-dev-$B"
cleanup() { docker rm -f "$ENGINE_C" "$S3_C" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
cleanup

echo "== engine 0.1.6 on 127.0.0.1:$ENGINE, S3Mock on 127.0.0.1:$S3"
docker run -d --name "$ENGINE_C" -p "127.0.0.1:$ENGINE:8000" \
  -e ENV=dev -e SCAN_API_SECRET="$SCAN_SECRET" -e MAX_IMAGE_MB=8 "$ENGINE_IMAGE" >/dev/null
docker run -d --name "$S3_C" -p "127.0.0.1:$S3:9090" \
  -e COM_ADOBE_TESTING_S3MOCK_STORE_INITIAL_BUCKETS=skin-originals-dev "$S3MOCK_IMAGE" >/dev/null

wait_for() { # url seconds
  for _ in $(seq 1 "$2"); do curl -sf -o /dev/null "$1" && return 0; sleep 1; done
  echo "timed out waiting for $1" >&2; return 1
}
wait_for "http://127.0.0.1:$ENGINE/health/ready" 240   # amd64 image under emulation starts slowly
wait_for "http://127.0.0.1:$S3/" 60

# Emulator ports live only in a firebase config file, so write one per
# checkout (gitignored). Rules and indexes are the real files.
cat > firebase.local.json <<EOF
{
  "firestore": { "rules": "firestore.rules", "indexes": "firestore.indexes.json" },
  "emulators": {
    "auth": { "host": "127.0.0.1", "port": $AUTH },
    "firestore": { "host": "127.0.0.1", "port": $FS, "websocketPort": $FSWS },
    "hub": { "host": "127.0.0.1", "port": $HUB },
    "logging": { "host": "127.0.0.1", "port": $LOGP },
    "ui": { "enabled": $([ "$MODE" = up ] && echo true || echo false), "host": "127.0.0.1", "port": $UI }
  }
}
EOF

# Port-dependent values for this checkout. Exported values beat every .env file.
export PORT=$WEB
export NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:$AUTH" FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:$AUTH"
export NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST="127.0.0.1:$FS" FIRESTORE_EMULATOR_HOST="127.0.0.1:$FS"
export SKIN_SCAN_API_URL="http://127.0.0.1:$ENGINE" S3_SKIN_IMAGES_ENDPOINT="http://127.0.0.1:$S3"
export FIREBASE_PROJECT_ID=$PROJECT NEXT_PUBLIC_FIREBASE_PROJECT_ID=$PROJECT
export LOCAL_STACK_WEB="http://127.0.0.1:$WEB"

SEED="npx vite-node --config vitest.config.ts scripts/seed-local.ts"
if [ "$MODE" = up ]; then
  echo "== web on http://localhost:$WEB  (emulator UI http://127.0.0.1:$UI; sign-in codes print in this terminal)"
  $FIREBASE emulators:exec --config firebase.local.json --project "$PROJECT" --only auth,firestore --ui \
    "$SEED && npx next dev -p $WEB"
else
  echo "== rules + end-to-end tests against the stack"
  $FIREBASE emulators:exec --config firebase.local.json --project "$PROJECT" --only auth,firestore \
    "$SEED && bash scripts/local-stack-e2e.sh"
fi
