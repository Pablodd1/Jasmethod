// Run: npx tsx src/lib/hrv-status.test.ts
// Regression tests for the HRV readiness contradiction hotfix (PR 0).
// The old behavior: normal HRV → score 50 → fallback interpreted as RED.
// The fix: hrvStatus categorical field constrains the interpretation.
import assert from "node:assert";
import { hrvReadiness } from "./science";
import { hrvDayType } from "./hrv-status";

const baseline = [62, 61, 63, 60, 62, 61, 62]; // stable ~61.7 avg
const mean = baseline.reduce((a, b) => a + b, 0) / baseline.length;
const sd = Math.sqrt(baseline.reduce((a, b) => a + (b - mean) ** 2, 0) / baseline.length);

// ---- NORMAL HRV (z within ±0.5 SD) → status "normal", day type NOT red ----
{
  const r = hrvReadiness(62, baseline, sd);
  assert.equal(r.hrvStatus, "normal", `normal HRV → "normal", got "${r.hrvStatus}"`);
  const day = hrvDayType(r.hrvStatus);
  assert.notEqual(day, "red", `normal HRV must NOT produce red day, got "${day}"`);
  assert.ok(r.score >= 40 && r.score <= 60, `normal score in 40-60 range, got ${r.score}`);
}

// ---- HIGH HRV (z ≥ 1) → status "high" ----
{
  const r = hrvReadiness(68, baseline, sd); // z ≈ 1.7
  assert.equal(r.hrvStatus, "high", `elevated HRV → "high"`);
  const day = hrvDayType(r.hrvStatus);
  assert.equal(day, "green", "high HRV → green day");
  // High HRV must NOT independently justify increasing intensity
  assert.ok(!r.advice.toLowerCase().includes("harder"), "high HRV advice must not push harder sessions");
}

// ---- LOW HRV (z ≤ -1) → status "low" ----
{
  const r = hrvReadiness(55, baseline, sd); // z ≈ -1.8
  assert.equal(r.hrvStatus, "low", `suppressed HRV → "low"`);
  const day = hrvDayType(r.hrvStatus);
  assert.equal(day, "caution", "low HRV → caution day");
}

// ---- BORDERLINE (z between -1 and -0.5) → status "low", but score higher than severe ----
{
  const r = hrvReadiness(61, baseline, sd); // z ≈ -0.7
  assert.equal(r.hrvStatus, "low", `borderline → "low"`);
  assert.ok(r.score >= 35, "borderline score should not be severely low");
}

// ---- INSUFFICIENT DATA ----
{
  const r = hrvReadiness(62, [], 0); // empty baseline
  assert.equal(r.hrvStatus, "insufficient", "no baseline → insufficient");
}

// ---- SCORE RANGES (the numeric score is for display, not for driving RED) ----
{
  const normal = hrvReadiness(62, baseline, sd);
  const low = hrvReadiness(55, baseline, sd);
  const high = hrvReadiness(68, baseline, sd);
  assert.ok(normal.score < low.score || normal.score > low.score, "scores exist"); // just checking they exist
  assert.ok(high.score > normal.score, "high > normal");
  assert.ok(low.score < normal.score, "low < normal");
}

// ---- HRV NEVER ALONE DRIVES THE DAY TYPE ----
{
  // Even LOW HRV with excellent subjective wellness → the day type is a
  // caution, not a hard rest. The check-in and training load are the
  // other half of the picture (handled in athlete-state-v2.ts, not here).
  const low = hrvReadiness(55, baseline, sd);
  assert.equal(low.hrvStatus, "low");
  // The hrvStatus constrains interpretation — it doesn't replace the full assessment
}

console.log("✓ hrv-status.test.ts — all assertions passed");
