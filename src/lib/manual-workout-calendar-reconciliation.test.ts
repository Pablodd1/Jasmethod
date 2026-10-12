import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as dates from "./dates";
import * as calendar from "./manual-workout-calendar";
import { googleCalUpsertEvent, googleCalDeleteEvent } from "./importers";

function syntheticSync(options: { moved?: boolean; failDelete?: boolean; approved?: boolean; approvalRevision?: string; startTime?: string | null } = {}) {
  const start = dates.dayBounds("UTC").start;
  const workout = { id: "synthetic-session", userId: "athlete", date: new Date(start.getTime() + (options.moved ? 20 : 1) * 86400000), startTime: options.startTime ?? null, durationMin: 45, planned: true, approved: options.approved ?? false, title: "Synthetic workout", feedbackStatus: null, planDay: null };
  const link = { id: "synthetic-link", userId: "athlete", workoutId: workout.id, date: new Date(start.getTime() + 86400000), notes: "gcalPush:synthetic-event" };
  const calls: { published: any[]; deleted: string[]; localDeleted: any[]; updates: any[] } = { published: [], deleted: [], localDeleted: [], updates: [] };
  const user = { timezone: "UTC", language: "en", email: "athlete@example.invalid", profile: null };
  const prisma = {
    user: { findUniqueOrThrow: async () => user },
    connector: { findMany: async () => [{ id: "synthetic-connector", provider: "google_cal", tokenEnc: "synthetic" }], updateMany: async (arg: any) => { calls.updates.push(arg); return { count: 1 }; } },
    workout: { findMany: async ({ where }: any) => { assert.equal(where.userId, "athlete"); return workout.date < where.date.lt ? [workout] : []; }, findFirst: async ({ where }: any) => { assert.equal(where.userId, "athlete"); return workout; } },
    calendarEvent: { findMany: async ({ where }: any) => { assert.equal(where.userId, "athlete"); return [link]; }, deleteMany: async () => ({ count: 0 }), update: async () => ({}), delete: async (arg: any) => { calls.localDeleted.push(arg); } },
    auditLog: { findFirst: async () => options.approvalRevision ? { after: JSON.stringify({ revision: options.approvalRevision }) } : null },
    $transaction: async (fn: any) => fn({ $executeRaw: async () => 1, athleteProfile: { findUnique: async () => null } }),
  };
  const deps: Record<string, unknown> = {
    "./manual-workout-calendar": calendar, "./dates": dates, "./db": { prisma },
    "./manual-workout-email-locale": { manualEmailLanguage: () => "en" },
    "./manual-workout-email": { eligibleManualEmail: () => false, manualEmailConfigured: () => false },
    "./manual-workout-email-content": { manualWorkoutCalendarDescription: () => { throw Error("Private guidance must not be shared without opt-in"); } },
    "./crypto": { decryptSecret: () => "synthetic", encryptSecret: () => "synthetic" },
    "./activity-store": {}, "./capabilities": {},
    "./canonical-session": { SessionResolutionError: class extends Error {} },
    "./effective-prescription": { effectivePrescription: async () => ({ canonical: { verdict: "ready", revision: "current", durationMin: 45 }, nutrition: {} }) },
    "./importers": {
      googleCalGetEvents: async () => [],
      googleCalUpsertEvent: async (_: string, input: any) => { calls.published.push(input); return "synthetic-event"; },
      googleCalDeleteEvent: async (_: string, id: string) => { calls.deleted.push(id); if (options.failDelete) throw Error("Synthetic provider failure"); },
    },
  };
  const compiled = ts.transpileModule(fs.readFileSync("src/lib/sync.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod: any = { exports: {} };
  vm.runInNewContext(compiled, { module: mod, exports: mod.exports, require: (id: string) => { if (id in deps) return deps[id]; throw Error(`Unmocked dependency: ${id}`); }, Date, process: { env: { NEXT_PUBLIC_APP_URL: "https://example.invalid" } }, console });
  return { run: () => mod.exports.syncUserConnectors("athlete", "google_cal"), calls, workout };
}

test("calendar sync retracts a workout moved past the 14-day horizon", async () => {
  const fixture = syntheticSync({ moved: true });
  const result = await fixture.run();
  assert.equal(result.results[0].ok, true);
  assert.equal(fixture.calls.published.length, 0);
  assert.deepEqual(fixture.calls.deleted, ["synthetic-event"]);
  assert.equal(fixture.calls.localDeleted.length, 1);
});

test("failed remote removal retains the mapping and reports failure for retry", async () => {
  const fixture = syntheticSync({ moved: true, failDelete: true });
  const result = await fixture.run();
  assert.equal(result.results[0].ok, false);
  assert.equal(fixture.calls.localDeleted.length, 0);
  assert.equal(fixture.calls.updates.at(-1).data.status, "error");
});

test("missing start stays all-day and stale approval stays provisional without private guidance", async () => {
  const fixture = syntheticSync({ approved: true, approvalRevision: "stale" });
  assert.equal((await fixture.run()).results[0].ok, true);
  const published = fixture.calls.published[0];
  assert.equal(published.start.date, dates.dateKey(fixture.workout.date, "UTC"));
  assert.deepEqual(Object.keys(published.start), ["date"]);
  assert.equal(published.provisional, true);
  assert.match(published.description, /PROVISIONAL \/ ON HOLD/);
  assert.match(published.description, /Start time not set/);
  assert.match(published.description, /sessionId=synthetic-session&date=\d{4}-\d{2}-\d{2}/);
  assert.match(published.revision, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(published.description, /07:00/);
});

test("approved current revision uses the entered start time", async () => {
  const fixture = syntheticSync({ approved: true, approvalRevision: "current", startTime: "18:45" });
  assert.equal((await fixture.run()).results[0].ok, true);
  const published = fixture.calls.published[0];
  assert.equal(published.provisional, false);
  assert.equal(published.start.toISOString().slice(11, 16), "18:45");
  assert.doesNotMatch(published.description, /ON HOLD|Start time not set/);
});

test("snapshot revisions change with schedule and readiness while historical valid events are retained", () => {
  const base = { workoutId: "fixture", date: "2026-11-01", startTime: null, durationMin: 45, canonicalRevision: "same", ready: false, description: "Placeholder" };
  for (const change of [{ date: "2026-11-02" }, { startTime: "09:00" }, { durationMin: 50 }, { ready: true }, { description: "Updated" }]) {
    assert.notEqual(calendar.manualWorkoutCalendarRevision(base), calendar.manualWorkoutCalendarRevision({ ...base, ...change }));
  }
  const start = new Date("2026-11-01"), end = new Date("2026-11-15"), past = new Date("2026-10-31");
  const w = { planned: true, durationMin: 45, date: past, feedbackStatus: null };
  assert.equal(calendar.retireWorkoutCalendarLink(w, past, start, end), false);
  assert.equal(calendar.retireWorkoutCalendarLink({ ...w, planned: false }, past, start, end), true);
  assert.equal(calendar.retireWorkoutCalendarLink({ ...w, date: new Date("2026-11-20") }, past, start, end), true);
  assert.equal(calendar.retireWorkoutCalendarLink({ ...w, date: new Date("2026-10-30") }, past, start, end), true);
});

test("provider all-day PATCH clears timed fields, carries revision/status, and uses exclusive next-day end", async () => {
  const original = globalThis.fetch;
  const calls: any[] = [];
  globalThis.fetch = async (_input, init) => { calls.push(JSON.parse(String(init?.body))); return Response.json({ id: "synthetic-event" }); };
  try {
    await googleCalUpsertEvent("synthetic", { summary: "Provisional", start: { date: "2026-12-31" }, durationMin: 45, workoutId: "fixture", existingGoogleId: "synthetic-event", revision: "synthetic-revision", provisional: true });
    assert.deepEqual(calls[0].start, { date: "2026-12-31", dateTime: null, timeZone: null });
    assert.deepEqual(calls[0].end, { date: "2027-01-01", dateTime: null, timeZone: null });
    assert.equal(calls[0].status, "tentative");
    assert.equal(calls[0].extendedProperties.private.jmmRevision, "synthetic-revision");
    await googleCalUpsertEvent("synthetic", { summary: "Approved", start: new Date("2027-01-01T09:00Z"), durationMin: 45, workoutId: "fixture", existingGoogleId: "synthetic-event", provisional: false });
    assert.equal(calls[1].start.date, null);
    assert.equal(calls[1].end.dateTime, "2027-01-01T09:45:00.000Z");
    assert.equal(calls[1].status, "confirmed");
  } finally { globalThis.fetch = original; }
});

test("already missing Google event is a verified idempotent delete", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 410 });
  try { await googleCalDeleteEvent("synthetic", "synthetic-event"); }
  finally { globalThis.fetch = original; }
});


test("publish rejects success responses without matching event acknowledgment", async () => {
  const original = globalThis.fetch;
  try {
    for (const response of [{}, { id: "different-event" }, { id: "synthetic-event", status: "cancelled" }]) {
      globalThis.fetch = async () => Response.json(response);
      await assert.rejects(googleCalUpsertEvent("synthetic", { summary: "Placeholder", start: { date: "2026-12-31" }, durationMin: 45, workoutId: "fixture", existingGoogleId: "synthetic-event", provisional: true }), /acknowledge/);
    }
  } finally { globalThis.fetch = original; }
});
