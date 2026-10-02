import { test } from "node:test";
import assert from "node:assert/strict";
import { intervalsConnectorEnabled, automatedDeliveryEnabled } from "./capabilities";
import { intervalsCreateEvent, intervalsUpdateEvent, intervalsVerifyKey } from "./intervals";
import { allDeliveryGuides } from "./device-delivery";

// Never call a real provider, even if a developer has an enabled local flag.
test("optional capabilities fail closed; only explicit true enables them", () => {
  for (const value of [undefined, "", "false", "1", "TRUE", " true "]) {
    assert.equal(intervalsConnectorEnabled({ ENABLE_INTERVALS_CONNECTOR: value }), false);
    assert.equal(automatedDeliveryEnabled({ ENABLE_AUTOMATED_DELIVERY: value }), false);
  }
  assert.equal(intervalsConnectorEnabled({ ENABLE_INTERVALS_CONNECTOR: "true" }), true);
  assert.equal(automatedDeliveryEnabled({ ENABLE_AUTOMATED_DELIVERY: "true" }), true);
});

test("Intervals verification, create and update make zero network calls while disabled", async () => {
  const flag = process.env.ENABLE_INTERVALS_CONNECTOR;
  const originalFetch = globalThis.fetch;
  let calls = 0;
  process.env.ENABLE_INTERVALS_CONNECTOR = "false";
  globalThis.fetch = async () => { calls++; throw new Error("Unexpected provider call"); };
  const event = { dateLocal: "2026-10-02", sport: "run", title: "Synthetic test", description: "Fixture" };
  try {
    await assert.rejects(intervalsVerifyKey("synthetic-test-only"), /disabled/);
    await assert.rejects(intervalsCreateEvent("synthetic-test-only", event), /disabled/);
    await assert.rejects(intervalsUpdateEvent("synthetic-test-only", "test-id", event), /disabled/);
    assert.equal(calls, 0);
  } finally {
    if (flag == null) delete process.env.ENABLE_INTERVALS_CONNECTOR; else process.env.ENABLE_INTERVALS_CONNECTOR = flag;
    globalThis.fetch = originalFetch;
  }
});

test("manual Garmin guide covers USB/NewFiles, compatibility, Mac limits and no receipt", () => {
  for (const language of ["en", "es"] as const) {
    const guide = allDeliveryGuides(language).find(g => g.platform === "garmin")!;
    assert.equal(guide.file, "fit");
    assert.match(guide.helpUrl!, /^https:\/\/support\.garmin\.com\//);
    const words = guide.steps.join(" ");
    assert.match(words, /Garmin\/NewFiles/);
    assert.match(words, /USB/);
    assert.match(words, /Mac/);
    assert.match(words, /Windows/);
    assert.doesNotMatch(words, /Workouts → Import|Workouts.*Import Workout|JSON/);
  }
});
