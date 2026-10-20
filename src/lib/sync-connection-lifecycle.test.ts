import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as dates from "./dates";
import { currentOrReportedWorkoutWhere } from "./calendar-workouts";
import { whoopGetDaily, whoopGetWorkouts } from "./importers";

const compiled = ts.transpileModule(fs.readFileSync("src/lib/sync.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
type Row = Record<string, any>;
function fixture(provider = "strava", expired = false, lastSyncAt: Date | null = null) {
  const row: Row = { id: "connection", userId: "athlete", provider, status: "connected", tokenEnc: "synthetic-old", refreshEnc: "synthetic-refresh", expiresAt: expired ? new Date(0) : null, syncStartedAt: null, lastSyncAt };
  const calls: string[] = [], windows: Array<{ kind: string; start: Date; end: Date }> = [], writes: Row[] = [], daysRequested: number[] = [];
  const hooks: { refresh?: () => void; read?: () => void; fail?: boolean; windowFailure?: number; final?: () => void } = {};
  const equal = (a: any, b: any) => a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;
  const matches = (where: Row): boolean => Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === "OR") return value.some(matches);
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if ("in" in value) return value.in.includes(row[key]);
      if ("lt" in value) return row[key] != null && row[key] < value.lt;
    }
    return equal(row[key], value);
  });
  const read = async () => { calls.push("read"); hooks.read?.(); if (hooks.fail) throw Error("Synthetic provider unavailable"); return []; };
  const windowRead = async (kind: string, window: { start: Date; end: Date }) => {
    calls.push(kind); windows.push({ kind, ...window }); hooks.read?.();
    if (hooks.windowFailure === windows.filter(w => w.kind === "workout").length && kind === "workout") throw Error("Synthetic incomplete history");
    return [];
  };
  const prisma = {
    user: { findUniqueOrThrow: async () => ({ timezone: "UTC", profile: null }) },
    connector: {
      findMany: async () => [{ ...row }],
      updateMany: async ({ where, data }: Row) => {
        if (data.lastSyncAt) hooks.final?.();
        if (!matches(where)) return { count: 0 };
        assert.equal(where.userId, "athlete"); assert.equal(where.provider, provider);
        writes.push({ ...data }); Object.assign(row, data); return { count: 1 };
      },
    },
    calendarEvent: { deleteMany: async () => ({}), findMany: async () => [] },
    workout: { findMany: async () => [] },
    trainingPlan: { findFirst: async () => null },
    $transaction: async (fn: any) => fn({ $executeRaw: async () => 1, athleteProfile: { findUnique: async () => null } }),
  };
  const deps: Row = {
    "./db": { prisma }, "./dates": dates,
    "./crypto": { decryptSecret: () => "synthetic", encryptSecret: (v: string) => `encrypted:${v}` },
    "./importers": {
      stravaRefreshToken: async () => { calls.push("refresh"); hooks.refresh?.(); return { access_token: "synthetic-rotated", refresh_token: "synthetic-new-refresh", expires_in: 3600 }; },
      stravaGetActivities: read, googleCalGetEvents: read,
      ouraGetDaily: async (_: string, days: number) => { daysRequested.push(days); return read(); },
      whoopGetDaily: async (_: string, _days: number, _tz: string, window: any) => windowRead("wellness", window),
      whoopGetWorkouts: async (_: string, _days: number, window: any) => windowRead("workout", window),
    },
    "./profile-import-review": { importStravaProfileWeight: async () => { calls.push("profile"); } },
    "./telemetry": { meterUsage: async () => {} },
    "./activity-store": {}, "./device-metric-snapshot": {}, "./manual-workout-calendar": {}, "./calendar-workouts": { currentOrReportedWorkoutWhere },
    "./manual-workout-email-locale": {}, "./manual-workout-email": {}, "./manual-workout-email-content": {},
    "./effective-prescription": {}, "./canonical-session": {}, "./capabilities": {},
  };
  const mod: any = { exports: {} };
  vm.runInNewContext(compiled, { module: mod, exports: mod.exports, Date, console, process: { env: {} }, require: (id: string) => {
    if (id in deps) return deps[id]; throw Error(`Unmocked boundary: ${id}`);
  } });
  return { row, calls, windows, writes, daysRequested, hooks, run: () => mod.exports.syncUserConnectors("athlete", provider),
    disconnect: () => Object.assign(row, { status: "disconnected", tokenEnc: null, refreshEnc: null, expiresAt: null, syncStartedAt: null }) };
}

test("disconnect during OAuth rotation cannot restore credentials or start an activity request", async () => {
  const f = fixture("strava", true); f.hooks.refresh = f.disconnect;
  assert.equal((await f.run()).results[0].ok, false);
  assert.equal(f.row.status, "disconnected"); assert.equal(f.row.tokenEnc, null); assert.equal(f.row.refreshEnc, null);
  assert.deepEqual(f.calls, ["refresh"]);
});

test("owned token rotation updates the worker snapshot and allows verified completion", async () => {
  const f = fixture("strava", true);
  assert.equal((await f.run()).results[0].ok, true);
  assert.equal(f.row.tokenEnc, "encrypted:synthetic-rotated"); assert.equal(f.row.refreshEnc, "encrypted:synthetic-new-refresh");
  assert.equal(f.row.syncStartedAt, null); assert.ok(f.row.lastSyncAt instanceof Date);
});

for (const provider of ["strava", "google_cal", "oura", "whoop"]) test(`${provider} disconnect during read keeps local access stopped`, async () => {
  const f = fixture(provider); f.hooks.read = f.disconnect;
  assert.equal((await f.run()).results[0].ok, false);
  assert.equal(f.row.status, "disconnected"); assert.equal(f.row.tokenEnc, null); assert.equal(f.row.lastSyncAt, null);
  assert.equal(f.calls.length, 1);
});

for (const fail of [false, true]) test(`reconnect or lease takeover survives stale ${fail ? "failure" : "success"} finalization`, async () => {
  const f = fixture();
  f.hooks.read = () => Object.assign(f.row, { tokenEnc: "synthetic-new-connection", refreshEnc: "synthetic-new-authorization", syncStartedAt: new Date("2099-01-01"), lastError: "New owner's state" });
  f.hooks.fail = fail;
  assert.equal((await f.run()).results[0].ok, false);
  assert.equal(f.row.tokenEnc, "synthetic-new-connection"); assert.equal(f.row.lastError, "New owner's state");
  assert.equal(f.row.syncStartedAt.toISOString(), "2099-01-01T00:00:00.000Z");
});

test("disconnect immediately before success finalization cannot produce a successful sync", async () => {
  const f = fixture(); f.hooks.final = f.disconnect;
  assert.equal((await f.run()).results[0].ok, false); assert.equal(f.row.status, "disconnected"); assert.equal(f.row.lastSyncAt, null);
});

test("WHOOP initial history requests all 180 days in paired contiguous windows", async () => {
  const f = fixture("whoop"); assert.equal((await f.run()).results[0].ok, true);
  const wellness = f.windows.filter(w => w.kind === "wellness"), workouts = f.windows.filter(w => w.kind === "workout");
  assert.equal(workouts.length, 6); assert.equal(wellness.length, 6);
  for (let i = 0; i < workouts.length; i++) {
    assert.equal(workouts[i].start.getTime(), wellness[i].start.getTime()); assert.equal(workouts[i].end.getTime(), wellness[i].end.getTime());
    assert.ok(workouts[i].end.getTime() - workouts[i].start.getTime() <= 30 * 86400000);
    if (i) assert.equal(workouts[i].start.getTime(), workouts[i - 1].end.getTime());
  }
  assert.equal(workouts.at(-1)!.end.getTime() - workouts[0].start.getTime(), 180 * 86400000);
  assert.equal(f.row.lastSyncAt.getTime(), workouts.at(-1)!.end.getTime());
});

test("WHOOP long interruption starts at its retained cursor and incomplete history never advances it", async () => {
  const original = new Date(Date.now() - 120 * 86400000), f = fixture("whoop", false, original);
  f.hooks.windowFailure = 2;
  assert.equal((await f.run()).results[0].ok, false); assert.equal(f.row.lastSyncAt, original);
  assert.equal(f.windows[0].start.getTime(), original.getTime() - 86400000);
  assert.equal(f.windows.filter(w => w.kind === "workout").length, 2);
  f.hooks.windowFailure = undefined; f.windows.length = 0;
  assert.equal((await f.run()).results[0].ok, true);
  assert.equal(f.windows[0].start.getTime(), original.getTime() - 86400000);
  assert.ok(f.windows.filter(w => w.kind === "workout").length >= 5);
});

test("Oura long interruption requests its entire retained history and preserves the cursor on provider failure", async () => {
  const original = new Date(Date.now() - 120 * 86400000), f = fixture("oura", false, original);
  f.hooks.fail = true;
  assert.equal((await f.run()).results[0].ok, false);
  assert.ok(f.daysRequested[0] >= 121 && f.daysRequested[0] <= 122);
  assert.equal(f.row.lastSyncAt, original);
  assert.equal(f.writes.some(write => write.lastSyncAt), false);
  f.hooks.fail = false;
  assert.equal((await f.run()).results[0].ok, true);
  assert.ok(f.daysRequested[1] >= 121 && f.daysRequested[1] <= 122);
  assert.ok(f.row.lastSyncAt > original);
});

test("WHOOP importer pagination keeps fixed explicit history bounds and refuses truncated success", async () => {
  const original = globalThis.fetch, seen: URL[] = [];
  const window = { start: new Date("2026-01-01T00:00Z"), end: new Date("2026-01-31T00:00Z") };
  globalThis.fetch = async (input) => { seen.push(new URL(String(input))); return Response.json({ records: [], next_token: "synthetic-next-page" }); };
  try {
    await assert.rejects(whoopGetWorkouts("synthetic", 30, window), /history is incomplete/);
    assert.equal(seen.length, 20);
    for (const url of seen) { assert.equal(url.searchParams.get("start"), window.start.toISOString()); assert.equal(url.searchParams.get("end"), window.end.toISOString()); }
    seen.length = 0;
    globalThis.fetch = async (input) => { seen.push(new URL(String(input))); return Response.json({ records: [] }); };
    await whoopGetDaily("synthetic", 30, "UTC", window);
    assert.equal(seen.length, 2);
    for (const url of seen) { assert.equal(url.searchParams.get("start"), window.start.toISOString()); assert.equal(url.searchParams.get("end"), window.end.toISOString()); }
  } finally { globalThis.fetch = original; }
});
