#!/usr/bin/env bash
# Synthetic-only disposable loopback environment. No credentials or external app
# settings are inherited. Run app, PG and tests in one process namespace/shell.
set -euo pipefail
if [[ "${JMM_TEST_SANITIZED_ENV:-}" != 1 ]]; then
  exec env -i PATH="$PATH" HOME="$HOME" TMPDIR=/tmp JMM_TEST_SANITIZED_ENV=1 \
    bash "$0" "${1:-dev}" "${2:-conversation}"
fi
cd "$(dirname "$0")/.."
for file in .env .env.local .env.development .env.development.local .env.production .env.production.local; do
  [[ ! -f "$file" ]] || { echo "Refusing to load $file in synthetic acceptance" >&2; exit 1; }
done
PG=/tmp/jmm-postgres/install/bin
[[ -x "$PG/initdb" && -x "$PG/pg_ctl" ]] || { echo 'Official local PostgreSQL binaries are unavailable' >&2; exit 1; }
MODE="${1:-dev}"; SUITE="${2:-conversation}"
[[ "$MODE" == dev || "$MODE" == start ]] || exit 2
[[ "$SUITE" == followup || "$SUITE" == all || "$SUITE" == webhook || "$SUITE" == conversation ]] || exit 2
ROOT="$(mktemp -d /tmp/jmm-conversation-private.XXXXXX)"
mkdir -p .local/jmm-conversation-runtime "$ROOT/socket"
chmod 700 "$ROOT"
APP_PID=''
cleanup(){
  if [[ -n "$APP_PID" ]]; then kill "$APP_PID" 2>/dev/null || true; wait "$APP_PID" 2>/dev/null || true; fi
  "$PG/pg_ctl" -D "$ROOT/data" -m immediate stop >/dev/null 2>&1 || true
  [[ ! -f "$ROOT/postgres.log" ]] || cp "$ROOT/postgres.log" .local/jmm-conversation-runtime/postgres.log
  rm -rf "$ROOT"
}
trap cleanup EXIT INT TERM
"$PG/initdb" -D "$ROOT/data" --auth=trust --no-locale --encoding=UTF8 > .local/jmm-conversation-runtime/initdb.log
"$PG/pg_ctl" -D "$ROOT/data" -l "$ROOT/postgres.log" -o "-h 127.0.0.1 -p 55432 -c unix_socket_directories=" -w start
"$PG/createdb" -h 127.0.0.1 -p 55432 jmm_launch_integration_test
export DATABASE_URL="postgresql://$(id -un)@127.0.0.1:55432/jmm_launch_integration_test"
export DIRECT_URL="$DATABASE_URL" ENABLE_INTERVALS_CONNECTOR=false ENABLE_AUTOMATED_DELIVERY=false
export CRON_SECRET=SYNTHETIC_LOCAL_CRON_SECRET_NOT_REAL
export ENABLE_MOCK_COACHING=true COACHING_TRANSPORT=mock VERCEL_ENV=preview NEXT_TELEMETRY_DISABLED=1
if [[ "$SUITE" == webhook ]]; then
  export ENABLE_MOCK_COACHING=false ENABLE_TELEGRAM_COACHING=true ENABLE_AUTOMATED_DELIVERY=true COACHING_TRANSPORT=telegram
  export TELEGRAM_BOT_TOKEN=SYNTHETIC_NOT_A_VALID_BOT_TOKEN TELEGRAM_COACHING_WEBHOOK_SECRET=SYNTHETIC_LOCAL_WEBHOOK_SECRET
fi
export JMM_TEST_APP_MODE="$MODE" TEST_BASE_URL=http://127.0.0.1:3220
[[ "$MODE" != start ]] || export JMM_TEST_BUILD_ID="$(cat .next/BUILD_ID)"
export NEXT_FONT_GOOGLE_MOCKED_RESPONSES="$PWD/scripts/jmm-test-font-mock.cjs"
export JMM_EGRESS_LOG="$PWD/.local/jmm-conversation-runtime/egress.log"
: > "$JMM_EGRESS_LOG"
export NODE_OPTIONS="--require $PWD/scripts/jmm-test-egress-guard.cjs"
./node_modules/.bin/prisma migrate deploy > .local/jmm-conversation-runtime/migrations.log 2>&1
./node_modules/.bin/next "$MODE" --hostname 127.0.0.1 --port 3220 > .local/jmm-conversation-runtime/server.log 2>&1 & APP_PID=$!
ready=0
for attempt in $(seq 1 120); do
  if [[ "$(curl --silent --output /dev/null --write-out '%{http_code}' http://127.0.0.1:3220/api/today || true)" == 401 ]]; then ready=1; break; fi
  kill -0 "$APP_PID" 2>/dev/null || { tail -80 .local/jmm-conversation-runtime/server.log; exit 1; }
  sleep 1
done
[[ "$ready" == 1 ]] || { echo "App readiness timed out";tail -80 .local/jmm-conversation-runtime/server.log;exit 1; }
set +e
TEST_SCRIPT=scripts/jmm-followup-integration.ts
[[ "$SUITE" != webhook ]] || TEST_SCRIPT=scripts/jmm-telegram-webhook-integration.ts
[[ "$SUITE" != conversation ]] || TEST_SCRIPT=scripts/jmm-conversation-integration.ts
node --import tsx "$TEST_SCRIPT" |& tee ".local/jmm-conversation-runtime/$SUITE.log"
FOLLOWUP=${PIPESTATUS[0]}
BASELINE=0
LEGACY=0
SYNC=0
if [[ "$SUITE" == all ]]; then
  node --import tsx scripts/jmm-launch-integration.ts |& tee .local/jmm-conversation-runtime/baseline.log
  BASELINE=${PIPESTATUS[0]}
  node --import tsx scripts/integration-check.ts |& tee .local/jmm-conversation-runtime/legacy.log
  LEGACY=${PIPESTATUS[0]}
  node --import tsx scripts/sync-check.ts |& tee .local/jmm-conversation-runtime/sync.log
  SYNC=${PIPESTATUS[0]}
fi
set -e
USERS="$("$PG/psql" -h 127.0.0.1 -p 55432 -d jmm_launch_integration_test -At -c 'SELECT COUNT(*) FROM "User";')"
printf 'followup=%s baseline=%s legacy=%s sync=%s remaining_users=%s egress_bytes=%s\n' "$FOLLOWUP" "$BASELINE" "$LEGACY" "$SYNC" "$USERS" "$(wc -c < "$JMM_EGRESS_LOG")" | tee ".local/jmm-conversation-runtime/$SUITE-summary.log"
[[ "$FOLLOWUP" == 0 && "$BASELINE" == 0 && "$LEGACY" == 0 && "$SYNC" == 0 && "$USERS" == 0 ]]
