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
import { Decoder, Stream } from "@garmin/fitsdk";
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
const artifactDir = ".local/jmm-launch-integration";
mkdirSync(artifactDir, { recursive: true });
// An interrupted/failed rerun must not present last run's files as new evidence.
for (const name of ["report.json", "timed-workout-graph.png", ...["run", "bike", "mobility", "recovery", "boxing"].flatMap(sport => [`${sport}.fit`, `${sport}-decoded.json`])]) rmSync(`${artifactDir}/${name}`, { force: true });
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
function decode(bytes: Buffer) {
  const decoder = new Decoder(Stream.fromByteArray(new Uint8Array(bytes)));
  assert.equal(decoder.isFIT(), true); assert.equal(decoder.checkIntegrity(), true);
  const output = decoder.read(); assert.deepEqual(output.errors, []);
  assert.ok(output.messages.fileIdMesgs?.length);
  assert.ok(output.messages.workoutMesgs?.length);
  assert.equal(output.messages.fileIdMesgs[0].type, "workout");
  const steps = output.messages.workoutStepMesgs;
  assert.ok(steps?.length);
  assert.deepEqual(steps.map((s: any) => s.messageIndex), steps.map((_: unknown, i: number) => i));
  assert.equal(output.messages.workoutMesgs[0].numValidSteps, steps.length);
  return { ...output.messages, workoutMesgs: output.messages.workoutMesgs, workoutStepMesgs: steps };
}
function unzipStored(bytes: Buffer) {
  const entries = new Map<string, Buffer>();
  for (let offset = 0; offset + 30 <= bytes.length && bytes.readUInt32LE(offset) === 0x04034b50;) {
    assert.equal(bytes.readUInt16LE(offset + 8), 0, "Fixture ZIP reader only supports the app's stored entries");
    const size = bytes.readUInt32LE(offset + 18), nameLength = bytes.readUInt16LE(offset + 26), extraLength = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    const start = offset + 30 + nameLength + extraLength;
    entries.set(name, bytes.subarray(start, start + size)); offset = start + size;
  }
  assert.ok(entries.size > 0); return entries;
}
async function canonical(a: Actor, sessionId: string) {
  const today = await json("/api/today", a);
  const session = today.sessions.find((s: any) => s.id === sessionId);
  assert.ok(session, "Requested session must remain visible");
  assert.ok(session.revision, "Today must expose canonical session revision");
  return { ...session, steps: session.prescription.steps, exactTimeSeconds: session.durationIsEstimate ? null : session.prescription.steps.reduce((total: number, s: any) => total + s.endpoint.seconds, 0) };
}
async function download(a: Actor, sessionId: string, expectedRevision?: string, status = 200) {
  return request(`/api/workout/approve?sessionId=${sessionId}${expectedRevision ? `&expectedRevision=${expectedRevision}` : ""}`, a, { status });
}

let browserId: string | undefined;
async function main() {
  await scenario("Fresh adult/no-connectors setup requires reviewed preview and creates a real device-free plan", async () => {
    const fresh = await actor("fresh", "athlete", false, false);
    await db.athleteProfile.update({ where: { userId: fresh.id }, data: { goal: null } });
    const empty = await json("/api/today", fresh);
    assert.deepEqual(empty.sessions, []); assert.equal(await db.trainingPlan.count({ where: { userId: fresh.id } }), 0);
    await json("/api/plan/generate", fresh, { status: 422, body: { distance: "run-only", weeks: 4, preview: true } });
    await configureSetup(fresh);
    await json("/api/plan/generate", fresh, { status: 409, body: { distance: "run-only", weeks: 4 } });
    const preview = await json("/api/plan/generate", fresh, { body: { distance: "run-only", weeks: 4, preview: true } });
    assert.ok(preview.previewToken); assert.equal(await db.trainingPlan.count({ where: { userId: fresh.id } }), 0);
    await json("/api/plan/generate", fresh, { body: { distance: "run-only", weeks: 4, preview: false, previewToken: preview.previewToken } });
    const plan = await db.trainingPlan.findFirstOrThrow({ where: { userId: fresh.id, status: "active" }, include: { days: { include: { sessions: true } } } });
    assert.equal(plan.distance, "run-only"); assert.equal(plan.raceDate, null); assert.ok(plan.days.some(d => d.date > day));
    assert.ok(plan.days.flatMap(d => d.sessions).length > 0);
    await json("/api/checkin", fresh, { body: validAnswers });
    const today = await json("/api/today", fresh); assert.ok(today.sessions.length, "Current selected training day must contain a real session");
    assert.ok(today.sessions.some((s: any) => s.verdict === "ready"));
    const ready = today.sessions.find((s: any) => s.verdict === "ready");
    const daily = await json(`/api/v1/training/today?sessionId=${ready.id}`, fresh); assert.equal(isDailyTraining(daily), true);
    assert.ok(daily.blocks.flatMap((b: any) => b.segments).every((s: any) => s.target.type === "open"));
    await download(fresh, ready.id, ready.revision);
    await json(`/api/v1/training/sessions/${ready.id}/completion`, fresh, { body: { expectedRevision: ready.revision, actual: { status: "partial", durationMinutes: 15, sessionRpe: 4 } } });
    const actual = await db.workout.findUniqueOrThrow({ where: { id: ready.id } }); assert.equal(actual.actualDurationMin, 15); assert.equal(actual.rpe, 4);
    assert.equal(await db.connector.count({ where: { userId: fresh.id } }), 0);
  });
  const a = await actor("primary"), b = await actor("other"), coach = await actor("coach", "coach"), admin = await actor("admin", "admin");
  const f = await fixture(a), other = await fixture(b);
  await savedClearCheckin(a); await savedClearCheckin(b);

  await scenario("Unauthenticated and cross-athlete reads/export are denied", async () => {
    await request("/api/today", undefined, { status: 401 });
    await request(`/api/workout/approve?sessionId=${f.run.id}`, undefined, { status: 401 });
    await download(b, f.run.id, undefined, 404);
    await request(`/api/workout/approve?sessionId=${f.run.id}&athleteId=${a.id}`, b, { status: 403 });
    await request(`/api/training/export?athleteId=${a.id}`, b, { status: 403 });
    assert.equal(await db.connector.count({ where: { userId: { in: [a.id, b.id] } } }), 0);
  });
  await scenario("Authorized coach/admin scope and immediate consent revocation", async () => {
    const path = `/api/workout/approve?sessionId=${f.run.id}&athleteId=${a.id}`;
    await request(path, coach, { status: 403 });
    const assignment = await db.coachAssignment.create({ data: { coachId: coach.id, athleteId: a.id, consent: "pending" } });
    await request(path, coach, { status: 403 });
    await db.coachAssignment.update({ where: { id: assignment.id }, data: { consent: "granted" } });
    decode(Buffer.from(await (await request(path, coach, { status: 200 })).arrayBuffer()));
    await request(path, admin, { status: 200 });
    await db.coachAssignment.update({ where: { id: assignment.id }, data: { consent: "revoked" } });
    await request(path, coach, { status: 403 });
  });
  await scenario("Two-session selection exports the exact selected canonical workout", async () => {
    for (const workout of [f.run, f.bike]) {
      const visible = await canonical(a, workout.id);
      const response = await download(a, workout.id, visible.revision);
      assert.equal(response.headers.get("x-workout-revision"), visible.revision);
      const bytes = Buffer.from(await response.arrayBuffer()), messages = decode(bytes);
      assert.equal(messages.workoutMesgs[0].sport, workout.sport === "bike" ? "cycling" : "running");
      assert.equal(messages.workoutStepMesgs.length, visible.steps.length);
      for (const [index, step] of visible.steps.entries()) {
        const actual = messages.workoutStepMesgs[index];
        assert.equal(actual.durationType, "time");
        assert.equal(actual.durationValue, step.endpoint.seconds * 1000);
        assert.equal(actual.intensity, step.phase === "active" ? "active" : step.phase);
        const targetType = step.target.type === "pace" || step.target.type === "speed" ? "speed" : step.target.type;
        assert.equal(actual.targetType, targetType);
        if (targetType === "power") { assert.equal(actual.customTargetValueLow, 1000 + step.target.low); assert.equal(actual.customTargetValueHigh, 1000 + step.target.high); }
        if (step.target.type === "pace") { assert.equal(actual.customTargetValueLow, Math.round(1000000 / step.target.high)); assert.equal(actual.customTargetValueHigh, Math.round(1000000 / step.target.low)); }
      }
      assert.equal(messages.workoutStepMesgs.reduce((n: number, s: any) => n + s.durationValue / 1000, 0), visible.exactTimeSeconds);
      writeFileSync(`${artifactDir}/${workout.sport}.fit`, bytes);
      writeFileSync(`${artifactDir}/${workout.sport}-decoded.json`, JSON.stringify({ canonical: visible, messages }, null, 2));
      decodedArtifacts.push({ sport: workout.sport, filename: `${workout.sport}.fit`, revision: visible.revision, exactTimeSeconds: visible.exactTimeSeconds, steps: messages.workoutStepMesgs });
    }
  });
  await scenario("Daily contract selects either session, reloads consistently, and shares exact targets", async () => {
    for (const workout of [f.run, f.bike]) {
      const visible = await canonical(a, workout.id);
      const daily = await json(`/api/v1/training/today?sessionId=${workout.id}`, a);
      assert.equal(isDailyTraining(daily), true);
      assert.equal(daily.session.id, workout.id);
      assert.equal(daily.session.sourceRevision, visible.revision);
      assert.equal(daily.sessions.length, 2);
      const segments = daily.blocks.flatMap((block: any) => block.segments);
      assert.deepEqual(segments.map((s: any) => s.endpoint), visible.steps.map((s: any) => s.endpoint));
      assert.deepEqual(segments.map((s: any) => s.target.label), visible.steps.map((s: any) => s.target.label));
      assert.equal(daily.session.calories.kcal, null);
      assert.equal((await json(`/api/v1/training/today?sessionId=${workout.id}`, a)).session.sourceRevision, visible.revision);
    }
    await request(`/api/v1/training/today?sessionId=${other.run.id}`, a, { status: 404 });
  });
  await scenario("Workout graph is private, athlete-scoped, and obeys canonical safety", async () => {
    const path = `/api/workout/graphic?sessionId=${f.run.id}`;
    await request(path, undefined, { status: 401 }); await request(path, b, { status: 404 });
    const graph = await request(path, a, { status: 200 });
    assert.match(graph.headers.get("cache-control") || "", /private.*no-store/);
    assert.match(graph.headers.get("content-type") || "", /image\/png/);
    const bytes = Buffer.from(await graph.arrayBuffer()); assert.equal(bytes.subarray(1, 4).toString("ascii"), "PNG");
    writeFileSync(`${artifactDir}/timed-workout-graph.png`, bytes);
    await db.athleteProfile.update({ where: { userId: a.id }, data: { injured: true } });
    await request(path, a, { status: 409 });
    await db.athleteProfile.update({ where: { userId: a.id }, data: { injured: false } });
    await db.dailyCheckin.delete({ where: { userId_date: { userId: a.id, date: day } } });
    await request(path, a, { status: 409 });
    await savedClearCheckin(a);
  });
  await scenario("Repeated GET downloads do not approve, complete, email or claim device receipt", async () => {
    const before = await db.workout.findUniqueOrThrow({ where: { id: f.bike.id } });
    const emailCount = await db.sentEmail.count({ where: { userId: a.id } });
    const connectors = await db.connector.findMany({ where: { userId: a.id } });
    for (let i = 0; i < 2; i++) { const response = await download(a, f.bike.id); assert.equal(response.headers.get("x-delivered-email"), "0"); }
    const after = await db.workout.findUniqueOrThrow({ where: { id: f.bike.id } });
    for (const key of ["approved", "completed", "feedbackAt", "deliveryProvider", "deliveryId"] as const) assert.deepEqual(after[key], before[key]);
    assert.equal(await db.sentEmail.count({ where: { userId: a.id } }), emailCount);
    assert.deepEqual(await db.connector.findMany({ where: { userId: a.id } }), connectors);
  });
  await scenario("Same-length edit invalidates a previously displayed revision", async () => {
    const before = await canonical(a, f.run.id);
    const original = (await db.workout.findUniqueOrThrow({ where: { id: f.run.id } })).prescription!;
    const edited = original.replace("Prepare gently", "Prepare slowly"); assert.equal(edited.length, original.length);
    await db.workout.update({ where: { id: f.run.id }, data: { prescription: edited } });
    await download(a, f.run.id, before.revision, 409);
    const after = await canonical(a, f.run.id); assert.notEqual(after.revision, before.revision);
    await download(a, f.run.id, after.revision);
    await db.workout.update({ where: { id: f.run.id }, data: { prescription: original } });
  });
  await scenario("Athlete anchor changes invalidate stale targets without altering history", async () => {
    const before = await canonical(a, f.bike.id), historical = await db.workout.findUniqueOrThrow({ where: { id: f.historical.id } });
    await db.athleteProfile.update({ where: { userId: a.id }, data: { ftp: 240 } });
    await download(a, f.bike.id, before.revision, 409);
    const after = await canonical(a, f.bike.id); assert.notEqual(after.revision, before.revision);
    assert.notDeepEqual(after.steps[1].target, before.steps[1].target);
    assert.deepEqual(await db.workout.findUniqueOrThrow({ where: { id: f.historical.id } }), historical);
  });
  await scenario("Missing session and no-check-in future sessions cannot export invented training", async () => {
    await download(a, randomUUID(), undefined, 404); await download(a, f.future.id, undefined, 409);
  });
  await scenario("Missing benchmarks retain effort/open targets and usable FIT", async () => {
    const empty = await actor("no-benchmarks", "athlete", false), fixtures = await fixture(empty); await savedClearCheckin(empty);
    const visible = await canonical(empty, fixtures.run.id); assert.ok(visible.steps.every((s: any) => s.target.type === "open"));
    const messages = decode(Buffer.from(await (await download(empty, fixtures.run.id, visible.revision)).arrayBuffer()));
    assert.ok(messages.workoutStepMesgs.every((s: any) => s.targetType === "open"));
  });
  for (const kind of ["injury", "dayOff", "zero-duration", "saved-rest", "empty", "malformed", "negative-step", "unsupported-sport"] as const) {
    await scenario(`Single and bundle export both gate ${kind}`, async () => {
      const athlete = await actor(`safety-${kind}`), fixtures = await fixture(athlete); await savedClearCheckin(athlete);
      if (kind === "injury") await db.athleteProfile.update({ where: { userId: athlete.id }, data: { injured: true } });
      else if (kind === "dayOff") await db.planDay.update({ where: { id: fixtures.today.id }, data: { dayOff: true } });
      else {
        const p = prescription();
        const data = kind === "zero-duration" ? { durationMin: 0 } : kind === "saved-rest" ? { prescription: JSON.stringify({ ...p, verdict: "rest", durationMin: 0, steps: [] }) } : kind === "empty" ? { prescription: JSON.stringify({ ...p, steps: [] }) } : kind === "malformed" ? { prescription: "{not-json" } : kind === "negative-step" ? { prescription: JSON.stringify({ ...p, steps: [{ ...p.steps[0], seconds: -20 }] }) } : { sport: "unsupported" };
        await db.workout.update({ where: { id: fixtures.run.id }, data });
      }
      const response = await download(athlete, fixtures.run.id, undefined, kind === "unsupported-sport" ? 422 : 409); assert.ok((await response.json()).error);
      const bundle = unzipStored(Buffer.from(await (await request("/api/training/export", athlete, { status: 200 })).arrayBuffer()));
      const status = bundle.get("fit-export-status.csv")?.toString("utf8"); assert.ok(status?.includes(fixtures.run.id), "Bundle must report why this session has no FIT");
      for (const [filename, bytes] of bundle) if (filename.endsWith(".fit")) { const decoded = decode(bytes); assert.notEqual(decoded.workoutMesgs[0].sport, "running", "Rejected running session leaked into bundle"); }
    });
  }
  await scenario("Swim/strength/brick/HYROX without explicit sport structure stay honestly gated", async () => {
    for (const sport of ["swim", "strength", "brick", "hyrox"]) {
      const p = prescription(sport); await db.workout.update({ where: { id: other.run.id }, data: { sport, prescription: JSON.stringify(p) } });
      const response = await download(b, other.run.id, undefined, 422); assert.match((await response.json()).error, /not yet|unvalidated|not.*validated|missing|explicit/i);
    }
  });
  await scenario("Every pilot sport has valid full daily guidance, honest capability, and matching endpoints", async () => {
    const athlete = await actor("sports", "athlete", false), fixtures = await fixture(athlete); await savedClearCheckin(athlete);
    for (const sport of ["run", "bike", "swim", "strength", "mobility", "recovery", "brick", "hyrox", "boxing"]) {
      const p: any = prescription(sport);
      if (sport === "swim") p.steps[1] = { ...p.steps[1], name: "Pool length: 25 yards", endpoint: { type: "distance", meters: 22.86 }, note: "Swim one 25-yard length, then stop and rest; no send-off timer assumed." };
      if (sport === "strength") p.steps[1] = { ...p.steps[1], name: "Controlled squat set", reps: 5, endpoint: { type: "reps", reps: 5 }, note: "Five controlled repetitions; prescribed load remains athlete-reported only." };
      if (sport === "brick") { p.steps[0].name = "Bike component"; p.steps[1].name = "Transition and run component"; }
      if (sport === "hyrox") { p.steps[0].name = "Run section"; p.steps[1].name = "Station section"; }
      await db.workout.update({ where: { id: fixtures.run.id }, data: { sport, prescription: JSON.stringify(p) } });
      const visible = await canonical(athlete, fixtures.run.id);
      const daily = await json(`/api/v1/training/today?sessionId=${fixtures.run.id}`, athlete);
      assert.equal(isDailyTraining(daily), true, `Daily contract rejected ${sport}`);
      assert.equal(daily.session.sport, sport); assert.equal(daily.session.verdict, "ready");
      assert.deepEqual(daily.blocks.flatMap((block: any) => block.segments).map((s: any) => s.endpoint), visible.steps.map((s: any) => s.endpoint));
      for (const key of ["focus", "preFuel", "postFuel", "downshift", "checkIn"]) assert.ok(daily.guidance[key].items.length, `${sport} needs ${key} guidance`);
      assert.equal(daily.session.capability.deviceTested, false);
      if (["mobility", "recovery", "boxing"].includes(sport)) {
        const bytes = Buffer.from(await (await download(athlete, fixtures.run.id, visible.revision)).arrayBuffer());
        const messages = decode(bytes); assert.equal(messages.workoutMesgs[0].sport, "generic");
        assert.deepEqual(messages.workoutStepMesgs.map((s: any) => s.durationValue / 1000), visible.steps.map((s: any) => s.endpoint.seconds));
        writeFileSync(`${artifactDir}/${sport}.fit`, bytes);
        writeFileSync(`${artifactDir}/${sport}-decoded.json`, JSON.stringify({ visible, messages }, null, 2));
      }
    }
  });
  await scenario("Untouched manual check-in preserves unknown answers and holds training", async () => {
    await json("/api/checkin", a, { body: {} });
    const saved = await db.dailyCheckin.findUniqueOrThrow({ where: { userId_date: { userId: a.id, date: day } } });
    const answers = JSON.parse(saved.answers!), adaptation = JSON.parse(saved.adaptation!);
    for (const key of ["sleep", "soreness", "motivation", "energy", "stress"]) assert.ok(answers[key] == null, `${key} must not become a default answer`);
    assert.equal(adaptation.verdict, "rest"); assert.equal(adaptation.scoreAvailable, false);
    await download(a, f.run.id, undefined, 409);
  });
  await scenario("Malformed/coerced check-in input is rejected without a new report", async () => {
    const saved = await db.dailyCheckin.findUniqueOrThrow({ where: { userId_date: { userId: a.id, date: day } } });
    await json("/api/checkin", a, { body: { ...validAnswers, sleep: true }, status: 400 });
    await json("/api/checkin", a, { body: { ...validAnswers, sick: "false" }, status: 400 });
    assert.deepEqual(await db.dailyCheckin.findUniqueOrThrow({ where: { id: saved.id } }), saved);
  });
  await scenario("Explicit device-free check-in adapts two sessions without fabricated measurements", async () => {
    const result = await json("/api/checkin", a, { body: { ...validAnswers, availableMinutes: 35 } });
    const today = await json("/api/today", a); assert.equal(today.sessions.length, 2);
    assert.ok(today.sessions.reduce((total: number, s: any) => total + s.durationMin, 0) <= 35);
    assert.equal(await db.connector.count({ where: { userId: a.id } }), 0);
    assert.equal(await db.dailyMetrics.count({ where: { userId: a.id, hrv: { not: null } } }), 0);
    assert.match(JSON.stringify(result), /not-connected/);
    assert.ok(today.sessions.every((s: any) => s.verdict === "ready"));
  });
  for (const field of ["sick", "newPain", "urgentSymptoms"] as const) await scenario(`${field} overrides training and blocks export`, async () => {
    await json("/api/checkin", a, { body: { ...validAnswers, [field]: true } });
    const today = await json("/api/today", a); assert.ok(today.sessions.every((s: any) => s.durationMin === 0 && !s.capability.available));
    await download(a, f.run.id, undefined, 409);
  });
  await scenario("Actual feedback records reported duration/RPE while preserving planned history", async () => {
    const before = await db.workout.findUniqueOrThrow({ where: { id: f.bike.id } });
    await json("/api/plan", a, { method: "PUT", body: { sessionId: f.bike.id, feedbackStatus: "partial", actualDurationMin: 18, rpe: 4, feedbackNote: "Synthetic report: stopped early for time; no pain." } });
    const after = await db.workout.findUniqueOrThrow({ where: { id: f.bike.id } });
    assert.equal(after.feedbackStatus, "partial"); assert.equal(after.actualDurationMin, 18); assert.equal(after.rpe, 4);
    assert.equal(after.durationMin, before.durationMin); assert.equal(after.originalPlan, before.originalPlan); assert.ok(after.feedbackAt);
    assert.equal((await db.workout.findUniqueOrThrow({ where: { id: f.historical.id } })).actualDurationMin, 28);
  });
  await scenario("Late reported execution changes current adaptation with dated provenance", async () => {
    const athlete = await actor("late-feedback", "athlete", false), fixtures = await fixture(athlete);
    const yesterday = new Date(day.getTime() - 86400000).toISOString().slice(0, 10);
    const before = await json(`/api/checkin?feedbackDate=${yesterday}`, athlete);
    assert.equal(before.feedbackDate, yesterday); assert.equal(before.previousSessions[0].id, fixtures.historical.id);
    await json("/api/plan", athlete, { method: "PUT", body: { sessionId: fixtures.historical.id, feedbackStatus: "partial", actualDurationMin: 12, rpe: 9, feedbackNote: "Synthetic late correction: harder than planned." } });
    await json("/api/checkin", athlete, { body: validAnswers });
    const checkin = await db.dailyCheckin.findUniqueOrThrow({ where: { userId_date: { userId: athlete.id, date: day } } });
    const adaptation = JSON.parse(checkin.adaptation!);
    assert.equal(adaptation.verdict, "trim"); assert.equal(adaptation.intensityCap, "z3");
    assert.match(JSON.stringify(adaptation), /execution|partial|reported|hard/i);
    const historical = await db.workout.findUniqueOrThrow({ where: { id: fixtures.historical.id } });
    assert.equal(historical.date.toISOString().slice(0, 10), yesterday); assert.equal(historical.durationMin, 30); assert.equal(historical.actualDurationMin, 12);
    assert.ok(historical.feedbackAt && historical.feedbackAt >= day);
  });
  await scenario("Substituted actual sport/quantities retain plan and separate observation from entry", async () => {
    const athlete = await actor("substitution", "athlete", false), fixtures = await fixture(athlete);
    await json("/api/plan", athlete, { method: "PUT", body: { sessionId: fixtures.historical.id, feedbackStatus: "substituted", actualSport: "bike", actualDurationMin: 24, rpe: 3, actualDetails: { distanceKm: 8.2, reps: null, loadKg: null } } });
    const saved = await db.workout.findUniqueOrThrow({ where: { id: fixtures.historical.id } });
    assert.equal(saved.sport, "run"); assert.equal(saved.durationMin, 30); assert.equal(saved.actualSport, "bike"); assert.equal(saved.actualDurationMin, 24);
    const details = JSON.parse(saved.actualDetails!);
    assert.equal(details.source, "athlete_report"); assert.equal(details.observedDate, fixtures.historical.date.toISOString().slice(0, 10));
    assert.equal(details.values.distanceKm, 8.2); assert.equal(details.values.reps, null); assert.ok(new Date(details.enteredAt) >= day);
    await json("/api/plan", athlete, { status: 400, method: "PUT", body: { sessionId: fixtures.historical.id, actualDetails: { reps: "five" } } });
    assert.equal((await db.workout.findUniqueOrThrow({ where: { id: fixtures.historical.id } })).actualDetails, saved.actualDetails);
  });
  await scenario("Local-yesterday feedback uses athlete timezone and preserves both selected sessions", async () => {
    const athlete = await actor("timezone", "athlete", false);
    await db.user.update({ where: { id: athlete.id }, data: { timezone: "Asia/Tokyo" } });
    const local = dayBounds("Asia/Tokyo"), yesterdayKey = addDaysKey(local.key, -1), yesterday = localDate(yesterdayKey, "Asia/Tokyo");
    const sessions = await Promise.all(["run", "bike"].map((sport, i) => db.workout.create({ data: { userId: athlete.id, date: yesterday, startTime: i ? "17:00" : "07:00", title: `Synthetic Tokyo ${sport}`, sport, type: "endurance", durationMin: 20, planned: true } })));
    const checkin = await json("/api/checkin", athlete);
    assert.equal(checkin.localToday, local.key); assert.equal(checkin.feedbackDate, yesterdayKey);
    assert.deepEqual(checkin.previousSessions.map((s: any) => s.id), sessions.map(s => s.id));
    await json("/api/plan", athlete, { method: "PUT", body: { sessionId: sessions[1].id, feedbackStatus: "skipped" } });
    const refreshed = await json("/api/checkin", athlete);
    assert.equal(refreshed.previousSessions[0].feedbackStatus, null); assert.equal(refreshed.previousSessions[1].feedbackStatus, "skipped");
    assert.equal(refreshed.previousSessions[1].actualDurationMin, null);
  });
  await scenario("Unplanned manual activity needs explicit actuals and remains athlete-scoped", async () => {
    const athlete = await actor("unplanned", "athlete", false);
    await json("/api/workouts", athlete, { status: 400, body: {} });
    await json("/api/workouts", athlete, { status: 400, body: { sport: "bike", date: day.toISOString().slice(0, 10) } });
    assert.equal(await db.workout.count({ where: { userId: athlete.id } }), 0);
    const fixtures = await fixture(athlete);
    await json("/api/checkin", athlete, { body: validAnswers });
    const beforeActivity = await canonical(athlete, fixtures.run.id);
    assert.equal(beforeActivity.verdict, "ready");
    const beforeOther = await db.workout.count({ where: { userId: b.id } });
    await json(`/api/workouts?athleteId=${b.id}`, athlete, { status: 403, body: { sport: "bike", date: day.toISOString().slice(0, 10), actualDurationMin: 12, rpe: 4 } });
    await json("/api/workouts", athlete, { status: 201, body: { sport: "bike", title: "Synthetic unplanned ride", date: day.toISOString().slice(0, 10), actualDurationMin: 12, rpe: 4 } });
    const saved = await db.workout.findFirstOrThrow({ where: { userId: athlete.id, planned: false } });
    assert.equal(saved.planned, false); assert.equal(saved.actualSport, "bike"); assert.equal(saved.actualDurationMin, 12); assert.equal(saved.rpe, 4);
    assert.equal(saved.feedbackStatus, "completed"); assert.ok(saved.feedbackAt); assert.equal(saved.avgHr, null); assert.equal(saved.avgPower, null); assert.equal(saved.calories, null);
    assert.equal(await db.workout.count({ where: { userId: b.id } }), beforeOther);
    assert.equal(await db.dailyMetrics.count({ where: { userId: athlete.id, hrv: { not: null } } }), 0);
    const afterActivity = await canonical(athlete, fixtures.run.id);
    assert.notEqual(afterActivity.revision, beforeActivity.revision);
    assert.notEqual(afterActivity.verdict, "ready", "New actual activity must invalidate the old prescription before another check-in");
    await download(athlete, fixtures.run.id, beforeActivity.revision, 409);
    await download(athlete, fixtures.run.id, afterActivity.revision, 409);
    await json("/api/checkin", athlete, { body: validAnswers });
    const today = await json("/api/today", athlete);
    assert.ok(today.sessions.reduce((total: number, s: any) => total + s.durationMin, 0) <= 48, "Reported same-day 12 minutes must count against the reviewed daily 60-minute limit");
    await json("/api/plan", athlete, { method: "PUT", body: { sessionId: fixtures.bike.id, feedbackStatus: "unknown", actualDurationMin: null } });
    assert.notEqual((await canonical(athlete, fixtures.run.id)).verdict, "ready", "Unknown new actual duration must hold training immediately");
    await json("/api/checkin", athlete, { body: validAnswers });
    const unknown = await json("/api/today", athlete);
    assert.ok(unknown.sessions.every((s: any) => s.durationMin === 0), "Unknown same-day execution must not count as zero extra load");
  });
  await scenario("Daily feedback rejects stale/foreign writes and preserves unknown actuals", async () => {
    const athlete = await actor("feedback", "athlete", false), fixtures = await fixture(athlete); await savedClearCheckin(athlete);
    const visible = await canonical(athlete, fixtures.run.id), path = `/api/v1/training/sessions/${fixtures.run.id}/completion`;
    await json(path, b, { status: 404, body: { expectedRevision: visible.revision, actual: { status: "completed", durationMinutes: 20, sessionRpe: 4 } } });
    await json(path, athlete, { status: 409, body: { expectedRevision: "outdated", actual: { status: "completed", durationMinutes: 20, sessionRpe: 4 } } });
    await json(path, athlete, { body: { expectedRevision: visible.revision, actual: { status: "unknown" } } });
    let saved = await db.workout.findUniqueOrThrow({ where: { id: fixtures.run.id } });
    assert.equal(saved.feedbackStatus, "unknown"); assert.equal(saved.completed, false); assert.equal(saved.actualDurationMin, null); assert.equal(saved.rpe, null);
    const current = await canonical(athlete, fixtures.run.id);
    assert.notEqual(current.revision, visible.revision, "Saving a real report must invalidate an older feedback snapshot");
    assert.notEqual(current.verdict, "ready", "New same-day feedback needs a fresh check-in before more training");
    await json(path, athlete, { status: 409, body: { expectedRevision: visible.revision, actual: { status: "completed", durationMinutes: 20, sessionRpe: 4 } } });
    await json(path, athlete, { body: { expectedRevision: current.revision, actual: { status: "partial", durationMinutes: 12, sessionRpe: 8, comments: "Synthetic report, stopped for available time." } } });
    saved = await db.workout.findUniqueOrThrow({ where: { id: fixtures.run.id } });
    assert.equal(saved.feedbackStatus, "partial"); assert.equal(saved.actualDurationMin, 12); assert.equal(saved.rpe, 8); assert.equal(saved.durationMin, 20);
    const reload = await json(`/api/v1/training/today?sessionId=${fixtures.run.id}`, athlete);
    assert.equal(reload.completion.actual.durationMinutes, 12); assert.equal(reload.completion.actual.sessionRpe, 8);
  });
  await scenario("Disabled Intervals blocks direct calls and preserves connections", async () => {
    await db.connector.create({ data: { userId: a.id, provider: "intervals", status: "connected", externalRef: "synthetic-fixture-only" } });
    const before = await db.connector.findMany({ where: { userId: a.id } });
    await request("/api/workout/intervals-push", a, { body: { sessionId: f.run.id }, status: 503 });
    const connectors = await json("/api/connectors", a);
    assert.equal(connectors.capabilities.intervalsConnector, false);
    assert.ok(!connectors.providers.some((provider: any) => provider.id === "intervals"));
    const today = await json("/api/today", a);
    assert.ok(!today.connectors.some((connector: any) => connector.provider === "intervals"));
    await request("/api/connectors/intervals/connect", a, { body: { athleteId: "synthetic-fixture-only", apiKey: "not-a-provider-key" }, status: 410 });
    await request("/api/connectors/sync", a, { body: { provider: "intervals" }, status: 503 });
    assert.deepEqual(await db.connector.findMany({ where: { userId: a.id } }), before);
  });
  await scenario("No provider-network attempts or email deliveries during device-free acceptance", async () => {
    assert.equal(await db.sentEmail.count({ where: { userId: { in: createdIds } } }), 0);
    const file = process.env.JMM_EGRESS_LOG;
    assert.ok(file, "Set JMM_EGRESS_LOG to the local app's outbound guard log for this assertion");
    assert.ok(existsSync(file!), "The outbound-guard log must exist; an absent guard log is not verification");
    const attempts = (existsSync(file!) ? readFileSync(file!, "utf8").trim() : "").split("\n").filter(Boolean).map(line => JSON.parse(line));
    // The dev server checks the npm dist-tag once at startup; the guard rejects it.
    // It is tooling, never an athlete-data/provider request, and remains recorded.
    assert.deepEqual(attempts.filter(attempt => attempt.host !== "registry.npmjs.org"), [], "The guarded app attempted provider networking");
  });

  if (process.env.JMM_KEEP_BROWSER_FIXTURE === "1") {
    const browser = await actor("browser", "athlete", false); await fixture(browser); browserId = browser.id;
    writeFileSync(`${artifactDir}/browser-fixture.json`, JSON.stringify({ id: browser.id, email: browser.email, password: browser.password, base: base.origin }, null, 2), { mode: 0o600 });
    console.log("Synthetic browser fixture prepared in ignored local artifact directory.");
  }
}

main().catch(error => { results.push({ name: "Fixture/test runner", status: "FAIL", detail: String(error) }); console.error(error); }).finally(async () => {
  const cleanupIds = createdIds.filter(id => id !== browserId);
  let cleanupVerified = false;
  try {
    await db.usageCounter.deleteMany({ where: { userId: { in: cleanupIds } } });
    await db.appEvent.deleteMany({ where: { userId: { in: cleanupIds } } });
    await db.user.deleteMany({ where: { id: { in: cleanupIds } } });
    assert.equal(await db.user.count({ where: { id: { in: cleanupIds } } }), 0);
    cleanupVerified = true;
  } catch (error) { results.push({ name: "Synthetic data cleanup", status: "FAIL", detail: String(error) }); }
  await db.$disconnect();
  let commit = "unknown"; try { commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch {}
  let sourceFingerprint: string | null = null;
  try {
    const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).split("\n").filter(path => /^(src\/|scripts\/|prisma\/|package(?:-lock)?\.json$|next\.config\.mjs$)/.test(path)).sort();
    const hash = createHash("sha256"); for (const path of files) hash.update(path).update("\0").update(readFileSync(path));
    sourceFingerprint = hash.digest("hex");
  } catch { /* HEAD still identifies the baseline if fingerprinting is unavailable. */ }
  writeFileSync(`${artifactDir}/report.json`, JSON.stringify({ generatedAt: new Date().toISOString(), commit, sourceFingerprint, environment: "Isolated loopback PostgreSQL/app; synthetic adult fixtures only", results, decodedArtifacts, cleanup: { createdUsers: createdIds.length, deletedUsers: cleanupVerified ? cleanupIds.length : null, verified: cleanupVerified }, browserFixtureRetained: Boolean(browserId), liveProviders: "NOT RUN; disabled and egress guarded", physicalDevices: "NOT RUN; no hardware available", deployment: "NOT RUN; not authorized" }, null, 2));
  const failures = results.filter(r => r.status === "FAIL");
  console.log(`${results.length - failures.length}/${results.length} acceptance scenarios passed.`);
  if (failures.length) process.exitCode = 1;
});
