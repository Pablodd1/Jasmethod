// Isolated PostgreSQL + real HTTP acceptance. No provider traffic or production databases.
import { hashToken as hashSessionToken } from "../src/lib/auth";
/**
 * Device-free launch acceptance against an isolated, real local PostgreSQL app.
 * Never point this at a deployed app or an athlete database.
 *
 * DATABASE_URL and DIRECT_URL must use 127.0.0.1:55432/jmm_launch_integration_test.
 * Start the app with the same URLs, no provider credentials, and Intervals disabled.
 * Preload scripts/jmm-test-egress-guard.cjs; set JMM_EGRESS_LOG in both processes.
 * JMM_INTEGRATION_BASE defaults to http://127.0.0.1:3220.
 * JMM_KEEP_BROWSER_FIXTURE=1 preserves only the named synthetic browser athlete.
 * Its generated login is written with mode 0600 under ignored .local/; never commit it.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { PrismaClient, type User } from "@prisma/client";
import bcrypt from "bcryptjs";
import { Encoder, Profile, Decoder, Stream } from "@garmin/fitsdk";
import { dayBounds, addDaysKey, localDate } from "../src/lib/dates";
import { isDailyTraining } from "../src/components/daily-training/training-contract";

function requireLocalDatabase(value: string | undefined) {
  const url = new URL(value || "");
  assert.equal(url.protocol, "postgresql:");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55432");
  assert.equal(url.pathname, "/jmm_launch_integration_test");
  assert.equal(url.search, "", "No database query overrides are permitted");
}
requireLocalDatabase(process.env.DATABASE_URL);
requireLocalDatabase(process.env.DIRECT_URL);
assert.notEqual(process.env.VERCEL_ENV, "production");
const base = new URL(process.env.JMM_INTEGRATION_BASE || "http://127.0.0.1:3220");
assert.equal(base.origin, "http://127.0.0.1:3220");
assert.equal(base.pathname, "/");

const db = new PrismaClient();
const createdIds: string[] = [];
const results: Array<{ name: string; status: "PASS" | "FAIL"; detail?: string }> = [];
const decodedArtifacts: Array<Record<string, unknown>> = [];
const artifactDir = ".local/jmm-release-audit";
mkdirSync(artifactDir, { recursive: true });
// An interrupted/failed rerun must not present last run's files as new evidence.
rmSync(`${artifactDir}/report.json`, { force: true });
const day = dayBounds("UTC").start;
const validAnswers = { sleep: 4, soreness: 2, motivation: 4, energy: 4, stress: 2, sick: false, newPain: false, urgentSymptoms: false, availableMinutes: 120 };
type Actor = User & { cookie: string; password: string };

async function actor(name: string, role = "athlete", anchors = true, setupComplete = true): Promise<Actor> {
  const password = randomBytes(24).toString("base64url");
  const user = await db.user.create({ data: {
    email: `launch-${name}-${randomUUID()}@example.invalid`, name: `Synthetic launch ${name}`,
    passwordHash: bcrypt.hashSync(password, 10), role, timezone: "UTC", language: "en", onboarded: true,
    profile: { create: { birthYear: 1990, goal: "run-only", experience: "amateur", weeklyHours: 3,
      ...(anchors ? { ftp: 200, lthr: 165, runPaceBase: 300 } : {}),
      notes: "Synthetic adult fixture. Runs 3 times weekly for 30 minutes; no current restrictions. Test data only." } },
    reminder: { create: { emailEnabled: false, telegramEnabled: false } },
  } });
  createdIds.push(user.id);
  const token = randomBytes(32).toString("hex");
  await db.authSession.create({ data: { userId: user.id, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 2 * 3600000) } });
  const result = { ...user, cookie: `jmm_session=${token}`, password };
  if (setupComplete) await configureSetup(result);
  if (anchors) {
    for (const [type, value] of [["ftp", 200], ["lthr", 165], ["run5k", 1415]] as const) {
      const profile = await json("/api/profile", result);
      await json("/api/benchmarks", result, { body: { action: "record", type, result: value, date: day.toISOString().slice(0, 10), applyBaseline: true, expectedRevision: profile.revision, reason: "Synthetic dated test evidence, not a real athlete measurement" } });
    }
  }
  return result;
}

async function configureSetup(a: Actor) {
  const profile = await json("/api/profile", a);
  await json("/api/profile", a, { method: "PUT", body: { expectedRevision: profile.revision, expectedSetupRevision: profile.setupRevision ?? null,
    goal: "run-only", experience: "amateur", weeklyHours: 3, birthYear: 1990,
    setup: { adultConfirmed: true, profileConfirmed: true, goalDescription: "Run comfortably for general fitness", baselineWeeklyMinutes: 120,
      baselineObservedAt: day.toISOString().slice(0, 10), interruptions: "none", restrictions: "none", qualifiedReview: "none_needed",
      trainingDays: [day.getUTCDay(), (day.getUTCDay() + 2) % 7, (day.getUTCDay() + 4) % 7], maxSessionMinutes: 60, equipmentAccess: "Shoes and outdoor path; access to stationary bike", planWeeks: 4 } } });
}

function prescription(sport = "run", durationMin = 20) {
  return { title: sport === "bike" ? "Afternoon bike reference" : "Morning run reference", sport, durationMin, intensity: "z2", type: "endurance", verdict: "full",
    steps: [
      { name: "Prepare gently", seconds: 300, zone: "z1", phase: "warmup", target: { type: "open" }, note: "Easy conversation; stop for symptoms." },
      { name: "Steady controlled work", seconds: durationMin * 60 - 600, zone: "z2", phase: "active" },
      { name: "Ease to finish", seconds: 300, zone: "z1", phase: "cooldown", target: { type: "open" } },
    ] };
}

async function fixture(a: Actor) {
  const plan = await db.trainingPlan.create({ data: { userId: a.id, name: "Synthetic adult device-free plan", distance: "run-only", level: "amateur", weeks: 2, startDate: day } });
  const today = await db.planDay.create({ data: { planId: plan.id, date: day, week: 1, dayOfWeek: day.getUTCDay(), focus: "run" } });
  const tomorrowDate = new Date(day.getTime() + 86400000);
  const tomorrow = await db.planDay.create({ data: { planId: plan.id, date: tomorrowDate, week: 1, dayOfWeek: tomorrowDate.getUTCDay(), focus: "run" } });
  async function workout(sport: string, durationMin: number, startTime: string) {
    const p = prescription(sport, durationMin);
    return db.workout.create({ data: { userId: a.id, planDayId: today.id, date: day, startTime, sport, title: p.title, type: "endurance", durationMin, intensity: "z2", prescription: JSON.stringify(p), planned: true, source: "plan" } });
  }
  const run = await workout("run", 20, "07:00"), bike = await workout("bike", 30, "17:00");
  const future = await db.workout.create({ data: { userId: a.id, planDayId: tomorrow.id, date: tomorrowDate, sport: "run", title: "Future unreviewed session", type: "endurance", durationMin: 20, intensity: "z2", planned: true, source: "plan" } });
  const historical = await db.workout.create({ data: { userId: a.id, date: new Date(day.getTime() - 86400000), sport: "run", title: "Reported prior easy run", type: "endurance", durationMin: 30, intensity: "z2", planned: true, completed: true, feedbackStatus: "completed", actualDurationMin: 28, rpe: 3, feedbackAt: new Date(), source: "manual" } });
  return { plan, today, tomorrow, run, bike, future, historical };
}

async function request(path: string, who?: Actor, options: { body?: unknown; method?: string; status?: number } = {}) {
  const response = await fetch(new URL(path, base), { method: options.method || (options.body === undefined ? "GET" : "POST"), headers: { ...(who ? { cookie: who.cookie } : {}), "Content-Type": "application/json" }, ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }), redirect: "manual", signal: AbortSignal.timeout(120000) });
  if (options.status !== undefined && response.status !== options.status) throw new Error(`${options.method || "GET"} ${path}: expected ${options.status}, received ${response.status}: ${(await response.text()).slice(0,500)}`);
  return response;
}
async function json(path: string, who?: Actor, options: Parameters<typeof request>[2] = {}) {
  return (await request(path, who, { status: 200, ...options })).json();
}
async function scenario(name: string, task: () => Promise<void>) {
  try { await task(); results.push({ name, status: "PASS" }); console.log(`PASS ${name}`); }
  catch (error) { const detail = error instanceof Error ? error.message : String(error); results.push({ name, status: "FAIL", detail }); console.error(`FAIL ${name}: ${detail}`); }
}
async function savedClearCheckin(a: Actor) {
  const { availableMinutes, ...answers } = validAnswers;
  const recorded = JSON.stringify({ ...answers, availableMin: availableMinutes, inputMetadata: { version: "checkin-safety-v1", source: "athlete-reported", observedOn: day.toISOString().slice(0, 10), recordedAt: new Date().toISOString() } });
  const adaptation = JSON.stringify({ verdict: "full", durationFactor: 1, intensityCap: "z7", safetyStatus: "clear", message: "Synthetic explicitly reported input" });
  await db.dailyCheckin.upsert({ where: { userId_date: { userId: a.id, date: day } }, create: { userId: a.id, date: day, answers: recorded, adaptation }, update: { answers: recorded, adaptation } });
}

async function main() {
  const a = await actor("release-a"), b = await actor("release-b");
  const f = await fixture(a); await savedClearCheckin(a);
  const steps = [ { name: "Prepare", phase: "warmup", zone: "z1", seconds: 300 },
    ...Array.from({ length: 3 }, (_, i) => [ { name: `Work ${i + 1}`, phase: "active", zone: "z4", seconds: 180 }, { name: "Easy", phase: "recovery", zone: "z1", seconds: 120 } ]).flat(),
    { name: "Finish", phase: "cooldown", zone: "z1", seconds: 600 } ];
  await db.workout.update({ where: { id: f.bike.id }, data: { prescription: JSON.stringify({ ...prescription("bike", 30), steps }) } });
  const card = () => json(`/api/workout/card?id=${f.bike.id}`, a);
  let current = await card();
  await scenario("new APIs require authentication and refuse another athlete", async () => {
    for (const path of ["/api/activity-streams", `/api/activity-analysis?workoutId=${f.bike.id}`, `/api/workout/history?id=${f.bike.id}`]) await request(path, undefined, { status: 401 });
    await request(`/api/workout/history?id=${f.bike.id}`, b, { status: 404 });
    await request(`/api/workout/interval-edit?athleteId=${a.id}`, b, { body: {}, status: 403 });
  });
  await scenario("preview is read-only; raised zone requires confirmation; save invalidates approval; stale revisions fail", async () => {
    const url = `/api/workout/interval-edit`;
    const expectedRevision = current.session.revision;
    const initial = await db.workout.findUniqueOrThrow({ where: { id: f.bike.id } });
    const preview = await json(url, a, { body: { id: f.bike.id, expectedRevision, mode: "preview", patch: { workZone: 5 } } });
    assert.equal(preview.preview.requiresConfirmation, true);
    assert.equal((await db.workout.findUniqueOrThrow({ where: { id: f.bike.id } })).prescription, initial.prescription);
    await request(url, a, { body: { id: f.bike.id, expectedRevision, mode: "apply", patch: { workZone: 5 } }, status: 409 });
    await json(url, a, { body: { id: f.bike.id, expectedRevision, mode: "apply", patch: { repeats: 2 } } });
    assert.equal((await db.workout.findUniqueOrThrow({ where: { id: f.bike.id } })).approved, false);
    await request(url, a, { body: { id: f.bike.id, expectedRevision, mode: "apply", patch: { repeats: 2 } }, status: 409 });
    current = await card(); assert.notEqual(current.session.revision, expectedRevision);
  });
  await scenario("revision history, restore and explicit approval produce a valid structured FIT", async () => {
    const history = await json(`/api/workout/history?id=${f.bike.id}`, a);
    assert.equal(history.canRestoreLatestStepEdit, true);
    assert.ok(history.history.some((h: any) => h.kind === "steps_edited"));
    await json("/api/workout/card", a, { method: "PATCH", body: { id: f.bike.id, expectedRevision: current.session.revision, action: "restore" } });
    current = await card();
    const fit = await request(`/api/workout/approve?sessionId=${f.bike.id}&expectedRevision=${current.session.revision}`, a, { method: "POST", status: 200 });
    assert.equal(fit.headers.get("x-workout-compatibility"), "device-unverified");
    const decoder = new Decoder(Stream.fromByteArray(new Uint8Array(await fit.arrayBuffer())));
    assert.equal(decoder.checkIntegrity(), true); const decoded = decoder.read(); assert.deepEqual(decoded.errors, []);
    assert.ok((decoded.messages.workoutStepMesgs?.length ?? 0) > 0);
    assert.equal((await db.workout.findUniqueOrThrow({ where: { id: f.bike.id } })).approved, true);
  });
  const fileStart = new Date(day.getTime() - 2 * 86400000);
  const tcx = `<TrainingCenterDatabase><Activities><Activity Sport="Biking"><Id>${fileStart.toISOString()}</Id><Lap><TotalTimeSeconds>120</TotalTimeSeconds><Track><Trackpoint><Time>${fileStart.toISOString()}</Time><HeartRateBpm><Value>130</Value></HeartRateBpm></Trackpoint><Trackpoint><Time>${new Date(fileStart.getTime() + 120000).toISOString()}</Time><HeartRateBpm><Value>132</Value></HeartRateBpm></Trackpoint></Track></Lap></Activity></Activities><Author><Name>Garmin Edge</Name></Author></TrainingCenterDatabase>`;
  async function upload(data: string | Uint8Array, name: string, consent: boolean) {
    const body = new FormData(); body.set("source", "garmin"); body.set("file", new File([data as BlobPart], name)); if (consent) body.set("streamConsent", "1");
    const response = await fetch(new URL("/api/import", base), { method: "POST", headers: { cookie: a.cookie }, body });
    const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result)); return result;
  }
  let importedId = "";
  await scenario("real multipart TCX import, consent, idempotence, missing power and owner isolation", async () => {
    await upload(tcx, "fixture.tcx", false); assert.equal(await db.activityStream.count({ where: { userId: a.id } }), 0);
    const imported = await upload(tcx, "fixture.tcx", true); assert.equal(imported.workoutsImported, 0); assert.equal(imported.streams.stored, 1);
    importedId = imported.streams.workoutIds[0];
    const analysis = await json(`/api/activity-analysis?workoutId=${importedId}`, a); assert.equal(analysis.power, null);
    await request(`/api/activity-analysis?workoutId=${importedId}`, b, { status: 404 });
    const deleted = await json(`/api/activity-streams?workoutId=${importedId}`, b, { method: "DELETE" }); assert.equal(deleted.deleted, 0);
    assert.equal(await db.activityStream.count({ where: { userId: a.id } }), 1);
  });
  await scenario("real SDK FIT and CSV imports persist summaries; unknown CSV distance stays unknown", async () => {
    const encoder = new Encoder();
    encoder.onMesg(Profile.MesgNum.FILE_ID, { type: "activity", manufacturer: "garmin", product: 7, serialNumber: 1234, timeCreated: fileStart } as any);
    encoder.onMesg(Profile.MesgNum.SESSION, { startTime: fileStart, timestamp: new Date(fileStart.getTime() + 600000), totalTimerTime: 600, totalElapsedTime: 600, sport: "running" } as any);
    await upload(encoder.close(), "fixture.fit", false);
    const result = await upload('Activity Type,Date,Time,Title,Distance\nRunning,2026-10-10 07:30:00,00:30:00,Synthetic CSV,10', "fixture.csv", false);
    assert.equal(result.workoutsFound, 1);
    const row = await db.workout.findFirstOrThrow({ where: { userId: a.id, title: "Synthetic CSV" } }); assert.equal(row.distanceKm, null);
  });
  await scenario("expired streams become unreadable, cron physically purges them, owner deletion remains available", async () => {
    assert.ok(importedId);
    await db.activityStream.update({ where: { workoutId: importedId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await json(`/api/activity-analysis?workoutId=${importedId}`, a)).reason, "no_streams");
    await request("/api/cron/worker", undefined, { status: 401 });
    const worker = await fetch(new URL("/api/cron/worker", base), { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    assert.equal(worker.status, 200); assert.equal((await worker.json()).streamCleanup.status, "ok");
    assert.equal(await db.activityStream.count({ where: { workoutId: importedId } }), 0);
    await upload(tcx, "fixture.tcx", true);
    assert.equal((await json("/api/activity-streams?all=1", a, { method: "DELETE" })).deleted, 1);
  });
  await scenario("automatic telemetry stores neither arbitrary text, biometrics, identifiers nor raw user-agent", async () => {
    await json("/api/telemetry/error", a, { body: { kind: "other", route: "/athletes/fixture-private-name", message: "Fixture Private HRV 12", stack: "private stack" } });
    const event = await db.appEvent.findFirstOrThrow({ where: { userId: a.id, source: "client" }, orderBy: { createdAt: "desc" } });
    const text = JSON.stringify(event); assert.doesNotMatch(text, /fixture-private-name|Fixture Private|HRV|private stack|userAgent/);
  });
  await scenario("legacy fitness API never invents numeric race predictions", async () => {
    const result = await json("/api/fitness", a);
    assert.equal(Object.prototype.hasOwnProperty.call(result, "predictions"), false);
  });
  await scenario("current-plan selectors exclude retired suggestions before limits and retain reported history", async () => {
    await db.trainingPlan.updateMany({ where: { userId: a.id }, data: { status: "archived" } });
    const old = await db.trainingPlan.create({ data: { userId: a.id, name: "Synthetic replaced plan", distance: "cycle", level: "amateur", weeks: 2, startDate: day, status: "active", createdAt: new Date(Date.now() - 1000) } });
    const current = await db.trainingPlan.create({ data: { userId: a.id, name: "Synthetic current plan", distance: "cycle", level: "amateur", weeks: 2, startDate: day, status: "active", createdAt: new Date(Date.now() + 1000) } });
    const [oldDay, currentDay] = await Promise.all([old, current].map(plan => db.planDay.create({ data: { planId: plan.id, date: day, week: 1, dayOfWeek: day.getUTCDay() } })));
    const pending = { userId: a.id, date: day, sport: "bike", type: "endurance", title: "Synthetic pending choice", durationMin: 30, planned: true, completed: false, source: "plan" };
    await db.workout.createMany({ data: Array.from({ length: 85 }, () => ({ ...pending, planDayId: oldDay.id })) });
    const selected = await db.workout.create({ data: { ...pending, planDayId: currentDay.id } });
    const reported = await db.workout.create({ data: { ...pending, planDayId: oldDay.id, calories: 123 } });
    const retired = await db.workout.create({ data: { ...pending, source: "superseded-starter", planned: false } });
    const foreign = await db.workout.create({ data: { ...pending, userId: b.id } });
    const before = await db.workout.count({ where: { userId: a.id } });
    const feedResponse = await request("/api/workouts?days=14", a);
    assert.match(feedResponse.headers.get("cache-control") || "", /no-store/);
    const feed = await feedResponse.json();
    assert.equal(feed.workouts.some((w: any) => w.id === selected.id), true);
    assert.equal(feed.workouts.some((w: any) => w.id === reported.id), true);
    assert.equal(feed.workouts.some((w: any) => w.planDayId === oldDay.id && w.id !== reported.id), false);
    assert.equal(feed.workouts.some((w: any) => [retired.id, foreign.id].includes(w.id)), false);
    const chat = await json("/api/assistant", a);
    assert.equal(chat.sessions.some((w: any) => w.id === selected.id), true, "85 replaced rows must not crowd out the active plan");
    assert.equal(chat.sessions.some((w: any) => w.id === reported.id), true, "Calorie-only actual evidence is retained");
    assert.equal(chat.sessions.filter((w: any) => w.title === pending.title).length, 2);
    assert.equal(chat.sessions.some((w: any) => [retired.id, foreign.id].includes(w.id)), false);
    assert.equal(await db.workout.count({ where: { userId: a.id } }), before, "Visibility never deletes history");
    await request(`/api/workouts?athleteId=${a.id}`, b, { status: 403 });
  });
  await scenario("replaced plans cannot consume today's budget, become the default workout or remain executable by old links", async () => {
    const owner = await actor("legacy-budget");
    const current = await fixture(owner);
    const old = await db.trainingPlan.create({ data: { userId: owner.id, name: "Synthetic legacy active cycle", distance: "cycle", level: "amateur", weeks: 2, startDate: day, status: "active", createdAt: new Date(Date.now() - 86400000) } });
    const oldDay = await db.planDay.create({ data: { planId: old.id, date: day, week: 1, dayOfWeek: day.getUTCDay(), dayOff: false } });
    await db.workout.createMany({ data: Array.from({ length: 85 }, () => ({ userId: owner.id, planDayId: oldDay.id, date: day, startTime: "05:00", title: "Synthetic retired budget consumer", sport: "bike", type: "endurance", intensity: "z2", durationMin: 30, planned: true, completed: false, approved: true, source: "plan", originalPlan: JSON.stringify(prescription("bike", 30)), createdAt: new Date(Date.now() - 3600000) })) });
    await db.workout.create({ data: { userId: owner.id, planDayId: oldDay.id, date: day, startTime: "05:00", title: "Synthetic retained skipped history", sport: "bike", type: "endurance", intensity: "z2", durationMin: 30, planned: true, completed: false, source: "plan", originalPlan: JSON.stringify(prescription("bike", 30)), feedbackStatus: "skipped", actualDurationMin: 0, rpe: 0, feedbackAt: new Date(Date.now() - 60000) } });
    const before = await db.workout.findMany({ where: { planDayId: oldDay.id }, orderBy: { id: "asc" } });
    const obsoleteId = before.find(w => w.feedbackStatus === null)!.id;
    const response = await json("/api/checkin", owner, { body: validAnswers });
    assert.notEqual(response.adaptation.verdict, "rest", "Legacy suggestions do not exhaust the current training budget");
    const saved = await db.workout.findMany({ where: { id: { in: [current.run.id, current.bike.id] } }, orderBy: { startTime: "asc" } });
    assert.deepEqual(saved.map(w => w.durationMin), [20, 30], "Only current sessions share the 60-minute daily ceiling");
    assert.deepEqual(await db.workout.findMany({ where: { planDayId: oldDay.id }, orderBy: { id: "asc" } }), before, "Read/adaptation never rewrites retired prescriptions");
    await db.planDay.update({ where: { id: oldDay.id }, data: { dayOff: true } });
    const overview = await json("/api/today", owner);
    assert.deepEqual(overview.sessions.map((s: any) => s.id).sort(), [current.run.id, current.bike.id].sort());
    assert.notEqual(overview.recovery.mode, "planned-rest");
    const daily = await json("/api/v1/training/today", owner);
    assert.equal(daily.session.id, current.run.id);
    assert.equal(daily.session.totalMinutes, 20);
    assert.equal(daily.sessions.length, 2);
    await request(`/api/v1/training/today?sessionId=${obsoleteId}`, owner, { status: 404 });
    await request(`/api/workout/card?id=${obsoleteId}`, owner, { status: 404 });
    await request(`/api/workout/approve?sessionId=${obsoleteId}`, owner, { method: "POST", status: 404 });
    await request(`/api/workout/approve?sessionId=${obsoleteId}`, owner, { status: 404 });
  });
}
main().catch(error => { results.push({ name: "acceptance setup", status: "FAIL", detail: String(error) }); }).finally(async () => {
  await db.user.deleteMany({ where: { id: { in: createdIds } } });
  const remaining = await db.user.count({ where: { id: { in: createdIds } } });
  writeFileSync(`${artifactDir}/report.json`, JSON.stringify({ results, remaining, externalProviders: "not tested", physicalDeviceReceipt: "not tested" }, null, 2));
  await db.$disconnect(); if (remaining || results.some(r => r.status === "FAIL")) process.exitCode = 1;
});
