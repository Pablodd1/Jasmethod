import test from "node:test";
import assert from "node:assert/strict";
import { fadePercent, suggestNextWorkout } from "./next-workout-suggestion";
import { applyIntervalPatch, summarizeSet, type EditableStep, type SetSummary } from "./workout-interval-edit";
import type { StreamAnalysis } from "./stream-analysis";

const analysis = (over: Partial<StreamAnalysis> = {}): StreamAnalysis => ({ ok: true, durationS: 3600, sampleSeconds: 3600, coverage: {}, power: null, hr: null, decoupling: null, efforts: [], notes: [], streamsReduced: false, ...over });
const effort = (avg: number, startS = 0) => ({ startS, durationS: 240, channel: "power" as const, avg, avgHrBpm: null, zone: 5 });
const set = (repeats: number, hardSeconds = repeats * 240): SetSummary => ({ repeats, workSeconds: 240, restSeconds: 120, workZone: 4, hardSeconds, totalSeconds: 3600 });

test("fade is the drop from first to last hard effort; needs ≥ 3 efforts on one channel", () => {
  assert.equal(fadePercent([effort(300), effort(290), effort(270)]), 10);
  assert.equal(fadePercent([effort(300), effort(270)]), null);
  assert.equal(fadePercent([effort(300), { ...effort(290), channel: "hr" as const }, effort(270)]), null);
  assert.equal(fadePercent([]), null);
});

test("no next interval set → nothing to adjust; no evidence → none, never a guess", () => {
  assert.equal(suggestNextWorkout({ analysis: analysis(), nextSet: null }).kind, "none");
  const r = suggestNextWorkout({ analysis: analysis(), plannedSet: null, nextSet: set(5) });
  assert.equal(r.kind, "none");
  assert.equal(r.patch, undefined);
});

test("strong fade (≥ 8%) → reduce by one repeat, no extra confirmation needed", () => {
  const r = suggestNextWorkout({ analysis: analysis({ efforts: [effort(300), effort(285), effort(270), effort(270, 3000)] }), plannedSet: set(4), nextSet: set(5) });
  assert.equal(r.kind, "reduce");
  assert.deepEqual(r.patch, { repeatsDelta: -1 });
  assert.equal(r.requiresConfirmation, false);
  assert.match(r.reasons[0].en, /faded 10%/);
  assert.match(r.reasons[0].es, /10%/);
});

test("high aerobic decoupling (≥ 8%) → reduce; moderate (5–8%) → hold with no patch", () => {
  const dec = (percent: number) => analysis({ decoupling: { percent, basis: "power", firstHalfEf: 1.4, secondHalfEf: 1.3 } });
  assert.equal(suggestNextWorkout({ analysis: dec(9.2), nextSet: set(4) }).kind, "reduce");
  const hold = suggestNextWorkout({ analysis: dec(6), nextSet: set(4) });
  assert.equal(hold.kind, "hold");
  assert.equal(hold.patch, undefined);
});

test("fewer hard efforts than planned: 2+ fewer → reduce, 1 fewer → hold", () => {
  assert.equal(suggestNextWorkout({ analysis: analysis({ efforts: [effort(300), effort(300)] }), plannedSet: set(4), nextSet: set(4) }).kind, "reduce");
  assert.equal(suggestNextWorkout({ analysis: analysis({ efforts: [effort(300), effort(300), effort(299)] }), plannedSet: set(4), nextSet: set(4) }).kind, "hold");
});

test("a next session with a single effort is never reduced below it", () => {
  const r = suggestNextWorkout({ analysis: analysis({ decoupling: { percent: 12, basis: "power", firstHalfEf: 1, secondHalfEf: 0.9 } }), nextSet: set(1) });
  assert.equal(r.kind, "hold");
  assert.equal(r.patch, undefined);
});

test("progression needs positive evidence, is +1 repeat, and ALWAYS requires explicit confirmation", () => {
  const good = suggestNextWorkout({ analysis: analysis({ efforts: [effort(300), effort(299), effort(298), effort(297)] }), plannedSet: set(4), nextSet: set(4) });
  assert.equal(good.kind, "progress");
  assert.deepEqual(good.patch, { repeatsDelta: 1 });
  assert.equal(good.requiresConfirmation, true);
  // missing planned set or too few efforts → no progression
  assert.equal(suggestNextWorkout({ analysis: analysis({ efforts: [effort(300), effort(299), effort(298), effort(297)] }), plannedSet: null, nextSet: set(4) }).kind, "none");
  // incomplete set → never progresses
  assert.notEqual(suggestNextWorkout({ analysis: analysis({ efforts: [effort(300), effort(300), effort(300)] }), plannedSet: set(4), nextSet: set(4) }).kind, "progress");
  // good fade but drifting aerobically → no progression
  assert.notEqual(suggestNextWorkout({ analysis: analysis({ efforts: [effort(300), effort(299), effort(298), effort(297)], decoupling: { percent: 6, basis: "power", firstHalfEf: 1, secondHalfEf: 1 } }), plannedSet: set(4), nextSet: set(4) }).kind, "progress");
});

test("a suggested patch really goes through the editor's limits: an increase over a tight budget is refused there", () => {
  const steps: EditableStep[] = [{ name: "Warm up", seconds: 600, zone: "z1", phase: "warmup", endpoint: { type: "time", seconds: 600 } }];
  for (let i = 0; i < 4; i++) {
    steps.push({ name: `Hard ${i + 1}/4`, seconds: 240, zone: "z4", phase: "active", endpoint: { type: "time", seconds: 240 } });
    if (i < 3) steps.push({ name: "Easy", seconds: 120, zone: "z2", phase: "recovery", endpoint: { type: "time", seconds: 120 } });
  }
  steps.push({ name: "Cool down", seconds: 600, zone: "z1", phase: "cooldown", endpoint: { type: "time", seconds: 600 } });
  const next = summarizeSet(steps)!;
  const s = suggestNextWorkout({ analysis: analysis({ efforts: [effort(300), effort(299), effort(298), effort(297)] }), plannedSet: set(4), nextSet: next });
  assert.equal(s.kind, "progress");
  const total = steps.reduce((a, x) => a + x.seconds, 0);
  const tight = applyIntervalPatch(steps, s.patch!, { budgetSeconds: total, intensityCapZone: 5 });
  assert.equal(tight.ok === false && tight.code, "exceeds_time_budget");
  const roomy = applyIntervalPatch(steps, s.patch!, { budgetSeconds: total + 600, intensityCapZone: 5 });
  assert.equal(roomy.ok, true);
  if (roomy.ok) assert.equal(roomy.requiresConfirmation, true);
});
