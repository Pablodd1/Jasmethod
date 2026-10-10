/** Synthetic-only production HTTP + PostgreSQL acceptance for reviewed imports.
 * The companion launcher strips credentials and enforces loopback-only egress.
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { request as httpRequest } from "node:http";
import { hashToken } from "../src/lib/auth";

for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
  const u = new URL(process.env[key] || "");
  assert.equal(u.protocol, "postgresql:"); assert.equal(u.hostname, "127.0.0.1");
  assert.equal(u.port, "55432"); assert.equal(u.pathname, "/jmm_launch_integration_test"); assert.equal(u.search, "");
}
assert.notEqual(process.env.VERCEL_ENV, "production");
assert.ok(process.env.NODE_OPTIONS?.includes("jmm-test-egress-guard.cjs"));
const db = new PrismaClient(), base = "http://127.0.0.1:3220", ids: string[] = [];
const results: Array<{ name: string; status: "PASS" | "FAIL"; detail?: string }> = [];
type Actor = { id: string; cookie: string };
type Input = { text: string; name?: string; options?: Record<string, string>; token?: string; extra?: Record<string, string> };
const defaults = { timezone: "America/New_York", unitSystem: "metric", numberFormat: "decimal-dot" };
const csvHeader = "Activity Type,Date,Title,Distance,Time,Avg HR,Max HR,Calories,Activity ID";
const csv = (rows: string[]) => csvHeader + "\n" + rows.join("\n") + "\n";
const fixture = csv(["Running,2026-01-15 06:30:00,Synthetic morning run,5,00:30:00,140,170,300,987650001"]);
const tcx = (date: string, title = "Synthetic TCX run", seconds = 1800, meters = 5000) => `<?xml version="1.0"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="Running"><Id>${date}</Id><Lap StartTime="${date}"><TotalTimeSeconds>${seconds}</TotalTimeSeconds><DistanceMeters>${meters}</DistanceMeters><Calories>300</Calories><AverageHeartRateBpm><Value>140</Value></AverageHeartRateBpm><MaximumHeartRateBpm><Value>170</Value></MaximumHeartRateBpm><Track><Trackpoint><Time>${date}</Time><DistanceMeters>0</DistanceMeters></Trackpoint><Trackpoint><Time>${new Date(new Date(date).getTime() + seconds * 1000).toISOString()}</Time><DistanceMeters>${meters}</DistanceMeters></Trackpoint></Track></Lap><Notes>${title}</Notes></Activity></Activities></TrainingCenterDatabase>`;

async function actor(name: string, language = "en"): Promise<Actor> {
  const user = await db.user.create({ data: {
    email: `garmin-api-${name}-${randomUUID()}@example.invalid`, name: `Synthetic Garmin ${name}`,
    passwordHash: bcrypt.hashSync(randomBytes(24).toString("hex"), 10), role: "athlete", timezone: "America/New_York", language,
    onboarded: true, profile: { create: { weightKg: 64, heightCm: 170, goal: "run-only", weeklyHours: 3 } },
    reminder: { create: { emailEnabled: false, telegramEnabled: false } },
  } }); ids.push(user.id);
  const token = randomBytes(32).toString("hex");
  await db.authSession.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 7200000) } });
  return { id: user.id, cookie: `jmm_session=${token}` };
}
async function upload(kind: "preview" | "commit", a: Actor | null, input: Input, statuses: number[] = [200], suffix = "") {
  const body = new FormData();
  body.set("file", new Blob([input.text]), input.name || "Activities.csv");
  for (const [key, value] of Object.entries(input.options || defaults)) body.set(key, value);
  for (const [key, value] of Object.entries(input.extra || {})) body.set(key, value);
  if (input.token) body.set("previewToken", input.token);
  const response = await fetch(`${base}/api/import/garmin/${kind}${suffix}`, {
    method: "POST", headers: { ...(a ? { cookie: a.cookie } : {}), origin: base }, body, signal: AbortSignal.timeout(120000),
  });
  const text = await response.text();
  assert.ok(statuses.includes(response.status), `${kind}: HTTP ${response.status}: ${text}`);
  let data: any; try { data = JSON.parse(text); } catch { assert.fail(`${kind}: non-JSON response ${text.slice(0, 200)}`); }
  return data;
}
async function controlledOversizeStream(a: Actor): Promise<{ status?: number; reset?: string; sentBytes: number }> {
  return new Promise((resolve, reject) => {
    let sentBytes = 0, chunks = 0, gotResponse = false;
    const req = httpRequest(new URL(`${base}/api/import/garmin/preview`), { method: "POST", headers: { cookie: a.cookie, "Content-Type": "multipart/form-data; boundary=synthetic-limit" } }, response => {
      gotResponse = true; response.resume(); response.on("end", () => resolve({ status: response.statusCode, sentBytes })); req.end();
    });
    req.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ECONNRESET" && sentBytes > 10 * 1024 * 1024 + 65536) resolve({ reset: error.code, sentBytes });
      else reject(error);
    });
    req.setTimeout(120000, () => req.destroy(new Error("Controlled upload timed out")));
    const chunk = Buffer.alloc(65536);
    function send() {
      if (req.destroyed || gotResponse) return;
      if (chunks++ >= 170) { req.end(); return; }
      sentBytes += chunk.byteLength;
      if (req.write(chunk)) setImmediate(send); else req.once("drain", send);
    }
    setImmediate(send);
  });
}
async function rows(a: Actor) { return db.workout.findMany({ where: { userId: a.id }, orderBy: { id: "asc" } }); }
async function previewAndCommit(a: Actor, input: Input) {
  const p = await upload("preview", a, input); assert.equal(p.canCommit, true, JSON.stringify(p)); assert.ok(p.previewToken);
  const c = await upload("commit", a, { ...input, token: p.previewToken }); assert.equal(c.ok, true); return { p, c };
}
async function protectedState(a: Actor, excluded: string[] = []) {
  const where = { userId: a.id };
  return Promise.all([
    db.user.findUnique({ where: { id: a.id } }), db.athleteProfile.findUnique({ where }), db.trainingPlan.findMany({ where, include: { days: true } }),
    db.workout.findMany({ where: { ...where, id: { notIn: excluded } }, orderBy: { id: "asc" } }), db.connector.findMany({ where }),
    db.manualWorkoutEmailPreference.findUnique({ where }), db.communicationPreference.findUnique({ where }), db.reminderPref.findUnique({ where }),
    db.manualWorkoutEmailOutbox.findMany({ where }), db.sentEmail.findMany({ where }), db.syncJob.findMany({ where }), db.coachingPrompt.findMany({ where }),
    db.calendarEvent.findMany({ where }), db.dailyMetrics.findMany({ where }), db.metricObservation.findMany({ where }),
  ]);
}
async function scenario(name: string, run: () => Promise<void>) {
  try { await run(); results.push({ name, status: "PASS" }); console.log(`PASS ${name}`); }
  catch (error) { const detail = error instanceof Error ? `${error.message}${error.cause ? `; cause: ${String(error.cause)}` : ""}` : String(error); results.push({ name, status: "FAIL", detail }); console.error(`FAIL ${name}: ${detail}`); }
}

async function main() {
  const primary = await actor("preserved"), outsider = await actor("outsider");
  const plan = await db.trainingPlan.create({ data: { userId: primary.id, name: "Synthetic saved cycle", level: "amateur", distance: "run-only", weeks: 12, startDate: new Date("2026-01-01T05:00:00Z"), days: { create: { date: new Date("2026-01-15T05:00:00Z"), week: 3, dayOfWeek: 4 } } }, include: { days: true } });
  const planned = await db.workout.create({ data: { userId: primary.id, planDayId: plan.days[0].id, date: new Date("2026-01-15T05:00:00Z"), sport: "run", title: "Protected future plan", type: "endurance", durationMin: 30, planned: true, completed: false, source: "plan", prescription: "{\"synthetic\":true}", approved: true } });
  await db.workout.create({ data: { userId: primary.id, date: new Date("2025-12-01T12:00:00Z"), sport: "run", title: "Protected reported history", type: "endurance", durationMin: 40, actualDurationMin: 37, completed: true, planned: true, source: "manual", feedbackStatus: "partial", feedbackNote: "Synthetic feedback", feedbackAt: new Date("2025-12-01T13:00:00Z"), rpe: 6 } });
  await db.connector.create({ data: { userId: primary.id, provider: "garmin", status: "disconnected" } });
  await db.manualWorkoutEmailPreference.create({ data: { userId: primary.id, enabled: false, timezone: "America/New_York" } });
  await db.communicationPreference.create({ data: { userId: primary.id, timezone: "America/New_York", paused: true } });
  let importedId = "", firstToken = "";

  await scenario("Authentication rejects preview/commit and old direct Garmin imports cannot bypass review", async () => {
    await upload("preview", null, { text: fixture }, [401]); await upload("commit", null, { text: fixture }, [401]);
    for (const source of ["garmin", "tcx"]) {
      const body = new FormData(); body.set("source", source); body.set("file", new Blob([fixture]), "Activities.csv");
      const r = await fetch(`${base}/api/import`, { method: "POST", headers: { cookie: primary.cookie }, body });
      assert.ok([400, 409, 422].includes(r.status), `Legacy ${source}: ${r.status}`);
      assert.match(await r.text(), /preview|review|revis|garmin/i);
    }
    assert.equal((await rows(primary)).length, 2);
  });
  await scenario("Preview reads only, reports exact coverage and converts local timezone without matching a saved plan", async () => {
    const before = await protectedState(primary); const p = await upload("preview", primary, { text: fixture });
    assert.deepEqual(await protectedState(primary), before); assert.equal(p.format, "activities-csv"); assert.equal(p.counts.new, 1);
    assert.equal(p.coverage.completeArchive, false); assert.equal(p.coverage.accepted, 1); assert.equal(p.sample[0].date, "2026-01-15T11:30:00.000Z");
    assert.equal(p.sample[0].distanceKm, 5); assert.equal(p.sample[0].durationMin, 30); firstToken = p.previewToken;
    assert.equal(p.canCommit, true); assert.ok(typeof firstToken === "string");
  });
  await scenario("State token binds user, bytes and options; missing, malformed and other-user tokens cannot write", async () => {
    const before = await rows(primary);
    await upload("commit", primary, { text: fixture }, [400, 409]);
    await upload("commit", primary, { text: fixture, token: "forged-preview-token" }, [400, 409]);
    await upload("commit", outsider, { text: fixture, token: firstToken }, [400, 403, 409]);
    await upload("commit", primary, { text: fixture.replace(",5,", ",50,"), token: firstToken }, [409]);
    await upload("commit", primary, { text: fixture, token: firstToken, options: { ...defaults, unitSystem: "imperial" } }, [409]);
    assert.deepEqual(await rows(primary), before); assert.equal((await rows(outsider)).length, 0);
  });
  await scenario("Confirmed import changes only the reviewed completed activity; plans, history and all consent/delivery state survive", async () => {
    const before = await protectedState(primary); const c = await upload("commit", primary, { text: fixture, token: firstToken });
    assert.equal(c.ok, true); assert.equal(c.counts.new, 1);
    const added = (await rows(primary)).filter(w => w.externalId && w.source === "garmin"); assert.equal(added.length, 1);
    importedId = added[0].id; assert.equal(added[0].planned, false); assert.equal(added[0].completed, true); assert.equal(added[0].actualDurationMin, 30);
    assert.equal(added[0].distanceKm, 5); assert.equal(added[0].date.toISOString(), "2026-01-15T11:30:00.000Z"); assert.equal(added[0].insights, null);
    assert.deepEqual(await protectedState(primary, [importedId]), before);
    assert.equal((await db.workout.findUniqueOrThrow({ where: { id: planned.id } })).completed, false);
  });
  await scenario("A repeated confirm returns its durable receipt; a fresh re-import is duplicate-only and stores no extra row", async () => {
    const before = await rows(primary); const c = await upload("commit", primary, { text: fixture, token: firstToken }); assert.equal(c.ok, true);
    assert.deepEqual(await rows(primary), before);
    const p = await upload("preview", primary, { text: fixture }); assert.equal(p.counts.duplicate, 1); assert.equal(p.counts.new, 0); assert.equal(p.canCommit, false);
  });
  await scenario("Corrected measurements update a uniquely identified prior file row without changing plans or feedback", async () => {
    const before = await protectedState(primary, [importedId]); const changed = fixture.replace(",140,170,", ",145,172,");
    const { p, c } = await previewAndCommit(primary, { text: changed }); assert.equal(p.counts.updated, 1); assert.equal(c.counts.updated, 1);
    const current = await db.workout.findUniqueOrThrow({ where: { id: importedId } }); assert.equal(current.avgHr, 145); assert.equal(current.maxHr, 172);
    assert.deepEqual(await protectedState(primary, [importedId]), before);
  });
  await scenario("CSV/TCX re-import of the same event is not double-counted", async () => {
    const before = await rows(primary); const p = await upload("preview", primary, { text: tcx("2026-01-15T11:30:00Z"), name: "activity.tcx" });
    assert.equal(p.counts.new, 0); assert.ok(p.counts.duplicate + p.counts.skipped >= 1, JSON.stringify(p)); assert.deepEqual(await rows(primary), before);
  });
  await scenario("The same source activity belongs to each athlete independently; target IDs cannot change another athlete", async () => {
    const before = await rows(primary);
    await upload("preview", outsider, { text: fixture, extra: { athleteId: primary.id, userId: primary.id } }, [403]);
    const { c } = await previewAndCommit(outsider, { text: fixture });
    assert.equal(c.counts.new, 1); assert.equal((await rows(outsider)).length, 1); assert.deepEqual(await rows(primary), before);
    const p = await upload("preview", outsider, { text: fixture }, [200, 403], `?athleteId=${primary.id}`);
    assert.ok(p.error || p.counts.duplicate === 1); assert.deepEqual(await rows(primary), before);
  });
  await scenario("English miles and pool yards normalize to kilometres; ambiguous swim units never auto-convert", async () => {
    const a = await actor("imperial");
    const text = csv(["Running,2026-02-01 07:00:00,Synthetic mile run,3.1,00:30:00,140,170,300,987650101", "Pool Swimming,2026-02-02 07:00:00,Synthetic yard swim,1650,00:30:00,130,155,300,987650102"]);
    const unresolved = await upload("preview", a, { text, options: { ...defaults, unitSystem: "imperial" } });
    assert.ok(unresolved.counts.rejected >= 1 || !unresolved.canCommit, JSON.stringify(unresolved));
    const { p } = await previewAndCommit(a, { text, options: { ...defaults, unitSystem: "imperial", swimDistanceUnit: "yd" } });
    assert.equal(p.counts.new, 2);
    const records = await rows(a); const run = records.find(w => w.sport === "run")!, swim = records.find(w => w.sport === "swim")!;
    assert.ok(Math.abs(run.distanceKm! - 4.9889664) < 0.001); assert.ok(Math.abs(swim.distanceKm! - 1.50876) < 0.001);
  });
  await scenario("Spanish CSV and comma decimals import with declared metric units", async () => {
    const a = await actor("spanish", "es");
    const text = 'Tipo de actividad,Fecha,Título,Distancia,Tiempo,FC media,FC máxima,Calorías,ID de actividad\nCarrera,2026-02-03 07:00:00,Carrera sintética,"5,25",00:31:30,142,173,310,987650201\nCiclismo,2026-02-04 07:00:00,Bici sintética,"20,5",01:00:00,130,160,600,987650202\n';
    const { p } = await previewAndCommit(a, { text, options: { ...defaults, numberFormat: "decimal-comma" } }); assert.equal(p.counts.new, 2);
    assert.deepEqual((await rows(a)).map(w => w.distanceKm).sort((a, b) => a! - b!), [5.25, 20.5]);
    const receipt = await db.auditLog.findFirstOrThrow({ where: { actorId: a.id, subjectId: a.id, action: "garmin.fileImport.confirmed" } });
    const evidence = JSON.parse(receipt.after || "null");
    assert.ok(evidence.durationEvidence.some((entry: any) => entry.sourceDurationSeconds === 1890 && entry.storedDurationMin === 32));
    assert.ok(!receipt.after!.includes("Tipo de actividad,Fecha"), "Raw file content must not be retained");
  });
  await scenario("DST gaps/overlaps are rejected, explicit offsets survive, and invalid timezone cannot be guessed", async () => {
    const a = await actor("dst");
    for (const date of ["2026-03-08 02:30:00", "2026-11-01 01:30:00"]) {
      const p = await upload("preview", a, { text: csv([`Running,${date},Synthetic DST,5,00:30:00,140,170,300,987650301`]) }, [200, 400, 422]);
      assert.ok(p.error || (!p.canCommit && p.counts.rejected > 0), JSON.stringify(p));
    }
    const invalidZone = await upload("preview", a, { text: fixture, options: { ...defaults, timezone: "Mars/Olympus" } }, [200, 400, 422]);
    assert.ok(invalidZone.error || !invalidZone.canCommit);
    const { p } = await previewAndCommit(a, { text: csv(["Running,2026-03-08T03:30:00-04:00,Synthetic explicit offset,5,00:30:00,140,170,300,987650302"]) });
    assert.equal(p.sample[0].date, "2026-03-08T07:30:00.000Z");
  });
  await scenario("Reports, binary FIT/ZIP, malformed TCX and malicious XML never save or fabricate success", async () => {
    const a = await actor("unsupported");
    for (const input of [
      { name: "Reports.csv", text: "Month,Activities,Distance,Time\nJanuary,7,54,04:00:00\n" },
      { name: "activity.fit", text: "\u000e\u0010\u0000\u0000\u0000\u0000\u0000\u0000.FIT\u0000\u0000" },
      { name: "archive.zip", text: "PK\u0003\u0004synthetic archive" },
      { name: "broken.tcx", text: "<TrainingCenterDatabase><Activities><Activity Sport=\"Running\"><Id>garbage</Id>" },
      { name: "entity.tcx", text: "<!DOCTYPE TrainingCenterDatabase [<!ENTITY xxe SYSTEM 'file:///etc/passwd'>]><TrainingCenterDatabase><Activities>&xxe;</Activities></TrainingCenterDatabase>" },
      { name: "invalid.csv", text: csv(["Running,2026-02-30 06:00:00,Impossible date,-8,00:90:00,999,999,-100,987650501"]) },
    ]) {
      const p = await upload("preview", a, input, [200, 400, 413, 415, 422]);
      assert.ok(p.error || p.canCommit === false, `${input.name}: ${JSON.stringify(p)}`); assert.equal((await rows(a)).length, 0);
    }
  });
  await scenario("Known-length oversize returns413; chunked overflow returns413 or resets after the cap; invalid options never write", async () => {
    const a = await actor("limits");
    await upload("preview", a, { text: "x".repeat(10 * 1024 * 1024 + 1) }, [413]);
    const chunked = await controlledOversizeStream(a);
    assert.ok(chunked.status === 413 || chunked.reset === "ECONNRESET", JSON.stringify(chunked));
    console.log(`  Chunked overflow outcome: ${chunked.status || chunked.reset}; sent ${chunked.sentBytes} bytes`);
    // Node/Next can close its incoming stream at the cap before a 413 can flush.
    // Only this specific overflow reset is accepted; arbitrary fetch failures fail.
    assert.equal((await upload("preview", a, { text: fixture })).canCommit, true, "The server must remain healthy after rejecting the stream");
    for (const options of [{ ...defaults, unitSystem: "guess" }, { ...defaults, numberFormat: "auto" }, { ...defaults, swimDistanceUnit: "feet" }]) {
      await upload("preview", a, { text: fixture, options }, [400]);
    }
    assert.equal((await rows(a)).length, 0);
  });
  await scenario("Mixed rows report acceptance/rejection and keep walking as other; duplicates inside a file are skipped", async () => {
    const a = await actor("mixed"); const text = csv([
      "Running,2026-02-05 07:00:00,Synthetic valid,5,00:30:00,140,170,300,987650601",
      "Running,not-a-date,Synthetic invalid,5,00:30:00,140,170,300,987650602",
      "Walking,2026-02-05 09:00:00,Synthetic walk,2,00:30:00,100,120,100,987650603",
      "Running,2026-02-05 07:00:00,Synthetic valid,5,00:30:00,140,170,300,987650601",
    ]);
    const { p } = await previewAndCommit(a, { text, options: { ...defaults, distanceUnit: "km" } }); assert.equal(p.counts.new, 2); assert.ok(p.counts.rejected >= 1); assert.ok(p.counts.duplicate >= 1); assert.ok(p.diagnostics.length >= 2);
    assert.equal((await rows(a)).length, 2); assert.ok((await rows(a)).some(w => w.sport === "other"));
  });
  await scenario("Existing manual/provider history is preserved rather than enriched or counted twice", async () => {
    const a = await actor("manual");
    const stored = await db.workout.create({ data: { userId: a.id, date: new Date("2026-01-15T11:30:00Z"), sport: "run", title: "Protected manual report", type: "endurance", durationMin: 30, actualDurationMin: 30, completed: true, planned: false, source: "manual", feedbackStatus: "completed", feedbackNote: "Synthetic athlete observation", rpe: 4 } });
    const p = await upload("preview", a, { text: fixture }); assert.equal(p.counts.new, 0); assert.equal(p.counts.updated, 0); assert.equal(p.canCommit, false);
    assert.deepEqual(await rows(a), [stored]);
  });
  await scenario("Completed planned history on the athlete-local day prevents doubled load even with different real start time", async () => {
    for (const substituted of [false, true]) {
      const a = await actor(substituted ? "planned-substitute" : "planned-completed");
      const stored = await db.workout.create({ data: { userId: a.id, source: "plan", date: new Date("2026-01-15T05:00:00Z"), sport: "run", title: "Protected already reported planned session", type: "endurance", durationMin: 30, actualDurationMin: 25, completed: true, planned: true, feedbackStatus: substituted ? "substituted" : "completed", actualSport: substituted ? "bike" : null, feedbackAt: new Date("2026-01-15T15:00:00Z"), rpe: 5 } });
      const p = await upload("preview", a, { text: substituted ? fixture.replace("Running,", "Cycling,") : fixture });
      assert.equal(p.counts.new, 0); assert.equal(p.counts.updated, 0); assert.equal(p.canCommit, false); assert.ok(p.counts.skipped >= 1); assert.deepEqual(await rows(a), [stored]);
    }
    const a = await actor("planned-tcx-day-boundary");
    const stored = await db.workout.create({ data: { userId: a.id, source: "plan", date: new Date("2026-01-15T05:00:00Z"), sport: "run", title: "Protected local day report", type: "endurance", durationMin: 30, actualDurationMin: 30, completed: true, planned: true, feedbackStatus: "completed" } });
    // 02:00Z Jan16 is 21:00 Jan15 in the athlete timezone. TCX has no file-zone input.
    const p = await upload("preview", a, { text: tcx("2026-01-16T02:00:00Z"), name: "local-day.tcx", options: {} });
    assert.equal(p.counts.new, 0); assert.equal(p.canCommit, false); assert.deepEqual(await rows(a), [stored]);
  });
  await scenario("Legacy CSV identity prevents timezone correction from creating a second activity", async () => {
    const a = await actor("legacy-zone");
    const original = await db.workout.create({ data: { userId: a.id, source: "garmin", externalId: "garmin-csv:2026-01-15 06:30:00:Synthetic morning run", date: new Date("2026-01-15T06:30:00Z"), sport: "run", title: "Synthetic morning run", type: "endurance", durationMin: 30, actualDurationMin: 30, completed: true, planned: false, distanceKm: 5 } });
    const p = await upload("preview", a, { text: fixture }); assert.equal(p.counts.new, 0); assert.equal(p.counts.updated, 0); assert.equal(p.canCommit, false);
    assert.deepEqual(await rows(a), [original]);
  });
  await scenario("Concurrent confirmations are idempotent and stale candidate-state tokens cannot overwrite newer measurements", async () => {
    const a = await actor("concurrent"); const p = await upload("preview", a, { text: fixture });
    const both = await Promise.all([upload("commit", a, { text: fixture, token: p.previewToken }), upload("commit", a, { text: fixture, token: p.previewToken })]);
    assert.ok(both.every(c => c.ok)); assert.equal((await rows(a)).length, 1);
    const changed = fixture.replace(",140,170,", ",143,171,"); const pending = await upload("preview", a, { text: changed }); assert.equal(pending.counts.updated, 1);
    const current = (await rows(a))[0]; await db.workout.update({ where: { id: current.id }, data: { avgHr: 146 } });
    await upload("commit", a, { text: changed, token: pending.previewToken }, [409]);
    assert.equal((await rows(a))[0].avgHr, 146);
  });
  await scenario("Explicit athlete feedback on an imported row is protected from a correcting file", async () => {
    const a = await actor("reported-import"); await previewAndCommit(a, { text: fixture });
    const record = (await rows(a))[0];
    const protectedRecord = await db.workout.update({ where: { id: record.id }, data: { feedbackStatus: "partial", actualDurationMin: 22, feedbackNote: "Synthetic reported shortened session", feedbackAt: new Date(), rpe: 7 } });
    const changed = fixture.replace(",140,170,", ",149,178,"); const p = await upload("preview", a, { text: changed });
    assert.equal(p.counts.updated, 0); assert.equal(p.canCommit, false); assert.deepEqual(await rows(a), [protectedRecord]);
  });
  await scenario("Malformed multipart requests are client errors and cannot mutate history", async () => {
    const before = await rows(primary);
    const r = await fetch(`${base}/api/import/garmin/preview`, { method: "POST", headers: { cookie: primary.cookie, "Content-Type": "application/json" }, body: "{}" });
    assert.ok([400, 415].includes(r.status), `Malformed multipart returned ${r.status}`); assert.deepEqual(await rows(primary), before);
  });
  await scenario("Recent confirmed history sends no messages, schedules no jobs and does not change opted-in settings", async () => {
    const a = await actor("recent");
    await db.reminderPref.update({ where: { userId: a.id }, data: { emailEnabled: true, telegramEnabled: true, telegramChatId: "synthetic-garmin-only" } });
    const before = await protectedState(a); const timestamp = new Date(Date.now() - 3600000).toISOString();
    await previewAndCommit(a, { text: csv([`Running,${timestamp},Synthetic recent,5,00:30:00,140,170,300,987650901`]) });
    const saved = await rows(a); assert.equal(saved.length, 1); assert.equal(saved[0].insights, null); assert.equal(saved[0].deliveryId, null);
    assert.deepEqual(await protectedState(a, [saved[0].id]), before);
  });
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  // Synthetic credentials remain in memory only, and every fixture user is removed.
  await db.user.deleteMany({ where: { id: { in: ids } } }); await db.$disconnect();
  mkdirSync(".local/jmm-garmin-import", { recursive: true }); writeFileSync(".local/jmm-garmin-import/api-report.json", JSON.stringify(results, null, 2) + "\n");
  console.log(`${results.filter(r => r.status === "PASS").length}/${results.length} Garmin API scenarios passed`);
  if (results.some(r => r.status === "FAIL")) process.exitCode = 1;
});
