/** Synthetic-only adaptive-cycle acceptance. The database, application and test
 * must share a disposable loopback namespace under jmm-test-egress-guard.cjs.
 * No production data, external provider requests or athlete credentials are used.
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { hashToken } from "../src/lib/auth";
import { addDaysKey, dateKey, localDate } from "../src/lib/dates";

for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
  const value = new URL(process.env[key] || "");
  assert.equal(value.protocol, "postgresql:");
  assert.equal(value.hostname, "127.0.0.1");
  assert.equal(value.port, "55432");
  assert.equal(value.pathname, "/jmm_launch_integration_test");
  assert.equal(value.search, "");
}
assert.notEqual(process.env.VERCEL_ENV, "production");
assert.ok(process.env.NODE_OPTIONS?.includes("jmm-test-egress-guard.cjs"), "The egress guard is mandatory");
const base = "http://127.0.0.1:3220", db = new PrismaClient(), ids: string[] = [];
const now = new Date(), today = dateKey(now, "America/New_York");
const report: Array<{ name: string; status: "PASS" | "FAIL"; detail?: string }> = [];
type Actor = { id: string; cookie: string; timezone: string };
type Json = Record<string, any>;
async function actor(name: string, goal = "run-only", role = "athlete"): Promise<Actor> {
  const user = await db.user.create({ data: {
    email: `adaptive-${name}-${randomUUID()}@example.invalid`, name: `Synthetic adaptive ${name}`,
    passwordHash: bcrypt.hashSync(randomBytes(24).toString("hex"), 4), role,
    timezone: "America/New_York", language: "en", onboarded: true,
    profile: { create: { birthYear: 1990, sex: "female", heightCm: 170, weightKg: 64,
      experience: "advanced", goal, weeklyHours: 6 } },
    reminder: { create: { emailEnabled: false, telegramEnabled: false } },
  } });
  ids.push(user.id);
  const token = randomBytes(32).toString("hex");
  await db.authSession.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3600000) } });
  return { id: user.id, cookie: `jmm_session=${token}`, timezone: user.timezone };
}
async function api(path: string, who?: Actor, body?: unknown, status = 200, method?: string): Promise<Json> {
  const response = await fetch(base + path, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: { ...(who ? { cookie: who.cookie } : {}), "Content-Type": "application/json", origin: base },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(120000), redirect: "manual",
  });
  const text = await response.text();
  assert.equal(response.status, status, `${path}: ${text.slice(0, 1200)}`);
  return JSON.parse(text);
}
async function setup(who: Actor, goal = "run-only", weeks = 12) {
  const state = await api("/api/profile", who);
  const saved = await api("/api/profile", who, {
    expectedRevision: state.revision, expectedSetupRevision: state.setupRevision,
    birthYear: 1990, sex: "female", heightCm: 170, weightKg: 64,
    experience: "advanced", goal, weeklyHours: 6,
    setup: { adultConfirmed: true, profileConfirmed: true,
      goalDescription: "Build comfortable, sustainable training with honest reviews",
      baselineWeeklyMinutes: 300, baselineObservedAt: addDaysKey(today, -1),
      interruptions: "none", restrictions: "none", qualifiedReview: "none_needed",
      trainingDays: [0, 1, 2, 3, 4, 5], maxSessionMinutes: 75,
      equipmentAccess: "Familiar running route, bicycle and supervised pool", planWeeks: weeks },
  }, 200, "PUT");
  assert.equal(saved.planningReadiness.ready, true);
}
async function race(who: Actor, name: string, key: string, priority: number, distance = "10k") {
  return db.race.create({ data: { userId: who.id, name, distance, date: new Date(`${key}T00:00:00Z`), priority } });
}
async function preview(who: Actor, extra: Json = {}) {
  return api("/api/plan/generate", who, { distance: "run-only", weeks: 12, preview: true, ...extra });
}
function assertBudgets(draft: Json, ceiling = 300, daily = 75) {
  for (const week of draft.preview.weeksPreview) {
    const totals = new Map<number, number>();
    let sum = 0;
    for (const session of week.sessions) {
      assert.ok(session.minutes > 0);
      sum += session.minutes;
      totals.set(session.daySlot, (totals.get(session.daySlot) || 0) + session.minutes);
      const seconds = session.steps.reduce((total: number, step: Json) => total + step.seconds, 0);
      assert.equal(seconds, session.minutes * 60, "Structured steps fit the assigned session exactly");
    }
    assert.equal(sum, week.totalMinutes);
    assert.ok(sum <= ceiling, `Week budget exceeded: ${sum} > ${ceiling}`);
    assert.ok([...totals.values()].every(minutes => minutes <= daily));
    for (const observation of week.observations || []) {
      assert.ok(week.sessions.some((session: Json) => session.sport === observation.sport && session.minutes === observation.minutes));
    }
  }
}
async function scenario(name: string, work: () => Promise<void>) {
  try { await work(); report.push({ name, status: "PASS" }); console.log(`PASS ${name}`); }
  catch (error) { const detail = error instanceof Error ? error.stack || error.message : String(error); report.push({ name, status: "FAIL", detail }); console.error(`FAIL ${name}: ${detail}`); }
}
async function main() {
  const runner = await actor("runner"), other = await actor("other"), coach = await actor("coach", "run-only", "coach");
  await setup(runner); await setup(other);
  await scenario("Authentication and cross-athlete plan boundaries", async () => {
    await api("/api/plan/generate", undefined, { preview: true }, 401);
    await api(`/api/plan/generate?athleteId=${runner.id}`, other, { preview: true }, 403);
    await api(`/api/plan/generate?athleteId=${runner.id}`, coach, { preview: true }, 403);
  });
  await scenario("Missing baseline: budgeted comfortable observations and no automatic test battery", async () => {
    const draft = await preview(runner);
    assert.equal(draft.preview.cycle.baselineReviews.find((review: Json) => review.sport === "run").status, "missing");
    assertBudgets(draft);
    assert.ok(draft.preview.weeksPreview.some((week: Json) => week.observations.length));
    assert.equal(await db.trainingPlan.count({ where: { userId: runner.id } }), 0);
    assert.equal(await db.benchmarkTest.count({ where: { userId: runner.id } }), 0);
    const saved = await api("/api/plan/generate", runner, { distance: "run-only", weeks: 12, previewToken: draft.previewToken });
    assert.deepEqual(saved.benchmarks, []);
    assert.equal(await db.benchmarkTest.count({ where: { userId: runner.id } }), 0);
    const before = await db.benchmarkTest.count({ where: { userId: runner.id } });
    await api("/api/benchmarks", runner, { action: "schedule", startDate: today }, 422);
    assert.equal(await db.benchmarkTest.count({ where: { userId: runner.id } }), before);
  });
  const events = await actor("events"); await setup(events);
  const eventA = await race(events, "Synthetic A event", addDaysKey(today, 8), 1);
  const eventB = await race(events, "Synthetic B event", addDaysKey(today, 11), 2);
  const eventC = await race(events, "Synthetic C marathon", addDaysKey(today, 18), 3, "marathon");
  await scenario("Every A/B/C event is protected, conflicting windows need athlete agreement", async () => {
    const draft = await preview(events);
    assert.equal(draft.eventTradeoffAgreementRequired, true);
    assert.equal(draft.preview.cycle.events.events.length, 3);
    assert.ok(draft.preview.cycle.events.warnings.some((warning: Json) => warning.code === "close_events"));
    assertBudgets(draft);
    await api("/api/plan/generate", events, { distance: "run-only", weeks: 12, previewToken: draft.previewToken }, 422);
    assert.equal(await db.trainingPlan.count({ where: { userId: events.id } }), 0);
    await db.coachAssignment.create({ data: { coachId: coach.id, athleteId: events.id, status: "active", consent: "granted" } });
    const coachDraft = await api(`/api/plan/generate?athleteId=${events.id}`, coach, { distance: "run-only", weeks: 12, preview: true });
    await api(`/api/plan/generate?athleteId=${events.id}`, coach, { distance: "run-only", weeks: 12, previewToken: coachDraft.previewToken, confirmEventTradeoffs: true }, 422);
    const saved = await api("/api/plan/generate", events, { distance: "run-only", weeks: 12, previewToken: draft.previewToken, confirmEventTradeoffs: true });
    const protectedKeys = [eventA, eventB, eventC].map(row => row.date.toISOString().slice(0, 10));
    for (const session of saved.plan.sessions) assert.ok(!protectedKeys.includes(dateKey(new Date(session.date), events.timezone)));
    const stored = await db.planDay.findMany({ where: { planId: saved.plan.id }, orderBy: { date: "asc" } });
    for (const key of protectedKeys) { const eventDay = stored.find(row => dateKey(row.date, events.timezone) === key); assert.equal(eventDay?.dayOff, false); assert.equal(eventDay?.focus, "event"); }
    const audit = await db.auditLog.findFirst({ where: { subjectId: events.id, action: "plan.generate", entityId: saved.plan.id } });
    assert.equal(JSON.parse(audit!.after!).eventTradeoffAgreement.confirmedBy, events.id);
  });
  await scenario("Changed event dates invalidate a reviewed preview without archiving saved training", async () => {
    const draft = await preview(events);
    const before = await db.trainingPlan.count({ where: { userId: events.id, status: "active" } });
    const edited = await api("/api/races", events, { id: eventB.id, date: addDaysKey(today, 12), priority: 3 }, 200, "PUT");
    assert.equal(edited.race.date, `${addDaysKey(today, 12)}T00:00:00.000Z`);
    assert.equal(edited.race.priority, 3);
    await api("/api/races", other, { id: eventB.id, date: addDaysKey(today, 20), priority: 1 }, 404, "PUT");
    await api("/api/plan/generate", events, { distance: "run-only", weeks: 12, previewToken: draft.previewToken, confirmEventTradeoffs: true }, 409);
    assert.equal(await db.trainingPlan.count({ where: { userId: events.id, status: "active" } }), before);
    assert.equal(await db.trainingPlan.count({ where: { userId: events.id } }), 1);
  });
  await scenario("A recent event protects its recovery window even when it predates the cycle", async () => {
    await race(other, "Synthetic recent C marathon", addDaysKey(today, -4), 3, "marathon");
    const draft = await preview(other);
    assert.ok(draft.preview.cycle.events.warnings.some((warning: Json) => warning.code === "recent_event"));
    assert.ok(draft.preview.weeksPreview[0].cycleFactor <= .5);
    assert.ok(draft.preview.weeksPreview[0].sessions.every((session: Json) => Number(session.zone.slice(1)) <= 2));
  });
  await scenario("Sport evidence stays separate and expiry inside a long cycle lowers effort without renewing tests", async () => {
    const tri = await actor("sport-evidence", "olympic"); await setup(tri, "olympic", 16);
    const observed = new Date(now.getTime() - 75 * 86400000);
    const test = await db.benchmarkTest.create({ data: { userId: tri.id, name: "Synthetic measured cycling test", type: "ftp", date: observed, result: 200, completed: true } });
    await db.athleteProfile.update({ where: { userId: tri.id }, data: { ftp: 200 } });
    await db.auditLog.create({ data: { actorId: tri.id, subjectId: tri.id, action: "baseline.fromTest", entityId: test.id } });
    const draft = await preview(tri, { distance: "olympic", weeks: 16 });
    const reviews = draft.preview.cycle.baselineReviews;
    assert.equal(reviews.find((review: Json) => review.sport === "bike").status, "review_due");
    assert.equal(reviews.find((review: Json) => review.sport === "swim").status, "missing");
    assert.equal(reviews.find((review: Json) => review.sport === "run").status, "missing");
    const expires = reviews.find((review: Json) => review.sport === "bike").expiresAt;
    let checked = 0;
    for (const week of draft.preview.weeksPreview) for (const session of week.sessions) {
      const key = addDaysKey(today, (week.week - 1) * 7 + session.daySlot);
      if (session.sport === "bike" && key >= expires) { assert.ok(Number(session.zone.slice(1)) <= 2); checked++; }
    }
    assert.ok(checked > 0);
    assertBudgets(draft);
    assert.equal(await db.benchmarkTest.count({ where: { userId: tri.id } }), 1);
    assert.equal((await db.athleteProfile.findUnique({ where: { userId: tri.id } }))?.ftp, 200);
  });
  await scenario("Today's applied evidence is current; genuinely future evidence cannot become current at a future start", async () => {
    const evidence = await actor("evidence-clock"); await setup(evidence);
    await db.athleteProfile.update({ where: { userId: evidence.id }, data: { runPaceBase: 318 } });
    const test = await db.benchmarkTest.create({ data: { userId: evidence.id, name: "Synthetic running evidence", type: "run5k", date: new Date(now.getTime() - 1000), result: 1500, completed: true } });
    await db.auditLog.create({ data: { actorId: evidence.id, subjectId: evidence.id, action: "baseline.fromTest", entityId: test.id } });
    const draft = await preview(evidence);
    assert.equal(draft.preview.cycle.baselineReviews.find((review: Json) => review.sport === "run").status, "current");
    await db.benchmarkTest.update({ where: { id: test.id }, data: { date: new Date(now.getTime() + 86400000) } });
    const future = await preview(evidence, { startDate: addDaysKey(today, 7) });
    assert.equal(future.preview.cycle.baselineReviews.find((review: Json) => review.sport === "run").status, "missing");
  });
  await scenario("Protected event days never become optional training or assumed completed rest", async () => {
    const who = await actor("event-today"); await setup(who);
    await race(who, "Synthetic event today", today, 1);
    const draft = await preview(who);
    await api("/api/plan/generate", who, { distance: "run-only", weeks: 12, previewToken: draft.previewToken, confirmEventTradeoffs: true });
    const answers = { sleep: 4, soreness: 2, motivation: 4, energy: 4, stress: 2, sick: false, newPain: false, urgentSymptoms: false, availableMin: 60 };
    await db.dailyCheckin.create({ data: { userId: who.id, date: localDate(today, who.timezone), answers: JSON.stringify(answers), adaptation: JSON.stringify({ verdict: "full", durationFactor: 1, intensityCap: "z7", safetyStatus: "clear" }) } });
    const state = await api("/api/today", who);
    assert.equal(state.recovery.mode, "event-day"); assert.equal(state.recovery.allowMovement, false); assert.equal(state.recovery.optionalMovementMinutes, null);
    assert.deepEqual(state.sessions, []);
    assert.equal(await db.metricObservation.count({ where: { userId: who.id, metricType: "jmm_rest_day" } }), 0);
    assert.equal(await db.workout.count({ where: { userId: who.id, date: localDate(today, who.timezone) } }), 0);
  });
  await scenario("Moving an event onto an existing session blocks its current prescription and stale export", async () => {
    const who = await actor("moved-event"); await setup(who);
    const event = await race(who, "Synthetic movable event", addDaysKey(today, 10), 2);
    const workout = await db.workout.create({ data: { userId: who.id, date: localDate(today, who.timezone), sport: "run", title: "Synthetic existing easy session", type: "endurance", durationMin: 20, intensity: "z2", planned: true,
      prescription: JSON.stringify({ title: "Synthetic existing easy session", sport: "run", durationMin: 20, intensity: "z2", type: "endurance", verdict: "full", steps: [{ name: "Warm up", seconds: 300, zone: "z1", phase: "warmup", target: { type: "open" } }, { name: "Easy effort", seconds: 600, zone: "z2", phase: "active", target: { type: "open" } }, { name: "Finish easy", seconds: 300, zone: "z1", phase: "cooldown", target: { type: "open" } }] }) } });
    const answers = { sleep: 4, soreness: 2, motivation: 4, energy: 4, stress: 2, sick: false, newPain: false, urgentSymptoms: false, availableMin: 60 };
    await db.dailyCheckin.create({ data: { userId: who.id, date: localDate(today, who.timezone), answers: JSON.stringify(answers), adaptation: JSON.stringify({ verdict: "full", durationFactor: 1, intensityCap: "z7", safetyStatus: "clear" }) } });
    const before = (await api("/api/today", who)).sessions.find((session: Json) => session.id === workout.id);
    assert.equal(before.verdict, "ready");
    await db.race.update({ where: { id: event.id }, data: { date: new Date(`${today}T13:30:00Z`) } });
    const state = await api("/api/today", who), after = state.sessions.find((session: Json) => session.id === workout.id);
    assert.equal(after.verdict, "blocked"); assert.notEqual(after.revision, before.revision);
    assert.match(after.resolutionReason, /saved event/); assert.equal(state.recovery.allowMovement, false);
    await api(`/api/workout/approve?sessionId=${workout.id}&expectedRevision=${before.revision}`, who, undefined, 409);
    assert.equal((await db.workout.findUniqueOrThrow({ where: { id: workout.id } })).prescription, workout.prescription);
    assert.equal(await db.auditLog.count({ where: { subjectId: who.id, action: "workout.approved" } }), 0);
    await db.race.update({ where: { id: event.id }, data: { date: new Date(`${addDaysKey(today, 10)}T00:00:00Z`) } });
    await db.athleteProfile.update({ where: { userId: who.id }, data: { raceDate: localDate(today, who.timezone) } });
    const profileEvent = (await api("/api/today", who)).sessions.find((session: Json) => session.id === workout.id);
    assert.equal(profileEvent.verdict, "blocked"); assert.match(profileEvent.resolutionReason, /saved event/);
    await api(`/api/workout/approve?sessionId=${workout.id}&expectedRevision=${before.revision}`, who, undefined, 409);
  });
  await scenario("Concurrent confirmations save one active cycle and reject the outdated confirmation", async () => {
    const who = await actor("plan-concurrent"); await setup(who);
    const draft = await preview(who);
    const responses = await Promise.all([1, 2].map(() => fetch(base + "/api/plan/generate", { method: "POST", headers: { cookie: who.cookie, "Content-Type": "application/json", origin: base }, body: JSON.stringify({ distance: "run-only", weeks: 12, previewToken: draft.previewToken }) })));
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
    assert.equal(await db.trainingPlan.count({ where: { userId: who.id, status: "active" } }), 1);
  });
  await scenario("Session environment stays unknown without forecast evidence; indoor saves are durable and preserve safety state", async () => {
    const who = await actor("environment");
    const workout = await db.workout.create({ data: { userId: who.id, date: localDate(today, who.timezone), startTime: "18:00", sport: "run", title: "Synthetic environment session", type: "endurance", durationMin: 30, intensity: "z2", approved: true, prescription: JSON.stringify({ synthetic: true }), notes: "Synthetic safety note" } });
    const path = `/api/training/environment?sessionId=${workout.id}`;
    const initial = await api(path, who);
    assert.equal(initial.environment.status, "unknown"); assert.equal(initial.environment.reason, "missing"); assert.equal(initial.environment.conditions, null);
    await api(path, other, undefined, 404);
    await api(path, undefined, undefined, 401);
    await api(`/api/training/environment?sessionId=${workout.id}&athleteId=${who.id}`, other, undefined, 403);
    const outdoor = { setting: "outdoor", venueName: "Synthetic outdoor track", latitude: 0, longitude: 0, plannedLocal: `${today}T18:00`, timeZone: who.timezone, venueConfirmed: true, requestForecast: false };
    const saved = await api("/api/training/environment", who, { sessionId: workout.id, expectedRevision: null, environment: outdoor });
    assert.equal(saved.environment.status, "unknown"); assert.equal(saved.environment.reason, "not_requested"); assert.equal(saved.environment.conditions, null);
    assert.ok(saved.environment.revision);
    const reloaded = await api(path, who);
    assert.equal(reloaded.environment.revision, saved.environment.revision);
    assert.equal(reloaded.environment.context.venueName, outdoor.venueName);
    await api("/api/training/environment", who, { sessionId: workout.id, expectedRevision: null, environment: outdoor }, 409);
    const indoor = { ...outdoor, setting: "indoor", venueName: "Synthetic indoor treadmill", latitude: null, longitude: null };
    const inside = await api("/api/training/environment", who, { sessionId: workout.id, expectedRevision: saved.environment.revision, environment: indoor });
    assert.equal(inside.environment.status, "indoor"); assert.equal(inside.environment.conditions, null); assert.equal(inside.environment.fetchedAt, null);
    assert.equal((await api(path, who)).environment.status, "indoor");
    const after = await db.workout.findUniqueOrThrow({ where: { id: workout.id } });
    assert.equal(after.approved, false); assert.equal(after.indoor, true);
    assert.equal(after.durationMin, workout.durationMin); assert.equal(after.intensity, workout.intensity);
    assert.equal(after.prescription, workout.prescription); assert.equal(after.notes, workout.notes);
    assert.equal(await db.dailyCheckin.count({ where: { userId: who.id } }), 0);
    assert.equal((await db.athleteProfile.findUniqueOrThrow({ where: { userId: who.id } })).ftp, null);
    await db.workout.update({ where: { id: workout.id }, data: { startTime: "19:00" } });
    const changed = await api(path, who); assert.equal(changed.environment.status, "unknown"); assert.equal(changed.environment.reason, "schedule_changed");
  });
  await scenario("Environment writes reject foreign, future, executed, malformed and unconfirmed-forecast requests", async () => {
    const who = await actor("environment-boundaries");
    const data = { userId: who.id, date: localDate(today, who.timezone), sport: "bike", title: "Synthetic boundary session", type: "endurance", durationMin: 20 };
    const workout = await db.workout.create({ data });
    const future = await db.workout.create({ data: { ...data, date: localDate(addDaysKey(today, 1), who.timezone) } });
    const executed = await db.workout.create({ data: { ...data, completed: true, actualDurationMin: 20 } });
    const environment = { setting: "unknown", venueName: null, latitude: null, longitude: null, plannedLocal: null, timeZone: null, venueConfirmed: false, requestForecast: false };
    await api("/api/training/environment", other, { sessionId: workout.id, expectedRevision: null, environment }, 404);
    await api("/api/training/environment", who, { sessionId: future.id, expectedRevision: null, environment }, 409);
    await api("/api/training/environment", who, { sessionId: executed.id, expectedRevision: null, environment }, 409);
    await api("/api/training/environment", who, { sessionId: workout.id, expectedRevision: null, environment: { ...environment, requestForecast: true } }, 400);
    await api("/api/training/environment", who, { sessionId: workout.id, expectedRevision: null, environment: { ...environment, forecast: { temperatureC: 20 } } }, 400);
    await api("/api/training/environment", who, { sessionId: workout.id, expectedRevision: null, environment: { ...environment, venueName: "x".repeat(5000) } }, 413);
    const malformed = await fetch(base + "/api/training/environment", { method: "POST", headers: { cookie: who.cookie, "Content-Type": "application/json", origin: base }, body: "{bad" });
    assert.equal(malformed.status, 400); assert.match(malformed.headers.get("cache-control") || "", /no-store/);
    const crossSite = await fetch(base + "/api/training/environment", { method: "POST", headers: { cookie: who.cookie, "Content-Type": "application/json", origin: "https://untrusted.example.invalid" }, body: JSON.stringify({ sessionId: workout.id, expectedRevision: null, environment }) });
    assert.equal(crossSite.status, 403);
    assert.equal(await db.auditLog.count({ where: { subjectId: who.id, action: "workout.environment" } }), 0);
  });
  await scenario("Concurrent venue saves resolve to one durable result and one conflict", async () => {
    const who = await actor("environment-concurrent");
    const workout = await db.workout.create({ data: { userId: who.id, date: localDate(today, who.timezone), sport: "run", title: "Synthetic concurrent session", type: "endurance", durationMin: 20 } });
    const environment = { setting: "unknown", venueName: null, latitude: null, longitude: null, plannedLocal: null, timeZone: null, venueConfirmed: false, requestForecast: false };
    const responses = await Promise.all([1, 2].map(() => fetch(base + "/api/training/environment", { method: "POST", headers: { cookie: who.cookie, "Content-Type": "application/json", origin: base }, body: JSON.stringify({ sessionId: workout.id, expectedRevision: null, environment }) })));
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
    assert.equal(await db.auditLog.count({ where: { subjectId: who.id, action: "workout.environment" } }), 1);
  });
  await scenario("DST-spanning plans retain every athlete-local calendar day and protect the entered event date", async () => {
    const who = await actor("dst"); await setup(who);
    const year = now.getUTCFullYear();
    let transition: string | null = null;
    for (let offset = 0; offset <= 2 && !transition; offset++) {
      for (const month of [3, 11]) {
        const first = new Date(Date.UTC(year + offset, month - 1, 1, 12));
        const sunday = 1 + (7 - first.getUTCDay()) % 7 + (month === 3 ? 7 : 0);
        const key = `${year + offset}-${String(month).padStart(2, "0")}-${String(sunday).padStart(2, "0")}`;
        if (addDaysKey(key, -7) >= today) { transition = key; break; }
      }
    }
    assert.ok(transition);
    const startDate = addDaysKey(transition!, -7);
    await race(who, "Synthetic daylight-saving event", transition!, 2);
    const draft = await preview(who, { startDate });
    const saved = await api("/api/plan/generate", who, { distance: "run-only", weeks: 12, startDate, previewToken: draft.previewToken, confirmEventTradeoffs: true });
    const days = await db.planDay.findMany({ where: { planId: saved.plan.id }, orderBy: { date: "asc" } });
    assert.equal(days.length, 84);
    assert.equal(new Set(days.map(row => dateKey(row.date, who.timezone))).size, 84);
    for (const [index, row] of days.entries()) {
      assert.equal(dateKey(row.date, who.timezone), addDaysKey(startDate, index));
      assert.equal(row.date.getTime(), localDate(addDaysKey(startDate, index), who.timezone).getTime());
    }
    assert.ok(days.some((row, index) => index > 0 && row.date.getTime() - days[index - 1].date.getTime() !== 86400000));
    assert.equal(days.find(row => dateKey(row.date, who.timezone) === transition)?.dayOff, false);
    assert.equal(days.find(row => dateKey(row.date, who.timezone) === transition)?.focus, "event");
    const month = transition!.slice(0, 7), firstKey = `${month}-01`;
    const nextMonth = new Date(`${month}-15T12:00:00Z`); nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    const nextKey = `${nextMonth.toISOString().slice(0, 7)}-01`, lastKey = addDaysKey(nextKey, -1);
    const firstRace = await race(who, "Synthetic first-of-month event", firstKey, 3);
    const lastRace = await race(who, "Synthetic last-of-month event", lastKey, 3);
    const excluded = await race(who, "Synthetic next-month event", nextKey, 3);
    const foreign = await race(other, "Synthetic foreign month event", firstKey, 3);
    const calendar = await api(`/api/calendar?month=${month}`, who);
    for (const [id, key] of [[firstRace.id, firstKey], [lastRace.id, lastKey]] as const) {
      const shown = calendar.races.find((event: Json) => event.id === id);
      assert.ok(shown, `Calendar excludes entered boundary day ${key}`);
      assert.equal(shown.dateKey, key); assert.equal(dateKey(new Date(shown.date), who.timezone), key);
      assert.equal((await db.race.findUniqueOrThrow({ where: { id } })).date.toISOString(), `${key}T00:00:00.000Z`);
    }
    assert.ok(calendar.races.some((event: Json) => event.dateKey === transition));
    assert.ok(!calendar.races.some((event: Json) => event.id === excluded.id || event.id === foreign.id));
  });
}
main().catch(error => { report.push({ name: "Fixture setup", status: "FAIL", detail: String(error) }); console.error(error); })
  .finally(async () => {
    try { await db.user.deleteMany({ where: { id: { in: ids } } }); }
    finally { await db.$disconnect(); }
    mkdirSync(".local/jmm-adaptive-cycle-integration", { recursive: true });
    const failed = report.filter(row => row.status === "FAIL");
    let buildId: string | null = null; try { buildId = readFileSync(".next/BUILD_ID", "utf8").trim(); } catch { /* Development server has no production build identifier. */ }
    writeFileSync(".local/jmm-adaptive-cycle-integration/report.json", JSON.stringify({ status: failed.length ? "failed" : "passed", generatedAt: new Date().toISOString(), buildId, syntheticOnly: true, checks: report }, null, 2));
    console.log(`${report.length - failed.length}/${report.length} adaptive-cycle acceptance scenarios passed`);
    if (failed.length) process.exitCode = 1;
  });
