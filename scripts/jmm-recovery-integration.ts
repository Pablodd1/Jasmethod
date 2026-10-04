/** Authenticated recovery acceptance; disposable loopback PostgreSQL only. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient, type User } from "@prisma/client";
import bcrypt from "bcryptjs";
import { hashToken } from "../src/lib/auth";
import { dayBounds } from "../src/lib/dates";

for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
  const url = new URL(process.env[key] || "");
  assert.equal(url.protocol, "postgresql:"); assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55432"); assert.equal(url.pathname, "/jmm_launch_integration_test"); assert.equal(url.search, "");
}
assert.notEqual(process.env.VERCEL_ENV, "production");
const base = new URL(process.env.JMM_INTEGRATION_BASE || "http://127.0.0.1:3220");
assert.equal(base.href, "http://127.0.0.1:3220/");
const db = new PrismaClient(), created: string[] = [];
const results: Array<{ name: string; status: "PASS" | "FAIL"; detail?: string }> = [];
const dir = ".local/jmm-recovery-integration";
mkdirSync(dir, { recursive: true });
const timezone = "Pacific/Honolulu", { start: day, key: today } = dayBounds(timezone);
const clear = { sleep: 4, soreness: 2, motivation: 4, energy: 4, stress: 2, sick: false, newPain: false, urgentSymptoms: false, availableMin: 20 };
type Actor = User & { cookie: string };
async function actor(label: string): Promise<Actor> {
  const user = await db.user.create({ data: {
    email: `recovery-${label}-${randomUUID()}@example.invalid`, name: `Synthetic recovery ${label}`,
    passwordHash: bcrypt.hashSync(randomBytes(24).toString("base64url"), 10), role: "athlete", timezone, language: "en", onboarded: true,
    profile: { create: { goal: "run-only", experience: "beginner", weeklyHours: 3, birthYear: 1990, weightKg: 70 } },
    reminder: { create: { emailEnabled: false, telegramEnabled: false } },
  } });
  created.push(user.id);
  const token = randomBytes(32).toString("hex");
  await db.authSession.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3600000) } });
  return { ...user, cookie: `jmm_session=${token}` };
}
async function request(path: string, owner?: Actor, options: { body?: unknown; status?: number; method?: string } = {}) {
  const response = await fetch(new URL(path, base), {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers: { "Content-Type": "application/json", origin: base.origin, ...(owner ? { cookie: owner.cookie } : {}) },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }), redirect: "manual", signal: AbortSignal.timeout(120000),
  });
  assert.equal(response.status, options.status ?? 200, `${path} returned unexpected status`);
  return response.json();
}
async function plan(owner: Actor, withDay = true, dayOff = true) {
  const value = await db.trainingPlan.create({ data: { userId: owner.id, name: "Synthetic recovery plan", distance: "run-only", level: "beginner", weeks: 1, startDate: day } });
  const planDay = withDay ? await db.planDay.create({ data: { planId: value.id, date: day, week: 1, dayOfWeek: new Date(`${today}T12:00Z`).getUTCDay(), dayOff, focus: dayOff ? "recovery" : "run" } }) : null;
  return { plan: value, day: planDay };
}
async function checkin(owner: Actor, changes: Record<string, unknown> = {}) {
  const answers = JSON.stringify({ ...clear, ...changes });
  const adaptation = JSON.stringify({ verdict: "full", durationFactor: 1, intensityCap: "z7", safetyStatus: "clear", message: "Synthetic explicitly reported input" });
  await db.dailyCheckin.upsert({ where: { userId_date: { userId: owner.id, date: day } }, create: { userId: owner.id, date: day, answers, adaptation }, update: { answers, adaptation } });
}
async function configureSetup(owner: Actor) {
  const profile = await request("/api/profile", owner);
  await request("/api/profile", owner, { method: "PUT", body: { expectedRevision: profile.revision, expectedSetupRevision: profile.setupRevision ?? null, experience: "beginner", weeklyHours: 3,
    setup: { adultConfirmed: true, profileConfirmed: true, goalDescription: "Run comfortably for general fitness", baselineWeeklyMinutes: 120, baselineObservedAt: today, interruptions: "none", restrictions: "none", qualifiedReview: "none_needed", trainingDays: [0,1,2,3,4,5,6], maxSessionMinutes: 60, equipmentAccess: "Shoes and outdoor path", planWeeks: 4 } } });
}
async function scenario(name: string, task: () => Promise<void>) {
  try { await task(); results.push({ name, status: "PASS" }); console.log(`PASS ${name}`); }
  catch (error) {
    const detail = error instanceof assert.AssertionError ? error.message : "Integration operation failed; inspect isolated CI server logs.";
    results.push({ name, status: "FAIL", detail }); console.error(`FAIL ${name}: ${detail}`);
  }
}
async function main() {
  await scenario("No-session active off-day is visible, read-only and unknown safety never offers movement", async () => {
    await request("/api/today", undefined, { status: 401 });
    const a = await actor("rest"), b = await actor("unrelated");
    await plan(a);
    const result = await request("/api/today", a);
    assert.equal(result.recovery.mode, "planned-rest");
    assert.equal(result.recovery.safetyStatus, "unknown");
    assert.equal(result.recovery.allowMovement, false);
    assert.equal(result.recovery.optionalMovementMinutes, null);
    assert.deepEqual(result.sessions, []);
    await request(`/api/today?athleteId=${a.id}`, b, { status: 403 });
    await request("/api/today", a);
    assert.equal(await db.metricObservation.count({ where: { userId: a.id, metricType: "jmm_rest_day" } }), 0);
    assert.equal(await db.workout.count({ where: { userId: a.id } }), 0);
  });
  await scenario("Complete current answers allow an optional twenty minutes, never create training or completed rest", async () => {
    const a = await actor("optional"); await plan(a); await checkin(a);
    const result = await request("/api/today", a);
    assert.equal(result.recovery.mode, "planned-rest");
    assert.equal(result.recovery.allowMovement, true);
    assert.equal(result.recovery.optionalMovementMinutes, 20);
    assert.equal(result.recovery.noAdditionalTraining, true);
    assert.deepEqual(result.sessions, []);
    assert.equal(await db.metricObservation.count({ where: { userId: a.id } }), 0);
    assert.equal(await db.workout.count({ where: { userId: a.id } }), 0);
    await checkin(a, { availableMin: 19 });
    assert.equal((await request("/api/today", a)).recovery.allowMovement, false);
  });
  await scenario("Illness, urgent symptoms, low energy and incomplete answers override optional movement", async () => {
    const a = await actor("holds"); await plan(a);
    for (const [changes, mode] of [[{ sick: true }, "hold"], [{ urgentSymptoms: true }, "hold"], [{ energy: 1 }, "planned-rest"], [{ energy: null }, "planned-rest"]] as const) {
      await checkin(a, changes);
      const result = await request("/api/today", a);
      assert.equal(result.recovery.mode, mode);
      assert.equal(result.recovery.allowMovement, false);
      assert.equal(result.recovery.optionalMovementMinutes, null);
    }
    await checkin(a);
    await db.athleteProfile.update({ where: { userId: a.id }, data: { injured: true } });
    assert.equal((await request("/api/today", a)).recovery.allowMovement, false);
  });
  await scenario("A completed imported activity suppresses extra movement on a planned off-day", async () => {
    const a = await actor("already-trained"); await plan(a); await checkin(a);
    await db.workout.create({ data: { userId: a.id, date: day, sport: "bike", title: "Synthetic imported ride", type: "endurance", durationMin: 30, planned: false, completed: true, source: "garmin", externalId: `synthetic-${randomUUID()}` } });
    const result = await request("/api/today", a);
    assert.equal(result.recovery.allowMovement, false);
    assert.equal(result.recovery.optionalMovementMinutes, null);
    assert.equal(await db.workout.count({ where: { userId: a.id } }), 1);
    assert.equal(await db.metricObservation.count({ where: { userId: a.id, metricType: "jmm_rest_day" } }), 0);
  });
  await scenario("No plan, empty plan and archived off-day are not silently called planned rest", async () => {
    const a = await actor("no-plan"); await checkin(a);
    assert.equal((await request("/api/today", a)).recovery.mode, "unplanned");
    await plan(a, false);
    assert.equal((await request("/api/today", a)).recovery.mode, "unplanned");
    const archived = await plan(a);
    await db.trainingPlan.update({ where: { id: archived.plan.id }, data: { status: "archived" } });
    const result = await request("/api/today", a);
    assert.equal(result.recovery.mode, "unplanned");
    assert.equal(result.recovery.allowMovement, false);
  });
  await scenario("An existing training session never gains an extra optional twenty-minute workout", async () => {
    const a = await actor("training"); await configureSetup(a); const current = await plan(a, true, false); await checkin(a);
    await db.workout.create({ data: {
      userId: a.id, planDayId: current.day!.id, date: day, sport: "run", title: "Synthetic easy session", type: "endurance", durationMin: 20, intensity: "z2", planned: true, source: "plan",
      prescription: JSON.stringify({ title: "Synthetic easy session", sport: "run", durationMin: 20, intensity: "z2", type: "endurance", verdict: "full", steps: [
        { name: "Warm up", seconds: 300, zone: "z1", phase: "warmup", target: { type: "open" } },
        { name: "Easy effort", seconds: 600, zone: "z2", phase: "active", target: { type: "open" } },
        { name: "Finish easy", seconds: 300, zone: "z1", phase: "cooldown", target: { type: "open" } },
      ] }),
    } });
    const result = await request("/api/today", a);
    assert.equal(result.sessions.length, 1);
    assert.equal(result.recovery.mode, "training");
    assert.equal(result.recovery.allowMovement, false);
    assert.equal(result.recovery.optionalMovementMinutes, null);
    assert.equal(await db.workout.count({ where: { userId: a.id } }), 1);
  });
  await scenario("Confirmed generation persists seven days per week including empty off-days; preview alone writes nothing", async () => {
    const a = await actor("generation");
    await configureSetup(a);
    const body = { distance: "run-only", weeks: 4, startDate: today };
    const preview = await request("/api/plan/generate", a, { body: { ...body, preview: true } });
    assert.equal(preview.preview.recoveryPolicy.minimumRestDays, 2);
    assert.ok(preview.preview.weeksPreview.every((week: any) => week.restDaySlots.length >= 2));
    assert.equal(await db.trainingPlan.count({ where: { userId: a.id } }), 0);
    await request("/api/plan/generate", a, { body: { ...body, previewToken: preview.previewToken } });
    const saved = await db.trainingPlan.findFirstOrThrow({ where: { userId: a.id, status: "active" }, include: { days: { include: { sessions: true } } } });
    assert.equal(saved.days.length, 28);
    for (let week = 1; week <= 4; week++) {
      const days = saved.days.filter(value => value.week === week);
      assert.equal(days.length, 7);
      assert.ok(days.filter(value => value.dayOff).length >= 2);
      assert.ok(days.filter(value => value.dayOff).every(value => value.sessions.length === 0));
    }
    assert.equal(await db.metricObservation.count({ where: { userId: a.id, metricType: "jmm_rest_day" } }), 0);
  });
}
main().catch(() => { results.push({ name: "Runner setup", status: "FAIL", detail: "Unable to initialize isolated recovery fixtures." }); }).finally(async () => {
  let cleanup = false;
  try {
    await db.usageCounter.deleteMany({ where: { userId: { in: created } } });
    await db.appEvent.deleteMany({ where: { userId: { in: created } } });
    await db.user.deleteMany({ where: { id: { in: created } } });
    assert.equal(await db.user.count({ where: { id: { in: created } } }), 0); cleanup = true;
  } catch { results.push({ name: "Fixture cleanup", status: "FAIL", detail: "Synthetic fixture cleanup could not be verified." }); }
  await db.$disconnect();
  writeFileSync(`${dir}/report.json`, JSON.stringify({ generatedAt: new Date().toISOString(), environment: "Disposable loopback PostgreSQL, real HTTP and synthetic athletes", results, cleanup: { createdUsers: created.length, verified: cleanup }, notRun: ["Real athlete or provider data", "Production deployment", "Physiological efficacy validation"] }, null, 2));
  const failed = results.filter(value => value.status === "FAIL").length;
  console.log(`${results.length-failed}/${results.length} recovery acceptance scenarios passed.`);
  if (failed) process.exitCode = 1;
});
