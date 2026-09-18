// Run: npx tsx src/lib/fitness.test.ts
import assert from "node:assert";
import { estimateTss, computePmc, executionScore, predictRace, heatIndex, altitudeFactor } from "./fitness";

// TSS estimation paths
assert.ok(estimateTss({ durationMin: 60, tss: 50 }) === 50, "explicit TSS wins");
assert.ok(estimateTss({ durationMin: 60, avgPower: 250, ftp: 250 }) > 90, "power-based TSS");
assert.ok(estimateTss({ durationMin: 60, avgHr: 150, lthr: 160 }) > 0, "HR-based TSS");
assert.ok(estimateTss({ durationMin: 60, avgHr: 150, lthr: 160 }) < 120, "HR-based TSS stays sane (~1h Z2 isn't 200+)");
assert.ok(estimateTss({ durationMin: 60, rpe: 7 }) > 0, "RPE fallback");

// PMC series
const wk: { date: Date; tssInput: any }[] = [];
for (let i = 0; i < 60; i++) {
  const d = new Date(); d.setDate(d.getDate() - 60 + i);
  wk.push({ date: d, tssInput: { durationMin: 60, rpe: 5 + (i % 3) } });
}
const pmc = computePmc(wk)!;
assert.ok(pmc.series.length >= 40, "PMC series spans the block");
assert.ok(pmc.current.ctl > 0 && pmc.current.atl > 0);
assert.ok(["fresh", "neutral", "fatigued", "risky"].includes(pmc.formZone));
assert.ok(pmc.series[pmc.series.length - 1].tsb === pmc.current.tsb);

// execution score
const planned = [
  { date: new Date("2026-08-20T00:00:00Z"), sport: "run", durationMin: 60 },
  { date: new Date("2026-08-21T00:00:00Z"), sport: "bike", durationMin: 90 },
];
const doneAll = [
  { date: new Date("2026-08-20T00:00:00Z"), sport: "run", durationMin: 55 },
  { date: new Date("2026-08-21T00:00:00Z"), sport: "bike", durationMin: 85 },
];
const ex = executionScore(planned, doneAll)!;
assert.equal(ex.completionPct, 100);
assert.ok(ex.score >= 85, "full execution scores high");
const ex2 = executionScore(planned, [])!;
assert.equal(ex2.completionPct, 0);
assert.equal(ex2.score, 0);

// race prediction scales with distance
const p = predictRace({ ftp: 250, runPaceBase: 280, swimPaceBase: 100 }, "olympic")!;
const half = predictRace({ ftp: 250, runPaceBase: 280, swimPaceBase: 100 }, "half")!;
assert.ok(half.totalMin > p.totalMin, "half > olympic time");
assert.ok(p.bikeSpeedKmh > 25 && p.bikeSpeedKmh < 40, "plausible bike speed");
assert.ok(p.runPaceSecPerKm > 200 && p.runPaceSecPerKm < 400, "plausible run pace");
assert.equal(predictRace({ ftp: 250 }, "nonsense"), null, "unknown distance → null");

// heat index + altitude
assert.ok(heatIndex(30, 80) > 30, "humidity raises feels-like");
assert.equal(heatIndex(15, 50), 15, "cool temps unchanged");
const alt = altitudeFactor(2500);
assert.ok(alt.vo2factor < 1 && alt.paceFactor > 1, "altitude reduces VO2, slows pace");
assert.ok(altitudeFactor(100).vo2factor === 1, "below threshold no effect");
assert.ok(altitudeFactor(500).vo2factor < 1, "Wehrlin-linear starts near sea level (adjudication Conflict 1)");
const alt5000ft = altitudeFactor(1524); // ~5,000 ft
assert.ok(alt5000ft.vo2factor > 0.72 && alt5000ft.vo2factor < 0.82, "5,000 ft ≈ 20%+ aerobic power loss per adjudication");

console.log("✓ fitness.test.ts — all assertions passed");
