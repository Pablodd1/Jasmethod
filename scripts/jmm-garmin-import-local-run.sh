#!/usr/bin/env bash
# Synthetic-only acceptance on a production server and disposable PostgreSQL.
# Nothing below inherits credentials or permits provider-network access.
set -euo pipefail
if [[ "${JMM_TEST_SANITIZED_ENV:-}" != 1 ]]; then
  exec env -i PATH="$PATH" HOME="$HOME" TMPDIR=/tmp JMM_TEST_SANITIZED_ENV=1 \
    NODE_PATH="${NODE_PATH:-}" JMM_QA_BROWSER="${JMM_QA_BROWSER:-/usr/bin/chromium}" \
    JMM_TEST_PG_BIN="${JMM_TEST_PG_BIN:-/tmp/jmm-postgres/install/bin}" bash "$0" "${1:-start}"
fi
cd "$(dirname "$0")/.."
for file in .env .env.local .env.development .env.development.local .env.production .env.production.local; do
  [[ ! -f "$file" ]] || { echo "Refusing to load $file in synthetic acceptance" >&2; exit 1; }
done
MODE="${1:-start}"; [[ "$MODE" == dev || "$MODE" == start ]] || exit 2
PG="$JMM_TEST_PG_BIN"
[[ -x "$PG/initdb" && -x "$PG/pg_ctl" && -x "$JMM_QA_BROWSER" ]] || { echo 'Official local PostgreSQL/browser binaries are required' >&2; exit 1; }
node -e 'require.resolve("playwright")' >/dev/null
ROOT="$(mktemp -d /tmp/jmm-garmin-private.XXXXXX)"
ARTIFACTS="$PWD/.local/jmm-garmin-import/runtime"
mkdir -p "$ARTIFACTS"; chmod 700 "$ROOT"
APP_PID=''
cleanup(){
  if [[ -n "$APP_PID" ]]; then kill "$APP_PID" 2>/dev/null || true; wait "$APP_PID" 2>/dev/null || true; fi
  "$PG/pg_ctl" -D "$ROOT/data" -m immediate stop >/dev/null 2>&1 || true
  [[ ! -f "$ROOT/postgres.log" ]] || cp "$ROOT/postgres.log" "$ARTIFACTS/postgres.log"
  rm -rf "$ROOT"
}
trap cleanup EXIT INT TERM
"$PG/initdb" -D "$ROOT/data" --auth=trust --no-locale --encoding=UTF8 > "$ARTIFACTS/initdb.log"
"$PG/pg_ctl" -D "$ROOT/data" -l "$ROOT/postgres.log" -o "-h 127.0.0.1 -p 55432 -c unix_socket_directories=" -w start
"$PG/createdb" -h 127.0.0.1 -p 55432 jmm_launch_integration_test
export DATABASE_URL="postgresql://$(id -un)@127.0.0.1:55432/jmm_launch_integration_test"; export DIRECT_URL="$DATABASE_URL"
export ENABLE_INTERVALS_CONNECTOR=false ENABLE_AUTOMATED_DELIVERY=false ENABLE_MOCK_COACHING=true COACHING_TRANSPORT=mock VERCEL_ENV=preview NEXT_TELEMETRY_DISABLED=1
export NEXT_FONT_GOOGLE_MOCKED_RESPONSES="$PWD/scripts/jmm-test-font-mock.cjs"
export JMM_EGRESS_LOG="$ARTIFACTS/egress.log"; : > "$JMM_EGRESS_LOG"
export NODE_OPTIONS="--require $PWD/scripts/jmm-test-egress-guard.cjs"
./node_modules/.bin/prisma migrate deploy > "$ARTIFACTS/migrations.log" 2>&1
./node_modules/.bin/next "$MODE" --hostname 127.0.0.1 --port 3220 > "$ARTIFACTS/server.log" 2>&1 & APP_PID=$!
ready=0
for attempt in $(seq 1 120); do
  if [[ "$(curl --silent --output /dev/null --write-out '%{http_code}' http://127.0.0.1:3220/api/today || true)" == 401 ]]; then ready=1; break; fi
  kill -0 "$APP_PID" 2>/dev/null || { tail -80 "$ARTIFACTS/server.log"; exit 1; }; sleep 1
done
[[ "$ready" == 1 ]] || { echo 'App readiness timed out'; tail -80 "$ARTIFACTS/server.log"; exit 1; }
cp "$JMM_EGRESS_LOG" "$ARTIFACTS/egress-startup.log"; : > "$JMM_EGRESS_LOG"
set +e
node --import tsx scripts/jmm-garmin-import-integration.ts |& tee "$ARTIFACTS/integration.log"; API=${PIPESTATUS[0]}
node scripts/jmm-garmin-import-browser.cjs |& tee "$ARTIFACTS/browser.log"; BROWSER=${PIPESTATUS[0]}
set -e
USERS="$("$PG/psql" -h 127.0.0.1 -p 55432 -d jmm_launch_integration_test -At -c 'SELECT COUNT(*) FROM "User";')"
EGRESS="$(wc -c < "$JMM_EGRESS_LOG")"
printf 'api=%s browser=%s remaining_users=%s acceptance_egress_bytes=%s startup_guard_bytes=%s\n' "$API" "$BROWSER" "$USERS" "$EGRESS" "$(wc -c < "$ARTIFACTS/egress-startup.log")" | tee "$ARTIFACTS/summary.log"
[[ "$API" == 0 && "$BROWSER" == 0 && "$USERS" == 0 && "$EGRESS" == 0 ]]
