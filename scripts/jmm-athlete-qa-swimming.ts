/** Synthetic adult swimmer acceptance: isolated loopback services only. */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { Decoder, Stream } from "@garmin/fitsdk";
import { actor, api, base, db, dayKey, observedKey, validAnswers, save, scenario, finish } from "./jmm-athlete-qa-support";

const snapshots: Record<string, unknown> = {};
let swimmer: Awaited<ReturnType<typeof actor>>;
let sessionId = "";
const futureKey = new Date(`${dayKey}T12:00:00Z`); futureKey.setUTCDate(futureKey.getUTCDate() + 42);
const raceDate = futureKey.toISOString().slice(0, 10);
async function main() {
  swimmer = await actor("swimming");
  await scenario("New swimmer: authenticated empty import review, optional devices and honest unknown data", async () => {
    const [onboard, imports, connectors, p] = await Promise.all([
      api("/api/onboard", swimmer), api("/api/onboard/import-review", swimmer),
      api("/api/connectors", swimmer), api("/api/profile", swimmer),
    ]);
    assert.equal(onboard.onboarded, false);
    assert.equal(imports.history.count, 0); assert.deepEqual(imports.observations, []);
    assert.equal(p.profile?.ftp ?? null, null); assert.equal(p.profile?.swimPaceBase ?? null, null);
    assert.ok(connectors.providers.some((p: any) => p.id === "garmin"));
    for (const p of connectors.providers) assert.notEqual(p.capabilities?.automaticDeviceDelivery, true);
    snapshots.initial = { onboard, imports, connectors, profile: p };
  });
  await scenario("Skip devices and most details: day-zero swimming exists without invented pace or automatic clearance", async () => {
    await save(swimmer, { goal: "swim-only", experience: "amateur" });
    const result = await api("/api/onboard", swimmer, {});
    assert.equal(result.next, "/today");
    const state = await api("/api/today", swimmer);
    assert.ok(state.sessions.some((s: any) => s.sport === "swim"));
    assert.ok(state.sessions.every((s: any) => s.verdict !== "ready"));
    snapshots.dayZero = state;
  });
  await scenario("Complete practical swimmer profile, safety/history, availability and 25 m pool context without weekly-hour question", async () => {
    const saved = await save(swimmer, {
      birthYear: 1990, sex: "female", heightCm: 169, weightKg: 64,
      experience: "amateur", goal: "swim-only", units: "metric", hasGpsWatch: false,
      notes: "Synthetic recreational swimmer. Freestyle, supervised 25 metre pool. No device; manual reports.",
      manualPrs: JSON.stringify([{ label: "400 m freestyle, 25 m pool", value: 400, unit: "seconds", date: observedKey }]),
      setup: { adultConfirmed: true, profileConfirmed: true, goalDescription: "Comfortable 1500 m pool race; develop sustainable freestyle technique",
        baselineWeeklyMinutes: 180, baselineObservedAt: observedKey, interruptions: "none", restrictions: "none",
        qualifiedReview: "none_needed", trainingDays: [0, 1, 2, 3, 4, 5, 6], maxSessionMinutes: 60,
        equipmentAccess: "Supervised 25 m pool; comfortable freestyle and backstroke; pull buoy; bands; no paddles", planWeeks: 8 },
    });
    assert.equal(saved.planningReadiness.ready, true);
    assert.equal(saved.profile.ftp, null); assert.equal(saved.profile.runPaceBase, null);
    snapshots.profile = saved;
  });
  await scenario("Dated swimmer CSS is explicitly recorded/applied and does not create run or bike baselines", async () => {
    const before = await api("/api/benchmarks", swimmer);
    const test = await api("/api/benchmarks", swimmer, { action: "record", type: "swim", date: observedKey,
      result: 102, applyBaseline: true, expectedRevision: before.profileRevision,
      reason: "Synthetic 400 m / 200 m freestyle field calculation, same supervised 25 m pool; 400 s and 196 s; CSS=(400−196)/2=102 sec/100m. Field reference, not measured lactate threshold." });
    assert.equal(test.baselineApplied, true);
    const profile = await api("/api/profile", swimmer);
    assert.equal(profile.profile.swimPaceBase, 102); assert.equal(profile.profile.ftp, null); assert.equal(profile.profile.runPaceBase, null);
    snapshots.benchmark = test;
  });
  await scenario("Add actual 1500 m pool race and review event-aware swim cycle before saving", async () => {
    const event = await api("/api/races", swimmer, { name: "Synthetic QA 1500 m pool freestyle", date: raceDate,
      distance: "swim-only", priority: 1, swimVenue: "pool", location: "Synthetic supervised pool", notes: "1500 m freestyle, 25 m course. No provider lookup." });
    assert.equal(event.race.swimVenue, "pool");
    const draft = await api("/api/plan/generate", swimmer, { distance: "swim-only", weeks: 8, startDate: dayKey, preview: true });
    assert.equal(await db.trainingPlan.count({ where: { userId: swimmer.id } }), 0);
    assert.equal(draft.preview.cycle.baselineReviews.find((r: any) => r.sport === "swim").status, "current");
    assert.equal(draft.preview.weeksPreview.length, 8);
    assert.ok(draft.preview.weeksPreview.every((w: any) => w.totalMinutes <= 180));
    assert.ok(draft.preview.weeksPreview.flatMap((w: any) => w.sessions).every((s: any) => ["swim", "strength", "mobility", "recovery"].includes(s.sport)));
    assert.ok(draft.preview.cycle.events.events.some((e: any) => e.id === event.race.id));
    const saved = await api("/api/plan/generate", swimmer, { distance: "swim-only", weeks: 8, startDate: dayKey,
      previewToken: draft.previewToken, ...(draft.eventTradeoffAgreementRequired ? { confirmEventTradeoffs: true } : {}) });
    assert.ok(saved.plan.id);
    const state = await api("/api/today", swimmer);
    sessionId = state.sessions.find((s: any) => s.sport === "swim")?.id || "";
    assert.ok(sessionId, "Confirmed cycle should include the first swimmer session today");
    snapshots.cycle = { event, draft, planId: saved.plan.id, today: state };
  });
  await scenario("Daily no-device check-in produces a ready swim with honest generic export limitation", async () => {
    const checkin = await api("/api/checkin", swimmer, { ...validAnswers, availableMinutes: 60 });
    const state = await api("/api/today", swimmer), session = state.sessions.find((s: any) => s.id === sessionId);
    snapshots.checkin = { checkin, state };
    assert.equal(session.verdict, "ready", session.resolutionReason);
    assert.equal(session.capability.available, false);
    assert.match(session.capability.reason, /pool|length|stroke/i);
    assert.equal(session.distanceKm, null);
    const structure = await api(`/api/workout/structure?id=${sessionId}`, swimmer);
    assert.equal(structure.sportStructure, null); assert.equal(structure.editable, true);
    snapshots.generatedSwim = { session, structure };
  });
  await scenario("Reviewed explicit pool lengths, strokes and rests save without silently approving; SDK FIT download preserves swimming", async () => {
    const original = await api(`/api/workout/structure?id=${sessionId}`, swimmer);
    const pool = { schemaVersion: 1, kind: "pool", poolLength: { value: 25, unit: "m" }, steps: [
      { kind: "lengths", name: "Warm up freestyle", phase: "warmup", zone: "z1", lengths: 8, stroke: "freestyle", estimatedSeconds: 240 },
      { kind: "rest", seconds: 30 },
      { kind: "lengths", name: "Comfortable freestyle", phase: "active", zone: "z2", lengths: 16, stroke: "freestyle", estimatedSeconds: 480 },
      { kind: "rest", seconds: 30 },
      { kind: "lengths", name: "Easy backstroke finish", phase: "cooldown", zone: "z1", lengths: 4, stroke: "backstroke", estimatedSeconds: 120 },
    ] };
    const saved = await api("/api/workout/structure", swimmer, { id: sessionId, expectedRevision: original.revision, sportStructure: pool }, "PATCH");
    assert.equal(saved.sportStructure.poolLength.value, 25);
    assert.equal((await db.workout.findUniqueOrThrow({ where: { id: sessionId } })).approved, false);
    const state = await api("/api/today", swimmer), session = state.sessions.find((s: any) => s.id === sessionId);
    assert.equal(session.verdict, "ready", session.resolutionReason); assert.equal(session.capability.available, true); assert.equal(session.capability.deviceTested, false);
    assert.equal(session.distanceKm, .7); assert.equal(session.distanceKind, "prescribed_steps");
    const response = await fetch(`${base}/api/workout/approve?sessionId=${sessionId}&expectedRevision=${session.revision}`, { headers: { cookie: swimmer.cookie } });
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(response.headers.get("x-workout-compatibility"), "device-unverified");
    const bytes = new Uint8Array(await response.arrayBuffer());
    const decoded = new Decoder(Stream.fromByteArray(bytes)).read();
    assert.deepEqual(decoded.errors, []);
    const workout = decoded.messages.workoutMesgs![0], steps = decoded.messages.workoutStepMesgs!;
    assert.equal(workout.sport, "swimming"); assert.equal(workout.poolLength, 25);
    assert.equal(steps[0].durationDistance, 200); assert.equal(steps[1].durationTime, 30);
    writeFileSync(".local/athlete-qa/swimming-workout.fit", bytes);
    snapshots.explicitPool = { saved, session, fit: { sport: workout.sport, poolLength: workout.poolLength, stepCount: steps.length, deviceReceived: false } };
  });
  await scenario("Race scenario remains available while unvalidated personalized numeric forecast stays disabled", async () => {
    const [forecast, workspace] = await Promise.all([api("/api/race-forecast?distance=swim-only", swimmer), api("/api/race-scenarios", swimmer)]);
    assert.equal(forecast.forecast, null); assert.equal(forecast.reason, "personalized_forecasts_disabled");
    assert.ok(workspace.revision); snapshots.race = { forecast, workspace };
  });
  await scenario("Swimmer records performed distance/time/effort once; saved history prevents subsequent sport-structure overwrite", async () => {
    const feedback = await api("/api/plan", swimmer, { sessionId, feedbackStatus: "completed", actualSport: "swim", actualDurationMin: 26,
      rpe: 3, actualDetails: { distanceKm: .7 }, feedbackNote: "Synthetic 700 m in supervised 25 m pool; no pain; comfortable technique." }, "PUT");
    assert.equal(feedback.workout.completed, true); assert.equal(feedback.workout.actualDurationMin, 26);
    const metadata = await api(`/api/workout/structure?id=${sessionId}`, swimmer);
    assert.equal(metadata.editable, false); assert.match(metadata.reason, /history|feedback|recorded/i);
    const checkin = await api(`/api/checkin?feedbackDate=${dayKey}`, swimmer);
    assert.equal(checkin.previousSessions.find((s: any) => s.id === sessionId).feedbackStatus, "completed");
    snapshots.results = { feedback, metadata };
  });
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  writeFileSync(".local/athlete-qa/swimming-snapshots.json", JSON.stringify(snapshots, null, 2));
  await finish("swimming");
});
