import { test } from "node:test";
import assert from "node:assert";
import {
  unitsOf,
  fmtWeight,
  fmtHeight,
  fmtDistance,
  fmtTemp,
  fmtVolume,
  fmtVolumeDual,
  fmtPace,
} from "./units";

test("units: preference defaults to metric for anything unknown", () => {
  assert.strictEqual(unitsOf("imperial"), "imperial");
  assert.strictEqual(unitsOf("metric"), "metric");
  assert.strictEqual(unitsOf(null), "metric");
  assert.strictEqual(unitsOf("garbage"), "metric");
});

test("units: weight kg ↔ lb", () => {
  assert.strictEqual(fmtWeight(70, "metric"), "70.0 kg");
  assert.match(fmtWeight(70, "imperial"), /^154\.\d lb$/); // 70 × 2.20462 = 154.3
  assert.strictEqual(fmtWeight(null, "imperial"), "—");
});

test("units: height cm ↔ ft/in", () => {
  assert.strictEqual(fmtHeight(178, "metric"), "178 cm");
  assert.strictEqual(fmtHeight(178, "imperial"), `5'10"`); // 70.1 in
  assert.strictEqual(fmtHeight(null, "metric"), "—");
});

test("units: distance km ↔ miles", () => {
  assert.strictEqual(fmtDistance(9.5, "metric"), "9.5 km");
  assert.strictEqual(fmtDistance(10, "metric"), "10 km");
  assert.strictEqual(fmtDistance(21.1, "imperial"), "13.1 mi");
  assert.strictEqual(fmtDistance(42.195, "metric"), "42 km");
});

test("units: temperature °C ↔ °F", () => {
  assert.strictEqual(fmtTemp(25, "metric"), "25°C");
  assert.strictEqual(fmtTemp(0, "imperial"), "32°F");
  assert.strictEqual(fmtTemp(37, "imperial"), "99°F");
});

test("units: volume ml ↔ oz + dual label always shows both", () => {
  assert.strictEqual(fmtVolume(500, "metric"), "500 ml");
  assert.strictEqual(fmtVolume(500, "imperial"), "17 oz");
  assert.strictEqual(fmtVolumeDual(500, "metric"), "500 ml (17 oz)");
  assert.strictEqual(fmtVolumeDual(500, "imperial"), "17 oz (500 ml)");
});

test("units: pace min/km ↔ min/mi", () => {
  assert.strictEqual(fmtPace(300, "metric"), "5:00/km");
  // 5:00/km → 8:03/mi (300 × 1.609 = 482.8s)
  assert.strictEqual(fmtPace(300, "imperial"), "8:03/mi");
});
