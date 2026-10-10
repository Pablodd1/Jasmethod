import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isDailyTraining } from "./training-contract";
import { assessDailyEnvironment, isDailyEnvironmentAssessment } from "../../lib/daily-environment";
const source = readFileSync("src/components/daily-training/DailyEnvironmentCard.tsx", "utf8");
test("environment card keeps edits explicit, dirty/late results isolated, and no location inference", () => {
  assert.match(source, /Unsaved changes: the previous forecast does not apply/); assert.match(source, /status: "unknown" as const, reason: "unconfirmed"/);
  assert.match(source, /sequence\.current\+\+/); assert.match(source, /sequence !== requestSequence.current/); assert.match(source, /controller.current\?\.abort/); assert.match(source, /if \(pending.current \|\| disabled\) return/);
  assert.match(source, /Save and forecast venue/); assert.match(source, /Guardar y consultar pronóstico/); assert.match(source, /Forecasting sends venue coordinates and time to MET Norway/);
  assert.match(source, /role="alert"/); assert.match(source, /role="status"/); assert.match(source, /<label/); assert.match(source, /fieldset disabled/);
  assert.doesNotMatch(source, /navigator\.geolocation|getCurrentPosition|watchPosition|heatPowerFactor|wbgt/);
});
test("daily response guard rejects malformed environment evidence instead of displaying conditions", () => {
  const sample = JSON.parse(readFileSync("src/components/daily-training/sample-session.json", "utf8"));
  const unknown = assessDailyEnvironment({ record: null, athleteId: "athlete", sessionId: "workout", dateLocal: "2026-10-10", timezone: "UTC" });
  assert.equal(isDailyEnvironmentAssessment(unknown), true); assert.equal(isDailyTraining({ ...sample, environment: unknown }), true);
  for (const environment of [null, {}, { ...unknown, status: "safe" }, { ...unknown, status: "forecast" }, { ...unknown, conditions: { temperatureC: 20, humidityPct: 40, windMs: 0 } }, { ...unknown, forecastAgeMinutes: -1 }]) { assert.equal(isDailyEnvironmentAssessment(environment), false); assert.equal(isDailyTraining({ ...sample, environment }), false); }
});
