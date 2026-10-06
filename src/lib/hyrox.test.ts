// Run: npx tsx src/lib/hyrox.test.ts
import assert from "node:assert";
import { planHyroxSplits, analyzeHyroxSplits, resolveHyroxPace } from "./hyrox";

// Plan math: 75 min at 4:30/km -> runs 36:00, stations ~37:24, rox 1:36
const plan = planHyroxSplits({ targetTotalMin: 75, runPaceSecPerKm: 270 });
assert.equal(plan.segments.length, 16, "16 segments");
assert.equal(plan.runsTotalSec, 2160, "8 runs x 270s");
const sum = plan.segments.reduce((a, s) => a + s.targetSec, 0) + plan.transitionsTotalSec;
assert.equal(sum, 75 * 60, "exact scenario total");
assert.equal(plan.segments.at(-1)?.cumulativeSec, 75 * 60);
// checkpoints grow monotonically
let prev = 0;
for (const seg of plan.segments) {
  assert.ok(seg.cumulativeSec >= prev, "monotonic checkpoints");
  prev = seg.cumulativeSec;
}
// stations differ by weight (wall ball > farmers)
const wall = plan.segments.find((s) => s.key === "wallball")!;
const farmers = plan.segments.find((s) => s.key === "farmers")!;
assert.ok(wall.targetSec > farmers.targetSec, "wallball costs more than farmers");

// Female strength stations scale up
const f = planHyroxSplits({ targetTotalMin: 75, runPaceSecPerKm: 270, sex: "female" });
const fSled = f.segments.find((s) => s.key === "sledpush")!;
assert.equal(fSled.targetSec, plan.segments.find((s) => s.key === "sledpush")!.targetSec, "no unsupported sex performance coefficient");
assert.deepEqual(planHyroxSplits({ targetTotalMin: 75, runPaceSecPerKm: 270, pro: true }).segments, plan.segments);

// Analysis: blown burpees detected as the race-loser
const actual = plan.segments.map((s) => s.targetSec);
const burpeeIdx = plan.segments.findIndex((s) => s.key === "burpee");
actual[burpeeIdx] += 250; // blow up burpees
const an = analyzeHyroxSplits(plan, actual);
assert.equal(an.weakest, "Burpee Broad Jumps", "burpees flagged");
const burpeeGap = an.stationGaps.find((g) => g.key === "burpee")!;
assert.ok(burpeeGap.deltaSec >= 248, "burpee delta ~+250s");
assert.ok(burpeeGap.pctOfTotalLoss > 80, "burpees dominate lost time");
assert.ok(burpeeGap.advice.includes("burpee"), "advice targets the station");
assert.ok(an.summary.includes("Burpee"), "summary names the culprit");

// Fast race: no weak station manufactured
const fast = plan.segments.map((s) => Math.round(s.targetSec * 0.95));
const an2 = analyzeHyroxSplits(plan, fast);
assert.ok(an2.totalDeltaSec < 0, "faster than plan detected");

console.log("✓ hyrox.test.ts — all assertions passed");

assert.throws(() => planHyroxSplits({ targetTotalMin: 30, runPaceSecPerKm: 270 }), /Target leaves/);
assert.throws(() => planHyroxSplits({ targetTotalMin: NaN, runPaceSecPerKm: 270 }), /positive/);
assert.throws(() => resolveHyroxPace(undefined, null), /No running pace/);
assert.deepEqual(resolveHyroxPace(undefined, 300), { pace: 300, source: "profile_threshold_scenario" });
assert.deepEqual(resolveHyroxPace("", 300), resolveHyroxPace(undefined, 300));
assert.deepEqual(resolveHyroxPace("290", 300), { pace: 290, source: "entered" });
assert.throws(() => resolveHyroxPace("300abc", 300), /positive/);
const missing = analyzeHyroxSplits(plan, Array(16).fill(null));
assert.equal(missing.stationGaps.length, 0); assert.equal(missing.weakest, ""); assert.equal(missing.summary, "No splits logged yet.");
const partial: (number | null)[] = Array(16).fill(null); partial[0] = 280;
const pa = analyzeHyroxSplits(plan, partial); assert.equal(pa.totalDeltaSec, 10); assert.equal(pa.stationGaps.length, 0); assert.match(pa.summary, /1\/16/);
assert.throws(() => analyzeHyroxSplits(plan, Array(16).fill(0)), /positive/);
assert.equal(an2.weakest, "");
const fading = plan.segments.map(s => s.targetSec); fading[14] += 60;
assert.match(analyzeHyroxSplits(plan, fading).summary, /last run was slower/);
assert.equal(analyzeHyroxSplits(plan, plan.segments.map(s => s.targetSec)).totalDeltaSec, 0, "segment comparison excludes unlogged transitions");
