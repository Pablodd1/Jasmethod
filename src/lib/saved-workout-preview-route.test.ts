import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { savedWorkoutPreview } from "./saved-workout-preview";
import { validSavedSessionId } from "./saved-workout-preview-contract";
import { evidencedTargetProfile } from "./anchor-evidence";
import { unitsOf } from "./units";

function load(file: string, dependencies: Record<string, unknown>): Record<string, any> {
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, { module: mod, exports: mod.exports, require: (key: string) => {
    if (!(key in dependencies)) throw Error(`Unmocked dependency: ${key}`);
    return dependencies[key];
  }, Response, Request, URL, console });
  return mod.exports;
}

function fixture() {
  const calls: { model: string; query: any }[] = [];
  const state = { signedOut: false, role: "athlete", assigned: false, exists: true, injured: false,
    applied: false, tested: false, malformed: false, offDay: false };
  const user = (id: string) => ({ id, role: state.role, timezone: "UTC", language: "en", profile: { ftp: 200, lthr: 175, units: "metric", injured: state.injured } });
  const db = {
    coachAssignment: { findUnique: async () => state.assigned ? { status: "active", consent: "granted" } : null },
    user: { findUnique: async ({ where }: any) => user(where.id) },
    workout: { findFirst: async (query: any) => {
      calls.push({ model: "workout", query });
      if (!state.exists || query.where.id !== "saved-session") return null;
      assert.equal(query.where.planned, true);
      return { id: query.where.id, userId: query.where.userId, planned: true, date: new Date("2026-10-13T12:00:00Z"), title: "Stored ride", sport: "bike", durationMin: 10, planDay: { dayOff: state.offDay },
        prescription: state.malformed ? "not-json" : JSON.stringify({ steps: [{ name: "Easy", zone: "z2", phase: "active", seconds: 600 }] }) };
    } },
    auditLog: { findMany: async (query: any) => { calls.push({ model: "auditLog", query }); return state.applied ? [{ entityId: "benchmark" }] : []; } },
    benchmarkTest: { findMany: async (query: any) => { calls.push({ model: "benchmarkTest", query }); return state.tested ? [{ id: "benchmark", type: "ftp", result: 200, date: new Date(), completed: true, skipped: false }] : []; } },
  };
  const access = load("src/lib/access.ts", { "./auth": { getCurrentUser: async () => state.signedOut ? null : user("athlete-a") }, "./db": { prisma: db } });
  const route = load("src/app/api/plan/preview/route.ts", {
    "@/lib/access": access, "@/lib/db": { prisma: db }, "@/lib/anchor-evidence": { evidencedTargetProfile },
    "@/lib/saved-workout-preview": { savedWorkoutPreview }, "@/lib/saved-workout-preview-contract": { validSavedSessionId }, "@/lib/units": { unitsOf },
  });
  return { state, calls, route, get: (query = "?sessionId=saved-session") => route.GET(new Request(`https://app.example.invalid/api/plan/preview${query}`)) as Promise<Response> };
}

test("saved preview route uses the real auth gate and refuses cross-athlete requests before plan reads", async () => {
  const f = fixture(); f.state.signedOut = true;
  assert.equal((await f.get()).status, 401); assert.equal(f.calls.length, 0);
  for (const role of ["athlete", "coach"]) {
    const blocked = fixture(); blocked.state.role = role;
    const response = await blocked.get("?sessionId=saved-session&athleteId=athlete-b");
    assert.equal(response.status, 403); assert.equal(blocked.calls.length, 0);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  const coach = fixture(); coach.state.role = "coach"; coach.state.assigned = true;
  assert.equal((await coach.get("?sessionId=saved-session&athleteId=athlete-b")).status, 200);
  assert.equal(coach.calls.find(c => c.model === "workout")?.query.where.userId, "athlete-b");
  assert.equal(coach.calls.find(c => c.model === "auditLog")?.query.where.subjectId, "athlete-b");
  assert.equal(coach.calls.find(c => c.model === "benchmarkTest")?.query.where.userId, "athlete-b");
});

test("preview reads one scoped planned session and athlete evidence without writes or execution APIs", async () => {
  const f = fixture(); const response = await f.get(); const data = await response.json();
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(f.calls.map(c => c.model).sort(), ["auditLog", "benchmarkTest", "workout"]);
  const workout = f.calls.find(c => c.model === "workout")!;
  assert.equal(workout.query.where.id, "saved-session"); assert.equal(workout.query.where.userId, "athlete-a");
  assert.equal(workout.query.select.planDay.select.dayOff, true);
  assert.equal(f.calls.find(c => c.model === "benchmarkTest")?.query.take, 100);
  assert.equal(data.session.steps[0].target.type, "open");
  assert.match(data.session.steps[0].target.missingReason, /No validated/);
  assert.equal("POST" in f.route, false); assert.equal("PATCH" in f.route, false); assert.equal("PUT" in f.route, false);
  assert.doesNotMatch(JSON.stringify(data), /"(?:capability|verdict|revision|nutrition|athleteId|prescription)":/);
  f.state.tested = true;
  assert.equal((await (await f.get()).json()).session.steps[0].target.type, "open");
  f.state.applied = true;
  assert.equal((await (await f.get()).json()).session.steps[0].target.high, 150);
});

test("route validates single IDs, conceals absent sessions, and fails closed for malformed/offday/injury", async () => {
  for (const query of ["", "?sessionId=", "?sessionId=../bad", `?sessionId=${"a".repeat(201)}`, "?sessionId=one&sessionId=two"]) {
    const f = fixture(); assert.equal((await f.get(query)).status, 400); assert.equal(f.calls.length, 0);
  }
  const absent = fixture(); absent.state.exists = false;
  const response = await absent.get(); assert.equal(response.status, 404); assert.deepEqual(await response.json(), { error: "Session not found" });
  for (const field of ["malformed", "offDay", "injured"] as const) {
    const f = fixture(); f.state[field] = true;
    const response = await f.get(); const data = await response.json();
    assert.equal(response.status, 200); assert.equal(data.available, false); assert.equal(data.session, null);
    assert.doesNotMatch(JSON.stringify(data), /"(?:capability|verdict|revision|nutrition)":/);
  }
});
