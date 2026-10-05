/** Delivery acceptance probes: real canonical FIT and handlers, no live provider or database. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import * as crypto from "node:crypto";
import { Decoder, Stream } from "@garmin/fitsdk";
import * as canonical from "./canonical-session";
import * as fit from "./fit-export";
const require = createRequire(import.meta.url), ts = require("typescript");
function load(file: string, dependencies: Record<string, any>, extra: Record<string, any> = {}) {
  const exports: any = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: (name: string) => { if (!(name in dependencies)) throw Error(`Unmocked ${name}`); return dependencies[name]; }, Date, Buffer, JSON, ...extra });
  return exports;
}
const step = (extra: any = {}) => ({ name: "Work", seconds: 5, phase: "active", zone: "z7", target: { type: "power", low: 250, high: 300 }, ...extra });
function session(sport = "bike", steps = [step()]) { return canonical.canonicalSession({ athleteId: "athlete", workout: { id: "workout", userId: "athlete", title: "Exact", sport, durationMin: 1 }, prescription: { sport, durationMin: steps.reduce((n, s) => n + (s.seconds || 0), 0) / 60 || 1, verdict: "full", steps }, dateLocal: "2026-10-05", timezone: "UTC" }); }
function fixture(initial = session()) {
  let current = initial;
  const row: any = { id: "workout", userId: "athlete", deliveryId: null, deliveryProvider: null, planned: true, completed: false, approved: false, date: new Date() };
  const state: any = { calls: [], deletes: [], audits: [], fail: null, afterPublish: null, saveFails: false, consent: false, deleted: false, autoEnabled: undefined, approvalRevision: initial.revision };
  const provider = load("src/lib/intervals.ts", { "./provider-fetch": { providerFetch: async (_url: string, init: any) => {
    const body = JSON.parse(init.body);
    if (_url.endsWith("bulk-delete")) { state.deletes.push(body); return Response.json(1); }
    state.calls.push(body);
    if (state.fail === "network") throw Error("synthetic timeout");
    if (state.fail === "rejected") return new Response("bad", { status: 400 });
    if (state.fail === "server") return new Response("bad", { status: 500 });
    if (state.fail === "malformed") return Response.json({ accepted: true });
    if (state.afterPublish) current = state.afterPublish;
    return Response.json([{ id: 123, external_id: body[0].external_id }]);
  } }, "./capabilities": { requireIntervalsConnector: () => {} } });
  const db: any = { workout: {
    findFirst: async () => state.deleted ? null : ({ ...row }),
    updateMany: async ({ where, data }: any) => { if (row.deliveryId !== where.deliveryId) return { count: 0 }; if (state.saveFails && JSON.parse(data.deliveryId).status !== "publishing") throw Error("storage failure"); Object.assign(row, data); return { count: 1 }; },
    findMany: async () => state.deleted ? [] : [{ ...row }],
  }, connector: { findUnique: async () => ({ externalRef: "provider-athlete" }) }, auditLog: { findFirst: async () => ({ after: JSON.stringify({ revision: state.approvalRevision }) }), findMany: async (args: any) => { state.auditQuery = args; return [...state.audits].reverse(); }, create: async ({ data }: any) => { state.audits.push(data); return data; } } };
  const api = load("src/lib/intervals-delivery.ts", { "node:crypto": crypto, "./db": { prisma: db }, "./effective-prescription": { effectivePrescription: async () => ({ canonical: current, workout: row }) }, "./dates": { dateKey: (value: Date) => value.toISOString().slice(0,10) }, "./fit-export": fit, "./canonical-session": canonical, "./capabilities": { requireIntervalsConnector: () => {} }, "./intervals-oauth": { getIntervalsAuthorization: async () => ({ authorization: "Bearer synthetic-only", athleteId: "provider-athlete" }) }, "./intervals-preferences": { readIntervalsAutoPublish: async () => state.consent }, "./intervals": provider }, { process: { env: { get ENABLE_INTERVALS_AUTO_PUBLISH() { return state.autoEnabled; } } } });
  const publish = (action = "publish", revision = current.revision) => api.publishIntervalsWorkout({ athleteId: "athlete", sessionId: "workout", actorId: "athlete", expectedRevision: revision, action });
  return { api, state, row, publish, change: (value: canonical.CanonicalSession) => { current = value; } };
}

test("Intervals native payload round-trips exact five-second power and running pace/distance FIT", () => {
  const f = fixture();
  for (const c of [session(), session("run", [step({ endpoint: { type: "distance", meters: 400 }, target: { type: "pace", low: 240, high: 300 } })])]) {
    const payload = f.api.canonicalIntervalsPayload(c);
    const decoder = new Decoder(Stream.fromByteArray(Buffer.from(payload.file_contents_base64, "base64")));
    assert.equal(decoder.checkIntegrity(), true); const decoded = decoder.read(); assert.deepEqual(decoded.errors, []);
    const s = (decoded.messages as any).workoutStepMesgs[0];
    if (c.sport === "bike") { assert.equal(s.durationTime, 5); assert.equal(s.customTargetPowerLow, 1250); assert.equal(s.customTargetPowerHigh, 1300); }
    else { assert.equal(s.durationDistance, 400); assert.equal(s.customTargetSpeedLow, 3.333); assert.equal(s.customTargetSpeedHigh, 4.167); }
    assert.equal(payload.external_id, f.api.intervalsExternalId(c.athleteId, c.id));
  }
});
test("Intervals refuses stale revision, rest, blocked and unsupported sport without HTTP", async () => {
  const f = fixture(); await assert.rejects(f.publish("publish", "old"), /changed/);
  for (const verdict of ["rest", "blocked"] as const) { const c = { ...session(), verdict, reason: "Hold training" }; f.change(c); await assert.rejects(f.publish(), /Hold training/); }
  f.change({ ...session(), sport: "swim" }); await assert.rejects(f.publish(), /run and bike/);
  assert.equal(f.state.calls.length, 0);
});
test("Intervals claims simultaneous requests and repeated publish updates one stable external ID", async () => {
  const f = fixture(); const results = await Promise.all([f.publish(), f.publish()]);
  assert.equal(results.filter(r => r.status === "published").length, 1); assert.equal(results.filter(r => r.status === "busy").length, 1); assert.equal(f.state.calls.length, 1);
  assert.equal((await f.publish()).status, "published"); assert.equal(f.state.calls.length, 1);
  f.change(session("bike", [step({ seconds: 10 })])); assert.equal((await f.publish()).status, "published");
  assert.equal(f.state.calls.length, 2); assert.equal(f.state.calls[0][0].external_id, f.state.calls[1][0].external_id);
  assert.equal(results[0].deviceReceived, false);
});
test("Intervals definite rejection releases claim; ambiguous failures retry idempotent external ID", async () => {
  for (const failure of ["rejected", "network", "server", "malformed"]) {
    const f = fixture(); f.state.fail = failure;
    assert.equal((await f.publish()).status, failure === "rejected" ? "rejected" : "unknown");
    assert.equal(f.api.readIntervalsReceipt(f.row.deliveryId).lease, undefined);
    f.state.fail = null; assert.equal((await f.publish()).status, "published");
    assert.equal(f.state.calls[0][0].external_id, f.state.calls[1][0].external_id);
  }
});
test("Intervals cancellation works for held sessions and suppresses obsolete publication", async () => {
  const f = fixture(); await f.publish(); f.change({ ...session(), verdict: "rest", reason: "Rest", revision: "rest-revision", steps: [] });
  assert.equal((await f.publish("cancel")).status, "cancelled"); assert.equal(f.state.deletes.length, 1);
  await f.publish("cancel"); assert.equal(f.state.deletes.length, 1);
  const g = fixture(); g.state.afterPublish = { ...session(), revision: "new-revision" };
  assert.equal((await g.publish()).status, "cancelled"); assert.equal(g.state.deletes.length, 1);
});
test("Intervals local receipt storage failure never reports clean acceptance", async () => {
  const f = fixture(); f.state.saveFails = true; const result = await f.publish();
  assert.equal(result.status, "unknown"); assert.equal(result.deviceReceived, false);
  assert.equal(f.api.readIntervalsReceipt(f.row.deliveryId).status, "publishing");
});


test("Intervals automatic first publication needs global gate, approval and per-athlete consent", async () => {
  for (const [enabled, approved, consent, expected] of [[false,true,true,0],[true,false,true,0],[true,true,false,0],[true,true,true,1]] as const) {
    const c = { ...session(), dateLocal: new Date(Date.now() + 86400000).toISOString().slice(0,10) };
    const f = fixture(c); f.state.autoEnabled = enabled ? "true" : undefined; f.row.approved = approved; f.state.consent = consent;
    await f.api.reconcileIntervalsPublications("athlete"); assert.equal(f.state.calls.length, expected);
  }
});
test("Intervals maintenance cancels held, archived and deleted sessions using stored ownership", async () => {
  for (const change of ["held", "archived", "deleted"]) {
    const c = { ...session(), dateLocal: new Date(Date.now() + 86400000).toISOString().slice(0,10) };
    const f = fixture(c); await f.publish();
    if (change === "held") f.change({ ...c, verdict: "blocked", reason: "Check-in required", revision: "held" });
    if (change === "archived") f.row.planDay = { plan: { status: "archived" } };
    if (change === "deleted") f.state.deleted = true;
    await f.api.reconcileIntervalsPublications("athlete"); assert.equal(f.state.deletes.length, 1);
  }
});

test("Intervals cannot update a receipt belonging to another connected athlete", async () => {
  const f = fixture(); await f.publish();
  const receipt = JSON.parse(f.row.deliveryId); receipt.providerAthleteId = "other-athlete"; f.row.deliveryId = JSON.stringify(receipt);
  await assert.rejects(f.publish(), /different Intervals account/); assert.equal(f.state.calls.length, 1);
});

test("Intervals auto publication rejects an approval for an old canonical revision", async () => {
  const f = fixture({ ...session(), dateLocal: new Date(Date.now() + 86400000).toISOString().slice(0,10) });
  f.state.autoEnabled = "true"; f.state.consent = true; f.row.approved = true; f.state.approvalRevision = "old";
  await f.api.reconcileIntervalsPublications("athlete"); assert.equal(f.state.calls.length, 0);
});

test("Intervals orphan cancellation covers previous UTC date and old publication audit age", async () => {
  const yesterdayUtc = new Date(Date.now() - 86400000).toISOString().slice(0,10);
  const f = fixture({ ...session(), dateLocal: yesterdayUtc }); await f.publish();
  f.state.deleted = true;
  for (const entry of f.state.audits) entry.createdAt = new Date("2020-01-01T00:00:00Z");
  await f.api.reconcileIntervalsPublications("athlete");
  assert.equal(f.state.deletes.length, 1);
  assert.equal(f.state.auditQuery.where.createdAt, undefined);
  assert.ok(f.state.auditQuery.where.OR.some((entry: any) => entry.after.contains.includes(yesterdayUtc)));
});

test("Intervals rejects completed, unplanned and archived manual publication but allows cancellation", async () => {
  for (const state of [{ completed: true }, { planned: false }, { planDay: { plan: { status: "archived" } } }]) {
    const f = fixture(); await f.publish(); Object.assign(f.row, state);
    await assert.rejects(f.publish(), /incomplete planned sessions/);
    assert.equal(f.state.calls.length, 1);
    assert.equal((await f.publish("cancel")).status, "cancelled");
  }
});
