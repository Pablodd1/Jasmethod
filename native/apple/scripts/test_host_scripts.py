"""Local configuration/wrapper tests, not XcodeGen, Swift or Apple SDK tests.

Run: python3 native/apple/scripts/test_host_scripts.py
Only the Python standard library and Bash are needed. Tool calls are fakes in a
temporary directory; no app is compiled, signed, provisioned or installed.
"""

import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import tempfile
import unittest


SOURCE = Path(__file__).resolve().parents[1]
SIMULATOR_ID = "00000000-0000-4000-8000-000000000001"


class HostScriptsTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="jmm-apple-host-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / "native app"
        shutil.copytree(SOURCE / "scripts", self.root / "scripts")
        shutil.copytree(SOURCE / "Config", self.root / "Config")
        shutil.copy2(SOURCE / ".xcodegen-version", self.root)
        shutil.copy2(SOURCE / "project.yml", self.root)
        self.bin = Path(self.temporary.name) / "bin"
        self.bin.mkdir()
        self.log = Path(self.temporary.name) / "calls.txt"
        self.env = dict(os.environ, PATH=f"{self.bin}:/usr/bin:/bin", MOCK_LOG=str(self.log))
        self.tool("uname", 'printf "%s\\n" "${MOCK_OS:-Darwin}"')
        self.tool("xcodegen", '''
if [[ "$1" == --version ]]; then
  printf 'Version: %s\\n' "${MOCK_GENERATOR:-2.44.1}"
else
  printf 'CALL xcodegen\\n%s\\n' "$*" >> "$MOCK_LOG"
  [[ "${MOCK_GENERATE_FAIL:-0}" == 0 ]] || exit 6
  if [[ "${MOCK_GENERATE_EMPTY:-0}" == 0 ]]; then
    mkdir -p JMMCompanion.xcodeproj/xcshareddata/xcschemes
    touch JMMCompanion.xcodeproj/project.pbxproj
    touch JMMCompanion.xcodeproj/xcshareddata/xcschemes/JMMCompanion.xcscheme
  fi
fi
''')
        self.tool("xcodebuild", '''
if [[ "$1" == -version ]]; then
  printf 'Xcode %s\\nBuild version mock\\n' "${MOCK_XCODE:-16.4}"
else
  printf 'CALL xcodebuild\\n' >> "$MOCK_LOG"
  printf '%s\\n' "$@" >> "$MOCK_LOG"
  exit "${MOCK_BUILD_STATUS:-0}"
fi
''')
        self.tool("xcrun", '''
case "$1" in
  --sdk) printf '%s\\n' "${MOCK_SDK:-18.5}" ;;
  --find) printf '/mock/selected/swift\\n' ;;
  swift) printf 'Apple Swift version mock\\n' ;;
  *) exit 7 ;;
esac
''')

    def tool(self, name, body):
        path = self.bin / name
        path.write_text("#!/bin/bash\nset -eu\n" + body + "\n")
        path.chmod(0o700)

    def run_script(self, name, *arguments, **environment):
        return subprocess.run(
            ["/bin/bash", str(self.root / "scripts" / name), *arguments],
            cwd=self.temporary.name,
            env=dict(self.env, **environment),
            capture_output=True,
            text=True,
            check=False,
        )

    def test_preflight_accepts_supported_pinned_tools(self):
        result = self.run_script("preflight.sh")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("No project generation, compilation", result.stdout)
        self.assertFalse(self.log.exists())

    def test_preflight_accepts_newer_xcode_sdk(self):
        result = self.run_script("preflight.sh", MOCK_XCODE="26.0", MOCK_SDK="26.0")
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_preflight_rejects_non_mac(self):
        result = self.run_script("preflight.sh", MOCK_OS="Linux")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("A Mac with Xcode is required", result.stderr)

    def test_preflight_rejects_old_xcode(self):
        result = self.run_script("preflight.sh", MOCK_XCODE="15.4")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Xcode 16 or newer", result.stderr)

    def test_preflight_rejects_unparseable_xcode(self):
        result = self.run_script("preflight.sh", MOCK_XCODE="unknown")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Could not parse", result.stderr)

    def test_preflight_rejects_different_generator(self):
        result = self.run_script("preflight.sh", MOCK_GENERATOR="2.46.0")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Expected XcodeGen 2.44.1", result.stderr)

    def test_preflight_rejects_old_sdk(self):
        result = self.run_script("preflight.sh", MOCK_SDK="17.5")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("iOS 18 or newer SDK", result.stderr)

    def test_generation_uses_checked_in_definition(self):
        result = self.run_script("generate-host.sh")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.log.read_text(), "CALL xcodegen\ngenerate --spec project.yml\n")

    def test_generation_failure_does_not_report_success(self):
        result = self.run_script("generate-host.sh", MOCK_GENERATE_FAIL="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("Generated ", result.stdout)

    def test_missing_generated_artifact_does_not_report_success(self):
        result = self.run_script("generate-host.sh", MOCK_GENERATE_EMPTY="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("did not produce", result.stderr)
        self.assertNotIn("Generated ", result.stdout)

    def test_simulator_build_is_unsigned_and_generic(self):
        result = self.run_script("verify-simulator.sh", "build")
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.log.read_text().splitlines()
        self.assertIn("generic/platform=iOS Simulator", calls)
        self.assertIn("iphonesimulator", calls)
        self.assertIn("CODE_SIGNING_ALLOWED=NO", calls)
        self.assertNotIn("-allowProvisioningUpdates", calls)
        self.assertEqual(calls[-1], "build")

    def test_simulator_test_uses_explicit_uuid(self):
        result = self.run_script("verify-simulator.sh", "test", SIMULATOR_ID)
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.log.read_text().splitlines()
        self.assertIn(f"platform=iOS Simulator,id={SIMULATOR_ID}", calls)
        self.assertIn("CODE_SIGNING_ALLOWED=NO", calls)
        self.assertEqual(calls[-1], "test")

    def test_rejects_missing_invalid_uuid_and_extra_signing_arguments(self):
        for args in [("test",), ("test", "YOUR_SIMULATOR_UDID"), ("build", "CODE_SIGNING_ALLOWED=YES"), ("archive",)]:
            with self.subTest(args=args):
                result = self.run_script("verify-simulator.sh", *args)
                self.assertEqual(result.returncode, 2)
                self.assertFalse(self.log.exists())

    def test_build_failure_is_not_success(self):
        result = self.run_script("verify-simulator.sh", "build", MOCK_BUILD_STATUS="65")
        self.assertEqual(result.returncode, 65)
        self.assertNotIn("Simulator build succeeded", result.stdout)

    def test_plists_declare_only_read_health_capability(self):
        with (SOURCE / "Config" / "Info.plist").open("rb") as stream:
            info = plistlib.load(stream)
        with (SOURCE / "Config" / "JMMCompanion.entitlements").open("rb") as stream:
            entitlements = plistlib.load(stream)
        self.assertEqual(entitlements, {"com.apple.developer.healthkit": True})
        self.assertIn("does not automatically upload", info["NSHealthShareUsageDescription"])
        self.assertNotIn("NSHealthUpdateUsageDescription", info)
        self.assertNotIn("UIBackgroundModes", info)
        self.assertEqual(info["CFBundleIdentifier"], "$(PRODUCT_BUNDLE_IDENTIFIER)")


if __name__ == "__main__":
    unittest.main(verbosity=2)
