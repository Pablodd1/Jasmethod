import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { appMutationOriginAllowed } from "./request-origin";
import { readScenarioJson } from "./race-scenario-http";
import { parseDailyEnvironmentCommand } from "./daily-environment-store";
import { assessDailyEnvironment } from "./daily-environment";
import { dateKey } from "./dates";
function fixture() {
  const state = { authenticated: true, writes: 0, prepares: 0, exists: true, conflict: false, contexts: [] as any[] };
  class ApiError extends Error { constructor(message: string, public status = 400) { super(message); } }
  const deps: Record<string, any> = {
    "@/lib/access": { ApiError, trainingAccess: async () => { if (!state.authenticated) throw new ApiError("Sign in", 401); return { actor: { id: "actor" }, athlete: { id: "athlete", timezone: "UTC" } }; } },
    "@/lib/request-origin": { appMutationOriginAllowed: (req: Request) => appMutationOriginAllowed(req, { APP_URL: "https://example.test" }) },
    "@/lib/ratelimit": { rateLimit: () => ({ ok: true }) },
    "@/lib/dates": { dateKey },
    "@/lib/race-scenario-http": { readScenarioJson, SCENARIO_HEADERS: { "Cache-Control": "private, no-store" }, scenarioError: (e: any) => Response.json({ error: e.message }, { status: e.status ?? 500, headers: { "Cache-Control": "private, no-store" } }) },
    "@/lib/daily-environment": { assessDailyEnvironment },
    "@/lib/daily-environment-store": { parseDailyEnvironmentCommand, readDailyEnvironment: async (...args: unknown[]) => { state.contexts.push(args); return { record: null, revision: null }; }, prepareDailyEnvironment: async (_command: unknown, scope: unknown) => { state.prepares++; state.contexts.push(scope); return {}; }, saveDailyEnvironment: async () => { state.writes++; return assessDailyEnvironment({ record: null, athleteId: "athlete", sessionId: "workout", dateLocal: dateKey(), timezone: "UTC" }); } },
    "@/lib/db": { prisma: { workout: { findFirst: async (q: any) => { assert.equal(q.where.userId, "athlete"); return state.exists ? { date: new Date(), startTime: null } : null; } }, $transaction: async (fn: any, options: any) => { assert.equal(options.isolationLevel, "Serializable"); if (state.conflict) throw { code: "P2034" }; return fn({}); } } },
  };
  const compiled = ts.transpileModule(fs.readFileSync("src/app/api/training/environment/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} as any }; vm.runInNewContext(compiled, { module: mod, exports: mod.exports, require: (id: string) => { if (!(id in deps)) throw Error(`Unmocked ${id}`); return deps[id]; }, Response, Request, URL });
  const body = { sessionId: "workout", expectedRevision: null, environment: { setting: "unknown", venueName: null, latitude: null, longitude: null, plannedLocal: null, timeZone: null, venueConfirmed: false, requestForecast: false } };
  const post = (headers: Record<string, string> = {}, value: unknown = body) => mod.exports.POST(new Request("https://example.test/api/training/environment", { method: "POST", headers: { Origin: "https://example.test", "Content-Type": "application/json", ...headers }, body: JSON.stringify(value) }));
  return { state, post, get: (id = "workout") => mod.exports.GET(new Request(`https://example.test/api/training/environment?sessionId=${id}`)) };
}
test("environment HTTP route requires auth, same-site JSON and scoped athlete access", async () => {
  const { state, post, get } = fixture(); state.authenticated = false;
  assert.equal((await post()).status, 401); assert.equal((await get()).status, 401); assert.equal(state.prepares, 0);
  state.authenticated = true;
  assert.equal((await post({ Origin: "https://evil.invalid" })).status, 403); assert.equal((await post({ Origin: "" })).status, 403); assert.equal((await post({ "sec-fetch-site": "cross-site" })).status, 403); assert.equal((await post({ "Content-Type": "text/plain" })).status, 415); assert.equal(state.prepares, 0); assert.equal(state.writes, 0);
  const response = await post(); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store"); assert.equal(state.writes, 1); assert.deepEqual(JSON.parse(JSON.stringify(state.contexts.at(-1))), { actorId: "actor", athleteId: "athlete", timezone: "UTC" });
});
test("GET never writes, absence stays unknown, missing sessions are not exposed, and conflicts are409", async () => {
  const { state, get, post } = fixture(); const response = await get(); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store"); assert.equal((await response.json()).environment.status, "unknown"); assert.equal(state.writes, 0); assert.equal(state.prepares, 0);
  state.exists = false; assert.equal((await get()).status, 404); assert.equal((await get("../bad")).status, 400);
  state.conflict = true; const conflict = await post(); assert.equal(conflict.status, 409); assert.equal(conflict.headers.get("cache-control"), "private, no-store"); assert.equal(state.writes, 0);
});
