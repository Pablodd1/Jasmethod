import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { appMutationOriginAllowed } from "./request-origin";
import { readScenarioJson } from "./race-scenario-http";
import { readDailyEnvironmentRecord, dailyForecastSnapshot } from "./daily-environment";
import { locationSearchInput, isTrainingLocation } from "./training-location";

function fixture() {
  const state = { authenticated: true, rate: true, calls: 0, rows: [] as any[] };
  class ApiError extends Error { constructor(message: string, public status = 400) { super(message); } }
  const deps: Record<string, any> = {
    "@/lib/access": { ApiError, trainingAccess: async () => { if (!state.authenticated) throw new ApiError("Sign in", 401); return { actor: { id: "actor" }, athlete: { id: "athlete" } }; } },
    "@/lib/db": { prisma: { auditLog: { findMany: async (q: any) => { assert.equal(q.where.subjectId, "athlete"); assert.equal(q.where.action, "workout.environment"); assert.equal(q.take, 40); return state.rows; } } } },
    "@/lib/request-origin": { appMutationOriginAllowed: (r: Request) => appMutationOriginAllowed(r, { APP_URL: "https://example.test" }) },
    "@/lib/ratelimit": { rateLimit: () => ({ ok: state.rate }) },
    "@/lib/race-scenario-http": { readScenarioJson, SCENARIO_HEADERS: { "Cache-Control": "private, no-store" }, scenarioError: (e: any) => Response.json({ error: e.message }, { status: e.status ?? 500 }) },
    "@/lib/daily-environment-store": { DAILY_ENVIRONMENT_ACTION: "workout.environment" },
    "@/lib/daily-environment": { readDailyEnvironmentRecord },
    "@/lib/training-location": { isTrainingLocation, locationSearchInput, searchTrainingLocations: async () => { state.calls++; return [{ label: "Miami, Florida", latitude: 25, longitude: -80, timeZone: "America/New_York" }]; } },
  };
  const compiled = ts.transpileModule(fs.readFileSync("src/app/api/training/locations/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} as any }; vm.runInNewContext(compiled, { module: mod, exports: mod.exports, require: (id: string) => { if (!(id in deps)) throw Error(id); return deps[id]; }, Response, Request, URL });
  return { state, get: () => mod.exports.GET(new Request("https://example.test/api/training/locations")), post: (body: unknown = { query: "33101" }, origin = "https://example.test") => mod.exports.POST(new Request("https://example.test/api/training/locations", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) })) };
}
test("location lookup requires authenticated same-origin bounded input and rate limits before external calls", async () => {
  const f = fixture(); f.state.authenticated = false;
  assert.equal((await f.get()).status, 401); assert.equal((await f.post()).status, 401);
  f.state.authenticated = true;
  assert.equal((await f.post({ query: "Miami" }, "https://evil.invalid")).status, 403);
  assert.equal((await f.post({ query: "Miami", url: "https://evil.invalid" })).status, 400);
  assert.equal((await f.post({ query: "x".repeat(2048) })).status, 400);
  f.state.rate = false; assert.equal((await f.post()).status, 429); assert.equal(f.state.calls, 0);
  f.state.rate = true; const response = await f.post(); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store"); assert.equal(f.state.calls, 1);
});
test("saved location lookup never calls geocoder and excludes foreign, malformed and unconfirmed evidence", async () => {
  const f = fixture(); f.state.rows = [{ entityId: "other", after: JSON.stringify({ athleteId: "other", venueName: "PRIVATE" }) }, { entityId: "invalid", after: "{}" }];
  const response = await f.get(); assert.equal(response.status, 200); assert.deepEqual((await response.json()).locations, []); assert.equal(f.state.calls, 0);
});
test("previous confirmed city is offered once without reusing its forecast or claiming today's venue", async () => {
  const f = fixture();
  const record = { version: "daily-environment-v1", athleteId: "athlete", sessionId: "workout", setting: "outdoor", venueName: "Miami, Florida", latitude: 25, longitude: -80, plannedLocal: "2026-10-10T09:00", timeZone: "America/New_York", venueConfirmed: true, requestForecast: false, observedOn: "2026-10-10", scheduleTime: "13:00", scheduleTimezone: "UTC", source: "athlete_reported", confirmedAt: "2026-10-10T11:55:00Z", plannedAt: "2026-10-10T13:00:00.000Z", forecast: dailyForecastSnapshot() };
  f.state.rows = [{ entityId: "workout", after: JSON.stringify(record) }, { entityId: "workout", after: JSON.stringify(record) }, { entityId: "workout", after: JSON.stringify({ ...record, athleteId: "other" }) }];
  const locations = (await (await f.get()).json()).locations;
  assert.deepEqual(locations, [{ label: "Miami, Florida", latitude: 25, longitude: -80, timeZone: "America/New_York" }]);
  assert.equal("forecast" in locations[0], false); assert.equal("venueConfirmed" in locations[0], false); assert.equal(f.state.calls, 0);
});
