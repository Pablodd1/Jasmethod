import { test } from "node:test";
import assert from "node:assert";
import {
  buildFuelingPlan,
  carbsPerHourFor,
  fuelCurveReference,
  postFuelPersonalized,
} from "./fueling";

test("carb curve follows the science bands (Jeukendrup 2014)", () => {
  assert.strictEqual(carbsPerHourFor(30, "z2"), 0, "<45 min: none");
  assert.strictEqual(carbsPerHourFor(60, "z5"), 20, "45-75 min hard: small");
  assert.ok(carbsPerHourFor(120, "z2") >= 30 && carbsPerHourFor(120, "z2") <= 45, "1-2.5h easy: 30-45");
  assert.strictEqual(carbsPerHourFor(120, "z4"), 60, "1-2.5h hard: 60");
  assert.strictEqual(carbsPerHourFor(180, "z4", false), 60, ">2.5h untrained gut caps at 60");
  assert.strictEqual(carbsPerHourFor(180, "z4", true), 90, ">2.5h gut-trained: 90 (2:1)");
});

test("hydration uses the measured sweat rate when present, capped at 1 L/h", () => {
  const measured = buildFuelingPlan({ durationMin: 120, intensity: "z3", sweatRateMlH: 1400 });
  assert.strictEqual(measured.fluidMlPerHour, 1000, "absorption cap");
  assert.strictEqual(measured.fluidSource, "measured");
  const estimated = buildFuelingPlan({ durationMin: 120, intensity: "z3" });
  assert.strictEqual(estimated.fluidSource, "estimated");
  assert.ok(estimated.fluidMlPerHour > 400 && estimated.fluidMlPerHour < 1000);
});

test("sodium is sweat-rate × concentration, personalized when measured", () => {
  const salty = buildFuelingPlan({
    durationMin: 180, intensity: "z3", sweatRateMlH: 1000, sodiumMgPerL: 1600,
  });
  assert.ok(Math.abs(salty.sodiumMgPerHour - 1600) <= 10, `1.0 L/h × 1600 mg/L ≈ 1600, got ${salty.sodiumMgPerHour}`);
  const typical = buildFuelingPlan({
    durationMin: 180, intensity: "z3", sweatRateMlH: 700, sodiumMgPerL: 500,
  });
  assert.ok(Math.abs(typical.sodiumMgPerHour - 350) <= 10);
});

test("timeline segments scale to the session and never appear on short sessions", () => {
  const short = buildFuelingPlan({ durationMin: 40, intensity: "z2" });
  assert.strictEqual(short.segments.length, 0);
  const long = buildFuelingPlan({ durationMin: 240, intensity: "z4", gutTrained: true, weightKg: 70 });
  assert.ok(long.segments.length >= 8, `4h session needs a real timeline, got ${long.segments.length}`);
  const perSeg = long.segments[0].carbsG;
  assert.ok(Math.abs(perSeg - Math.round(90 * 15 / 60)) <= 1, "90 g/h → ~23 g per 15-min segment");
  assert.strictEqual(long.segments[0].atMin, 15, "fueling starts in the first 15 min");
});

test("pre-session and caffeine are weight-personalized", () => {
  const p = buildFuelingPlan({ durationMin: 150, intensity: "z4", weightKg: 80 });
  assert.strictEqual(p.preSession.carbsG, 160, "2 g/kg");
  assert.strictEqual(p.caffeineMg, 240, "3 mg/kg");
  const none = buildFuelingPlan({ durationMin: 30, intensity: "z2", weightKg: 80 });
  assert.strictEqual(none.preSession.carbsG, 0);
  assert.strictEqual(none.caffeineMg, undefined);
});

test("gut-training progression appears only for long sessions with untrained gut", () => {
  const untrained = buildFuelingPlan({ durationMin: 180, intensity: "z4", gutTrained: false });
  assert.match(untrained.gutNote || "", /practice/i);
  const trained = buildFuelingPlan({ durationMin: 180, intensity: "z4", gutTrained: true });
  assert.strictEqual(trained.gutNote, undefined);
  const short = buildFuelingPlan({ durationMin: 90, intensity: "z4", gutTrained: false });
  assert.strictEqual(short.gutNote, undefined);
});

test("post fuel is weight-personalized with the recovery-window instruction", () => {
  const hard = postFuelPersonalized({ durationMin: 120, intensity: "z4", weightKg: 70 });
  assert.strictEqual(hard.carbsG, 84, "1.2 g/kg after long/hard");
  assert.strictEqual(hard.proteinG, 21, "0.3 g/kg");
  assert.strictEqual(hard.ratio, "4:1");
  const strength = postFuelPersonalized({ durationMin: 60, intensity: "z3", sport: "strength", weightKg: 70 });
  assert.ok(strength.proteinG >= 28, "strength: protein-forward");
  assert.strictEqual(strength.ratio, "1:1");
});

test("reference curve is monotonic non-decreasing and honors gut training", () => {
  const c = fuelCurveReference(true);
  for (let i = 1; i < c.length; i++)
    assert.ok(c[i].gPerHour >= c[i - 1].gPerHour, "curve never dips");
  assert.strictEqual(c[c.length - 1].gPerHour, 90);
  assert.strictEqual(fuelCurveReference(false)[4].gPerHour, 60);
});
