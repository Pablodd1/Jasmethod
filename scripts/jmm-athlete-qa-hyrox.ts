/** New HYROX athlete acceptance: disposable adult account on isolated loopback only. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { actor, api, base, db, dayKey, observedKey, validAnswers, save, scenario, finish } from "./jmm-athlete-qa-support";
import { addDaysKey } from "../src/lib/dates";
import { SPORT_STRUCTURE_EXAMPLES } from "../src/lib/sport-structure-examples";

const snapshots: Record<string, any> = {};
async function main() {
  const a = process.argv.includes("--reuse") ? JSON.parse(readFileSync(".local/athlete-qa/hyrox-private.json", "utf8")) : await actor("hyrox");
  if (process.argv.includes("--reuse")) {
    assert.match(a.email, /^athlete-qa-hyrox-.*@example\.invalid$/);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: a.id } })).email, a.email);
    await db.$transaction(async tx => {
      await tx.workout.deleteMany({ where: { userId: a.id } }); await tx.trainingPlan.deleteMany({ where: { userId: a.id } });
      await tx.benchmarkTest.deleteMany({ where: { userId: a.id } }); await tx.race.deleteMany({ where: { userId: a.id } });
      await tx.dailyCheckin.deleteMany({ where: { userId: a.id } }); await tx.dailyMetrics.deleteMany({ where: { userId: a.id } });
      await tx.metricObservation.deleteMany({ where: { userId: a.id } }); await tx.auditLog.deleteMany({ where: { subjectId: a.id } });
      await tx.athleteProfile.deleteMany({ where: { userId: a.id } }); await tx.user.update({ where: { id: a.id }, data: { onboarded: false } });
    });
  }
  let preview: any, sessionId = "", hyroxId = "";
  await scenario("New adult HYROX signup: empty history and optional imports; no device needed to reach today", async () => {
    const [onboard, review, connectors] = await Promise.all([api("/api/onboard", a), api("/api/onboard/import-review", a), api("/api/connectors", a)]);
    assert.equal(onboard.onboarded, false); assert.equal(review.history.count, 0);
    snapshots.initial = { onboard, review, connectors };
    await save(a, { goal: "hyrox", experience: "amateur" });
    const done = await api("/api/onboard", a, {}); assert.equal(done.next, "/today");
    const today = await api("/api/today", a);
    assert.ok(today.sessions.length); assert.ok(today.sessions.every((s: any) => s.verdict !== "ready"));
    snapshots.dayZero = today;
  });
  await scenario("Useful optional profile, running/station history, equipment and reviewed current volume save without weekly-hours question", async () => {
    const result = await save(a, { birthYear: 1990, sex: "female", heightCm: 169, weightKg: 65,
      experience: "amateur", goal: "hyrox", maxHr: 188, restingHr: 52, units: "metric",
      notes: "Synthetic Women Open athlete. Six months of familiar HYROX training; recent 5 km 27:00. Practiced wall ball 4 kg 3x12, sandbag lunges 10 kg 4x10m, carry 2x16kg 4x25m, sled push 75kg on familiar turf. Comfortable basic squat/hinge. No device; manual records.",
      setup: { adultConfirmed: true, profileConfirmed: true,
        goalDescription: "Complete a first Women Open HYROX race with repeatable transitions and controlled running",
        baselineWeeklyMinutes: 300, baselineObservedAt: observedKey, interruptions: "none", restrictions: "none", qualifiedReview: "none_needed",
        trainingDays: [0,1,2,3,4,5,6], maxSessionMinutes: 90, planWeeks: 8,
        equipmentAccess: "Familiar HYROX gym: SkiErg, rower, sled with known turf, 4 kg wall ball, 10 kg sandbag, 2x16 kg kettlebells. Safe flat running loop." } });
    assert.equal(result.planningReadiness.ready, true); snapshots.profile = result;
    const b = await api("/api/benchmarks", a);
    const benchmark = await api("/api/benchmarks", a, { action: "record", type: "run5k", result: 1620,
      date: observedKey, applyBaseline: true, expectedRevision: b.profileRevision,
      reason: "Synthetic completed 27-minute 5 km flat run; not a compromised HYROX race pace." });
    assert.equal(benchmark.baselineApplied, true); snapshots.benchmark = benchmark;
  });
  await scenario("HYROX race event persists; 8-week cycle preview is read-only and confirms explicitly", async () => {
    const event = await api("/api/races", a, { name: "Synthetic Women Open HYROX", distance: "hyrox", date: addDaysKey(dayKey, 49),
      location: "Synthetic indoor venue", priority: 1, goalTimeMin: 100,
      notes: "Women Open Singles, eight 1 km runs and eight official stations. Synthetic event only." });
    preview = await api("/api/plan/generate", a, { distance: "hyrox", weeks: 8, startDate: dayKey, preview: true });
    assert.equal(await db.trainingPlan.count({ where: { userId: a.id } }), 0);
    assert.equal(preview.preview.weeksPreview.length, 8);
    assert.ok(preview.preview.weeksPreview.every((w: any) => w.totalMinutes <= 300));
    const sports = new Set(preview.preview.weeksPreview.flatMap((w: any) => w.sessions.map((s: any) => s.sport)));
    for (const sport of ["run", "strength", "hyrox"]) assert.ok(sports.has(sport), `Missing ${sport} in HYROX cycle`);
    const saved = await api("/api/plan/generate", a, { distance: "hyrox", weeks: 8, startDate: dayKey,
      previewToken: preview.previewToken, ...(preview.eventTradeoffAgreementRequired ? { confirmEventTradeoffs: true } : {}) });
    assert.ok(saved.plan.id); snapshots.cycle = { event, preview, saved };
    const today = await api("/api/today", a); snapshots.todayBeforeCheckin = today;
    sessionId = today.sessions.find((s: any) => s.sport === "run")?.id || ""; assert.ok(sessionId);
    const futureHyrox = await db.workout.findFirst({ where: { userId: a.id, sport: "hyrox", planned: true }, orderBy: { date: "asc" } });
    assert.ok(futureHyrox); hyroxId = futureHyrox.id;
  });
  await scenario("No-device daily check-in produces usable run card and controlled manual actual report", async () => {
    const checkin = await api("/api/checkin", a, { ...validAnswers, availableMinutes: 90 });
    const today = await api("/api/today", a), session = today.sessions.find((s: any) => s.id === sessionId);
    assert.equal(session.verdict, "ready", session.resolutionReason);
    const card = await api(`/api/workout/card?id=${sessionId}`, a); assert.ok(card);
    const result = await api("/api/plan", a, { sessionId, feedbackStatus: "completed", actualSport: "run", actualDurationMin: session.durationMin,
      rpe: 3, actualDetails: { distanceKm: 4 }, feedbackNote: "Synthetic comfortable run, controlled breathing, no pain. Distance is a manual report." }, "PUT");
    assert.equal(result.workout.completed, true); snapshots.execution = { checkin, today, card, result };
  });
  await scenario("HYROX generated station day supplies individually executable sets and loads rather than only generic time", async () => {
    const metadata = await api(`/api/workout/structure?id=${hyroxId}`, a);
    const row = await db.workout.findUniqueOrThrow({ where: { id: hyroxId } });
    snapshots.generatedHyrox = { metadata, prescription: JSON.parse(row.prescription || "{}"), title: row.title };
    assert.ok(metadata.sportStructure?.kind === "hyrox", "Generated HYROX session has no explicit run/station structure; athlete must author JSON before stations, loads, reps and recoveries are executable.");
  });
  await scenario("Manual reviewed HYROX structure preserves run/station identity, reps/load/recovery and discloses device limits", async () => {
    const before = await api(`/api/workout/structure?id=${hyroxId}`, a);
    const saved = await api("/api/workout/structure", a, { id: hyroxId, expectedRevision: before.revision,
      sportStructure: SPORT_STRUCTURE_EXAMPLES.hyrox.structure }, "PATCH");
    assert.equal(saved.sportStructure.kind, "hyrox");
    assert.equal(saved.sportStructure.steps.find((s: any) => s.kind === "station").load.value, 4);
    assert.equal((await db.workout.findUniqueOrThrow({ where: { id: hyroxId } })).approved, false);
    const card = await api(`/api/workout/card?id=${hyroxId}`, a);
    snapshots.explicitHyrox = { saved, card };
    const stale = await api("/api/workout/structure", a, { id: hyroxId, expectedRevision: before.revision,
      sportStructure: SPORT_STRUCTURE_EXAMPLES.hyrox.structure }, "PATCH", 409); assert.ok(stale.error);
    const response = await fetch(`${base}/api/workout/approve?sessionId=${hyroxId}&expectedRevision=${saved.revision}`, { headers: { cookie: a.cookie } });
    assert.notEqual(response.status, 200, "Future HYROX must not export as a cleared executable workout");
    snapshots.explicitHyrox.exportStatus = response.status; snapshots.explicitHyrox.exportBody = await response.text();
  });
  await scenario("Manual 8 x 1 km plus 8 stations calculator reconciles arithmetic and missing splits honestly", async () => {
    const planned = await api("/api/hyrox/split-planner?target=100&pace=390&sex=female&pro=0", a);
    assert.equal(planned.plan.segments.length, 16);
    assert.equal(planned.plan.segments.filter((s: any) => s.kind === "run").length, 8);
    assert.equal(planned.plan.segments.at(-1).cumulativeSec, 6000);
    const actuals = planned.plan.segments.map((s: any, i: number) => i === 7 ? null : s.targetSec + 5);
    const analyzed = await api("/api/hyrox/split-planner", a, { target: 100, pace: 390, sex: "female", pro: false, actualSecs: actuals });
    assert.match(analyzed.analysis.summary, /15\/16/); assert.match(analyzed.analysis.summary, /Transitions excluded/);
    assert.ok(planned.plan.notes.some((n: string) => /not.*validated/i.test(n)));
    const invalid = await api("/api/hyrox/split-planner", a, { target: 100, pace: 390, sex: "female", pro: false, actualSecs: Array(16).fill(-1) }, undefined, 400);
    assert.ok(invalid.error); snapshots.splits = { planned, analyzed };
    const forecast = await api("/api/race-forecast?distance=hyrox", a); assert.equal(forecast.forecast, null);
  });
  await scenario("Connector options and empty sync never claim Strava workout publishing or watch delivery", async () => {
    const choices = await api("/api/connectors", a);
    for (const id of ["strava", "oura", "whoop", "garmin", "apple"]) assert.ok(choices.providers.some((p: any) => p.id === id));
    assert.equal(choices.providers.find((p: any) => p.id === "strava").capabilities.publishesStructuredWorkouts, false);
    const result = await api("/api/connectors/sync", a, {}); assert.equal(result.total, 0);
    snapshots.connectors = { choices, result };
  });
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  writeFileSync(".local/athlete-qa/hyrox-snapshots.json", JSON.stringify(snapshots, null, 2));
  await finish("hyrox");
});
