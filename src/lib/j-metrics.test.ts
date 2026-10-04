import { test } from "node:test";
import assert from "node:assert/strict";
import { computeJMetrics, workoutJStress, type JStressWorkout } from "./j-metrics";
import { addDaysKey, localDate } from "./dates";
const at = new Date("2026-10-04T20:00:00Z");
const session = (extra: Partial<JStressWorkout> = {}): JStressWorkout => ({ date: at, completed: true, planned: false, durationMin: 60, rpe: 5, ...extra });
test("JStress uses actual reported effort and recorded duration only", () => {
  assert.equal(workoutJStress(session()).value, 300);
  assert.equal(workoutJStress(session({ actualDurationMin: 40 })).value, 200);
  assert.equal(workoutJStress(session({ planned: true })).value, null);
  assert.equal(workoutJStress(session({ planned: true, actualDurationMin: 40 })).value, 200);
  assert.equal(workoutJStress(session({ completed: false })).value, null);
  for (const feedbackStatus of ["partial", "substituted"]) {
    assert.equal(workoutJStress(session({ completed: false, planned: true, actualDurationMin: 20, feedbackStatus })).value, 100);
    const m = computeJMetrics([session({ completed: false, feedbackStatus, rpe: null })], at, "UTC", ["2026-10-04"], 1);
    assert.equal(m.series[0].jStress, null);
    assert.deepEqual(m.confirmedRestDays, []);
  }
  assert.equal(workoutJStress(session({ matchedPlanId: "activity" })).value, null);
  for (const rpe of [null, undefined, NaN, Infinity, -1, 11]) assert.equal(workoutJStress(session({ rpe })).value, null);
  for (const durationMin of [0, -10, NaN, Infinity, 1441]) assert.equal(workoutJStress(session({ durationMin })).value, null);
  assert.equal(workoutJStress(session({ rpe: 0 })).value, 0);
  const legacy = { ...session({ rpe: null }), tss: 300, intensity: "z5", np: 200 };
  assert.equal(workoutJStress(legacy).value, null);
});
test("Unknown days and incomplete sessions are not rest; imported activity overrides rest", () => {
  const m = computeJMetrics([session(), session({ rpe: null }), session({ matchedPlanId: "activity" })], at, "UTC", ["2026-10-03", "2026-10-04"], 3);
  assert.deepEqual(m.series.map(p => p.jStress), [null, 0, null]);
  assert.equal(m.totalJStress, 300);
  assert.equal(m.coveragePct, 50);
  assert.equal(m.totalSessions, 2);
  assert.deepEqual(m.confirmedRestDays, ["2026-10-03"]);
  assert.equal(m.current.jRecent, null);
});
test("Smoothing is initialized from observed daily load and needs contiguous history", () => {
  const first = "2026-08-24";
  const workouts = Array.from({ length: 42 }, (_, i) => session({ date: localDate(addDaysKey(first, i), "UTC") }));
  const m = computeJMetrics(workouts, at, "UTC", [], 42);
  assert.equal(m.series[5].jRecent, null);
  assert.equal(m.series[6].jRecent, 300);
  assert.equal(m.series[40].jBase, null);
  assert.deepEqual(m.current, { jBase: 300, jRecent: 300, jBalance: 0 });
  const gap = computeJMetrics(workouts.filter((_, i) => i !== 36), at, "UTC", [], 42);
  assert.deepEqual(gap.current, { jBase: null, jRecent: null, jBalance: null });
  const rest = computeJMetrics(workouts.slice(0, -1), at, "UTC", ["2026-10-04"], 42);
  assert.equal(rest.current.jBase, Math.round(300 * Math.exp(-1 / 42) * 10) / 10);
  assert.equal(rest.current.jRecent, Math.round(300 * Math.exp(-1 / 7) * 10) / 10);
});
test("Calendar window handles timezone and daylight saving; future workouts excluded", () => {
  const now = new Date("2026-11-02T02:00:00Z");
  const m = computeJMetrics([session({ date: new Date("2026-11-01T05:30:00Z") }), session({ date: new Date("2026-11-01T06:30:00Z") }), session({ date: new Date("2026-11-03T00:00:00Z") })], now, "America/New_York", [], 2);
  assert.equal(m.today, "2026-11-01");
  assert.deepEqual(m.series.map(p => p.date), ["2026-10-31", "2026-11-01"]);
  assert.equal(m.series[1].jStress, 600);
  assert.equal(m.totalSessions, 2);
});
