import test from "node:test";
import assert from "node:assert/strict";
import { nativeDeviceCapabilities } from "./native-device-capabilities";

test("native device publication and receipt never become live from an environment switch", () => {
  for (const value of [undefined, "", "false", "TRUE", "1", "true"]) {
    const capabilities = nativeDeviceCapabilities({ ENABLE_APPLE_WORKOUT_EXPORT: value, ENABLE_COROS_CONNECTOR: "true" });
    assert.equal(capabilities.apple.exportEnabled, value === "true");
    assert.equal(capabilities.apple.automaticSync, false);
    assert.equal(capabilities.apple.watchReceiptVerified, false);
    assert.equal(capabilities.apple.importsActivities, false);
    assert.equal(capabilities.coros.configured, false);
    assert.equal(capabilities.coros.authorizationAvailable, false);
    assert.equal(capabilities.coros.publishesStructuredWorkouts, false);
    assert.equal(capabilities.coros.importsActivities, false);
    assert.equal(capabilities.coros.watchReceiptVerified, false);
  }
});
