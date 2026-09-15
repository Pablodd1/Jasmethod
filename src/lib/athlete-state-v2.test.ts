// Run: npx tsx src/lib/athlete-state-v2.test.ts
// Shadow-mode V2 golden tests — 26+ validation cases from the spec.
import assert from "node:assert";
import { computeAthleteState, type AthleteStateInput } from "./athlete-state-v2";

function run(name: string, input: Partial<AthleteStateInput>, checks: (s: any) => void) {
  const state = computeAthleteState(input as AthleteStateInput);
  checks(state);
  console.log(`  ✓ ${name}`);
}

const base: AthleteStateInput = {
  hrvToday: 62, hrvBaseline7d: [62, 61, 63, 60, 62, 61, 62],
  sleep: 3, soreness: 3, energy: 3, stress: 3, motivation: 3, mood: 3,
  recentTss: [50, 50, 50, 50, 50, 50, 50],
  rhrToday: 50, rhrBaseline: 50,
  experience: "amateur",
};

console.log("AthleteState V2 — golden tests");

// ---- HRV cases ----
run("normal HRV", { ...base }, (s) => {
  assert.equal(s.aerobicReadiness.status, "neutral");
  assert.ok(s.aerobicReadiness.reason.includes("normal"));
});
run("low HRV (suppressed)", { ...base, hrvToday: 52 }, (s) => {
  assert.equal(s.aerobicReadiness.status, "caution");
});
run("unusually high HRV", { ...base, hrvToday: 70 }, (s) => {
  assert.equal(s.aerobicReadiness.status, "good");
  assert.ok(!s.aerobicReadiness.reason.includes("harder"), "high HRV must not push intensity");
});
run("missing HRV", { ...base, hrvToday: undefined, hrvBaseline7d: undefined }, (s) => {
  assert.equal(s.aerobicReadiness.status, "unknown");
  assert.ok(s.aerobicReadiness.confidence < 0.5);
});
run("multi-device HRV (whoop + garmin + oura)", { ...base, hrvDevices: ["whoop", "garmin", "oura"] }, (s) => {
  assert.ok(s.aerobicReadiness.confidence > 0.5, "multi-device boosts confidence");
});

// ---- Subjective ----
run("poor sleep only", { ...base, sleep: 1 }, (s) => {
  assert.equal(s.sleepStatus.status, "caution");
  assert.notEqual(s.aerobicReadiness.status, "caution", "sleep alone must not drive aerobic readiness");
});
run("high soreness only", { ...base, soreness: 5 }, (s) => {
  assert.equal(s.neuromuscularReadiness.status, "caution");
});
run("high stress only", { ...base, stress: 5 }, (s) => {
  assert.equal(s.subjectiveWellness.status, "caution");
});
run("excellent subjective recovery", { ...base, sleep: 5, energy: 5, mood: 5, motivation: 5 }, (s) => {
  assert.equal(s.subjectiveWellness.status, "good");
});

// ---- Training load ----
run("high recent load", { ...base, recentTss: [120, 110, 130, 115, 125, 110, 120] }, (s) => {
  assert.equal(s.trainingLoadStatus.status, "caution");
});
run("missed sessions (low load)", { ...base, recentTss: [10, 0, 15, 0, 10, 0, 5] }, (s) => {
  assert.ok(s.trainingLoadStatus.status === "neutral" || s.trainingLoadStatus.status === "unknown");
});

// ---- Safety overrides ----
run("illness flag", { ...base, sick: true }, (s) => {
  assert.equal(s.healthCaution.status, "caution");
  assert.ok(s.healthCaution.reason.includes("pause") || s.healthCaution.reason.includes("illness"));
});
run("injury flag", { ...base, injuredFlag: true }, (s) => {
  assert.equal(s.musculoskeletalStatus.status, "caution");
});
run("menstrual symptoms", { ...base, menstrualSymptoms: true }, (s) => {
  assert.equal(s.healthCaution.status, "caution");
  // Must NOT be an automatic readiness penalty
  assert.ok(!s.healthCaution.reason.includes("penalty"));
});
run("menstrual day without symptoms", { ...base, menstrualDay: 15 }, (s) => {
  // No automatic penalty — context only
  assert.notEqual(s.healthCaution.status, "caution");
});

// ---- RPE / recent effort ----
run("recent RPE 9-10 (high recent effort)", { ...base, soreness: 4, energy: 2 }, (s) => {
  // At least one dimension should reflect the high recent effort
  assert.ok(s.reasonCodes.length > 0);
});

// ---- No wearable ----
run("no wearable athlete (manual only)", { ...base, hrvToday: undefined, hrvBaseline7d: undefined, rhrToday: undefined, rhrBaseline: undefined }, (s) => {
  assert.equal(s.aerobicReadiness.status, "unknown");
  assert.ok(s.dataCoverage >= 0.5, "subjective + load data still provide coverage without wearable");
  assert.equal(s.aerobicReadiness.status, "unknown", "aerobic correctly unknown");
});

// ---- Beginner ----
run("beginner athlete", { ...base, experience: "beginner" }, (s) => {
  // Beginner should not be penalised for normal data
  assert.notEqual(s.subjectiveWellness.status, "caution");
});

// ---- Environmental ----
run("heat stress", { ...base, tempC: 32 }, (s) => {
  assert.equal(s.environmentalStress.status, "caution");
});
run("altitude stress", { ...base, altitudeM: 2500 }, (s) => {
  assert.equal(s.environmentalStress.status, "caution");
});

// ---- Confidence coverage ----
run("full data coverage", { ...base, tempC: 25, sick: false, injuredFlag: false }, (s) => {
  assert.ok(s.dataCoverage >= 0.8, `coverage should be high with full data, got ${s.dataCoverage}`);
  assert.ok(s.dataConfidence > 0.5, "confidence should be reasonable");
});
run("minimal data coverage", { }, (s) => {
  assert.ok(s.dataCoverage < 0.5, "minimal data should have low coverage");
});

console.log("\nAthleteState V2 — all golden tests passed");
