#!/bin/bash
# Usage: verify-simulator.sh build | verify-simulator.sh test SIMULATOR_UDID
# Simulator only. No automatic runtime installation, provisioning, or signing.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
usage() { printf 'Usage: %s build | %s test SIMULATOR_UDID\n' "$0" "$0" >&2; exit 2; }
ACTION="${1:-}"
case "$ACTION" in
  build)
    [[ $# == 1 ]] || usage
    DESTINATION='generic/platform=iOS Simulator'
    ;;
  test)
    [[ $# == 2 ]] || usage
    [[ "$2" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]] || usage
    DESTINATION="platform=iOS Simulator,id=$2"
    ;;
  *) usage ;;
esac
bash "$ROOT/scripts/generate-host.sh"
cd "$ROOT"
mkdir -p .build/verification
RESULT="$ROOT/.build/verification/${ACTION}-$(date -u +%Y%m%dT%H%M%SZ)-$$.xcresult"
xcodebuild \
  -project JMMCompanion.xcodeproj \
  -scheme JMMCompanion \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination "$DESTINATION" \
  -derivedDataPath "$ROOT/.build/host-derived-data" \
  -resultBundlePath "$RESULT" \
  CODE_SIGNING_ALLOWED=NO \
  "$ACTION"
printf 'Simulator %s succeeded. Result bundle: %s\n' "$ACTION" "$RESULT"
printf 'This does not verify signing, HealthKit permission, physical watch receipt, or completed-workout ingestion.\n'
