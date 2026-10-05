import test from "node:test";
import assert from "node:assert/strict";
import { mapIntervalsActivity, mapIntervalsWellness, fetchIntervalsRange, intervalsRead, intervalsEventHash, intervalsSecretMatches } from "./intervals-ingest";
const activity = { id: "i123", icu_athlete_id: "a1", source: "GARMIN_CONNECT", type: "Run", name: "Easy run", start_date: "2026-10-04T11:30:00Z", moving_time: 1800, distance: 5000, average_heartrate: 140, max_heartrate: 160, icu_average_watts: 250, calories: 320 };
test("Intervals maps documented activity units and preserves absent measurements", () => {
  const a = mapIntervalsActivity(activity, "a1", "America/New_York")!;
  assert.equal(a.durationMin, 30); assert.equal(a.distanceKm, 5); assert.equal(a.avgHr, 140); assert.equal(a.avgPower, 250); assert.equal(a.np, null); assert.equal(a.source, "intervals"); assert.equal(a.date.toISOString(), activity.start_date.replace("Z", ".000Z"));
  assert.equal("tss" in a, false);
  const missing = mapIntervalsActivity({ ...activity, distance: null, average_heartrate: "145", calories: undefined }, "a1", "UTC")!;
  assert.equal(missing.distanceKm, null); assert.equal(missing.avgHr, null); assert.equal(missing.calories, null);
});
test("Intervals rejects Strava/unknown provenance and mismatched athlete", () => {
  assert.equal(mapIntervalsActivity({ ...activity, source: "STRAVA" }, "a1", "UTC"), null);
  assert.equal(mapIntervalsActivity({ ...activity, source: undefined }, "a1", "UTC"), null);
  assert.throws(() => mapIntervalsActivity(activity, "other", "UTC"), /mismatch/);
  assert.throws(() => mapIntervalsActivity({ ...activity, moving_time: 0 }, "a1", "UTC"), /duration/);
});
test("Intervals local activity timestamps use athlete timezone", () => {
  const a = mapIntervalsActivity({ ...activity, start_date: null, start_date_local: "2026-10-04T07:30:00" }, "a1", "America/New_York")!;
  assert.equal(a.date.toISOString(), "2026-10-04T11:30:00.000Z");
});
test("Intervals wellness keeps RMSSD and SDNN distinct without invented readiness", () => {
  const w = mapIntervalsWellness({ id: "2026-10-04", hrv: 42.5, hrvSDNN: 61, sleepSecs: 27000, restingHR: 48, weight: 72, sleepScore: null, readiness: 5 }, "America/New_York");
  assert.equal(w.date.toISOString(), "2026-10-04T04:00:00.000Z"); assert.equal(w.data.sleepHours, 7.5); assert.equal(w.data.hrvType, "rmssd");
  assert.equal(w.observations.find(o => o.metricType === "hrv_sdnn")?.value, 61);
  assert.equal("recoveryScore" in w.data, false); assert.equal("sleepScore" in w.data, false);
  const onlySdnn = mapIntervalsWellness({ id: "2026-10-04", hrvSDNN: 50 }, "UTC"); assert.equal("hrv" in onlySdnn.data, false);
  assert.throws(() => mapIntervalsWellness({ id: "2026-02-31" }, "UTC"));
});
test("Intervals webhook stable hash ignores object order but distinguishes updates", () => {
  assert.equal(intervalsEventHash({ type: "A", activity: { id: "i1", name: "one" } }), intervalsEventHash({ activity: { name: "one", id: "i1" }, type: "A" }));
  assert.notEqual(intervalsEventHash({ type: "A" }), intervalsEventHash({ type: "B" }));
  assert.equal(intervalsSecretMatches("test-secret", "test-secret"), true); assert.equal(intervalsSecretMatches("wrong", "test-secret"), false); assert.equal(intervalsSecretMatches(null, "test-secret"), false);
});
test("Intervals range reads use Bearer and bounded nonoverlapping date windows", async () => {
  const calls: URL[] = [];
  const fetcher = (async (url: any, init: any) => {
    assert.equal(init.headers.Authorization, "Bearer fixture"); assert.equal(init.redirect, "error"); calls.push(new URL(url));
    return Response.json(String(url).includes("/activities?") ? [activity] : [{ id: "2026-10-04", sleepSecs: 27000 }]);
  }) as typeof fetch;
  const rows = await fetchIntervalsRange("Bearer fixture", "2026-09-01", "2026-10-04", true, true, fetcher);
  assert.equal(calls.length, 4); assert.equal(rows.activities.length, 2);
  assert.equal(calls[0].searchParams.get("newest"), "2026-09-30"); assert.equal(calls[2].searchParams.get("oldest"), "2026-10-01");
  assert.ok(calls.every(u => u.pathname.startsWith("/api/v1/athlete/0/")));
});
test("Intervals permission failures and malformed provider lists fail visibly", async () => {
  await assert.rejects(intervalsRead("/athlete/0/wellness", "Bearer fixture", (async () => new Response("", { status: 403 })) as typeof fetch), /Reconnect/);
  await assert.rejects(fetchIntervalsRange("Bearer fixture", "2026-10-04", "2026-10-04", true, false, (async () => Response.json({ rows: [] })) as typeof fetch), /Invalid Intervals list/);
});

import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
function webhookFixture(fail = false) {
  const jobs = new Map<string, any>(); let databaseCalls = 0;
  const exports: any = {};
  const source = readFileSync(new URL("../app/api/connectors/intervals/webhook/route.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const tx = { connector: { findMany: async ({ where }: any) => where.externalRef === "a1" ? [{ id: "c1", userId: "u1" }] : [] }, syncJob: { upsert: async ({ where, create }: any) => { if (fail) throw Error("storage unavailable"); if (!jobs.has(where.dedupeKey)) jobs.set(where.dedupeKey, create); return jobs.get(where.dedupeKey); } } };
  vm.runInNewContext(code, { exports, Buffer, Date, Number, JSON, process: { env: { INTERVALS_WEBHOOK_SECRET: "fixture-secret" } }, require: (id: string) => {
    if (id === "next/server") return { NextResponse: Response };
    if (id.endsWith("/db")) return { prisma: { $transaction: async (fn: any) => { databaseCalls++; return fn(tx); } } };
    if (id.endsWith("/capabilities")) return { intervalsConnectorEnabled: () => true };
    if (id.endsWith("/intervals-ingest")) return { intervalsEventHash, intervalsSecretMatches, intervalsEventTypes: new Set(["ACTIVITY_UPLOADED"]) };
    throw Error(id);
  } });
  return { post: (body: any) => exports.POST(new Request("http://localhost/webhook", { method: "POST", body: JSON.stringify(body) })), jobs, calls: () => databaseCalls };
}
test("Intervals official webhook envelope authenticates before database and binds each athlete", async () => {
  const f = webhookFixture(); const event = { athlete_id: "a1", type: "ACTIVITY_UPLOADED", timestamp: "2026-10-04T12:00:00Z", activity: { id: "i123", name: "sensitive payload not persisted" } };
  assert.equal((await f.post({ secret: "wrong", events: [event] })).status, 401); assert.equal(f.calls(), 0);
  assert.equal((await f.post({ secret: "fixture-secret", events: [event] })).status, 200);
  assert.equal((await f.post({ secret: "fixture-secret", events: [{ ...event, activity: { name: "sensitive payload not persisted", id: "i123" } }] })).status, 200);
  assert.equal(f.jobs.size, 1); const job = [...f.jobs.values()][0]; assert.equal(job.userId, "u1"); assert.equal(job.kind, "intervals");
  assert.equal(job.payload.includes("fixture-secret"), false); assert.equal(job.payload.includes("sensitive payload"), false);
  await f.post({ secret: "fixture-secret", events: [{ ...event, athlete_id: "unlinked" }] }); assert.equal(f.jobs.size, 1);
});
test("Intervals webhook storage failures request redelivery instead of fabricated success", async () => {
  const f = webhookFixture(true);
  const response = await f.post({ secret: "fixture-secret", events: [{ athlete_id: "a1", type: "ACTIVITY_UPLOADED", timestamp: "2026-10-04T12:00:00Z", activity: { id: "i123" } }] });
  assert.equal(response.status, 503); assert.equal(f.jobs.size, 0);
});

import * as dates from "./dates";
import { fromZonedTime } from "date-fns-tz";
import * as crypto from "node:crypto";
function eventWorkerFixture(status: number, record: any = activity, connected = true) {
  const writes: any[] = [], deletes: any[] = [], exports: any = {};
  const code = ts.transpileModule(readFileSync(new URL("./intervals-ingest.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, Date, URLSearchParams, AbortSignal, fetch: async () => new Response(status === 200 ? JSON.stringify(record) : "", { status, headers: { "Content-Type": "application/json" } }), require: (id: string) => {
    if (id === "node:crypto") return crypto;
    if (id === "date-fns-tz") return { fromZonedTime };
    if (id === "./dates") return dates;
    if (id === "./capabilities") return { requireIntervalsConnector: () => {} };
    if (id === "./db") return { prisma: { connector: { findFirst: async ({ where }: any) => connected && where.externalRef === "a1" && where.userId === "u1" ? { scope: "ACTIVITY:READ" } : null }, user: { findUniqueOrThrow: async () => ({ timezone: "UTC" }) } } };
    if (id === "./intervals-oauth") return { getIntervalsAuthorization: async () => ({ authorization: "Bearer fixture", athleteId: "a1" }) };
    if (id === "./activity-store") return { storeActivity: async (...args: any[]) => { writes.push(args); return true; }, deleteImportedActivities: async (...args: any[]) => { deletes.push(args); } };
    throw Error(id);
  } });
  return { writes, deletes, run: (type = "ACTIVITY_UPDATED", userId = "u1") => exports.processIntervalsEvent(userId, { connectorId: "c1", event: { athlete_id: "a1", type, activity: { id: "i123" } } }) };
}
test("Intervals activity event fetches current record and makes stale deletion harmless", async () => {
  const f = eventWorkerFixture(200); await f.run("ACTIVITY_DELETED");
  assert.equal(f.writes.length, 1); assert.equal(f.deletes.length, 0); assert.equal(f.writes[0][0], "u1");
  const missing = eventWorkerFixture(404); await missing.run("ACTIVITY_DELETED"); assert.equal(missing.deletes.length, 1); assert.equal(missing.deletes[0][1], "intervals");
});
test("Intervals event processor stops cross-tenant, disconnected and permission-failed imports", async () => {
  const cross = eventWorkerFixture(200); await cross.run("ACTIVITY_UPDATED", "u2"); assert.equal(cross.writes.length, 0);
  const disconnected = eventWorkerFixture(200, activity, false); await disconnected.run(); assert.equal(disconnected.writes.length, 0);
  const permission = eventWorkerFixture(403); await assert.rejects(permission.run(), /Reconnect/); assert.equal(permission.deletes.length, 0);
  const owner = eventWorkerFixture(200, { ...activity, icu_athlete_id: "other" }); await assert.rejects(owner.run(), /ownership/); assert.equal(owner.writes.length, 0);
});
