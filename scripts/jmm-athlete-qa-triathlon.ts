/** New Olympic triathlete: local signup → imported history → reviewed cycle → actuals. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { actor, api, base, db, dayKey, observedKey, validAnswers, save, scenario, finish, type Actor } from "./jmm-athlete-qa-support";
import { addDaysKey } from "../src/lib/dates";
import { generatePlan } from "../src/lib/science";
import { boundPlanWeeks } from "../src/lib/planning-bounds";
import { parsePlanningSetup } from "../src/lib/planning-setup";

async function main() {
  const a: Actor = process.argv.includes("--reuse")
    ? JSON.parse(readFileSync(".local/athlete-qa/triathlon-private.json", "utf8")) : await actor("triathlon");
  if(process.argv.includes("--reuse")) {
    assert.match(a.email,/^athlete-qa-triathlon-.*@example\.invalid$/);
    assert.equal((await db.user.findUniqueOrThrow({where:{id:a.id}})).email,a.email);
    await db.$transaction(async tx=>{
      await tx.workout.deleteMany({where:{userId:a.id}}); await tx.trainingPlan.deleteMany({where:{userId:a.id}});
      await tx.benchmarkTest.deleteMany({where:{userId:a.id}}); await tx.race.deleteMany({where:{userId:a.id}});
      await tx.dailyCheckin.deleteMany({where:{userId:a.id}}); await tx.dailyMetrics.deleteMany({where:{userId:a.id}});
      await tx.metricObservation.deleteMany({where:{userId:a.id}}); await tx.auditLog.deleteMany({where:{subjectId:a.id}});
      await tx.athleteProfile.deleteMany({where:{userId:a.id}});
      await tx.user.update({where:{id:a.id},data:{onboarded:false}});
    });
  }
  const doubleDay = { version: "optional-double-day-v1", weekday: 3,
    purpose: "Practice familiar run/swim or bike/run pairs around work without adding load",
    firstStart: "07:00", secondStart: "18:00", athleteAgreed: true,
    priorTolerance: true, foodFluidsAvailable: true, recheckBetween: true };
  const setup = { adultConfirmed: true, profileConfirmed: true,
    goalDescription: "Complete an Olympic triathlon comfortably using recent tolerated training",
    baselineWeeklyMinutes: 480, baselineObservedAt: observedKey,
    interruptions: "none", restrictions: "none", qualifiedReview: "none_needed",
    trainingDays: [0, 1, 2, 3, 4, 5, 6], maxSessionMinutes: 180,
    equipmentAccess: "Familiar road bike and trainer, safe running routes, lifeguarded 25 m pool; familiar bodyweight and dumbbell movements",
    planWeeks: 8, doubleDay };
  let preview: any, saved: any, raceId = "";

  await scenario("New registration sees honest empty import review and can skip onboarding", async () => {
    const initial = await api("/api/onboard", a);
    assert.equal(initial.onboarded, false);
    const review = await api("/api/onboard/import-review", a);
    assert.equal(review.history.count, 0); assert.equal(review.observations.length, 0);
    const done = await api("/api/onboard", a, {});
    assert.equal(done.next, "/today");
    assert.equal(await db.trainingPlan.count({ where: { userId: a.id } }), 0);
    const today = await api("/api/today", a);
    assert.ok(today.sessions.length); assert.notEqual(today.sessions[0].verdict, "ready");
  });
  await scenario("Garmin TCX import is stored once and acknowledged as history", async () => {
    const tcx = `<TrainingCenterDatabase><Activities><Activity Sport="Biking"><Id>${observedKey}T12:00:00Z</Id><Lap><Track><Trackpoint><Time>${observedKey}T12:00:00Z</Time><DistanceMeters>0</DistanceMeters><HeartRateBpm><Value>120</Value></HeartRateBpm></Trackpoint><Trackpoint><Time>${observedKey}T12:45:00Z</Time><DistanceMeters>20000</DistanceMeters><HeartRateBpm><Value>135</Value></HeartRateBpm></Trackpoint></Track></Lap></Activity></Activities></TrainingCenterDatabase>`;
    for (let repeat = 0; repeat < 2; repeat++) {
      const form = new FormData(); form.set("source", "garmin");
      form.set("file", new Blob([tcx], { type: "application/xml" }), "synthetic-triathlon.tcx");
      const response = await fetch(`${base}/api/import`, { method: "POST", headers: { cookie: a.cookie }, body: form });
      assert.equal(response.status, 200, await response.text());
    }
    const review = await api("/api/onboard/import-review", a);
    assert.equal(review.history.count, 1); assert.ok(review.history.sports.some((s: any) => s.sport === "bike"));
    assert.equal(await db.workout.count({ where: { userId: a.id, planned: false } }), 1);
  });
  await scenario("Complete reviewed Olympic profile without asking weekly hours", async () => {
    const result = await save(a, { birthYear: 1990, sex: "male", heightCm: 178, weightKg: 74,
      experience: "advanced", goal: "olympic", maxHr: 184, restingHr: 48, setup });
    assert.equal(result.planningReadiness.ready, true);
  });
  await scenario("Three sport benchmarks are explicit measured reports with derived running provenance", async () => {
    for (const [type, result] of [["ftp", 230], ["run5k", 1380], ["swim", 105], ["lthr", 165]] as const) {
      const profile = await api("/api/profile", a);
      const recorded = await api("/api/benchmarks", a, { action: "record", type,
        name: `Synthetic completed ${type} test`, result, date: observedKey,
        applyBaseline: true, expectedRevision: profile.revision });
      assert.equal(recorded.baselineApplied, true);
    }
    const profile = await api("/api/profile", a);
    assert.equal(profile.profile.ftp, 230); assert.equal(profile.profile.runPaceBase, 293);
    assert.equal(profile.profile.swimPaceBase, 105); assert.ok(profile.zones);
  });
  await scenario("Olympic race and venue save without imaginary weather or venue coordinates", async () => {
    const result = await api("/api/races", a, { name: "Synthetic Olympic triathlon",
      distance: "olympic", date: addDaysKey(dayKey, 56), location: "Synthetic Florida course",
      startTime: "07:00", swimVenue: "lake", swimCurrent: "none", bikeTerrain: "flat",
      runTerrain: "flat", goalTimeMin: 165, priority: 1, notes: "Synthetic QA event; no real registration" });
    raceId = result.race.id;
    const races = await api("/api/races", a);
    assert.equal(races.races.find((r: any) => r.id === raceId).weather, null);
    assert.equal(result.race.lat, null); assert.equal(result.race.lng, null);
  });
  await scenario("Cycle preview is read-only with three sports and exact bounded structured time", async () => {
    preview = await api("/api/plan/generate", a, { distance: "olympic", weeks: 8, startDate: dayKey, preview: true });
    assert.equal(await db.trainingPlan.count({ where: { userId: a.id } }), 0);
    const sports = new Set(preview.preview.weeksPreview.flatMap((w: any) => w.sessions.map((s: any) => s.sport)));
    for (const sport of ["swim", "bike", "run"]) assert.ok(sports.has(sport));
    for (const week of preview.preview.weeksPreview) {
      assert.ok(week.totalMinutes <= 480);
      for (const s of week.sessions) assert.equal(s.steps.reduce((sum: number, step: any) => sum + step.seconds, 0), s.minutes * 60);
    }
    writeFileSync(".local/athlete-qa/triathlon-cycle-preview.json", JSON.stringify(preview, null, 2));
  });
  await scenario("Sport purpose survives bounding: brick and strength are not silently lost", async () => {
    const raw = generatePlan({ level: "advanced", distance: "olympic", weeks: 8,
      startDate: new Date(`${dayKey}T00:00:00Z`), weeklyHours: 8, easyPct: 70 });
    const bounded = boundPlanWeeks(raw, parsePlanningSetup(setup), 8, new Date(`${dayKey}T12:00:00Z`).getUTCDay(), "advanced");
    const evidence = { raw: raw.map(w => ({ week: w.week, sports: w.sessions.map(s => s.sport) })),
      bounded: bounded.weeks.map(w => ({ week: w.week, sports: w.sessions.map(s => s.sport), note: w.doubleDayNote })) };
    writeFileSync(".local/athlete-qa/triathlon-purpose-evidence.json", JSON.stringify(evidence, null, 2));
    assert.ok(raw.some(w => w.sessions.some(s => s.sport === "brick")));
    assert.ok(preview.preview.weeksPreview.some((w: any) => w.sessions.some((s: any) => s.sport === "brick")), "Purpose lost: raw Olympic build includes bricks but API preview has none");
    assert.ok(preview.preview.weeksPreview.some((w: any) => w.sessions.some((s: any) => s.sport === "strength")), "Purpose lost: raw plan includes strength but API preview has none");
  });
  await scenario("Preferred Wednesday pair is considered before a discretionary rest placement", async () => {
    assert.ok(preview.preview.weeksPreview.some((w: any) => w.sessions.some((s: any) => s.doubleDayRole)),
      "Wednesday available, agreed and within time budget, but discretionary slot-six rest removes every preferred pair");
  });
  await scenario("Reviewed cycle confirms once and stale confirmation preserves active training", async () => {
    // The athlete explicitly moves the optional pair to today for this
    // execution scenario; default-Wednesday behavior was checked above.
    await save(a,{experience:"advanced",setup:{...setup,doubleDay:{...doubleDay,
      weekday:new Date(`${dayKey}T12:00:00Z`).getUTCDay(),secondStart:"23:00"}}});
    preview=await api("/api/plan/generate",a,{distance:"olympic",weeks:8,startDate:dayKey,preview:true});
    assert.ok(preview?.previewToken);
    saved = await api("/api/plan/generate", a, { distance: "olympic", weeks: 8, startDate: dayKey,
      previewToken: preview.previewToken, confirmDoubleDay: true, confirmEventTradeoffs: true });
    assert.equal(await db.trainingPlan.count({ where: { userId: a.id, status: "active" } }), 1);
    await api("/api/plan/generate", a, { distance: "olympic", weeks: 8, startDate: dayKey,
      previewToken: preview.previewToken, confirmDoubleDay: true, confirmEventTradeoffs: true }, undefined, 409);
    assert.equal(await db.trainingPlan.count({ where: { userId: a.id, status: "active" } }), 1);
  });
  await scenario("Check-in clears selected current swim, actual results persist, repeated results do not duplicate", async () => {
    await api("/api/checkin", a, { ...validAnswers, availableMinutes: 180 });
    const today = await api("/api/today", a);
    writeFileSync(".local/athlete-qa/triathlon-today.json", JSON.stringify(today, null, 2));
    const session = today.sessions.find((s: any) => s.sport === "swim");
    assert.ok(session, "A start-day swim must be visible after cycle confirmation");
    assert.equal(session.verdict, "ready");
    const card = await api(`/api/workout/card?id=${session.id}`, a);
    assert.ok(card);
    for (let repeat = 0; repeat < 2; repeat++) await api("/api/plan", a, { sessionId: session.id,
      feedbackStatus: "completed", completed: true, actualDurationMin: session.durationMin,
      actualSport: "swim", rpe: 3, feedbackNote: "Synthetic comfortable pool completion, no pain" }, "PUT");
    const actual = await db.workout.findUniqueOrThrow({ where: { id: session.id } });
    assert.equal(actual.completed, true); assert.equal(actual.rpe, 3); assert.equal(actual.actualSport, "swim");
    assert.equal(await db.workout.count({ where: { id: session.id } }), 1);
    const after = await api("/api/today", a);
    assert.ok(after.sessions.some((s: any) => s.id === session.id && s.completed));
    const secondary=after.sessions.find((s:any)=>s.id!==session.id);
    assert.ok(secondary,"Explicit current-day pair has an existing easy second session");
    assert.equal(secondary.verdict,"blocked","Actual report alone cannot clear session two");
    await api(`/api/workout/approve?sessionId=${secondary.id}`,a,undefined,undefined,409);
    await api("/api/checkin",a,{...validAnswers,availableMinutes:180});
    const rechecked=await api("/api/today",a);
    assert.equal(rechecked.sessions.find((s:any)=>s.id===secondary.id).verdict,"ready");
    const calendar = await api(`/api/calendar?month=${dayKey.slice(0, 7)}`, a); assert.ok(calendar);
    const plan = await api("/api/plan", a); assert.ok(plan.plans[0].days.some((d: any) => d.date.slice(0, 10) > dayKey && d.sessions.length));
  });
  await scenario("Three-leg race arithmetic previews and saves honestly; forecast remains gated", async () => {
    const baseline = (sport: string, metric: string, value: number) => ({ sourceId: null, source: "manual",
      observedAt: observedKey, context: "Synthetic recent familiar training", protocol: "Athlete-reported reference", sport, metric, value });
    const leg = (sport: string, distanceM: number, metric: string, value: number, target: number, bike: any = null) => ({ id: sport, sport, distanceM,
      baseline: baseline(sport, metric, value), target, targetConfirmed: true, segments: [], flatCourseConfirmed: true,
      timeMultiplier: 1, bike, hrTargetBpm: null });
    const input = { name: "Synthetic Olympic execution scenario", eventType: "triathlon", startAt: null,
      weather: { kind: "unknown", source: "", issuedAt: null, validFrom: null, validTo: null,
        temperatureC: null, humidityPct: null, windMps: null },
      legs: [leg("swim", 1500, "pace_sec_100m", 105, 110),
        leg("bike", 40000, "power_w", 230, 180, { totalMassKg: 83, cdaM2: .32, crr: .004, airDensityKgM3: 1.2, drivetrainEfficiency: .97, grossEfficiency: null }),
        leg("run", 10000, "pace_sec_km", 293, 315)], transitionSeconds: 240, practicedCarbsGph: null, sensitivityPercent: 5 };
    const state = await api("/api/race-scenarios", a);
    const calculated = await api("/api/race-scenarios/preview", a, { input, metadata: { raceId } });
    assert.equal(calculated.result.classification, "scenario"); assert.ok(calculated.result.durationSeconds > 0);
    const stored = await api("/api/race-scenarios", a, { input, metadata: { raceId }, expectedRevision: state.revision }, undefined, 201);
    assert.equal(stored.result.durationSeconds, calculated.result.durationSeconds);
    const forecast = await api(`/api/race-forecast?id=${raceId}`, a); assert.equal(forecast.forecast, null);
  });
  await scenario("Connector choices are truthful and empty sync never invents provider receipt", async () => {
    const choices = await api("/api/connectors", a);
    for (const id of ["strava", "oura", "whoop", "garmin", "apple"]) assert.ok(choices.providers.some((p: any) => p.id === id));
    const strava = choices.providers.find((p: any) => p.id === "strava"); assert.equal(strava.capabilities.publishesStructuredWorkouts, false);
    const garmin = choices.providers.find((p: any) => p.id === "garmin"); assert.equal(garmin.method, "upload");
    const synced = await api("/api/connectors/sync", a, {}); assert.equal(synced.total, 0); assert.match(synced.message, /No connected devices/);
  });
  await scenario("Race create rejects malformed priority and negative race durations before storage", async () => {
    await api("/api/races", a, { name: "Synthetic invalid event", distance: "olympic", date: addDaysKey(dayKey, 60),
      priority: 0, goalTimeMin: -10, resultMin: -5 }, undefined, 400);
  });
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => finish("triathlon"));
