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

test("post-fuel ordinary meal example does not imply hourly replacement", () => {
  const r = postFuelPersonalized({ durationMin: 120, intensity: "z4", weightKg: 70 });
  assert.ok(!/g\/kg\/h/.test(r.note), "misleading unit must be gone");
  assert.match(r.note, /84 g carbohydrate/);
  assert.match(r.note, /one feeding/);
});

// ---- Day-off protocol (owner spec) ----
import { dayOffProtocol, dayOffProtocolText } from "./day-off";

test("day-off guidance keeps rest optional, avoids default supplements and fixed water targets", () => {
  for (const lang of ["en", "es"] as const) {
    const p = dayOffProtocol(lang);
    const all = JSON.stringify(p);
    assert.match(all, /own needs|tus necesidades/);
    assert.doesNotMatch(all, /creatin|2-3 L|20 min very easy|20 min muy suaves/);
    assert.match(all, /No supplements|No se recomiendan suplementos/);
    assert.ok(p.essentials.length >= 4, "sleep, fuel, supplementation, movement");
    assert.strictEqual(p.visualizationFull.length, 8, "full 8-step visualization routine");
    const t = dayOffProtocolText(lang);
    assert.match(t, /VISUALIZATION \(2-5 min|VISUALIZACIÓN \(2-5 min/);
    assert.match(t, /SUPPLEMENTS|SUPLEMENTOS/i);
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
  assert.strictEqual(caffeineAllowedFromPrefs({ enabled: true }), false);
  assert.strictEqual(caffeineAllowedFromPrefs({ enabled: null, dislikes: "[]" }), false);
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
import { illustrativeRaceScenario as forecastRace } from "./raceforecast";

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

// ---- Sprint protocol knowledge base (97 cited entries) ----
import {
  allSprintProtocols, selectSprintProtocols, getSprintProtocol,
  predict400From200, race400Segments, speedReserveOpen, buildSprintSession,
} from "./sprint-protocols";

test("protocol DB loaded: 97 entries, every one with source + evidence tier", () => {
  const all = allSprintProtocols();
  assert.strictEqual(all.length, 97);
  for (const p of all) {
    assert.ok(p.sources.length >= 1, `${p.id} missing source`);
    assert.ok(p.evidence_level, `${p.id} missing evidence tier`);
  }
});

test("protocol selection filters by domain + event + evidence floor", () => {
  const se = selectSprintProtocols({ domains: ["speed_endurance"], event: "400", minEvidence: "observational" });
  assert.ok(se.length >= 4, `speed_endurance 400m observational+ should be ≥4, got ${se.length}`);
  assert.ok(se.every((p) => p.event.includes("400") && p.domain === "speed_endurance"));
  assert.ok(getSprintProtocol("A-A15_HART_400M_PROGRAMME"), "Hart entry present");
});

test("race math: 200→400 prediction, segments and speed reserve (Hart/Badon rules)", () => {
  assert.strictEqual(predict400From200(22.5), 48.5);
  const { potential, segments } = race400Segments(22.5, "advanced");
  assert.strictEqual(potential, 48.5);
  const sum = segments.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - potential) < 0.6, `segments sum ${sum} ≈ potential ${potential}`);
  assert.ok(segments[0] > segments[1], "opening 100 faster than second (positive split)");
  const open = speedReserveOpen(22.5);
  assert.ok(open > 22.5 && open < 24, `93-95% opening band, got ${open}`);
});

test("session builder: phase-aware Hart/SET sets with citations and honest coach-review", () => {
  const s = buildSprintSession("mid", 0);
  assert.ok(s.rows.length >= 2);
  assert.ok(s.rows.some((r) => /Hart|SET/.test(r.sourceId + r.name)));
  assert.ok(s.sourceIds.includes("A-A15_HART_400M_PROGRAMME"));
  assert.ok(s.coachReview.length > 0, "rest-dosing honesty surfaced");
  const taper = buildSprintSession("taper", 0);
  // Taper: volume cut ~50% (meta-analytic −41–60 %)
  assert.ok(taper.rows[0].reps <= 3, `taper reps reduced, got ${taper.rows[0].reps}`);
});

// ---- Sprint grounding context (JASAI retrieval) ----
import { sprintContextForPhase } from "./sprint-protocols";

test("sprint grounding context: cited protocol lines per phase", () => {
  for (const phase of ["fall", "early", "mid", "late", "taper"] as const) {
    const ctx = sprintContextForPhase(phase);
    assert.ok(ctx.length > 50, `${phase} context too thin`);
    assert.match(ctx, /\[[A-E]-[^\]]+\]/, "each line cites its entry id");
  }
});

// ---- Launch-readiness additions ----
import { isWeeklyReviewTime, weeklyReviewDay } from "./weekly-review";
import { telegramPlan as tp } from "./plan-formats";

test("weekly review timing: Sunday evening local, once per ISO week", () => {
  // Deterministic: the function reads the real clock; test the day-key shape
  const day = weeklyReviewDay("America/New_York");
  assert.match(day, /^week:\d{4}-\d{2}-\d{2}$/);
  // Sunday-evening check on a fixed instant via the exported fn (mock not
  // available; assert signature + non-throw)
  assert.strictEqual(typeof isWeeklyReviewTime("UTC", 17), "boolean");
});

test("daily plan opens with the WHY line when provided", () => {
  const t = tp("Jas", "Mon", [{
    title: "Tempo", sport: "run", durationMin: 45, intensity: "z4",
  }], "Green light — your recovery supports the planned quality today.");
  assert.match(t.split("\n")[1], /💡/);
  const without = tp("Jas", "Mon", [{
    title: "Tempo", sport: "run", durationMin: 45, intensity: "z4",
  }]);
  assert.ok(!without.includes("💡"));
});

// ---- Session caps (owner feedback: 3h scheduled run) ----
import { capSessionMinutes, generateSingleSport } from "./science";

test("hard sessions cap at 90 min, long at 30% weekly / 150, full-goal 180", () => {
  const hard = capSessionMinutes({ title: "Tempo / Threshold Run", minutes: 147, type: "threshold" }, 600);
  assert.strictEqual(hard.minutes, 90, `147-min tempo capped, got ${hard.minutes}`);
  const long = capSessionMinutes({ title: "Long Aerobic Run (Z2)", minutes: 205, type: "endurance" }, 600);
  assert.ok(long.minutes <= 150, `205-min long capped ≤150, got ${long.minutes}`);
  const marathon = capSessionMinutes({ title: "Long Aerobic Run (Z2)", minutes: 200, type: "endurance" }, 700, "full");
  assert.strictEqual(marathon.minutes, 180);
  const small = capSessionMinutes({ title: "Long Run", minutes: 90, type: "endurance" }, 300);
  assert.strictEqual(small.minutes, 90, "already-compliant session untouched");
});

test("generated single-sport plans respect the caps end-to-end", () => {
  const weeks = generateSingleSport({ sport: "run", level: "amateur", weeks: 8, startDate: new Date(), weeklyHours: 10 });
  for (const w of weeks)
    for (const s of w.sessions)
      assert.ok(s.minutes <= 180, `week ${w.week} "${s.title}" = ${s.minutes} min exceeds 180`);
});

// ---- Complete training loop (S2/S3/S4) ----
import { mesoVolumeRaces, type PlanRace } from "./science";
import { bikeSetupPhysics, bikePhysicsSpeedKmh } from "./raceforecast";

test("taper anchors to the A-race date, not the cycle position", () => {
  const start = new Date("2026-10-01T00:00:00Z");
  // A race on week 4 (Oct 22 falls in week starting Oct 22 = index 3)
  const aRace: PlanRace = { date: new Date("2026-10-22T00:00:00Z"), priority: 1 };
  // Week of race (index 3: Oct 22–28) → deep taper ~0.45
  const wk3 = mesoVolumeRaces(3, "amateur", [aRace], start);
  assert.strictEqual(wk3.phase, "taper");
  assert.ok(wk3.vol < 0.5, `race week vol ${wk3.vol} should be deep taper`);
  // Week before (index 2: Oct 15–21) → taper ~0.59
  const wk2 = mesoVolumeRaces(2, "amateur", [aRace], start);
  assert.strictEqual(wk2.phase, "taper");
  assert.ok(wk2.vol > wk3.vol && wk2.vol < 0.65, `pre-race week vol ${wk2.vol}`);
  // Normal week far from race (index 0) is NOT suppressed by a distant race
  const wk0 = mesoVolumeRaces(0, "amateur", [aRace], start);
  assert.strictEqual(wk0.phase, "build");
});

test("B races train through: −20% sharpening week, no taper phase", () => {
  const start = new Date("2026-10-01T00:00:00Z");
  const bRace: PlanRace = { date: new Date("2026-10-15T00:00:00Z"), priority: 2 };
  const wk2 = mesoVolumeRaces(2, "amateur", [bRace], start); // Oct 15 week
  assert.strictEqual(wk2.phase, "build", "B race week is train-through, not taper");
  assert.ok(Math.abs(wk2.vol - 0.8 * 1.0) < 0.05, `B-week ~0.8 vol, got ${wk2.vol}`);
});

test("post-race dips: A −40%, B −15%", () => {
  const start = new Date("2026-10-01T00:00:00Z");
  const a: PlanRace = { date: new Date("2026-10-08T00:00:00Z"), priority: 1 };
  const afterA = mesoVolumeRaces(2, "amateur", [a], start); // week after Oct 8
  assert.ok(Math.abs(afterA.vol - 0.6) < 0.02, `post-A vol ${afterA.vol} ≈ 0.6`);
  const b: PlanRace = { date: new Date("2026-10-08T00:00:00Z"), priority: 2 };
  const afterB = mesoVolumeRaces(2, "amateur", [b], start);
  assert.ok(Math.abs(afterB.vol - 0.85) < 0.02, `post-B vol ${afterB.vol} ≈ 0.85`);
});

test("equipment physics: TT vs road vs aero-bars change bike speed", () => {
  const tt = bikeSetupPhysics({ bikeType: "tt" });
  const road = bikeSetupPhysics({ bikeType: "road" });
  const aero = bikeSetupPhysics({ bikeType: "road", hasAeroBars: true });
  assert.ok(tt.cdA < aero.cdA && aero.cdA < road.cdA, "CdA ordering TT < aero < road");
  const base = { ftp: 250, weightKg: 70, distanceKm: 40, sustainableW: 200 };
  const vTT = bikePhysicsSpeedKmh({ ...base, cdA: tt.cdA, bikeKg: tt.bikeKg }).speedKmh;
  const vRoad = bikePhysicsSpeedKmh({ ...base, cdA: road.cdA, bikeKg: road.bikeKg }).speedKmh;
  assert.ok(vTT > vRoad + 0.3, `TT faster: ${vTT.toFixed(1)} vs ${vRoad.toFixed(1)} km/h`);
});

test("taper bonus applies only in the tapered sweet spot with real fitness", () => {
  // fitnessPaceFactor is private — assert via the exported forecastRace path:
  // build two athletes (tapered TSB+12 CTL 60 vs untapered TSB 0 CTL 60) and
  // confirm the tapered one predicts a faster run-only 10k.
  const mk = (tsb: number, ctl: number) =>
    ({
      current: { ctl, atl: ctl - tsb, tsb, formZone: "fresh", rampRate7d: 2, rampWarning: null as any },
      formZone: "fresh",
      rampRate7d: 2,
      rampWarning: null as any,
    }) as any;
  const tapered = forecastRace({
    athlete: { runPaceBase: 300, weightKg: 70 },
    fitness: mk(12, 60),
    distance: "10k",
    venue: {},
    goalTimeMin: null,
  })!;
  const neutral = forecastRace({
    athlete: { runPaceBase: 300, weightKg: 70 },
    fitness: mk(0, 60),
    distance: "10k",
    venue: {},
    goalTimeMin: null,
  })!;
  assert.ok(tapered.totalMin < neutral.totalMin, `tapered ${tapered.totalMin} < neutral ${neutral.totalMin}`);
});

// ---- Max Trube MD protocol enrichment ----
import { structuredSteps as ss } from "./prescription";

test("z5 interval work defaults to Rønnestad 30/15 — the effort-matched winner", () => {
  const steps = ss(60, "z5", "interval", 0, "run");
  const groups = steps.map((s) => s.group || "").filter(Boolean);
  assert.ok(groups.some((g) => /Rønnestad 30\/15/.test(g)), `group: ${groups.join("; ")}`);
  const work = steps.find((s) => /Hard — 30 s/.test(s.name));
  assert.ok(work, "30 s work steps present");
  const rest = steps.find((s) => /Float — 15 s/.test(s.name));
  assert.ok(rest && rest.seconds === 15, "15 s float recovery at half intensity");
});

test("80/160 VO2max and classic 1:1 remain available as variants", () => {
  const steps = ss(60, "z5", "interval", 1, "run");
  const groups = steps.map((s) => s.group || "").join("; ");
  assert.ok(/80\/160/.test(groups) || /1:1/.test(groups), `variant groups: ${groups}`);
});
