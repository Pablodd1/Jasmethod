import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { appleWorkoutPlanId, AppleWorkoutExportError, buildAppleWorkoutExport } from "./apple-workout-export";
import type { CanonicalSession } from "./canonical-session";
const now = new Date("2026-10-09T12:00:00.000Z");
function session(): CanonicalSession {
  return {
    schemaVersion: 2, id: "fixture-run", athleteId: "fixture-athlete", revision: "a".repeat(64), revisionNumber: 187649984473770,
    dateLocal: "2026-10-10", timezone: "America/New_York", title: "Fixture intervals", sport: "run", durationMin: 20,
    verdict: "ready", reason: "Explicit fixture", exactTimeSeconds: null,
    capability: { mode: "native", available: true, fitSport: "running", reason: "fixture", deviceTested: false },
    steps: [
      { name: "Warm up", phase: "warmup", zone: "z1", seconds: 300, endpoint: { type: "time", seconds: 300 }, target: { type: "open", source: "explicit", label: "Open effort" } },
      { name: "One kilometer", phase: "active", zone: "z3", seconds: 320, endpoint: { type: "distance", meters: 1000 }, target: { type: "pace", source: "explicit", low: 300, high: 330, label: "5:00–5:30/km" }, group: "Repeat 1/2", note: "Keep the complete instruction in the companion preview." },
      { name: "Manual recovery", phase: "recovery", zone: "z1", seconds: 90, endpoint: { type: "lap" }, target: { type: "heartRate", source: "explicit", low: 110, high: 135, label: "110–135 bpm" } },
      { name: "Second kilometer", phase: "active", zone: "z3", seconds: 320, endpoint: { type: "distance", meters: 1000 }, target: { type: "speed", source: "explicit", low: 3, high: 3.5, label: "3–3.5 m/s" }, group: "Repeat 2/2" },
      { name: "Cool down", phase: "cooldown", zone: "z1", seconds: 180, endpoint: { type: "time", seconds: 180 }, target: { type: "open", source: "effort", label: "Open effort", missingReason: "No numerical target requested." } },
    ],
  };
}
test("Apple JSON fixture matches canonical export exactly and omits private profile/athlete identity", () => {
  const result = buildAppleWorkoutExport(session(), now);
  const fixture = JSON.parse(readFileSync("native/apple/Tests/JMMWorkoutCoreTests/Fixtures/run.jmmworkout.json", "utf8"));
  assert.deepEqual(result, fixture);
  assert.equal("athleteId" in result, false);
  assert.equal("seconds" in result.steps[1], false);
  assert.deepEqual(result.steps[2].endpoint, { type: "lap" });
  assert.equal(result.hardwareVerified, false);
  assert.equal(result.localSchedulerOnly, true);
});
test("Apple plan identity is stable across revisions/dates and separated across athletes/sessions", () => {
  const a = session(), b = session(); b.revision = "b".repeat(64); b.dateLocal = "2026-10-11";
  assert.equal(buildAppleWorkoutExport(a, now).planId, buildAppleWorkoutExport(b, now).planId);
  assert.notEqual(appleWorkoutPlanId("athlete1", "session"), appleWorkoutPlanId("athlete2", "session"));
  assert.notEqual(appleWorkoutPlanId("a:b", "c"), appleWorkoutPlanId("a", "b:c"));
  assert.match(appleWorkoutPlanId("a", "b"), /^[a-f\d]{8}-[a-f\d]{4}-8[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/);
});
test("Apple exporter preserves explicit bike watts including upper-cap zero lower bound", () => {
  const a = session(); a.sport = "bike";
  a.steps[1].target = { type: "power", low: 0, high: 250, label: "≤250 W", source: "profile_reference" };
  assert.deepEqual(buildAppleWorkoutExport(a, now).steps[1].target, a.steps[1].target);
});
test("Apple export rejects blocked/rest/multisport/reps/unsupported targets instead of dropping details", () => {
  const mutations: ((a: CanonicalSession) => void)[] = [
    a => { a.verdict = "blocked"; }, a => { a.verdict = "rest"; }, a => { a.sport = "swim"; },
    a => { a.steps[1].endpoint = { type: "reps", reps: 12 }; },
    a => { a.steps[1].target = { type: "swimStroke", stroke: "free", source: "explicit", label: "Free" } as any; },
    a => { a.steps[1].componentId = "child"; }, a => { a.steps[2].phase = "warmup"; },
    a => { a.steps[2].phase = "cooldown"; }, a => { a.steps = Array.from({ length: 51 }, () => a.steps[1]); },
    a => { a.steps[1].target.low = Number.NaN; }, a => { a.steps[1].target.low = 340; },
    a => { a.steps[0].target.low = 3; }, a => { a.dateLocal = "2026-02-30"; },
    a => { a.timezone = "Not/AZone"; }, a => { a.revision = "unknown"; },
  ];
  for (const mutate of mutations) { const a = session(); mutate(a); assert.throws(() => buildAppleWorkoutExport(a, now), AppleWorkoutExportError); }
});
test("Apple byte bound rejects oversized notes without truncating them", () => {
  const a = session(); a.steps = Array.from({ length: 40 }, (_, i) => ({ ...a.steps[1], name: `Interval ${i}`, note: "é".repeat(20000) }));
  assert.throws(() => buildAppleWorkoutExport(a, now), /256 KiB/);
});
