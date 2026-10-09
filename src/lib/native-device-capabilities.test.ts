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


test("valid OAuth setup only enables authorization, never data sync or device receipt", () => {
  const { coros } = nativeDeviceCapabilities({ ENABLE_COROS_CONNECTOR: "true", APP_URL: "https://example.test", COROS_ISSUER: "https://mcpus.coros.com", COROS_CLIENT_ID: "synthetic-public-client", TOKEN_ENCRYPTION_KEY: "synthetic-test-key-never-configured" });
  assert.equal(coros.configured, true);
  assert.equal(coros.authorizationAvailable, true);
  assert.equal(coros.publishesStructuredWorkouts, false);
  assert.equal(coros.importsActivities, false);
  assert.equal(coros.watchReceiptVerified, false);
});
