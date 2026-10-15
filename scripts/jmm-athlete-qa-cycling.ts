/** New cyclist acceptance: disposable localhost account, no remote/provider traffic. */
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Decoder, Stream } from "@garmin/fitsdk";
import { actor, api, save, scenario, finish, db, base, dayKey, observedKey, validAnswers, type Actor } from "./jmm-athlete-qa-support";

const file = ".local/athlete-qa/cycling-private.json";
let cyclist: Actor;
let sessionId = "";
const evidence: Record<string, unknown> = { synthetic: true, sport: "bike", deviceReceiptVerified: false };
const future = new Date(`${dayKey}T00:00:00Z`); future.setUTCDate(future.getUTCDate() + 56);
const raceKey = future.toISOString().slice(0, 10);
async function raw(path: string, body?: unknown, method = "GET") {
  return fetch(base + path, { method, headers: { cookie: cyclist.cookie, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(120000) });
}
async function main() {
  cyclist = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : await actor("cycling");
  // Reruns reset only this named synthetic athlete, preserving its auth session
  // for parent browser review and avoiding an extra registration/rate-limit use.
  const own = await db.user.findUniqueOrThrow({ where: { id: cyclist.id } });
  assert.match(own.email, /^athlete-qa-cycling-.*@example\.invalid$/);
  await db.$transaction([
    db.workout.deleteMany({ where: { userId: cyclist.id } }), db.trainingPlan.deleteMany({ where: { userId: cyclist.id } }),
    db.benchmarkTest.deleteMany({ where: { userId: cyclist.id } }), db.race.deleteMany({ where: { userId: cyclist.id } }),
    db.dailyCheckin.deleteMany({ where: { userId: cyclist.id } }), db.auditLog.deleteMany({ where: { subjectId: cyclist.id } }),
    db.athleteProfile.deleteMany({ where: { userId: cyclist.id } }), db.athleteProfile.create({ data: { userId: cyclist.id } }),
    db.user.update({ where: { id: cyclist.id }, data: { onboarded: false } }),
  ]);
  await scenario("New cyclist sees import-first empty state without fabricated thresholds", async () => {
    const review = await api("/api/onboard/import-review", cyclist);
    assert.equal(review.history.count, 0); assert.deepEqual(review.suggestions, []);
    evidence.importReview = review;
    assert.equal((await api("/api/profile", cyclist)).profile.ftp, null);
  });
  await scenario("Optional onboarding may finish with a safe bike starter and no invented full cycle", async () => {
    await save(cyclist, { goal: "cycle", experience: "amateur" });
    await api("/api/onboard", cyclist, {});
    const today = await api("/api/today", cyclist);
    assert.ok(today.sessions.length); assert.equal(today.sessions[0].sport, "bike");
    assert.notEqual(today.sessions[0].verdict, "ready");
    await api("/api/checkin", cyclist, validAnswers);
    const ready = await api("/api/today", cyclist);
    assert.equal(ready.sessions[0].verdict, "ready");
    assert.ok(ready.sessions[0].durationMin <= 20);
    assert.equal(await db.trainingPlan.count({ where: { userId: cyclist.id } }), 0);
    evidence.starter = { sport: ready.sessions[0].sport, durationMin: ready.sessions[0].durationMin, verdict: ready.sessions[0].verdict };
  });
  await scenario("Cyclist fills only useful manual profile and tolerated-load planning context", async () => {
    const p = await save(cyclist, { birthYear: 1988, sex: "male", heightCm: 178, weightKg: 74,
      experience: "amateur", goal: "cycle", maxHr: 188, restingHr: 49, ftp: 235, units: "metric", trainingWindow: "morning",
      setup: { adultConfirmed: true, profileConfirmed: true, goalDescription: "Complete a comfortable 80 km sportive with even pacing",
        baselineWeeklyMinutes: 300, baselineObservedAt: observedKey, interruptions: "none", restrictions: "none", qualifiedReview: "none_needed",
        trainingDays: [0, 1, 2, 3, 4, 5], maxSessionMinutes: 90, equipmentAccess: "Road bicycle, power meter, indoor trainer, safe familiar roads", planWeeks: 8,
        coachPreference: "Self-coached; contact Jasmel if needed", targetGoal: { metric: "completion", sport: "bike", targetDate: raceKey },
        travel: { startDate: null, endDate: null, destinationTimezone: null, equipmentNotes: "Trainer available when traveling", timeNotes: "Prefer early mornings", maxSessionMinutes: null } } });
    assert.equal(p.planningReadiness.ready, true); assert.equal(p.profile.weightKg, 74);
    const preview = await api("/api/plan/generate", cyclist, { distance: "cycle", weeks: 8, preview: true, easyPct: 70 });
    assert.equal(preview.preview.cycle.baselineReviews.find((x: any) => x.sport === "bike").status, "missing", "A manually typed FTP is not a dated applied test");
    evidence.reportedFtpBaseline = preview.preview.cycle.baselineReviews;
  });
  await scenario("Dated FTP and HR test results persist with explicit baseline application", async () => {
    let profile = await api("/api/profile", cyclist);
    const ftp = await api("/api/benchmarks", cyclist, { action: "record", type: "ftp", name: "Synthetic cyclist field FTP test", result: 235, date: observedKey, applyBaseline: true, expectedRevision: profile.revision });
    assert.equal(ftp.baselineApplied, true);
    profile = await api("/api/profile", cyclist);
    const lthr = await api("/api/benchmarks", cyclist, { action: "record", type: "lthr", name: "Synthetic reported cycling threshold heart rate", result: 166, date: observedKey, applyBaseline: true, expectedRevision: profile.revision });
    assert.equal(lthr.baselineApplied, true);
    profile = await api("/api/profile", cyclist);
    evidence.appliedTests = { ftp: { date: ftp.test.date, result: ftp.test.result }, lthr: { date: lthr.test.date, result: lthr.test.result }, profileProvenance: profile.provenance };
    assert.equal(profile.profile.ftp, 235); assert.equal(profile.profile.lthr, 166);
    const draft = await api("/api/plan/generate", cyclist, { distance: "cycle", weeks: 8, preview: true, easyPct: 70 });
    assert.equal(draft.preview.cycle.baselineReviews.find((x: any) => x.sport === "bike").status, "current");
  });
  await scenario("Garmin TCX file import preserves actual bike measurements and is idempotent", async () => {
    const xml = `<?xml version="1.0"?><TrainingCenterDatabase><Activities><Activity Sport="Biking"><Id>${observedKey}T07:00:00Z</Id><Lap><Track><Trackpoint><Time>${observedKey}T07:00:00Z</Time><DistanceMeters>0</DistanceMeters><HeartRateBpm><Value>125</Value></HeartRateBpm><Extensions><Watts>155</Watts></Extensions></Trackpoint><Trackpoint><Time>${observedKey}T07:45:00Z</Time><DistanceMeters>22000</DistanceMeters><HeartRateBpm><Value>145</Value></HeartRateBpm><Extensions><Watts>175</Watts></Extensions></Trackpoint></Track></Lap></Activity></Activities></TrainingCenterDatabase>`;
    async function upload() { const form = new FormData(); form.set("source", "garmin"); form.set("file", new Blob([xml], { type: "application/xml" }), "synthetic-cycling.tcx"); const r = await fetch(base + "/api/import", { method: "POST", headers: { cookie: cyclist.cookie }, body: form }); const result = await r.json(); assert.equal(r.status, 200, JSON.stringify(result)); return result; }
    await upload(); await upload();
    const imports = await db.workout.findMany({ where: { userId: cyclist.id, planned: false, completed: true, source: "garmin" } });
    assert.equal(imports.length, 1); assert.equal(imports[0].sport, "bike"); assert.equal(imports[0].durationMin, 45); assert.equal(imports[0].avgPower, 165);
    const review = await api("/api/onboard/import-review", cyclist); assert.equal(review.history.count, 1);
    evidence.importedCycling = { count: imports.length, minutes: imports[0].durationMin, avgPower: imports[0].avgPower, source: imports[0].source, noLiveConnection: true };
  });
  await scenario("Cycling event and venue stay manual and separate from unverifiable online weather", async () => {
    const saved = await api("/api/races", cyclist, { name: "Synthetic 80 km cycling sportive", distance: "cycle", date: raceKey, priority: 1,
      location: "Synthetic local road circuit", bikeElevM: 450, bikeTerrain: "rolling", targetTempC: 27, humidity: 65, goalTimeMin: 180, notes: "Athlete-reported course; no provider lookup" });
    assert.equal(saved.race.name, "Synthetic 80 km cycling sportive");
    assert.equal(saved.race.lat, null);
    const listed = await api("/api/races", cyclist); assert.equal(listed.races[0].weather, null);
    evidence.race = { name: saved.race.name, date: saved.race.date, location: saved.race.location, weather: listed.races[0].weather };
  });
  await scenario("Cycling race scenario computes explicit assumptions and labels sensitivity honestly", async () => {
    const input = { name: "Synthetic 80 km cycling strategy", eventType: "bike_road", startAt: null,
      weather: { kind: "unknown", source: "", issuedAt: null, validFrom: null, validTo: null, temperatureC: null, humidityPct: null, windMps: null },
      legs: [{ id: "bike", sport: "bike", distanceM: 80000, baseline: { sourceId: null, source: "manual", observedAt: observedKey, context: "Athlete-reported synthetic FTP", protocol: "Field test athlete report; not lab verified", sport: "bike", metric: "power_w", value: 235 },
        target: 170, targetConfirmed: true, segments: [], flatCourseConfirmed: true, timeMultiplier: 1,
        bike: { totalMassKg: 84, cdaM2: 0.35, crr: 0.005, airDensityKgM3: 1.2, drivetrainEfficiency: 0.97, grossEfficiency: null }, hrTargetBpm: null }], transitionSeconds: 0, practicedCarbsGph: null, sensitivityPercent: 5 };
    const state = await api("/api/race-scenarios", cyclist);
    const preview = await api("/api/race-scenarios/preview", cyclist, { input });
    assert.equal(preview.result.classification, "scenario"); assert.ok(preview.result.durationSeconds > 0);
    assert.equal(preview.result.sensitivity.label, "Selected time sensitivity, not a confidence interval");
    await api("/api/race-scenarios", cyclist, { input, expectedRevision: state.revision }, undefined, 201);
    const saved = await api("/api/race-scenarios", cyclist); assert.equal(saved.snapshots.length, 1);
    const forecast = await api("/api/race-forecast", cyclist); assert.equal(forecast.forecast, null);
    evidence.raceScenario = { classification: preview.result.classification, durationSeconds: preview.result.durationSeconds, sensitivity: preview.result.sensitivity, legacyForecast: null };
  });
  await scenario("Full cycle needs preview confirmation and stays within reviewed weekly and daily budgets", async () => {
    await api("/api/plan/generate", cyclist, { distance: "cycle", weeks: 8, confirmEventTradeoffs: true }, undefined, 409);
    const preview = await api("/api/plan/generate", cyclist, { distance: "cycle", weeks: 8, preview: true, easyPct: 65 });
    for (const week of preview.preview.weeksPreview) {
      assert.ok(week.totalMinutes <= 300);
      assert.equal(week.sessions.reduce((total: number, s: any) => total + s.minutes, 0), week.totalMinutes);
      for (const s of week.sessions) { assert.ok(["bike", "strength", "mobility"].includes(s.sport), "Cycling cycle may include sport-support strength/recovery"); assert.ok(s.minutes <= 90); }
    }
    await api("/api/plan/generate", cyclist, { distance: "cycle", weeks: 8, previewToken: preview.previewToken, easyPct: 65, confirmEventTradeoffs: true });
    const plan = await api("/api/plan", cyclist); assert.equal(plan.plans.length, 1); assert.equal(plan.plans[0].weeks, 8);
    evidence.cycle = { weeks: plan.plans[0].weeks, summary: plan.summary, review: preview.preview.cycle.baselineReviews };
    const today = await api("/api/today", cyclist); sessionId = today.sessions.find((x: any) => x.sport === "bike")?.id;
    assert.ok(sessionId, "Today must expose the confirmed cyclist workout");
  });
  await scenario("Daily check-in, workout card and focus readiness refer to one current saved bike session", async () => {
    await api("/api/checkin", cyclist, { ...validAnswers, availableMinutes: 75 });
    const view = await api(`/api/v1/training/today?sessionId=${sessionId}`, cyclist);
    assert.equal(view.session.sport, "bike"); assert.equal(view.session.verdict, "ready"); assert.ok(view.session.totalMinutes <= 75);
    assert.ok(view.workoutCard.session.steps.some((s: any) => s.target.type === "power"));
    await api(`/api/v1/training/sessions/${sessionId}/focus`, cyclist, { ready: true, expectedRevision: view.session.sourceRevision });
    evidence.dailySession = { id: sessionId, minutes: view.session.totalMinutes, verdict: view.session.verdict, targets: view.workoutCard.session.steps.map((s: any) => s.target) };
  });
  await scenario("FIT download decodes structured bike steps and never claims email or watch delivery", async () => {
    const view = await api(`/api/v1/training/today?sessionId=${sessionId}`, cyclist);
    const response = await raw(`/api/workout/approve?sessionId=${sessionId}&expectedRevision=${view.session.sourceRevision}`);
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(response.headers.get("x-workout-compatibility"), "device-unverified"); assert.equal(response.headers.get("x-delivered-email"), "0");
    const bytes = new Uint8Array(await response.arrayBuffer());
    const decoded = new Decoder(Stream.fromByteArray(bytes)).read(); assert.deepEqual(decoded.errors, []);
    assert.ok(decoded.messages.workoutStepMesgs);
    assert.equal(decoded.messages.workoutStepMesgs.length, view.workoutCard.session.steps.length);
    writeFileSync(".local/athlete-qa/cycling-workout.fit", bytes);
    evidence.fit = { bytes: bytes.length, steps: decoded.messages.workoutStepMesgs.length, receipt: "device-unverified" };
  });
  await scenario("Calendar export contains the active cycling plan without claiming device synchronization", async () => {
    const response = await raw("/api/training/export?format=ics"); assert.equal(response.status, 200);
    const text = await response.text(); assert.match(text, /BEGIN:VCALENDAR/); assert.match(text, /BEGIN:VEVENT/);
    evidence.calendar = { generated: true, eventCount: (text.match(/BEGIN:VEVENT/g) || []).length };
  });
  await scenario("Connectors truthfully block outbound automation and unavailable native devices", async () => {
    const connectors = await api("/api/connectors", cyclist), native = await api("/api/connectors/native", cyclist);
    for (const id of ["strava", "whoop", "oura", "garmin"]) {
      const provider = connectors.providers.find((p: any) => p.id === id); assert.ok(provider);
      assert.equal(provider.capabilities.publishesStructuredWorkouts, false); assert.equal(provider.capabilities.automaticDeviceDelivery, false);
    }
    assert.equal(native.coros.publishesStructuredWorkouts, false); assert.equal(native.coros.watchReceiptVerified, false);
    assert.equal(native.apple.automaticSync, false);
    await api("/api/workout/garmin-json", cyclist, undefined, undefined, 410);
    const push = await raw("/api/workout/intervals-push", { sessionId, expectedRevision: "synthetic-disabled" }, "POST"); assert.equal(push.status, 503);
    evidence.connectors = { providers: connectors.providers.map((p: any) => ({ id: p.id, method: p.method, configured: p.configured, capabilities: p.capabilities })), native };
  });
  await scenario("Completion explicitly records actual minutes and RPE without replacing planned duration", async () => {
    const view = await api(`/api/v1/training/today?sessionId=${sessionId}`, cyclist);
    const before = await db.workout.findUniqueOrThrow({ where: { id: sessionId } });
    await api(`/api/v1/training/sessions/${sessionId}/completion`, cyclist, { expectedRevision: view.session.sourceRevision,
      actual: { status: "completed", actualSport: "bike", durationMinutes: 43, sessionRpe: 4, comments: "Synthetic controlled ride; no symptoms, tolerated fuel" } });
    const after = await db.workout.findUniqueOrThrow({ where: { id: sessionId } });
    assert.equal(after.completed, true); assert.equal(after.actualDurationMin, 43); assert.equal(after.rpe, 4); assert.equal(after.durationMin, before.durationMin);
    evidence.completion = { planned: after.durationMin, actual: after.actualDurationMin, rpe: after.rpe, completed: after.completed };
  });
  await scenario("Invalid race create returns actionable validation instead of a server error", async () => {
    const response = await raw("/api/races", { name: "Synthetic invalid date", date: "not-a-date", distance: "cycle" }, "POST");
    const body = await response.json(); evidence.invalidRace = { status: response.status, error: body.error };
    assert.equal(response.status, 400, "Malformed date must be validation400, never server500");
  });
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  writeFileSync(".local/athlete-qa/cycling-evidence.json", JSON.stringify(evidence, null, 2)); await finish("cycling");
});
