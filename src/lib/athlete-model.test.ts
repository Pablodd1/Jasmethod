import test from "node:test";
import assert from "node:assert/strict";
import { buildAthleteModel, inferZone, type HistoryWorkout, type HistoryMetric } from "./athlete-model";
import { analyzeCompliance } from "./execution-compliance";
import { decidePerformance, selectStimulus, buildDensitySteps, type MetricRow, type LoadRow } from "./performance-engine";
import type { ActivityStreams } from "./activity-streams";

const NOW = new Date("2026-11-02T12:00:00Z");
const day = (n: number) => new Date(+NOW - n * 86400000);
const garmin = (days: number, perWeek = 5, extra: Partial<HistoryWorkout> = {}): HistoryWorkout[] =>
  Array.from({ length: days }, (_, i) => i).filter(i => i % 7 < perWeek).map(i => ({ date: day(days - i), sport: i % 3 ? "bike" : "run", type: "endurance", durationMin: 60, completed: true, planned: false, source: "garmin", avgHr: 135, ...extra }));

test("history from Garmin/COROS builds the baseline; no history → cold start with questions", () => {
  const m = buildAthleteModel({ history: garmin(80), metrics: [], profile: { goal: "olympic", birthYear: 1990, sex: "male", lthr: 165 }, now: NOW });
  assert.equal(m.coldStart, false); assert.ok(m.hoursPerWeek28! > 3); assert.deepEqual(m.sports.sort(), ["bike", "run"]);
  assert.equal(m.levelSource, "history-estimate");
  const cold = buildAthleteModel({ history: [], metrics: [], profile: null, now: NOW });
  assert.equal(cold.coldStart, true); assert.equal(cold.pushAllowed, false); assert.equal(cold.level, "beginner");
  for (const id of ["goal", "birthYear", "sex", "experience", "connectHistory", "weeklyHours", "injuries", "energy"]) assert.ok(cold.onboarding.some(q => q.id === id), id);
});

test("stated level wins over estimate; goal label never raises level", () => {
  const m = buildAthleteModel({ history: garmin(80), metrics: [], profile: { experience: "pro", goal: "full" }, now: NOW });
  assert.equal(m.level, "pro"); assert.equal(m.levelSource, "profile");
  assert.ok(!m.onboarding.some(q => q.id === "experience"));
});

test("age and sex: masters spacing, youth no overload, no female penalty, RED-S asked of everyone", () => {
  const base = { history: garmin(80), metrics: [] as HistoryMetric[], now: NOW };
  assert.equal(buildAthleteModel({ ...base, profile: { birthYear: 1990 } }).spacingH, 48);
  assert.equal(buildAthleteModel({ ...base, profile: { birthYear: 1970 } }).spacingH, 60);
  const old = buildAthleteModel({ ...base, profile: { birthYear: 1955 } });
  assert.equal(old.spacingH, 72); assert.ok(old.keyCap <= 2);
  assert.equal(buildAthleteModel({ ...base, profile: { birthYear: 2011 } }).pushAllowed, false);
  const f = buildAthleteModel({ ...base, profile: { birthYear: 1990, sex: "female" } }), mm = buildAthleteModel({ ...base, profile: { birthYear: 1990, sex: "male" } });
  assert.equal(f.spacingH, mm.spacingH); assert.equal(f.keyCap, mm.keyCap);
  assert.ok(f.onboarding.some(q => q.id === "energy") && mm.onboarding.some(q => q.id === "energy"));
});

test("personal calibration: HRV recovery sets spacing, RPE bias lowers key cap", () => {
  // Baseline ~60 ms; each hard session drops HRV for ~3 days.
  const keys = [70, 60, 50, 40, 30, 20].map(d => ({ date: day(d), sport: "bike", type: "interval", intensity: "z5", durationMin: 60, completed: true, planned: false, rpe: 9 } as HistoryWorkout));
  const metrics: HistoryMetric[] = Array.from({ length: 85 }, (_, i) => 85 - i).map(n => ({ date: new Date(+day(n) + 6 * 3600000), hrv: keys.some(k => { const d = (+day(n) - +new Date(k.date)) / 86400000; return d >= 0 && d < 3; }) ? 45 : 60 + (n % 3), hrvType: "rmssd", source: "oura" }));
  const m = buildAthleteModel({ history: [...garmin(85), ...keys], metrics, profile: { birthYear: 1990, experience: "advanced" }, now: NOW });
  assert.ok(m.personalRecoveryH! >= 60, String(m.personalRecoveryH)); assert.equal(m.spacingH, 72);
  const hot = buildAthleteModel({ history: garmin(80, 5, { intensity: "z2", rpe: 6 }), metrics: [], profile: { experience: "advanced" }, now: NOW });
  assert.ok(hot.rpeBias! >= 1.5); assert.equal(hot.keyCap, 2);
});

test("imported rows with only heart rate get a zone from LTHR or HRmax", () => {
  assert.equal(inferZone({ date: NOW, sport: "run", avgHr: 168 }, { lthr: 165 }), "z5");
  assert.equal(inferZone({ date: NOW, sport: "run", avgHr: 130 }, { maxHr: 190 }), "z2");
  assert.equal(inferZone({ date: NOW, sport: "run" }, {}), null);
});

const synth = (reps: number[], workS = 240, restS = 180, wuS = 900): { steps: any[]; streams: ActivityStreams } => {
  const steps: any[] = [{ name: "wu", seconds: wuS, zone: "z2", phase: "warmup" }];
  reps.forEach((_, i) => { steps.push({ name: "rep", seconds: workS, zone: "z5", phase: "active" }); if (i < reps.length - 1) steps.push({ name: "rec", seconds: restS, zone: "z2", phase: "recovery" }); });
  steps.push({ name: "cd", seconds: 600, zone: "z1", phase: "cooldown" });
  const t: number[] = [], power: number[] = [], hr: number[] = []; let cur = 0;
  steps.forEach(s => { const repIdx = s.phase === "active" ? steps.filter(x => x.phase === "active").indexOf(s) : -1; for (let k = 0; k < s.seconds; k += 5) { t.push(cur + k); power.push(repIdx >= 0 ? reps[repIdx] : 150); hr.push(repIdx >= 0 ? 170 : 130); } cur += s.seconds; });
  return { steps, streams: { version: 1 as any, t, power, hr, cadence: t.map(() => null), speedMs: t.map(() => null), altitudeM: t.map(() => null), distanceM: t.map(() => null), originalSampleCount: t.length, reduced: false, droppedSamples: 0 } };
};

test("compliance: steady reps on target, fading reps flagged, no stream → insufficient", () => {
  const good = synth([300, 302, 298, 301, 300]);
  assert.equal(analyzeCompliance(good.steps, good.streams, { sport: "bike" }).verdict, "on_target");
  const fade = synth([300, 290, 275, 262, 250]);
  const r = analyzeCompliance(fade.steps, fade.streams, { sport: "bike" });
  assert.equal(r.verdict, "faded"); assert.ok(r.fadePct! > 8);
  assert.equal(analyzeCompliance(good.steps, null, { sport: "bike" }).verdict, "insufficient_data");
});

const whoop: MetricRow[] = Array.from({ length: 60 }, (_, i) => 59 - i).map(n => ({ date: day(n), hrv: n < 7 ? 64 : 60 + ((n % 5) - 2) * 2, hrvType: "rmssd", restingHr: 50, sleepHours: 7.6, source: "whoop" }));
const easy: LoadRow[] = Array.from({ length: 14 }, (_, i) => ({ date: day(27 - i * 2), sport: "bike", type: "endurance", intensity: "z2", rpe: 3, minutes: 60 }));
const good = { sleep: 5, soreness: 1, motivation: 5, energy: 5, stress: 1, mood: 5, sick: false, urgentSymptoms: false, newPain: false } as any;
const q = (extra: any) => ({ level: "advanced", phase: "build", plannedHard: true, nextDayKey: false, ...extra });

test("engine respects the athlete model: cold start, faded last key session, personal spacing", () => {
  const d = (extra: any) => decidePerformance({ base: { verdict: "full", safetyStatus: "clear", score: 90 }, subjective: good, metrics: whoop, loadRows: easy, pushEnabled: true, now: NOW, quality: q(extra) });
  assert.equal(d({}).verdict, "push");
  assert.ok(d({ pushAllowed: false, pushBlockReason: "first block" }).pushBlockedBy.includes("first block"));
  assert.ok(d({ lastKeyExecution: "faded" }).pushBlockedBy.some(r => /faded/.test(r)));
  const run60h = [...easy, { date: new Date(+NOW - 60 * 3600000), sport: "run", type: "interval", intensity: "z5", rpe: 8, minutes: 50 }];
  const dec = decidePerformance({ base: { verdict: "full", safetyStatus: "clear", score: 90 }, subjective: good, metrics: whoop, loadRows: run60h, pushEnabled: true, now: NOW });
  const planned = { sport: "run", type: "interval", intensity: "z5", durationMin: 60 };
  assert.equal(selectStimulus({ planned, decision: dec, availMin: 60, availableSports: ["bike"] }).sport, "run", "60 h > default 48 h");
  assert.equal(selectStimulus({ planned, decision: dec, availMin: 60, availableSports: ["bike"], spacingH: 72 }).sport, "bike", "masters/personal 72 h spacing pivots");
  assert.ok(buildDensitySteps({ sport: "bike", kind: "threshold", zone: "z4", reason: "" }, 60));
});
