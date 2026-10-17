import { buildUniversalWorkoutCard } from "./universal-workout-card-server";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { dayBounds, dateKey, localDate } from "./dates";
import { canonicalSession, SessionResolutionError } from "./canonical-session";
import { unitsOf } from "./units";
import { canonicalBlocks, planningDensity } from "../components/daily-training/training-contract";
import { readActualFueling } from "./actual-fueling";
import { readSessionObservations } from './session-observations';

function fixture(dateLocal: string, timezone = "America/New_York") {
  const workout = { id: "synthetic-session", userId: "synthetic-athlete", date: localDate(dateLocal, timezone), sport: "bike", title: "Synthetic ride", durationMin: 30, startTime: null, planned: true, completed: false };
  const canonical = canonicalSession({ athleteId: workout.userId, workout, dateLocal, timezone,
    prescription: { sport: "bike", verdict: "full", durationMin: 30, steps: [{ name: "Work", phase: "active", zone: "z2", seconds: 1800 }] },
    safety: { status: "unknown", reason: "Reassess on session day" } });
  const state = { authenticated: true, exists: true, resolved: 0, queryStart: null as Date | null, checkinDate: null as Date | null, changedDuringRead: false };
  class ApiError extends Error { constructor(public status: number) { super("Unavailable"); } }
  class NextResponse extends Response { static json(data: unknown, init?: ResponseInit) { return new Response(JSON.stringify(data), { ...init, headers: { "Content-Type": "application/json", ...init?.headers } }); } }
  const deps: Record<string, any> = {
    "@/lib/universal-workout-card-server": {buildUniversalWorkoutCard},
    "@/lib/actual-fueling": {readActualFueling},
    "@/lib/session-observations": {readSessionObservations},
    "next/server": { NextResponse }, "@/lib/units": { unitsOf },
    "@/lib/canonical-session": { SessionResolutionError },
    "@/lib/dates": { dayBounds, dateKey },
    "@/components/daily-training/training-contract": { canonicalBlocks, planningDensity },
    "@/lib/access": { trainingAccess: async () => { if (!state.authenticated) throw new ApiError(401); return { athlete: { id: workout.userId, timezone, language: "en", profile: {} } }; }, errorResponse: (e: ApiError) => Response.json({ error: e.message }, { status: e.status || 500 }) },
    "@/lib/db": { prisma: {
      workout: {
        findFirst: async (q: any) => { assert.equal(q.where.userId, workout.userId); assert.equal(q.where.planned, true); return state.exists && q.where.id === workout.id ? { date: workout.date } : null; },
        findMany: async (q: any) => { assert.equal(q.where.userId, workout.userId); state.queryStart = q.where.date.gte; return !state.changedDuringRead && workout.date >= q.where.date.gte && workout.date < q.where.date.lt ? [workout] : []; },
      }, race: { findFirst: async () => null },
      dailyCheckin: { findUnique: async (q: any) => { assert.equal(q.where.userId_date.userId, workout.userId); state.checkinDate = q.where.userId_date.date; return null; } },
    } },
    "@/lib/effective-prescription": { effectivePrescription: async (athlete: string, id: string) => { assert.equal(athlete, workout.userId); assert.equal(id, workout.id); state.resolved++; return { prescription: { sport: "bike", durationMin: 30 }, canonical, targetProfile: {}, nutrition: null }; } },
  };
  const compiled = ts.transpileModule(fs.readFileSync("src/app/api/v1/training/today/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} as any }; vm.runInNewContext(compiled, { module: mod, exports: mod.exports, require: (id: string) => { assert.ok(id in deps, id); return deps[id]; }, Response, Request, URL, Date });
  return { state, workout, get: (query = "sessionId=synthetic-session") => mod.exports.GET(new Request(`https://example.invalid/api/v1/training/today?${query}`)) };
}
test("selected historical/future links resolve owned date and preserve effective safety instead of 404", async () => {
  for (const day of ["2024-03-10", "2028-11-05"]) {
    const { get, state, workout } = fixture(day);
    const response = await get(); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
    const body = await response.json(); assert.equal(body.session.dateLocal, day); assert.equal(body.session.verdict, "blocked");
    assert.equal(state.queryStart?.toISOString(), workout.date.toISOString()); assert.equal(state.checkinDate?.toISOString(), workout.date.toISOString()); assert.equal(state.resolved, 1);
  }
});
test("rescheduled links follow the current owned date and ignore supplied date", async () => {
  const { get } = fixture("2028-12-04"); const response = await get("sessionId=synthetic-session&date=2024-01-01");
  assert.equal(response.status, 200); assert.equal((await response.json()).session.dateLocal, "2028-12-04");
});
test("selected links fail closed for other athletes, deleted sessions, bad IDs and interrupted reschedules", async () => {
  const { get, state } = fixture("2028-12-04");
  assert.equal((await get("sessionId=other-athlete-session")).status, 404);
  state.exists = false; assert.equal((await get()).status, 404); state.exists = true;
  assert.equal((await get("sessionId=")).status, 400); assert.equal((await get(`sessionId=${"x".repeat(201)}`)).status, 400);
  state.changedDuringRead = true; assert.equal((await get()).status, 404);
  state.authenticated = false; assert.equal((await get()).status, 401); assert.equal(state.resolved, 0);
});
test("unselected daily endpoint retains today's scoped empty response", async () => {
  const { get, state } = fixture("2024-01-01"); assert.equal((await get("")).status, 204);
  assert.equal(dateKey(state.queryStart!, "America/New_York"), dateKey(new Date(), "America/New_York"));
});
test("daily completion reloads saved fueling and actual minutes, never substituting planned time",async()=>{
  const {get,workout}=fixture("2028-12-04");
  Object.assign(workout,{feedbackStatus:"completed",feedbackAt:new Date(),actualDurationMin:90,avgHr:140,avgPower:180,calories:900,preWeightKg:70,postWeightKg:69.5,actualDetails:JSON.stringify({schemaVersion:1,values:{distanceKm:42},fueling:{schemaVersion:1,carbsG:90,fluidMl:1000,giSymptoms:"mild"}})});
  const response=await get();assert.equal(response.status,200);
  const body=await response.json();assert.equal(body.completion.actual.durationMinutes,90);assert.equal(body.completion.actual.status,"completed");
  assert.deepEqual(body.completion.actual.actualFueling,{schemaVersion:1,carbsG:90,fluidMl:1000,giSymptoms:"mild"});
  assert.deepEqual(body.completion.actual.measurements,{avgHr:140,avgPower:180,calories:900,preWeightKg:70,postWeightKg:69.5});
  assert.equal(body.session.totalMinutes,30,"planned duration remains a separate field");
});

test("quantity-only feedback reloads with unknown outcome, never inferred completion",async()=>{
  const {get,workout}=fixture("2028-12-04");
  Object.assign(workout,{feedbackStatus:null,feedbackAt:new Date(),completed:false,actualDurationMin:null,actualDetails:JSON.stringify({schemaVersion:1,values:{distanceKm:42},fueling:{schemaVersion:1,carbsG:0,fluidMl:null,giSymptoms:null}})});
  const response=await get();assert.equal(response.status,200);
  const body=await response.json();assert.equal(body.completion.actual.status,"unknown");assert.equal(body.completion.actual.durationMinutes,null);assert.equal(body.completion.actual.actualFueling.carbsG,0);
});
