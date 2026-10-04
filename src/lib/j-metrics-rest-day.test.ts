import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { addDaysKey, dateKey, localDate } from "./dates";
const require = createRequire(import.meta.url);

test("rest-day route authorization, local dates, conflict and idempotency", async t => {
  const user = { id: "athlete-a", timezone: "Pacific/Honolulu", passwordHash: `salt:${"a".repeat(64)}` };
  let authenticated = true, completed = false, fail = false;
  const rows: any[] = [{ userId: "athlete-b", metricType: "jmm_rest_day", observedAt: localDate(dateKey(new Date(), user.timezone), user.timezone) }];
  const audit: any[] = [], lookups: any[] = [];
  let locks = 0, serial = Promise.resolve();
  const db: any = {
    authSession: { findUnique: async () => authenticated ? { user, expiresAt: new Date(Date.now() + 60000) } : null },
    $queryRaw: async () => { locks++; },
    workout: { findFirst: async (query: any) => { lookups.push(query); return completed ? { id: "completed-without-rpe" } : null; } },
    metricObservation: {
      deleteMany: async ({ where }: any) => { for (let i = rows.length - 1; i >= 0; i--) if (rows[i].userId === where.userId && rows[i].metricType === where.metricType && rows[i].observedAt >= where.observedAt.gte && rows[i].observedAt < where.observedAt.lt) rows.splice(i, 1); },
      create: async ({ data }: any) => { if (fail) throw new Error("private database error"); rows.push(data); return data; },
    },
    appEvent: { create: async ({ data }: any) => { audit.push(data); return data; } },
    $transaction: (fn: any) => {
      const operation = serial.then(async () => {
        const snapshot = structuredClone(rows);
        try { return await fn(db); } catch (error) { rows.splice(0, rows.length, ...snapshot); throw error; }
      });
      serial = operation.then(() => undefined, () => undefined); return operation;
    },
  };
  const globalDb = globalThis as any, previous = globalDb.prisma;
  globalDb.prisma = db;
  const cookies = t.mock.method(require("next/headers"), "cookies", async () => ({ get: () => ({ value: "test-session" }) }));
  t.after(() => { globalDb.prisma = previous; cookies.mock.restore(); });
  const { POST } = await import("../app/api/j-metrics/rest-day/route");
  const today = dateKey(new Date(), user.timezone);
  const request = (body: unknown = { date: today, confirmed: true }, headers: Record<string, string> = {}) => new Request("https://app.example.invalid/api/j-metrics/rest-day", {
    method: "POST", headers: { origin: "https://app.example.invalid", "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body),
  });
  assert.equal((await POST(request(undefined, { origin: "https://other.example.invalid" }))).status, 403);
  assert.equal((await POST(request(undefined, { origin: "" }))).status, 403);
  authenticated = false;
  assert.equal((await POST(request())).status, 401);
  authenticated = true;
  assert.equal((await POST(request(undefined, { "content-type": "text/plain" }))).status, 415);
  for (const body of ["{", [], { date: "2026-02-30", confirmed: true }, { date: today, confirmed: "true" }, { date: today, confirmed: true, userId: "athlete-b" }, { date: addDaysKey(today, 1), confirmed: true }, { date: addDaysKey(today, -90), confirmed: true }]) {
    assert.equal((await POST(request(body))).status, 400);
  }
  assert.equal((await POST(request(" ".repeat(1025)))).status, 413);
  assert.equal(locks, 0);
  const results = await Promise.all([POST(request()), POST(request())]);
  assert.ok(results.every(result => result.status === 200));
  assert.equal(rows.filter(row => row.userId === user.id).length, 1);
  assert.equal(rows[0].userId, "athlete-b");
  assert.deepEqual(lookups[0].where.OR, [{ completed: true }, { feedbackStatus: { in: ["completed", "partial", "substituted"] } }]);
  assert.equal(lookups[0].where.userId, user.id);
  assert.equal(rows[1].observedAt.toISOString(), localDate(today, user.timezone).toISOString());
  assert.equal(rows[1].measurementMethod, "athlete_reported_rest");
  assert.ok(audit.every(event => !event.meta && !event.message.includes(today)));
  completed = true;
  assert.equal((await POST(request())).status, 409);
  assert.equal((await POST(request({ date: today, confirmed: false }))).status, 200);
  assert.equal(rows.length, 1); // Other athlete's marker survives deletion.
  completed = false;
  assert.equal((await POST(request({ date: addDaysKey(today, -89), confirmed: true }))).status, 200);
  fail = true;
  const failed = await POST(request({ date: addDaysKey(today, -89), confirmed: true }));
  assert.equal(failed.status, 500);
  assert.doesNotMatch(await failed.text(), /private database/);
  assert.equal(rows.length, 2); // Failed replacement restored the previous marker.
  assert.equal(rows[1].observedAt.toISOString(), localDate(addDaysKey(today, -89), user.timezone).toISOString());
});
