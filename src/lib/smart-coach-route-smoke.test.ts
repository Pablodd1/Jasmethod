/**
 * Route-level smoke test with an IN-MEMORY fake database: the REAL /api/import, /api/activity-streams and
 * /api/activity-analysis handlers run against the REAL parsers, policy and analysis code, for two synthetic athletes.
 *
 * What this proves: request parsing, authentication scoping, consent/flag/provenance gates, isolation between
 * athletes, deletion, error handling and response shapes. What it does NOT prove: anything that needs PostgreSQL
 * (transactions, advisory locks, migrations, query planning) or the Prisma client itself. Those remain a separate,
 * database-backed check. No network, no real accounts, no secrets; all data is synthetic.
 */
import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";
import Module from "node:module";
import { Encoder, Profile } from "@garmin/fitsdk";

type Row = Record<string, any>;
const M = Module as any;
const originalLoad = M._load;
const tables: Record<string, Row[]> = { workout: [], activityStream: [], athleteProfile: [], auditLog: [], benchmarkTest: [] };
let seq = 0;
let currentUser: Row | null = null;
let failStreamWrites = false;

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, want]) => {
    const have = row[key];
    if (want && typeof want === "object" && !(want instanceof Date) && !Array.isArray(want)) {
      return Object.entries(want as Row).every(([op, v]) => {
        const a = have instanceof Date ? have.getTime() : have, b = v instanceof Date ? v.getTime() : v;
        if (op === "gt") return a > b; if (op === "gte") return a >= b; if (op === "lt") return a < b; if (op === "lte") return a <= b;
        if (op === "in") return (v as unknown[]).includes(have); if (op === "not") return have !== v;
        if (op === "startsWith") return String(have).startsWith(String(v));
        throw new Error(`fake db: unsupported operator ${op}`);
      });
    }
    return have === want;
  });
}
function delegate(name: string) {
  const rows = () => tables[name];
  return {
    findFirst: async ({ where }: Row = {}) => rows().find(r => matches(r, where)) ?? null,
    findUnique: async ({ where }: Row) => rows().find(r => matches(r, where)) ?? null,
    findMany: async ({ where, take }: Row = {}) => rows().filter(r => matches(r, where)).slice(0, take ?? 1e9),
    deleteMany: async ({ where }: Row = {}) => { const before = rows().length; tables[name] = rows().filter(r => !matches(r, where)); return { count: before - tables[name].length }; },
    upsert: async ({ where, create, update }: Row) => {
      if (name === "activityStream" && failStreamWrites) throw new Error("relation \"ActivityStream\" does not exist");
      const hit = rows().find(r => matches(r, where));
      if (hit) Object.assign(hit, update); else rows().push({ id: `${name}-${++seq}`, ...create });
    },
  };
}
const fakePrisma = new Proxy({}, { get: (_t, key: string) => (key in tables ? delegate(key) : (() => { throw new Error(`fake db: no model ${key}`); })) });
const fakeStore = {
  storeActivity: async (userId: string, _tz: string, a: Row) => {
    const hit = tables.workout.find(w => w.userId === userId && w.source === a.source && w.externalId === a.externalId);
    if (hit) { Object.assign(hit, a); return false; }
    tables.workout.push({ id: `w${++seq}`, userId, planned: false, completed: true, ...a });
    return true;
  },
};

type Handler = (req: Request) => Promise<Response>;
let importPost: Handler, streamsGet: Handler, streamsDelete: Handler, analysisGet: Handler;
const A = { id: "athlete-a", language: "en", timezone: "America/New_York" };
const B = { id: "athlete-b", language: "es", timezone: "Europe/Madrid" };
const asUser = (u: Row | null) => { currentUser = u; };

before(async () => {
  (globalThis as any).prisma = fakePrisma;
  M._load = function (request: string, parent: unknown, isMain: boolean) {
    let file = "";
    try { file = M._resolveFilename(request, parent, isMain); } catch { /* builtin or missing: fall through */ }
    if (file.endsWith("/src/lib/auth.ts")) return { getCurrentUser: async () => currentUser };
    if (file.endsWith("/src/lib/activity-store.ts")) return fakeStore;
    if (file.endsWith("/src/lib/sync.ts")) return { persistDeviceDay: async () => {} };
    return originalLoad.apply(this, arguments);
  };
  importPost = (await import("../app/api/import/route")).POST as Handler;
  const streams = await import("../app/api/activity-streams/route");
  streamsGet = streams.GET as unknown as Handler; streamsDelete = streams.DELETE as Handler;
  analysisGet = (await import("../app/api/activity-analysis/route")).GET as Handler;
});
beforeEach(() => {
  for (const key of Object.keys(tables)) tables[key] = [];
  failStreamWrites = false; asUser(null);
  process.env.ENABLE_ACTIVITY_STREAMS = "1";
  delete process.env.ACTIVITY_STREAM_RETENTION_DAYS;
  const now = Date.now();
  tables.athleteProfile.push({ userId: A.id, ftp: 250 });
  tables.auditLog.push({ subjectId: A.id, action: "baseline.fromTest", entityId: "test-ftp", createdAt: new Date(now) });
  tables.benchmarkTest.push({ id: "test-ftp", userId: A.id, type: "ftp", result: 250, completed: true, skipped: false, date: new Date(now - 10 * 86_400_000) });
});

// ----------------------------------------------------------------- synthetic files
const T0 = Date.parse("2026-10-18T11:30:00Z");
const iso = (s: number) => new Date(T0 + s * 1000).toISOString().replace(".000Z", "Z");
/** 45-minute steady ride: 200 W; HR 140 bpm in the first half, 147 bpm in the second (analytic decoupling 1 − 140/147). */
function rideTcx(opts: { creator?: string; power?: boolean; seconds?: number } = {}): string {
  const seconds = opts.seconds ?? 2700, withPower = opts.power !== false;
  const points = Array.from({ length: seconds + 1 }, (_, i) => `<Trackpoint><Time>${iso(i)}</Time><DistanceMeters>${i * 8}</DistanceMeters><HeartRateBpm><Value>${i < seconds / 2 ? 140 : 147}</Value></HeartRateBpm>${withPower ? `<Extensions><ns3:TPX xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2"><ns3:Watts>200</ns3:Watts></ns3:TPX></Extensions>` : ""}</Trackpoint>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="Biking"><Id>${iso(0)}</Id><Lap StartTime="${iso(0)}"><TotalTimeSeconds>${seconds}</TotalTimeSeconds><Calories>600</Calories><Track>${points}</Track></Lap></Activity></Activities><Author xsi:type="Application_t" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Name>${opts.creator ?? "Edge 840"}</Name></Author></TrainingCenterDatabase>`;
}
function fitRide(seconds = 600): Uint8Array {
  const encoder = new Encoder(), start = new Date(T0);
  encoder.onMesg(Profile.MesgNum.FILE_ID, { type: "activity", manufacturer: "development", product: 7, serialNumber: 99, timeCreated: start } as any);
  for (let i = 0; i <= seconds; i++) encoder.onMesg(Profile.MesgNum.RECORD, { timestamp: new Date(T0 + i * 1000), heartRate: 130, power: 180 } as any);
  encoder.onMesg(Profile.MesgNum.SESSION, { timestamp: new Date(T0 + seconds * 1000), startTime: start, totalElapsedTime: seconds, totalTimerTime: seconds, sport: "cycling", subSport: "generic", avgHeartRate: 130, maxHeartRate: 131, avgPower: 180 } as any);
  encoder.onMesg(Profile.MesgNum.ACTIVITY, { timestamp: new Date(T0 + seconds * 1000), numSessions: 1, type: "manual", event: "activity", eventType: "stop" } as any);
  return encoder.close();
}
function upload(source: string, content: string | Uint8Array, opts: { consent?: boolean; name?: string } = {}): Request {
  const form = new FormData();
  form.set("source", source);
  form.set("file", new File([content as BlobPart], opts.name ?? "activity.tcx"));
  if (opts.consent) form.set("streamConsent", "1");
  return new Request("http://localhost/api/import", { method: "POST", body: form });
}
const get = (path: string) => new Request(`http://localhost${path}`);
const json = async (r: Response) => ({ status: r.status, body: await r.json() as Row });
const near = (v: unknown, expected: number, tol: number) => { assert.equal(typeof v, "number"); assert.ok(Math.abs((v as number) - expected) <= tol, `${v} vs ${expected}`); };

// ----------------------------------------------------------------- scenarios
test("authentication: every route refuses an anonymous caller", async () => {
  assert.equal((await importPost(upload("garmin", rideTcx()))).status, 401);
  assert.equal((await streamsGet(get("/api/activity-streams"))).status, 401);
  assert.equal((await streamsDelete(new Request("http://localhost/api/activity-streams?all=1", { method: "DELETE" }))).status, 401);
  assert.equal((await analysisGet(get("/api/activity-analysis?workoutId=x"))).status, 401);
});

test("athlete A uploads a consented ride: summary stored with provenance, streams stored, analysis matches the hand-computed values", async () => {
  asUser(A);
  const { status, body } = await json(await importPost(upload("garmin", rideTcx(), { consent: true })));
  assert.equal(status, 200);
  assert.equal(body.workoutsImported, 1);
  assert.equal(body.streams.stored, 1);
  assert.equal(tables.workout.length, 1);
  assert.equal(tables.workout[0].source, "garmin");          // provenance preserved
  assert.equal(tables.workout[0].userId, A.id);
  assert.equal(tables.activityStream.length, 1);
  assert.ok(!/lat|lon|gps|position/i.test(tables.activityStream[0].data), "no location data in storage");
  const retentionMs = tables.activityStream[0].expiresAt.getTime() - tables.activityStream[0].consentAt.getTime();
  assert.equal(retentionMs, 180 * 86_400_000);

  const id = body.streams.workoutIds[0];
  const analysis = await json(await analysisGet(get(`/api/activity-analysis?workoutId=${id}`)));
  assert.equal(analysis.status, 200);
  assert.equal(analysis.body.ok, true);
  near(analysis.body.power.avgW, 200, 0.5);
  near(analysis.body.power.npW, 200, 1);
  near(analysis.body.power.intensityFactor, 0.8, 0.005);   // FTP 250 comes from the validated test fixture
  near(analysis.body.power.tss, 48, 0.5);                  // 2700 s × 200 W × 0.8 / (250 W × 3600) × 100
  near(analysis.body.decoupling.percent, 4.76, 0.1);       // 1 − 140/147
  assert.equal(analysis.body.hr.secondsInZone, null, "no validated LTHR → no HR zones, not guessed");
  assert.equal(analysis.body.anchors.ftpW, 250);
});

test("isolation: athlete B cannot list, analyse or delete athlete A's data; A's data is intact afterwards", async () => {
  asUser(A);
  const id = (await json(await importPost(upload("garmin", rideTcx(), { consent: true })))).body.streams.workoutIds[0];

  asUser(B);
  assert.deepEqual((await json(await streamsGet(get("/api/activity-streams")))).body.workoutIds, []);
  assert.equal((await analysisGet(get(`/api/activity-analysis?workoutId=${id}`))).status, 404);
  assert.equal((await json(await streamsDelete(new Request(`http://localhost/api/activity-streams?workoutId=${id}`, { method: "DELETE" })))).body.deleted, 0);
  assert.equal((await json(await streamsDelete(new Request("http://localhost/api/activity-streams?all=1", { method: "DELETE" })))).body.deleted, 0);

  asUser(A);
  assert.deepEqual((await json(await streamsGet(get("/api/activity-streams")))).body.workoutIds, [id]);
  assert.equal((await json(await analysisGet(get(`/api/activity-analysis?workoutId=${id}`)))).body.ok, true);
});

test("B's own upload lands only in B's records (two consenting athletes, no cross-visibility)", async () => {
  asUser(A); await importPost(upload("garmin", rideTcx(), { consent: true }));
  asUser(B); const b = await json(await importPost(upload("garmin", rideTcx({ seconds: 900 }), { consent: true })));
  assert.equal(b.body.workoutsImported, 1);
  assert.equal(tables.workout.filter(w => w.userId === A.id).length, 1);
  assert.equal(tables.workout.filter(w => w.userId === B.id).length, 1);
  assert.equal(tables.activityStream.filter(s => s.userId === B.id).length, 1);
  assert.deepEqual((await json(await streamsGet(get("/api/activity-streams")))).body.workoutIds, b.body.streams.workoutIds);
});

test("no consent → the summary is imported but second-by-second data is discarded", async () => {
  asUser(A);
  const { body } = await json(await importPost(upload("garmin", rideTcx())));
  assert.equal(body.workoutsImported, 1);
  assert.equal(body.streams.stored, 0);
  assert.equal(tables.activityStream.length, 0);
  const id = tables.workout[0].id;
  const analysis = await json(await analysisGet(get(`/api/activity-analysis?workoutId=${id}`)));
  assert.equal(analysis.body.ok, false);
  assert.equal(analysis.body.reason, "no_streams");
});

test("operator flag off → nothing second-by-second is stored even with consent; status says so; deletion still works", async () => {
  asUser(A);
  const id = (await json(await importPost(upload("garmin", rideTcx(), { consent: true })))).body.streams.workoutIds[0];
  process.env.ENABLE_ACTIVITY_STREAMS = "0";
  const off = await json(await importPost(upload("garmin", rideTcx({ seconds: 900 }), { consent: true })));
  assert.equal(off.body.streams.enabled, false);
  assert.equal(tables.activityStream.length, 1, "only the earlier row exists");
  assert.deepEqual((await json(await streamsGet(get("/api/activity-streams")))).body, { enabled: false, retentionDays: null, workoutIds: [] });
  assert.equal((await json(await analysisGet(get(`/api/activity-analysis?workoutId=${id}`)))).body.reason, "storage_disabled");
  assert.equal((await json(await streamsDelete(new Request("http://localhost/api/activity-streams?all=1", { method: "DELETE" })))).body.deleted, 1);
});

test("Strava-origin file: kept as the athlete's own record with its origin, but never stored as streams and never analysed", async () => {
  asUser(A);
  const { body } = await json(await importPost(upload("garmin", rideTcx({ creator: "Strava" }), { consent: true })));
  assert.equal(body.workoutsImported, 1);
  assert.equal(body.streams.stored, 0);
  assert.deepEqual(body.streams.refused, { strava_origin: 1 });
  assert.equal(tables.workout[0].source, "tcx");
  assert.match(tables.workout[0].notes, /Original source: STRAVA/);
  assert.equal(tables.activityStream.length, 0);
  const analysis = await json(await analysisGet(get(`/api/activity-analysis?workoutId=${tables.workout[0].id}`)));
  assert.equal(analysis.body.ok, false);
  assert.equal(analysis.body.reason, "strava_restricted");
});

test("unknown origin is refused by analysis even if a row exists (fail closed)", async () => {
  asUser(A);
  tables.workout.push({ id: "mystery", userId: A.id, source: "mystery", externalId: "x:1", sport: "bike", title: "Ride", date: new Date(), notes: null });
  const analysis = await json(await analysisGet(get("/api/activity-analysis?workoutId=mystery")));
  assert.equal(analysis.body.reason, "unknown_provenance");
});

test("re-importing the same file updates in place: no duplicate workout, no duplicate stream", async () => {
  asUser(A);
  await importPost(upload("garmin", rideTcx(), { consent: true }));
  const again = await json(await importPost(upload("garmin", rideTcx(), { consent: true })));
  assert.equal(again.body.workoutsImported, 0);
  assert.equal(again.body.workoutsAlreadyStored, 1);
  assert.equal(tables.workout.length, 1);
  assert.equal(tables.activityStream.length, 1);
});

test("a FIT activity file goes through the same route, consent and storage path", async () => {
  asUser(A);
  const { status, body } = await json(await importPost(upload("garmin", fitRide(), { consent: true, name: "ride.fit" })));
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(tables.workout[0].source, "fit");
  assert.equal(body.streams.stored, 1);
});

test("unsupported or damaged files are refused with a clear reason and store nothing", async () => {
  asUser(A);
  const zip = await json(await importPost(upload("garmin", new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]), { name: "export.zip" })));
  assert.equal(zip.status, 415); assert.equal(zip.body.code, "zip"); assert.match(zip.body.error, /ZIP/);
  const spanish = await json(await importPost(upload("garmin", "Tipo de actividad,Fecha,Tiempo,Distancia\r\nCarrera,2026-10-18 07:00:00,00:40:00,\"8,2\"\r\n", { name: "Activities.csv" })));
  assert.equal(spanish.status, 422); assert.equal(spanish.body.code, "unrecognized_columns");
  assert.deepEqual(spanish.body.foundColumns, ["Tipo de actividad", "Fecha", "Tiempo", "Distancia"]);
  const damaged = fitRide(); damaged[Math.floor(damaged.length / 2)] ^= 0xff;
  const bad = await json(await importPost(upload("garmin", damaged, { name: "bad.fit" })));
  assert.equal(bad.status, 422); assert.equal(bad.body.code, "integrity_failed");
  const empty = await json(await importPost(upload("garmin", new Uint8Array(0))));
  assert.equal(empty.status, 400);
  assert.equal(tables.workout.length, 0);
});

test("English Garmin CSV: running imported in the athlete's timezone, walking skipped and counted, decimal-comma value is unknown (not 5409)", async () => {
  asUser(A);
  const csv = ["Activity Type,Date,Title,Distance,Time,Avg HR", "Running,2026-10-18 06:30:00,Morning run,\"54,09\",00:40:00,150", "Walking,2026-10-18 12:00:00,Stroll,2.0,00:30:00,95"].join("\r\n") + "\r\n";
  const { status, body } = await json(await importPost(upload("garmin", csv, { name: "Activities.csv" })));
  assert.equal(status, 200);
  assert.equal(body.workoutsImported, 1);
  assert.deepEqual(body.unsupportedTypes, { Walking: 1 });
  assert.equal(body.skipped.ambiguousNumbers, 1);
  const w = tables.workout[0];
  assert.equal(w.distanceKm, undefined, "ambiguous distance stays unknown");
  assert.equal(w.date.toISOString(), "2026-10-18T10:30:00.000Z", "06:30 America/New_York (EDT), not the server's timezone");
});

test("missing is not zero: a ride without a power meter reports no power metrics (null), not 0 W", async () => {
  asUser(A);
  const id = (await json(await importPost(upload("garmin", rideTcx({ power: false }), { consent: true })))).body.streams.workoutIds[0];
  const analysis = (await json(await analysisGet(get(`/api/activity-analysis?workoutId=${id}`)))).body;
  assert.equal(analysis.ok, true);
  assert.equal(analysis.power, null);
  assert.equal(tables.workout[0].avgPower, undefined);
  assert.ok(analysis.notes.some((n: string) => /No power data/.test(n)));
});

test("deleting stored data: one activity, then everything; analysis then reports no stored data", async () => {
  asUser(A);
  const first = (await json(await importPost(upload("garmin", rideTcx(), { consent: true })))).body.streams.workoutIds[0];
  const second = (await json(await importPost(upload("garmin", fitRide(), { consent: true, name: "r.fit" })))).body.streams.workoutIds[0];
  assert.equal((await json(await streamsDelete(new Request(`http://localhost/api/activity-streams?workoutId=${first}`, { method: "DELETE" })))).body.deleted, 1);
  assert.equal((await json(await analysisGet(get(`/api/activity-analysis?workoutId=${first}`)))).body.reason, "no_streams");
  assert.equal((await json(await streamsDelete(new Request("http://localhost/api/activity-streams?all=1", { method: "DELETE" })))).body.deleted, 1);
  assert.equal(tables.activityStream.length, 0);
  assert.equal(tables.workout.length, 2, "deleting second-by-second data never deletes the workout summary");
  assert.ok(second);
});

test("expired data is not analysable even before the purge runs", async () => {
  asUser(A);
  const id = (await json(await importPost(upload("garmin", rideTcx(), { consent: true })))).body.streams.workoutIds[0];
  tables.activityStream[0].expiresAt = new Date(Date.now() - 1000);
  assert.equal((await json(await analysisGet(get(`/api/activity-analysis?workoutId=${id}`)))).body.reason, "no_streams");
  assert.deepEqual((await json(await streamsGet(get("/api/activity-streams")))).body.workoutIds, []);
});

test("a storage failure (e.g. the table is not migrated yet) never fails the import", async () => {
  asUser(A);
  failStreamWrites = true;
  const { status, body } = await json(await importPost(upload("garmin", rideTcx(), { consent: true })));
  assert.equal(status, 200);
  assert.equal(body.workoutsImported, 1);
  assert.equal(body.streams.error, true);
  assert.equal(tables.workout.length, 1);
});
