import test from "node:test";
import assert from "node:assert/strict";
import { resolveAppleExport } from "./apple-export-request";
import { canonicalSession, type CanonicalSession } from "./canonical-session";
const request = (query = "sessionId=session-1&expectedRevision=revision-1") => new Request(`https://app.example/api/workout/apple-export?${query}`);
function fixture(overrides: Record<string, unknown> = {}) {
  const calls: string[][] = [];
  return { calls, dependencies: {
    env: { ENABLE_APPLE_WORKOUT_EXPORT: "true" },
    access: async () => ({ actor: { id: "athlete-a" }, athlete: { id: "athlete-a" } }),
    resolve: async (athleteId: string, sessionId: string) => {
      calls.push([athleteId, sessionId]);
      return { canonical: { athleteId: "athlete-a", id: "session-1", revision: "revision-1" } as CanonicalSession };
    }, ...overrides,
  } };
}
const rejectsStatus = async (action: () => Promise<unknown>, status: number) => assert.rejects(action, (error: unknown) => typeof error === "object" && error !== null && "status" in error && error.status === status);
test("Apple export requires authentication before capability or workout resolution", async () => {
  const { calls, dependencies } = fixture({ access: async () => { throw Object.assign(new Error("Sign in"), { status: 401 }); } });
  await rejectsStatus(() => resolveAppleExport(request(), dependencies), 401);
  assert.equal(calls.length, 0);
});
test("Apple export disabled by default before any workout read", async () => {
  const { calls, dependencies } = fixture({ env: {} });
  await rejectsStatus(() => resolveAppleExport(request(), dependencies), 503);
  assert.equal(calls.length, 0);
});
test("Apple export refuses cross-athlete access even for an authorized coach", async () => {
  const { calls, dependencies } = fixture({ access: async () => ({ actor: { id: "coach" }, athlete: { id: "athlete-a" } }) });
  await rejectsStatus(() => resolveAppleExport(request(), dependencies), 403);
  assert.equal(calls.length, 0);
});
test("Apple export validates bounded IDs and current revision", async () => {
  for (const query of ["", "sessionId=session-1", "sessionId=" + "x".repeat(201) + "&expectedRevision=revision-1"]) {
    const { calls, dependencies } = fixture();
    await rejectsStatus(() => resolveAppleExport(request(query), dependencies), 400);
    assert.equal(calls.length, 0);
  }
  const { calls, dependencies } = fixture();
  await rejectsStatus(() => resolveAppleExport(request("sessionId=session-1&expectedRevision=old"), dependencies), 409);
  assert.deepEqual(calls, [["athlete-a", "session-1"]]);
});
test("Apple export rejects a mismatched resolved tenant or session", async () => {
  for (const canonical of [{ athleteId: "athlete-b", id: "session-1" }, { athleteId: "athlete-a", id: "session-2" }]) {
    const { dependencies } = fixture({ resolve: async () => ({ canonical: canonical as CanonicalSession }) });
    await rejectsStatus(() => resolveAppleExport(request(), dependencies), 404);
  }
});

test("Apple export does not turn a missing workout into an internal error", async () => {
  const { dependencies } = fixture({ resolve: async () => null });
  await rejectsStatus(() => resolveAppleExport(request(), dependencies), 404);
});

function canonical(verdict = "full") {
  return canonicalSession({
    athleteId: "athlete-a",
    workout: { id: "session-1", userId: "athlete-a", sport: "run", title: "Synthetic run", durationMin: 1 },
    prescription: { sport: "run", durationMin: 1, verdict, steps: [{ name: "Run", phase: "active", zone: "z2", seconds: 60, target: { type: "open" } }] },
    dateLocal: "2026-10-09", timezone: "UTC",
  });
}
test("Apple export emits only the exact owned revision and no account profile", async () => {
  const session = canonical();
  const { dependencies } = fixture({ resolve: async () => ({ canonical: session }) });
  const result = await resolveAppleExport(request(`sessionId=session-1&expectedRevision=${session.revision}`), dependencies);
  assert.equal(result.revision, session.revision);
  assert.equal(result.sessionId, session.id);
  assert.equal(result.steps.length, session.steps.length);
  assert.equal(result.hardwareVerified, false);
  assert.equal(result.localSchedulerOnly, true);
  assert.ok(!("athleteId" in result));
  assert.ok(!("profile" in result));
  assert.ok(!("email" in result));
});
test("Apple export preserves effective safety holds", async () => {
  const session = canonical("rest");
  const { dependencies } = fixture({ resolve: async () => ({ canonical: session }) });
  await rejectsStatus(() => resolveAppleExport(request(`sessionId=session-1&expectedRevision=${session.revision}`), dependencies), 409);
});
