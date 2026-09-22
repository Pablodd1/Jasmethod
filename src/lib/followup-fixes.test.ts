import { test } from "node:test";
import assert from "node:assert";
import { parseTrainingCommand, applyTrainingCommand } from "./training-commands";
import { structuredSteps } from "./prescription";
import { prescribeToday } from "./adaptive";
import { postFuelPersonalized } from "./fueling";

// ---- Follow-up review: negation handling ----

test("parser: 'I do not need a rest day' never triggers an edit", () => {
  for (const q of [
    "I do not need a rest day",
    "no rest day for me today",
    "I don't want to skip the workout",
  ]) {
    assert.strictEqual(parseTrainingCommand(q).command, "NO_CHANGE", `"${q}"`);
  }
});

// ---- Follow-up review: sport builders respect the zone cap and time ----

test("boxing steps follow the capped zone and never overrun the session", () => {
  const easy = structuredSteps(10, "z2", "skill", 0, "boxing");
  const total = easy.reduce((a, s) => a + s.seconds, 0);
  assert.ok(total <= 10 * 60 + 30, `10-min session built ${total}s of steps`);
  assert.ok(
    easy.every((s) => Number(s.zone.slice(1)) <= 2 || s.phase !== "active"),
    "no active step above the z2 cap",
  );
  const hard = structuredSteps(60, "z5", "skill", 0, "boxing");
  assert.ok(hard.some((s) => s.zone === "z5"), "hard day keeps real rounds");
  const totalHard = hard.reduce((a, s) => a + s.seconds, 0);
  assert.ok(totalHard <= 60 * 60 + 30, `60-min session built ${totalHard}s`);
});

test("hyrox blocks follow the capped zone", () => {
  const easy = structuredSteps(40, "z2", "interval", 0, "hyrox");
  assert.ok(
    easy.every((s) => Number(s.zone.slice(1)) <= 2),
    "no z4 blocks in a z2-capped hyrox session",
  );
});

test("strength skips plyometrics when the session is capped below z3", () => {
  const easy = structuredSteps(50, "z2", "strength", 0, "strength");
  assert.ok(easy.every((s) => !/Plyometrics/i.test(s.name)), "no plyo on an easy day");
  const hard = structuredSteps(50, "z4", "strength", 0, "strength");
  assert.ok(hard.some((s) => /Plyometrics/i.test(s.name)), "plyo kept on a normal day");
});

// ---- Follow-up review: time budget enforced last ----

test("coach 120% cannot push a 30-minute budget to 38 minutes", () => {
  const p = prescribeToday({
    session: { sport: "run", title: "Easy run", type: "endurance", intensity: "z2", durationMin: 45 },
    adaptation: { verdict: "full", durationFactor: 1, intensityCap: "z7" },
    profile: { intensityPct: 120 },
    timeBudgetMin: 30,
  });
  assert.ok(p.durationMin <= 30, `budget exceeded: ${p.durationMin}`);
});

// ---- Follow-up review: fueling unit label ----

test("post-fuel note states TOTAL grams, not g/kg/h", () => {
  const r = postFuelPersonalized({ durationMin: 120, intensity: "z4", weightKg: 70 });
  assert.ok(!/g\/kg\/h/.test(r.note), "misleading unit must be gone");
  assert.match(r.note, /84 g carbs TOTAL/);
});

// ---- Day-off protocol (owner spec) ----
import { dayOffProtocol, dayOffProtocolText } from "./day-off";

test("day-off protocol carries sleep, fuel, supplementation and visualization in both languages", () => {
  for (const lang of ["en", "es"] as const) {
    const p = dayOffProtocol(lang);
    const all = JSON.stringify(p);
    assert.match(all, /8 hours|8 horas/);
    assert.match(all, /creatin/i);
    assert.ok(p.essentials.length >= 4, "sleep, fuel, supplementation, movement");
    assert.strictEqual(p.visualizationFull.length, 8, "full 8-step visualization routine");
    const t = dayOffProtocolText(lang);
    assert.match(t, /VISUALIZATION \(2-5 min|VISUALIZACIÓN \(2-5 min/);
    assert.match(t, /Supplement|SUPLEMENTACIÓN/i);
  }
});

// ---- TrainingPeaks-style structures + summary metrics ----
import { estimateDistanceKm, estimateIf, zoneTargets } from "./prescription";

test("interval sets follow research patterns and fit the session budget", () => {
  // VO2max: z5 interval → 1:1 work:float repeats (Seiler)
  const vo2 = structuredSteps60();
  function structuredSteps60() {
    // local import indirection to keep the file tidy
    const { structuredSteps } = require("./prescription");
    return structuredSteps(60, "z5", "interval", 0, "run");
  }
  const total = vo2.reduce((a: number, s: any) => a + s.seconds, 0);
  assert.ok(total <= 60 * 60 + 60, `60-min session built ${total}s`);
  const groups = new Set(vo2.map((s: any) => s.group).filter(Boolean));
  assert.strictEqual(groups.size, 1, "one repeat group per set");
  // threshold z4 → cruise intervals
  const thr = structuredSteps60z4();
  function structuredSteps60z4() {
    const { structuredSteps } = require("./prescription");
    return structuredSteps(70, "z4", "threshold", 0, "bike");
  }
  assert.ok(JSON.stringify(thr).match(/Threshold|cruise/i));
});

test("pace targets respect the athlete's unit system", () => {
  const metric = zoneTargets("z4", "run", { lthr: 160, runPaceBase: 300, units: "metric" });
  assert.match(metric.pace!, /\/km$/);
  const imperial = zoneTargets("z4", "run", { lthr: 160, runPaceBase: 300, units: "imperial" });
  assert.match(imperial.pace!, /\/mi$/);
  // 300 s/km (z4 factor 1.0) × 1.609 = 483 s/mi = 8:03/mi
  assert.strictEqual(imperial.pace, "~8:03/mi");
});

test("distance estimates: run from pace, bike from zone speed", () => {
  const run = estimateDistanceKm("run", "z2", 60, { runPaceBase: 400 });
  assert.ok(run && run > 7 && run < 8, `60 min z2 at 8:00/km ≈ 7.5 km, got ${run}`);
  const bike = estimateDistanceKm("bike", "z2", 60, {});
  assert.ok(bike && bike > 25 && bike < 30, `60 min z2 bike ≈ 27 km, got ${bike}`);
});

test("IF is TSS normalized per hour", () => {
  assert.strictEqual(estimateIf("z4", 87, 60), 0.87); // 87 TSS over exactly 1 h
  assert.strictEqual(estimateIf("z2", 0, 30), undefined);
});

// ---- Review-round-3 fixes ----
import { caffeineAllowedFromPrefs } from "./fueling";

test("caffeine opt-out propagates: master off, dislike and opt-out all suppress", () => {
  assert.strictEqual(caffeineAllowedFromPrefs({ enabled: false }), false);
  assert.strictEqual(
    caffeineAllowedFromPrefs({ enabled: true, dislikes: '["caffeine"]' }),
    false,
  );
  assert.strictEqual(
    caffeineAllowedFromPrefs({ enabled: true, optsOut: '["caffeine"]' }),
    false,
  );
  assert.strictEqual(caffeineAllowedFromPrefs({ enabled: true, likes: '["caffeine"]' }), true);
  assert.strictEqual(caffeineAllowedFromPrefs({ enabled: true }), true);
  assert.strictEqual(caffeineAllowedFromPrefs({ enabled: null, dislikes: "[]" }), true);
});

test("graphic signing secret fails closed in production", async () => {
  const { graphicSigningSecret } = await import("./workout-graphic");
  assert.throws(
    () => graphicSigningSecret({ NODE_ENV: "production" }),
    /CRON_SECRET is required/,
  );
  // A defined secret works in production (deterministic per env).
  assert.strictEqual(
    graphicSigningSecret({ NODE_ENV: "production", CRON_SECRET: "abc" }),
    graphicSigningSecret({ NODE_ENV: "production", CRON_SECRET: "abc" }),
  );
  // Non-production dev fallback remains for local testing only.
  assert.strictEqual(graphicSigningSecret({ NODE_ENV: "test" }), "jmm-graphic-dev-secret");
});
