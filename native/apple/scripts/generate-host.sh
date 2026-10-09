#!/bin/bash
# Generates local project files only; no fetching, signing, or provisioning.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bash "$ROOT/scripts/preflight.sh"
cd "$ROOT"
xcodegen generate --spec project.yml
[[ -f JMMCompanion.xcodeproj/project.pbxproj && -f JMMCompanion.xcodeproj/xcshareddata/xcschemes/JMMCompanion.xcscheme ]] || {
  printf 'XcodeGen did not produce the expected project and shared scheme.\n' >&2
  exit 1
}
printf 'Generated %s/JMMCompanion.xcodeproj. This is not a compiled or signed app.\n' "$ROOT"
