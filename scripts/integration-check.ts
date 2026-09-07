import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID, createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { Decoder, Stream } from "@garmin/fitsdk";
import { dayBounds, addDaysKey, localDate } from "../src/lib/dates";
const db = new PrismaClient(),
  base = process.env.TEST_BASE_URL || "http://localhost:3000";
const database = new URL(process.env.DATABASE_URL || "");
if (
  !["localhost", "127.0.0.1"].includes(database.hostname) ||
  !/test|integration|ci/.test(database.pathname) ||
  !["localhost", "127.0.0.1"].includes(new URL(base).hostname)
)
  throw new Error(
    "Integration checks require an isolated localhost test database and server.",
  );
const id = randomUUID().slice(0, 8),
  password = `Review-only-${id}-2026!`,
  created: string[] = [],
  timings: any[] = [];
async function request(
  path: string,
  cookie = "",
  method = "GET",
  body?: any,
  status = 200,
) {
  const start = performance.now();
  const r = await fetch(base + path, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body && !(body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
    },
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const text = await r.text();
  assert.equal(r.status, status, `${method} ${path}: ${text.slice(0, 500)}`);
  timings.push({ path, ms: Math.round(performance.now() - start), status });
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { data, response: r };
}
async function account(role: string, label: string) {
  const email = `integration-${id}-${label}@example.invalid`;
  const user = await db.user.create({
    data: {
      email,
      name: label === "admin" ? "Jasmel · Local Test" : `Test Athlete ${label}`,
      role,
      language: "en",
      passwordHash: await bcrypt.hash(password, 10),
      profile: {
        create: { lthr: 160, ftp: 200, weeklyHours: 6, goal: "olympic" },
      },
    },
  });
  created.push(user.id);
  const login = await request("/api/auth/login", "", "POST", {
    email,
    password,
  });
  const cookie = login.response.headers.get("set-cookie")!.split(";")[0];
  return { ...user, cookie };
}
async function main() {
  const admin = await account("admin", "admin"),
    a = await account("athlete", "one"),
    b = await account("athlete", "two");
  const day = dayBounds(a.timezone),
    tomorrow = addDaysKey(day.key, 1);
  await request("/api/admin", "", "GET", undefined, 401);
  await request("/api/admin", a.cookie, "GET", undefined, 403);
  await request(`/api/admin/athletes/${a.id}`, b.cookie, "GET", undefined, 403);
  await request(
    `/api/profile?athleteId=${a.id}`,
    b.cookie,
    "GET",
    undefined,
    403,
  );
  const list = (await request("/api/admin", admin.cookie)).data;
  assert.ok(list.rows.some((u: any) => u.id === admin.id));
  assert.ok(list.count >= 3);
  await request(`/api/profile?athleteId=${a.id}`, admin.cookie, "PUT", {
    lthr: 165,
    vo2max: 55,
  });
  assert.equal(
    (await request("/api/profile", a.cookie)).data.profile.lthr,
    165,
  );
  await request(
    `/api/profile?athleteId=${a.id}`,
    admin.cookie,
    "PUT",
    { ftp: -10 },
    400,
  );
  await request("/api/profile", a.cookie, "PUT", { role: "admin" }, 400);
  await request(`/api/plan/generate?athleteId=${a.id}`, admin.cookie, "POST", {
    distance: "olympic",
    weeks: 4,
    startDate: day.key,
  });
  const active = await db.trainingPlan.findFirstOrThrow({
    where: { userId: a.id, status: "active" },
    include: {
      days: { orderBy: { date: "asc" }, include: { sessions: true } },
    },
  });
  const firstDay = active.days.find(
    (d) => d.date.getTime() === day.start.getTime(),
  )!;
  assert.ok(firstDay);
  const w = await db.workout.create({
    data: {
      userId: a.id,
      planDayId: firstDay.id,
      date: day.start,
      title: "Integration threshold 🏁",
      sport: "bike",
      type: "threshold",
      durationMin: 60,
      intensity: "z4",
      source: "plan",
      planned: true,
      startTime: "10:00",
    },
  });
  await request(
    "/api/plan",
    b.cookie,
    "PUT",
    { sessionId: w.id, title: "Intrusion" },
    404,
  );
  const low = { sleep: 2, motivation: 2, energy: 2, stress: 4, soreness: 4 };
  const low1 = (await request("/api/checkin", a.cookie, "POST", low)).data;
  const low2 = (await request("/api/checkin", a.cookie, "POST", low)).data;
  assert.deepEqual(
    low1.prescriptions.map((p: any) => p.durationMin),
    low2.prescriptions.map((p: any) => p.durationMin),
    "Repeated check-in must not compound reductions",
  );
  assert.ok(low2.prescriptions.length >= 2);
  const good = { sleep: 5, motivation: 5, energy: 5, stress: 1, soreness: 1 };
  await request("/api/checkin", a.cookie, "POST", good);
  assert.equal(
    (await db.workout.findUniqueOrThrow({ where: { id: w.id } })).durationMin,
    60,
  );
  await request("/api/plan", a.cookie, "PUT", {
    planDayId: firstDay.id,
    dayOff: true,
  });
  assert.ok(
    (await request("/api/today", a.cookie)).data.sessions.every(
      (s: any) => s.durationMin === 0,
    ),
  );
  await request(
    `/api/workout/approve?sessionId=${w.id}`,
    a.cookie,
    "POST",
    undefined,
    400,
  );
  await request("/api/plan", a.cookie, "PUT", {
    planDayId: firstDay.id,
    dayOff: false,
  });
  const variation = (
    await request("/api/workout/regenerate", a.cookie, "POST", {
      id: w.id,
      mode: "variant",
    })
  ).data.workout;
  assert.ok(JSON.parse(variation.prescription).steps.length > 3);
  const fit = await fetch(`${base}/api/workout/approve?sessionId=${w.id}`, {
    method: "POST",
    headers: { cookie: a.cookie },
  });
  assert.equal(fit.status, 200);
  const decoder = new Decoder(
    Stream.fromByteArray(new Uint8Array(await fit.arrayBuffer())),
  );
  assert.ok(decoder.checkIntegrity());
  assert.deepEqual(decoder.read().errors, []);
  await request("/api/checkin", a.cookie, "DELETE");
  assert.equal(
    (await db.workout.findUniqueOrThrow({ where: { id: w.id } })).durationMin,
    60,
  );
  await request(`/api/plan?athleteId=${a.id}`, admin.cookie, "PUT", {
    sessionId: w.id,
    date: tomorrow,
    durationMin: 45,
    reason: "Integration coaching edit",
  });
  assert.equal(
    (
      await db.planDay.findUniqueOrThrow({ where: { id: firstDay.id } })
    ).date.getTime(),
    day.start.getTime(),
  );
  assert.equal(
    (
      await db.workout.findUniqueOrThrow({ where: { id: w.id } })
    ).date.getTime(),
    localDate(tomorrow, a.timezone).getTime(),
  );
  await request(`/api/plan?athleteId=${a.id}`, admin.cookie, "PUT", {
    sessionId: w.id,
    date: day.key,
  });
  await request("/api/plan", a.cookie, "PUT", {
    sessionId: w.id,
    feedbackStatus: "partial",
    actualDurationMin: 25,
    rpe: 8,
    feedbackNote: "Limited time",
  });
  await request("/api/sleep", a.cookie, "POST", {
    date: day.key,
    hours: 7.5,
    quality: 8,
  });
  const metric = await db.dailyMetrics.findUniqueOrThrow({
    where: { userId_date: { userId: a.id, date: day.start } },
  });
  assert.equal(metric.sleepHours, 7.5);
  await request("/api/metrics", a.cookie, "POST", {
    date: day.key,
    hrv: 48,
    restingHr: 51,
  });
  await request("/api/metrics", a.cookie, "POST", { hrv: -1 }, 400);
  const upload = () => {
    const f = new FormData();
    f.set("source", "apple");
    f.set(
      "file",
      new Blob(
        [
          `<HealthData><Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" value="41" startDate="${day.key} 08:00:00 -0400"/><Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30" durationUnit="min" startDate="${day.key} 11:00:00 -0400" endDate="${day.key} 11:30:00 -0400"/></HealthData>`,
        ],
        { type: "text/xml" },
      ),
      "export.xml",
    );
    return f;
  };
  assert.equal(
    (await request("/api/import", a.cookie, "POST", upload())).data
      .workoutsImported,
    1,
  );
  assert.equal(
    (await request("/api/import", a.cookie, "POST", upload())).data
      .workoutsImported,
    0,
  );
  assert.equal(
    (
      await db.dailyMetrics.findUniqueOrThrow({
        where: { userId_date: { userId: a.id, date: day.start } },
      })
    ).hrvType,
    "sdnn",
  );
  await db.connector.create({
    data: {
      userId: a.id,
      provider: "strava",
      status: "connected",
      tokenEnc: "integration-token-do-not-expose",
      refreshEnc: "integration-refresh",
    },
  });
  const connectors = (await request("/api/connectors", a.cookie)).data;
  assert.ok(
    !JSON.stringify(connectors).includes("integration-token") &&
      !JSON.stringify(connectors).includes("tokenEnc"),
  );
  const oauth = await request(
    "/api/connectors/strava/callback?code=test&state=invalid",
    a.cookie,
    "GET",
    undefined,
    307,
  );
  assert.ok(oauth.response.headers.get("location")?.includes("invalid_state"));
  await request(
    "/api/cron/sync",
    "",
    "GET",
    undefined,
    process.env.CRON_SECRET ? 401 : 503,
  );
  await request(
    "/api/cron/reminders",
    "",
    "GET",
    undefined,
    process.env.CRON_SECRET ? 401 : 503,
  );
  await request(`/api/plan/generate?athleteId=${a.id}`, admin.cookie, "POST", {
    distance: "olympic",
    weeks: 4,
    startDate: day.key,
  });
  assert.equal(
    await db.trainingPlan.count({ where: { userId: a.id, status: "active" } }),
    1,
  );
  assert.ok(
    await db.workout.findUnique({ where: { id: w.id } }),
    "Completed history survives plan replacement",
  );
  const overview = (await request(`/api/admin/athletes/${a.id}`, admin.cookie))
    .data;
  assert.ok(
    overview.audit.some(
      (x: any) => x.action === "workout.update" && x.actor.name === admin.name,
    ),
  );
  assert.ok(
    overview.analysis.insights.some((x: any) => x.title.includes("partial")),
  );
  assert.equal(await db.workout.count({ where: { userId: b.id } }), 0);
  // Protocol assignment uses an isolated athlete and existing session identity.
  const c = await account("athlete", "protocol");
  await db.athleteProfile.update({
    where: { userId: c.id },
    data: { experience: "advanced", birthYear: 1990 },
  });
  const protocolPlan = await db.trainingPlan.create({
    data: {
      userId: c.id,
      name: "Protocol integration",
      level: "advanced",
      distance: "cycle",
      weeks: 4,
      startDate: day.start,
      raceDate: localDate(addDaysKey(day.key, 28), c.timezone),
      days: {
        create: { date: day.start, week: 1, dayOfWeek: 1, focus: "bike" },
      },
    },
    include: { days: true },
  });
  const protocolSession = await db.workout.create({
    data: {
      userId: c.id,
      planDayId: protocolPlan.days[0].id,
      date: day.start,
      sport: "bike",
      title: "Protocol slot",
      type: "endurance",
      intensity: "z2",
      durationMin: 60,
      planned: true,
    },
  });
  const history = await db.workout.create({
    data: {
      userId: c.id,
      date: localDate(addDaysKey(day.key, -4), c.timezone),
      sport: "run",
      title: "Retained imported record",
      type: "endurance",
      durationMin: 30,
      completed: true,
      planned: false,
      source: "garmin",
    },
  });
  const protocolPath = `/api/protocols?athleteId=${c.id}`;
  const protocolRequest = {
    mode: "preview",
    sessionId: protocolSession.id,
    protocolId: "aerobic-power",
  };
  await request("/api/protocols", "", "GET", undefined, 401);
  await request(protocolPath, b.cookie, "GET", undefined, 403);
  await request("/api/protocols", b.cookie, "POST", protocolRequest, 404);
  const catalog = (await request(protocolPath, admin.cookie)).data;
  assert.equal(catalog.protocols.length, 8);
  assert.equal(catalog.athlete.id, c.id);
  assert.equal(catalog.sessions.length, 1);
  const preview = (
    await request(protocolPath, admin.cookie, "POST", protocolRequest)
  ).data;
  assert.equal(preview.preview.durationMin, 40);
  assert.equal(
    preview.preview.verdict,
    "planned",
    "no check-in cannot imply verified readiness",
  );
  assert.equal(preview.blocks.length, 0);
  assert.equal(
    (await db.workout.findUniqueOrThrow({ where: { id: protocolSession.id } }))
      .title,
    "Protocol slot",
    "preview never changes a workout",
  );
  await request(protocolPath, admin.cookie, "POST", {
    ...protocolRequest,
    mode: "apply",
    previewToken: preview.previewToken,
  });
  const assigned = await db.workout.findUniqueOrThrow({
    where: { id: protocolSession.id },
  });
  assert.equal(assigned.type, "protocol:aerobic-power");
  assert.equal(
    JSON.parse(assigned.prescription!).steps.filter(
      (s: any) => s.phase === "active",
    ).length,
    4,
  );
  assert.equal(await db.workout.count({ where: { userId: c.id } }), 2);
  assert.deepEqual(
    await db.workout.findUniqueOrThrow({ where: { id: history.id } }),
    history,
  );
  assert.equal(
    (await request("/api/auth/me", admin.cookie)).data.user.id,
    admin.id,
  );
  await request(
    protocolPath,
    admin.cookie,
    "POST",
    { ...protocolRequest, mode: "apply", previewToken: preview.previewToken },
    409,
  );
  await request(
    "/api/workout/regenerate",
    c.cookie,
    "POST",
    { id: protocolSession.id },
    400,
  );
  await request("/api/checkin", c.cookie, "POST", good);
  const protocolToday = (await request("/api/today", c.cookie)).data
    .sessions[0];
  assert.equal(
    protocolToday.prescription.steps.filter((s: any) => s.phase === "active")
      .length,
    4,
  );
  const protocolFit = await fetch(
    `${base}/api/workout/approve?sessionId=${protocolSession.id}`,
    { method: "POST", headers: { cookie: c.cookie } },
  );
  assert.equal(protocolFit.status, 200);
  const protocolDecoder = new Decoder(
    Stream.fromByteArray(new Uint8Array(await protocolFit.arrayBuffer())),
  );
  assert.equal(protocolDecoder.checkIntegrity(), true);
  const decodedProtocol = protocolDecoder.read();
  assert.deepEqual(decodedProtocol.errors, []);
  assert.equal(
    (decodedProtocol.messages as any).workoutStepMesgs.filter(
      (s: any) => s.intensity === "active",
    ).length,
    4,
  );
  await request("/api/checkin", c.cookie, "POST", low);
  assert.equal(
    (await request("/api/today", c.cookie)).data.sessions[0].intensity,
    "z1",
  );
  await request(protocolPath, admin.cookie, "POST", protocolRequest, 400);
  await request("/api/checkin", c.cookie, "DELETE");
  assert.equal(
    (
      await request("/api/today", c.cookie)
    ).data.sessions[0].prescription.steps.filter(
      (s: any) => s.phase === "active",
    ).length,
    4,
  );
  const beforeRename = await db.workout.findUniqueOrThrow({
    where: { id: protocolSession.id },
  });
  await request(`/api/plan?athleteId=${c.id}`, admin.cookie, "PUT", {
    sessionId: protocolSession.id,
    title: "Controlled interval practice",
    durationMin: beforeRename.durationMin,
    intensity: beforeRename.intensity,
    sport: beforeRename.sport,
    notes: beforeRename.notes,
    startTime: beforeRename.startTime,
  });
  assert.equal(
    (await request("/api/today", c.cookie)).data.sessions[0].title,
    "Controlled interval practice",
  );
  assert.ok(
    JSON.parse(
      (
        await db.workout.findUniqueOrThrow({
          where: { id: protocolSession.id },
        })
      ).originalPlan!,
    ).protocol,
  );
  await request(`/api/plan?athleteId=${c.id}`, admin.cookie, "PUT", {
    sessionId: protocolSession.id,
    durationMin: 35,
  });
  const manuallyEdited = await db.workout.findUniqueOrThrow({
    where: { id: protocolSession.id },
  });
  assert.equal(JSON.parse(manuallyEdited.originalPlan!).protocol, undefined);
  assert.equal(manuallyEdited.type, "interval");
  await db.planDay.update({
    where: { id: protocolPlan.days[0].id },
    data: { dayOff: true },
  });
  await request(protocolPath, admin.cookie, "POST", protocolRequest, 400);
  await db.planDay.update({
    where: { id: protocolPlan.days[0].id },
    data: { dayOff: false },
  });
  await db.athleteProfile.update({
    where: { userId: c.id },
    data: { injured: true },
  });
  await request(protocolPath, admin.cookie, "POST", protocolRequest, 400);
  await db.athleteProfile.update({
    where: { userId: c.id },
    data: { injured: false },
  });
  await db.workout.update({
    where: { id: protocolSession.id },
    data: { completed: true },
  });
  await request(protocolPath, admin.cookie, "POST", protocolRequest, 400);
  assert.ok(
    await db.auditLog.findFirst({
      where: {
        actorId: admin.id,
        subjectId: c.id,
        action: "workout.protocol",
        entityId: protocolSession.id,
      },
    }),
  );
  for (const path of [
    "/today",
    "/admin",
    `/admin/athletes/${a.id}`,
    "/calendar",
    "/checkin",
    "/settings",
    "/connectors",
  ])
    await request(path, admin.cookie);
  // Use only synthetic fixtures; retained data is for local browser verification.
  await db.connector.deleteMany({ where: { userId: a.id } });
  if (process.env.KEEP_TEST_DATA === "1")
    writeFileSync(
      process.env.TEST_FIXTURES_PATH || "../work/integration-fixtures.json",
      JSON.stringify(
        {
          admin: { id: admin.id, email: admin.email, password },
          athlete: { id: a.id, email: a.email, password },
          timings,
        },
        null,
        2,
      ),
    );
  console.log(
    `Integration passed: ${timings.length} HTTP assertions, account isolation, coach edits, repeated adaptations, date moves, imports and valid FIT export.`,
  );
  console.log(
    JSON.stringify(
      timings.filter((t) => ["/api/today", "/api/admin"].includes(t.path)),
    ),
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (process.env.KEEP_TEST_DATA !== "1")
      await db.user.deleteMany({ where: { id: { in: created } } });
    await db.$disconnect();
  });
