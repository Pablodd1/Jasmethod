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

// ---- Sprint: snapshots, GPX, 1:1 matching, shadow ----
import { parseGpxCourse } from "./gpx";
import { executionScore } from "./fitness";

test("gpx: parses track points into km + ascent; rejects junk", () => {
  const gpx = `<?xml version="1.0"?><gpx><trk><trkseg>
    <trkpt lat="25.7617" lon="-80.1918"><ele>2</ele></trkpt>
    <trkpt lat="25.7627" lon="-80.1928"><ele>5</ele></trkpt>
    <trkpt lat="25.7637" lon="-80.1938"><ele>3</ele></trkpt>
    <trkpt lat="25.7647" lon="-80.1948"><ele>10</ele></trkpt>
  </trkseg></trk></gpx>`;
  const c = parseGpxCourse(gpx);
  assert.ok(c);
  assert.ok(c.km > 0.05 && c.km < 1, `short course km sane, got ${c?.km}`);
  assert.strictEqual(c.elevM, 10, "ascent: 2→5 (+3), 5→3 (0), 3→10 (+7) = 10 m");
  assert.strictEqual(parseGpxCourse("<gpx></gpx>"), null);
  assert.strictEqual(parseGpxCourse("not xml at all"), null);
});

test("executionScore: one activity cannot satisfy multiple planned sessions", () => {
  const d = (offset: number) => new Date(Date.now() + offset * 86400000);
  const planned = [
    { date: d(0), sport: "run", durationMin: 30 },
    { date: d(0), sport: "run", durationMin: 30 },
    { date: d(0), sport: "run", durationMin: 30 },
  ];
  const completed = [{ date: d(0), sport: "run", durationMin: 30 }];
  const r = executionScore(planned, completed)!;
  // Review repro: old code scored 100 — one activity matched all three.
  assert.strictEqual(r.completionPct, 33, `one activity matches one session, got ${r.completionPct}%`);
  assert.ok(r.score < 60);
});

// ---- Measured course (GPX) applied in the forecast engine ----
import { forecastRace } from "./raceforecast";

test("forecast applies the measured GPX course to run distance and ascent", () => {
  const base = forecastRace({
    athlete: { runPaceBase: 300, weightKg: 70 },
    fitness: null,
    distance: "10k",
    venue: { courseKm: 11.2, courseElevM: 150 },
    goalTimeMin: null,
  })!;
  // Measured 11.2 km + 150 m ascent must be SLOWER than the flat 10k label forecast.
  const flat = forecastRace({
    athlete: { runPaceBase: 300, weightKg: 70 },
    fitness: null,
    distance: "10k",
    venue: {},
    goalTimeMin: null,
  })!;
  assert.ok(base.totalMin > flat.totalMin, `measured course (${base.totalMin} min) must be slower than flat label 10k (${flat.totalMin} min)`);
  assert.match(base.segments[0].distanceLabel, /measured/);
});

// ---- Telemetry & cost estimation ----
import { estimateMonthlyCostUsd, COST_TABLE } from "./telemetry";

test("cost estimation: pure token math from the editable price table", () => {
  const c = estimateMonthlyCostUsd({
    ai_calls: 100, ai_input_tokens: 1_000_000, ai_output_tokens: 0,
    db_rows_synced: 0, fit_exports: 0, telegram_msgs: 0, email_sends: 0, gpx_uploads: 0,
  });
  assert.strictEqual(c, COST_TABLE.ai_input_per_1m_tokens);
  const mixed = estimateMonthlyCostUsd({
    ai_calls: 0, ai_input_tokens: 0, ai_output_tokens: 2_000_000,
    db_rows_synced: 0, fit_exports: 0, telegram_msgs: 0, email_sends: 10, gpx_uploads: 0,
  });
  assert.strictEqual(mixed, +(2 * COST_TABLE.ai_output_per_1m_tokens + 10 * COST_TABLE.email_per_send).toFixed(4));
  assert.strictEqual(estimateMonthlyCostUsd({
    ai_calls: 0, ai_input_tokens: 0, ai_output_tokens: 0, db_rows_synced: 0,
    fit_exports: 0, telegram_msgs: 5000, email_sends: 0, gpx_uploads: 0,
  }), 0, "telegram is free");
});
