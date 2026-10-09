#!/bin/bash
# Read-only toolchain checks. Never installs tools, accepts licenses, or signs in.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail() { printf 'Apple host preflight: %s\n' "$*" >&2; exit 1; }

[[ "$(uname -s)" == Darwin ]] || fail "A Mac with Xcode is required; this environment cannot compile or run Apple SDK code."
for tool in xcodebuild xcrun xcodegen; do
  command -v "$tool" >/dev/null 2>&1 || fail "Missing $tool. Use your approved tool installation workflow; this script installs nothing."
done

XCODE_OUTPUT="$(xcodebuild -version)" || fail "Xcode is not ready. Have the developer check the selected Xcode and any pending setup/license prompts."
XCODE_VERSION="$(printf '%s\n' "$XCODE_OUTPUT" | awk '/^Xcode / { print $2; exit }')"
[[ "$XCODE_VERSION" =~ ^([0-9]+)\.([0-9]+) ]] || fail "Could not parse xcodebuild -version."
(( BASH_REMATCH[1] >= 16 )) || fail "Xcode 16 or newer is required to compile the iOS 18 APIs behind availability guards; deployment remains iOS 17."

PIN="$(tr -d '[:space:]' < "$ROOT/.xcodegen-version")"
GENERATOR_OUTPUT="$(xcodegen --version)" || fail "Could not read the XcodeGen version."
GENERATOR_VERSION="$(printf '%s\n' "$GENERATOR_OUTPUT" | awk '{print $NF}')"
[[ "$GENERATOR_VERSION" == "$PIN" ]] || fail "Expected XcodeGen $PIN, found $GENERATOR_VERSION. Use the pinned official release; do not silently regenerate with a different version."

SDK_VERSION="$(xcrun --sdk iphonesimulator --show-sdk-version)" || fail "The iOS Simulator SDK is unavailable in the selected Xcode."
[[ "$SDK_VERSION" =~ ^([0-9]+)\.([0-9]+) ]] || fail "Could not parse the iOS Simulator SDK version."
(( BASH_REMATCH[1] >= 18 )) || fail "An iOS 18 or newer SDK is required; an iOS 17 runtime can still be used for minimum-version tests."
xcrun --find swift >/dev/null || fail "The selected Xcode Swift toolchain is unavailable."
xcrun swift --version
printf '%s\nXcodeGen %s\niOS Simulator SDK %s\n' "$XCODE_OUTPUT" "$GENERATOR_VERSION" "$SDK_VERSION"
printf 'Preflight passed. No project generation, compilation, signing, grant, or device test has run.\n'
