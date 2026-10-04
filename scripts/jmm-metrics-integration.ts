/** Real HTTP + PostgreSQL acceptance, restricted to the disposable CI database. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient, type Prisma, type User } from "@prisma/client";
import bcrypt from "bcryptjs";
import { hashToken } from "../src/lib/auth";
import { addDaysKey, dateKey, localDate } from "../src/lib/dates";
import { workoutRevision } from "../src/lib/workout-update";

for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
  const url = new URL(process.env[key] || "");
  assert.equal(url.protocol, "postgresql:");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55432");
  assert.equal(url.pathname, "/jmm_launch_integration_test");
  assert.equal(url.search, "");
}
assert.notEqual(process.env.VERCEL_ENV, "production");
const base = new URL(process.env.JMM_INTEGRATION_BASE || "http://127.0.0.1:3220");
assert.equal(base.href, "http://127.0.0.1:3220/");
const db = new PrismaClient(), created: string[] = [];
const results: Array<{ name: string; status: "PASS" | "FAIL"; detail?: string }> = [];
const dir = ".local/jmm-metrics-integration";
mkdirSync(dir, { recursive: true });
type Actor = User & { cookie: string };
const timezone = "Pacific/Honolulu", today = dateKey(new Date(), timezone);
const restPath = "/api/j-metrics/rest-day";

async function actor(label: string): Promise<Actor> {
  const user = await db.user.create({ data: {
    email: `metrics-${label}-${randomUUID()}@example.invalid`, name: `Synthetic metrics ${label}`,
    passwordHash: bcrypt.hashSync(randomBytes(24).toString("base64url"), 10), role: "athlete", timezone, language: "en", onboarded: true,
    profile: { create: { goal: "run-only", experience: "amateur", weeklyHours: 3, birthYear: 1990, weightKg: 70 } },
    reminder: { create: { emailEnabled: false, telegramEnabled: false } },
  } });
  created.push(user.id);
  const token = randomBytes(32).toString("hex");
  await db.authSession.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3600000) } });
  return { ...user, cookie: `jmm_session=${token}` };
}
async function request(path: string, owner?: Actor, options: { body?: unknown; status?: number; origin?: string; raw?: string; method?: string } = {}) {
  const hasBody = options.body !== undefined || options.raw !== undefined;
  const response = await fetch(new URL(path, base), {
    method: options.method ?? (hasBody ? "POST" : "GET"),
    headers: { "Content-Type": "application/json", origin: options.origin ?? base.origin, ...(owner ? { cookie: owner.cookie } : {}) },
    ...(hasBody ? { body: options.raw ?? JSON.stringify(options.body) } : {}),
    redirect: "manual", signal: AbortSignal.timeout(60000),
  });
  assert.equal(response.status, options.status ?? 200, `${path} returned unexpected status`);
  return response;
}
async function metrics(owner: Actor, path = "/api/fitness") { return (await (await request(path, owner)).json()).jMetrics; }
async function fixture(owner: Actor, offset: number, data: Partial<Prisma.WorkoutUncheckedCreateInput> = {}) {
  return db.workout.create({ data: {
    userId: owner.id, date: localDate(addDaysKey(today, offset), timezone), sport: "run", title: "Synthetic recorded effort", type: "endurance",
    durationMin: 90, actualDurationMin: 60, rpe: 5, planned: true, completed: true, feedbackStatus: "completed", source: "manual", tss: 999, ...data,
  } });
}
async function scenario(name: string, task: () => Promise<void>) {
  try { await task(); results.push({ name, status: "PASS" }); console.log(`PASS ${name}`); }
  catch (error) {
    const detail = error instanceof assert.AssertionError ? error.message : "Integration operation failed; inspect isolated CI server logs.";
    results.push({ name, status: "FAIL", detail }); console.error(`FAIL ${name}: ${detail}`);
  }
}

async function main() {
  await scenario("Fitness and rest declarations require authentication", async () => {
    await request("/api/fitness", undefined, { status: 401 });
    await request(restPath, undefined, { body: { date: today, confirmed: true }, status: 401 });
  });
  await scenario("Actual load uses actual minutes, ignores legacy scores and isolates accounts", async () => {
    const a = await actor("actual"), b = await actor("other");
    await fixture(a, 0);
    await fixture(b, 0, { actualDurationMin: 100, rpe: 10 });
    const own = await metrics(a);
    assert.equal(own.totalJStress, 300);
    assert.equal(own.series.at(-1).jStress, 300);
    assert.equal(own.totalSessions, 1);
    assert.equal(own.current.jBase, null);
    assert.equal(own.timezone, timezone);
    // /fitness is intentionally the authenticated user's own view; a query cannot change scope.
    assert.equal((await metrics(a, `/api/fitness?athleteId=${b.id}`)).totalJStress, 300);
    assert.equal((await metrics(b)).totalJStress, 1000);
    const answer = await (await request("/api/assistant", a, { body: { message: "What is my JStress?", externalConsent: false, clientRequestId: randomUUID() } })).json();
    assert.match(answer.answer, new RegExp(`JStress \\(${today}\\): 300 AU`));
    assert.equal(answer.trainingModified, false);
  });
  await scenario("Missing effort remains unknown, matched plans are skipped, partial training counts", async () => {
    const a = await actor("coverage");
    const actual = await fixture(a, -1);
    await fixture(a, -1, { matchedPlanId: actual.id, actualDurationMin: 90, rpe: 10 });
    const missing = await fixture(a, 0, { rpe: null });
    await fixture(a, -2, { completed: false, feedbackStatus: "partial", actualDurationMin: 20, rpe: 3 });
    const value = await metrics(a);
    assert.equal(value.totalJStress, 360);
    assert.equal(value.eligibleSessions, 2);
    assert.equal(value.totalSessions, 3);
    assert.equal(value.series.at(-1).jStress, null);
    assert.equal(value.series.find((point: any) => point.date === addDaysKey(today, -1)).jStress, 300);
    await request(restPath, a, { body: { date: today, confirmed: true }, status: 409 });
    await request(restPath, a, { body: { date: addDaysKey(today, -2), confirmed: true }, status: 409 });
    assert.equal((await db.workout.findUniqueOrThrow({ where: { id: missing.id } })).rpe, null);
  });
  await scenario("Actual RPE zero persists through workout PUT and remains a scored zero", async () => {
    const a = await actor("zero-rpe");
    const session = await fixture(a, 0, { rpe: null, actualDurationMin: 20 });
    await request("/api/plan", a, { method: "PUT", body: { sessionId: session.id, expectedRevision: workoutRevision(session), rpe: 0, actualDurationMin: 20, feedbackStatus: "completed" } });
    const saved = await db.workout.findUniqueOrThrow({ where: { id: session.id } });
    assert.equal(saved.rpe, 0);
    assert.equal(saved.actualDurationMin, 20);
    const value = await metrics(a);
    assert.equal(value.totalJStress, 0);
    assert.equal(value.eligibleSessions, 1);
    assert.equal(value.coveragePct, 100);
    assert.equal(value.series.at(-1).jStress, 0);
    assert.ok(!value.confirmedRestDays.includes(today));
  });
  await scenario("Rest declaration is idempotent, tenant-scoped, removable and subordinate to later training", async () => {
    const a = await actor("rest"), b = await actor("rest-other");
    const declaration = { date: today, confirmed: true };
    await request(restPath, b, { body: declaration });
    await Promise.all([request(restPath, a, { body: declaration }), request(restPath, a, { body: declaration })]);
    const where = { userId: a.id, metricType: "jmm_rest_day" };
    assert.equal(await db.metricObservation.count({ where }), 1);
    const saved = await db.metricObservation.findFirstOrThrow({ where });
    assert.equal(saved.observedAt.toISOString(), localDate(today, timezone).toISOString());
    assert.equal(saved.measurementMethod, "athlete_reported_rest");
    assert.equal((await metrics(a)).series.at(-1).jStress, 0);
    await fixture(a, 0, { rpe: null });
    const conflicting = await metrics(a);
    assert.equal(conflicting.series.at(-1).jStress, null);
    assert.ok(!conflicting.confirmedRestDays.includes(today));
    await request(restPath, a, { body: { ...declaration, confirmed: false } });
    assert.equal(await db.metricObservation.count({ where }), 0);
    assert.equal(await db.metricObservation.count({ where: { userId: b.id, metricType: "jmm_rest_day" } }), 1);
    const events = await db.appEvent.findMany({ where: { userId: a.id, route: restPath } });
    assert.ok(events.length >= 3);
    assert.ok(events.every(event => event.meta === null && !event.message.includes(today)));
  });
  await scenario("Cross-origin, forged account, invalid calendar, future and oversized requests cannot write", async () => {
    const a = await actor("boundaries");
    await request(restPath, a, { body: { date: today, confirmed: true }, origin: "https://other.example.invalid", status: 403 });
    for (const body of [
      { date: "2026-02-30", confirmed: true }, { date: addDaysKey(today, 1), confirmed: true },
      { date: addDaysKey(today, -90), confirmed: true }, { date: today, confirmed: "true" },
      { date: today, confirmed: true, userId: "another-athlete" },
    ]) await request(restPath, a, { body, status: 400 });
    await request(restPath, a, { raw: " ".repeat(1025), status: 413 });
    assert.equal(await db.metricObservation.count({ where: { userId: a.id } }), 0);
    await request(restPath, a, { body: { date: addDaysKey(today, -89), confirmed: true } });
    assert.equal(await db.metricObservation.count({ where: { userId: a.id } }), 1);
  });
}

main().catch(() => { results.push({ name: "Runner setup", status: "FAIL", detail: "Unable to initialize isolated integration fixtures." }); }).finally(async () => {
  let cleanup = false;
  try {
    await db.usageCounter.deleteMany({ where: { userId: { in: created } } });
    await db.appEvent.deleteMany({ where: { userId: { in: created } } });
    await db.user.deleteMany({ where: { id: { in: created } } });
    assert.equal(await db.user.count({ where: { id: { in: created } } }), 0);
    cleanup = true;
  } catch { results.push({ name: "Fixture cleanup", status: "FAIL", detail: "Synthetic fixture cleanup could not be verified." }); }
  await db.$disconnect();
  writeFileSync(`${dir}/report.json`, JSON.stringify({ generatedAt: new Date().toISOString(), environment: "Disposable loopback PostgreSQL and synthetic athletes", results, cleanup: { createdUsers: created.length, verified: cleanup }, notRun: ["Production athlete data", "Device delivery", "External AI providers"] }, null, 2));
  const failed = results.filter(result => result.status === "FAIL").length;
  console.log(`${results.length - failed}/${results.length} J Metrics acceptance scenarios passed.`);
  if (failed) process.exitCode = 1;
});
