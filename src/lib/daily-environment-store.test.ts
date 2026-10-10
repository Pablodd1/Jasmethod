import test from "node:test";
import assert from "node:assert/strict";
import { DAILY_ENVIRONMENT_ACTION, parseDailyEnvironmentCommand, prepareDailyEnvironment, readDailyEnvironment, saveDailyEnvironment } from "./daily-environment-store";
const now = new Date("2026-10-10T12:00:00Z");
const scope = { athleteId: "athlete", actorId: "athlete", timezone: "UTC" };
const environment = { setting: "outdoor", venueName: "Private route", latitude: 25.7617, longitude: -80.1918, plannedLocal: "2026-10-10T09:00", timeZone: "America/New_York", venueConfirmed: true, requestForecast: false };
const command = () => parseDailyEnvironmentCommand({ sessionId: "workout", expectedRevision: null, environment });
function fixture() {
  const state: any = { workout: { id: "workout", userId: "athlete", date: new Date("2026-10-10"), startTime: "13:00", planned: true, completed: false, feedbackStatus: null, feedbackAt: null, actualDurationMin: null, approved: true, prescription: "UNMODIFIED_PRESCRIPTION" }, audits: [], writes: [], locks: [], checkin: { answers: JSON.stringify({ sick: true, urgentSymptoms: true, focus: { workout: true }, unknownPreservedField: "value" }) }, queries: [] };
  const db: any = { $executeRaw: async (...args: unknown[]) => { state.locks.push(args); },
    workout: { findFirst: async (q: any) => { state.queries.push(q); return q.where.id === state.workout.id && q.where.userId === state.workout.userId ? { ...state.workout } : null; },
      updateMany: async (q: any) => { state.writes.push(q); if (state.rejectWrite) return { count: 0 }; Object.assign(state.workout, q.data); return { count: 1 }; } },
    auditLog: { findFirst: async (q: any) => { state.queries.push(q); return state.audits.filter((r: any) => r.subjectId === q.where.subjectId && r.entityId === q.where.entityId && r.action === q.where.action).at(-1) ?? null; },
      create: async ({ data }: any) => { const row = { ...data, id: `audit-${state.audits.length + 1}` }; state.audits.push(row); return row; } },
    dailyCheckin: { update: () => { throw Error("Must never rewrite check-in"); }, upsert: () => { throw Error("Must never rewrite check-in"); } },
  };
  return { state, db };
}
test("environment command rejects injected athlete/provider fields and requires optimistic revision", () => {
  for (const raw of [{ sessionId: "workout", environment }, { sessionId: "../workout", expectedRevision: null, environment }, { sessionId: "workout", expectedRevision: null, environment, athleteId: "other" }, { sessionId: "workout", expectedRevision: null, environment: { ...environment, forecast: {} } }]) assert.throws(() => parseDailyEnvironmentCommand(raw));
});
test("scoped store does not use another athlete's venue and does not call a provider implicitly", async () => {
  const { state, db } = fixture();
  state.audits.push({ subjectId: "other", entityId: "workout", action: DAILY_ENVIRONMENT_ACTION, after: "PRIVATE_FOREIGN_CONTEXT", id: "other-audit" });
  assert.deepEqual(await readDailyEnvironment("athlete", "workout", db), { record: null, revision: null });
  let requests = 0;
  const prepared = await prepareDailyEnvironment(command(), scope, db, { now, forecast: async () => { requests++; throw Error("No provider request expected"); } });
  assert.equal(requests, 0); assert.equal(prepared.forecast, null);
  const before = JSON.stringify(state.checkin);
  const saved = await saveDailyEnvironment(db, command(), scope, prepared, now);
  assert.equal(saved.status, "unknown"); assert.equal(saved.reason, "not_requested"); assert.equal(state.workout.approved, false); assert.equal(state.workout.prescription, "UNMODIFIED_PRESCRIPTION"); assert.equal(JSON.stringify(state.checkin), before);
  assert.equal(state.audits.at(-1).subjectId, "athlete"); assert.equal(state.audits.at(-1).entityId, "workout"); assert.equal(state.locks.length, 1);
  assert.deepEqual(Object.keys(state.writes[0].data).sort(), ["approved", "indoor", "startTime"]);
  for (const q of state.queries) if (q.where.action) { assert.equal(q.where.action, DAILY_ENVIRONMENT_ACTION); assert.equal(q.where.subjectId, "athlete"); assert.equal(q.where.entityId, "workout"); }
});
test("only explicit confirmed forecast action sends coordinates/time; failures persist as unknown", async () => {
  const { db } = fixture(); const c = command(); c.environment.requestForecast = true;
  const sent: unknown[] = [];
  const prepared = await prepareDailyEnvironment(c, scope, db, { now, forecast: async (request) => { sent.push(request); throw Error("Provider down"); } });
  assert.deepEqual(sent, [{ latitude: 25.7617, longitude: -80.1918, at: "2026-10-10T13:00:00.000Z", timeZone: "America/New_York" }]);
  const saved = await saveDailyEnvironment(db, c, scope, prepared, now); assert.equal(saved.status, "unknown"); assert.equal(saved.reason, "provider_unavailable"); assert.equal(saved.conditions, null);
});
test("confirmed indoor and account/venue timezone schedule survive read without weather inference", async () => {
  const { db, state } = fixture();
  const c = parseDailyEnvironmentCommand({ sessionId: "workout", expectedRevision: null, environment: { ...environment, setting: "indoor", plannedLocal: "2026-10-10T10:30" } });
  const prepared = await prepareDailyEnvironment(c, scope, db, { now });
  const saved = await saveDailyEnvironment(db, c, scope, prepared, now);
  assert.equal(saved.status, "indoor"); assert.equal(saved.conditions, null); assert.equal(state.workout.startTime, "14:30");
  const reread = await readDailyEnvironment("athlete", "workout", db); assert.equal(reread.revision, saved.revision); assert.equal(JSON.parse(reread.record!).plannedAt, "2026-10-10T14:30:00.000Z");
});
test("foreign, future, performed and wrong-day venue submissions are rejected before a provider call", async () => {
  for (const change of [{ userId: "other" }, { date: new Date("2026-10-11") }, { completed: true }, { feedbackStatus: "partial" }, { feedbackAt: now }, { actualDurationMin: 0 }, { planned: false }]) {
    const { db, state } = fixture(); Object.assign(state.workout, change); let requests = 0; const c = command(); c.environment.requestForecast = true;
    await assert.rejects(() => prepareDailyEnvironment(c, scope, db, { now, forecast: async () => { requests++; throw Error("Should not call"); } })); assert.equal(requests, 0); assert.equal(state.writes.length, 0);
  }
  const { db } = fixture(); const c = command(); c.environment.plannedLocal = "2026-10-10T23:00";
  await assert.rejects(() => prepareDailyEnvironment(c, scope, db, { now }), /workout's date/);
});
test("repeated and late responses cannot overwrite a newer venue or moved workout", async () => {
  const { db, state } = fixture(); const c = command();
  const [a, b] = await Promise.all([prepareDailyEnvironment(c, scope, db, { now }), prepareDailyEnvironment(c, scope, db, { now })]);
  await saveDailyEnvironment(db, c, scope, a, now); await assert.rejects(() => saveDailyEnvironment(db, c, scope, b, now), /changed/); assert.equal(state.audits.length, 1);
  await assert.rejects(() => prepareDailyEnvironment(c, scope, db, { now }), /changed/);
  const next = { ...c, expectedRevision: state.audits[0].id }; const prepared = await prepareDailyEnvironment(next, scope, db, { now }); state.workout.startTime = "14:00";
  await assert.rejects(() => saveDailyEnvironment(db, next, scope, prepared, now), /changed/); assert.equal(state.audits.length, 1);
});
test("save rechecks actual execution, midnight boundary and update result before claiming persistence", async () => {
  for (const change of [{ completed: true }, { rejectWrite: true }, { afterMidnight: true }]) {
    const { db, state } = fixture(); const c = command(), prepared = await prepareDailyEnvironment(c, scope, db, { now });
    if (change.completed) state.workout.completed = true; if (change.rejectWrite) state.rejectWrite = true;
    await assert.rejects(() => saveDailyEnvironment(db, c, scope, prepared, change.afterMidnight ? new Date("2026-10-11T00:00Z") : now)); assert.equal(state.audits.length, 0);
  }
});
