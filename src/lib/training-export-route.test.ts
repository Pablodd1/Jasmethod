// @ts-nocheck -- execute the route and access gate with isolated storage/session boundaries.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as calendarExport from "./training-export";
import { SessionResolutionError } from "./canonical-session";

function load(file, dependencies) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: key => {
    if (!(key in dependencies)) throw Error(`Unmocked dependency ${key}`);
    return dependencies[key];
  }, URL, Request, Response, Buffer, console });
  return exports;
}
function fixture({ signedOut = false, role = "athlete", assigned = false, resolutionError = false } = {}) {
  const calls = [];
  const athlete = { id: "athlete-a", role, name: "Example Athlete", email: "athlete-a@example.invalid", timezone: "America/New_York", language: "en", profile: {} };
  const workout = { id: "session-1", date: new Date("2026-10-09T04:00:00Z"), startTime: "07:30", title: "PRIVATE_RAW_WORKOUT", sport: "bike", durationMin: 60, completed: false };
  const plan = { name: "Training plan", days: [{ date: workout.date, week: 1, dayOff: false, sessions: [workout] }] };
  const db = Object.fromEntries(["workout", "dailyMetrics", "sleepRecord", "dailyCheckin"].map(model => [model, { findMany: async query => { calls.push({ model, query }); return []; } }]));
  db.trainingPlan = { findFirst: async query => { calls.push({ model: "trainingPlan", query }); return plan; } };
  db.coachAssignment = { findUnique: async () => assigned ? { status: "active", consent: "granted" } : null };
  db.user = { findUnique: async ({ where }) => ({ ...athlete, id: where.id }) };
  const access = load("src/lib/access.ts", { "./auth": { getCurrentUser: async () => signedOut ? null : athlete }, "./db": { prisma: db } });
  const route = load("src/app/api/training/export/route.ts", {
    "@/lib/access": access, "@/lib/db": { prisma: db }, "@/lib/training-export": calendarExport,
    "@/lib/canonical-session": { SessionResolutionError },
    "@/lib/effective-prescription": { effectivePrescription: async (userId, sessionId) => {
      calls.push({ model: "resolve", userId, sessionId });
      if (resolutionError) throw new SessionResolutionError("PRIVATE_MALFORMED_DETAILS");
      return null;
    } },
  });
  return { calls, get: query => route.GET(new Request(`https://app.example.invalid/api/training/export${query || ""}`)) };
}

test("direct ICS download is authenticated, scoped, private and does not fetch unrelated health exports", async () => {
  const f = fixture();
  const response = await f.get("?format=ics");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/calendar; charset=utf-8");
  assert.match(response.headers.get("content-disposition"), /example-athlete-training-calendar\.ics/);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  const text = (await response.text()).replace(/\r\n[ \t]/g, "");
  assert.match(text, /BEGIN:VCALENDAR/);
  assert.match(text, /DTSTART:20261009T113000Z/);
  assert.match(text, /does not auto-sync/);
  assert.match(text, /JMM provisional session/);
  assert.doesNotMatch(text, /PRIVATE_RAW_WORKOUT|athlete-a@example|device transfer complete/);
  assert.deepEqual(f.calls.map(c => c.model), ["trainingPlan", "resolve"]);
  assert.equal(f.calls[0].query.where.userId, "athlete-a");
  assert.equal(f.calls[1].userId, "athlete-a");
});

test("ICS and ZIP block signed-out and unauthorized cross-athlete exports before data reads", async () => {
  for (const query of ["?format=ics", ""]) {
    const f = fixture({ signedOut: true });
    assert.equal((await f.get(query)).status, 401);
    assert.equal(f.calls.length, 0);
  }
  for (const role of ["athlete", "coach"]) {
    const f = fixture({ role });
    assert.equal((await f.get("?format=ics&athleteId=athlete-b")).status, 403);
    assert.equal(f.calls.length, 0);
  }
  const f = fixture({ role: "coach", assigned: true });
  assert.equal((await f.get("?format=ics&athleteId=athlete-b")).status, 200);
  assert.equal(f.calls[0].query.where.userId, "athlete-b");
  assert.equal(f.calls[1].userId, "athlete-b");
});

test("ICS resolution failures retain non-actionable placeholder without private error details", async () => {
  const response = await fixture({ resolutionError: true }).get("?format=ics");
  assert.equal(response.status, 200);
  const text = (await response.text()).replace(/\r\n[ \t]/g, "");
  assert.match(text, /PROVISIONAL \/ ON HOLD/);
  assert.doesNotMatch(text, /PRIVATE_MALFORMED_DETAILS|PRIVATE_RAW_WORKOUT/);
});

test("default and explicit ZIP exports remain available; unsupported format rejects before reads", async () => {
  for (const query of ["", "?format=zip"]) {
    const f = fixture();
    const response = await f.get(query);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/zip");
    assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 2).toString(), "PK");
    assert.equal(f.calls.filter(c => ["workout", "dailyMetrics", "sleepRecord", "dailyCheckin"].includes(c.model)).length, 4);
  }
  const f = fixture();
  assert.equal((await f.get("?format=exe")).status, 400);
  assert.equal(f.calls.length, 0);
});
