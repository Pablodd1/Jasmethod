import { test } from "node:test";
import assert from "node:assert";
import {
  buildFuelingPlan,
  carbsPerHourFor,
  fuelCurveReference,
  postFuelPersonalized,
  caffeineAllowedFromPrefs,
} from "./fueling";

test("carb curve follows the science bands (Jeukendrup 2014)", () => {
  assert.strictEqual(carbsPerHourFor(30, "z2"), 0, "<45 min: none");
  assert.strictEqual(carbsPerHourFor(60, "z5"), 20, "45-75 min hard: small");
  assert.ok(carbsPerHourFor(120, "z2") >= 30 && carbsPerHourFor(120, "z2") <= 45, "1-2.5h easy: 30-45");
  assert.strictEqual(carbsPerHourFor(120, "z4"), 60, "1-2.5h hard: 60");
  assert.strictEqual(carbsPerHourFor(180, "z4", false), 60, ">2.5h untrained gut caps at 60");
  assert.strictEqual(carbsPerHourFor(180, "z4", true), 90, ">2.5h gut-trained: 90 (2:1)");
});

test("hydration needs dated context before calling supplied sweat measured", () => {
  const measured = buildFuelingPlan({ durationMin: 120, intensity: "z3", sweatRateMlH: 1400, sweatMeasurement: {observedAt:"2026-09-01",context:"Easy cycling in cool conditions",source:"measured"} });
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
  const p = buildFuelingPlan({ durationMin: 150, intensity: "z4", weightKg: 80, caffeineOptIn: true });
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
  assert.ok(strength.proteinG != null && strength.proteinG >= 28, "strength: protein-forward");
  assert.strictEqual(strength.ratio, "1.3:1", "ratio reflects the displayed grams, not a universal recovery rule");
});

test("reference curve is monotonic non-decreasing and honors gut training", () => {
  const c = fuelCurveReference(true);
  for (let i = 1; i < c.length; i++)
    assert.ok(c[i].gPerHour >= c[i - 1].gPerHour, "curve never dips");
  assert.strictEqual(c[c.length - 1].gPerHour, 90);
  assert.strictEqual(fuelCurveReference(false)[4].gPerHour, 60);
});


test("unknown weight never fabricates nutrition totals or caffeine",()=>{
 const pre=buildFuelingPlan({durationMin:120,intensity:"z4"});
 const post=postFuelPersonalized({durationMin:120,intensity:"z4"});
 assert.equal(pre.preSession.carbsG,null);assert.equal(pre.caffeineMg,undefined);
 assert.equal(post.carbsG,null);assert.equal(post.proteinG,null);assert.match(post.note,/weight is unknown/);
 assert.match(pre.notes,/overdrinking/);assert.match(pre.notes,/Extra sodium does not/);assert.match(pre.notes,/together, once/);
});
test("caffeine is explicit opt-in with valid weight, and opt-outs win",()=>{
 assert.equal(buildFuelingPlan({durationMin:90,intensity:"z4",weightKg:70}).caffeineMg,undefined);
 assert.equal(buildFuelingPlan({durationMin:90,intensity:"z4",caffeineOptIn:true}).caffeineMg,undefined);
 assert.equal(buildFuelingPlan({durationMin:90,intensity:"z4",weightKg:70,caffeineOptIn:true}).caffeineMg,210);
 assert.equal(caffeineAllowedFromPrefs({enabled:true}),false);
 assert.equal(caffeineAllowedFromPrefs({enabled:true,likes:'["caffeine"]',optsOut:'["caffeine"]'}),false);
 assert.equal(caffeineAllowedFromPrefs({enabled:true,likes:'{}'}),false);
 assert.equal(caffeineAllowedFromPrefs({enabled:true,likes:'["caffeine"]'}),true);
});
test("reported sweat remains unverified; heat never relabels it as a measurement",()=>{
 const p=buildFuelingPlan({durationMin:120,intensity:"z3",sweatRateMlH:700,heatFactor:1.3});
 assert.equal(p.fluidSource,"reported");assert.equal(p.fluidMlPerHour,700);assert.ok(p.measurementGaps.some(g=>/date\/conditions/.test(g)));
 assert.throws(()=>buildFuelingPlan({durationMin:60,intensity:"z2",weightKg:NaN}));
});

import { enforceSplit, generateSingleSport, generateHyroxPlan, HYROX_STATIONS, HYROX_STATION_DIVISION_LABELS, type PlanSession } from "./science";
test("easy-distribution preference cannot create intensity or extra minutes", () => {
  const easy: PlanSession[] = [{ sport: "run" as const, title: "Easy run", minutes: 40, zone: "z2", type: "endurance", description: "Easy" }];
  assert.deepStrictEqual(enforceSplit(easy, 70), easy);
  const mixed: PlanSession[] = [...easy, { sport: "run" as const, title: "Intervals", minutes: 30, zone: "z5", type: "interval", description: "6 x 1km hard" }];
  const result = enforceSplit(mixed, 80);
  assert.equal(result.reduce((n, s) => n + s.minutes, 0), 70);
  assert.equal(result[1].zone, "z2"); assert.ok(!result[1].description.includes("6 x 1km"));
  assert.equal(mixed[1].zone, "z5", "existing input plan is not mutated");
});
test("new HYROX weeks stay within the selected availability and remove mandatory depth jumps", () => {
  const weeks = generateHyroxPlan({ level: "beginner", weeks: 6, startDate: new Date("2026-10-06"), weeklyHours: 2 });
  assert.ok(weeks.every(w => w.totalMinutes <= 120));
  assert.ok(weeks.every(w => w.totalMinutes === w.sessions.reduce((n, s) => n + s.minutes, 0)));
  assert.ok(!weeks.flatMap(w => w.sessions).some(s => /is mandatory|depth jumps 3/.test(s.description)));
});
test("carbohydrate practice cannot escalate beyond demonstrated tolerance or short-session context", () => {
  const base = { durationMin: 240, intensity: "z3", gutTrained: true };
  const plan = (targetGPerHour: number, toleratedGPerHour: number, reviewedHighIntake = false, giSymptoms: "none" | "moderate" = "none") => buildFuelingPlan({ ...base, carbohydratePractice: { targetGPerHour, toleratedGPerHour, reviewedHighIntake, giSymptoms } });
  assert.equal(plan(80, 60).carbsPerHourG, 60);
  assert.equal(plan(80, 80).carbsPerHourG, 80);
  assert.equal(plan(100, 100).carbsPerHourG, 90);
  assert.equal(plan(100, 100, true).carbsPerHourG, 100);
  assert.ok(plan(100, 100, true, "moderate").carbsPerHourG <= 60);
  assert.equal(buildFuelingPlan({ ...base, durationMin: 60, carbohydratePractice: { targetGPerHour: 100, toleratedGPerHour: 100, giSymptoms: "none", reviewedHighIntake: true } }).carbsPerHourG, 15);
  assert.match(plan(100, 100, true).gutNote!, /not automatic/);
});
test("rapid carbohydrate restoration is hourly only for documented short recovery", () => {
  const normal = postFuelPersonalized({ durationMin: 150, intensity: "z4", weightKg: 70 });
  assert.ok(!normal.note.includes("PER HOUR"));
  const rapid = postFuelPersonalized({ durationMin: 150, intensity: "z4", weightKg: 70, nextSessionInHours: 3 });
  assert.match(rapid.note, /70–84 g carbohydrate PER HOUR/);
  assert.throws(() => postFuelPersonalized({ durationMin: 150, intensity: "z4", weightKg: 70, nextSessionInHours: -1 }));
});

test("HYROX reference distinguishes Women Pro from Men Pro", () => {
  assert.strictEqual(HYROX_STATION_DIVISION_LABELS.womenPro, "Women Pro");
  const push = HYROX_STATIONS.find(s => s.key === "sledpush")!;
  assert.strictEqual(push.womenPro, "152kg");
  assert.strictEqual(push.menPro, "202kg");
  const wall = HYROX_STATIONS.find(s => s.key === "wallball")!;
  assert.strictEqual(wall.targetHeightM?.womenPro, 2.7);
  assert.strictEqual(wall.targetHeightM?.men, 3);
  for (const station of HYROX_STATIONS) {
    assert.strictEqual(station.womenPro, station.men);
    assert.ok(!("pro" in station), "ambiguous division must not be exposed");
  }
});

test("single-sport base substitutes encode easy intensity consistently", () => {
  for (const sport of ["run", "bike", "swim"] as const) {
    const weeks = generateSingleSport({ sport, level: "beginner", weeks: 3, startDate: new Date("2026-10-05T00:00:00Z"), weeklyHours: 4 });
    for (const week of weeks.slice(0, 2)) {
      const easy = week.sessions.find(s => s.title === "Easy Aerobic Session");
      assert.ok(easy, sport);
      assert.strictEqual(easy.zone, "z2");
      assert.strictEqual(easy.type, "endurance");
      assert.ok(!week.sessions.some(s => s.title.startsWith("VO2max")));
    }
    assert.ok(weeks[2].sessions.some(s => s.title.startsWith("VO2max") && s.zone === "z5"));
  }
});
