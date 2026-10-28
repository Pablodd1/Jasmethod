/** Actual queue/worker/sync/store source, synthetic database and provider seams.
 * No socket, real account, credentials, provider load or send is used. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as crypto from "node:crypto";
import * as dates from "./dates";
import { computeJMetrics, type JStressWorkout } from "./j-metrics";
import { mergeProviderMeasurements } from "./sport-measurements";

type Row = Record<string, any>;
const equal = (a: any, b: any) => a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some((item: Row) => matches(row, item));
    if (key === "AND") return value.every((item: Row) => matches(row, item));
    const current = row[key];
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if ("in" in value) return value.in.includes(current);
      if ("not" in value) return current != null && current !== value.not;
      if ("lt" in value) return current != null && current < value.lt;
      if ("lte" in value && !(current != null && current <= value.lte)) return false;
      if ("gte" in value && !(current != null && current >= value.gte)) return false;
      return true;
    }
    return value === null ? current == null : equal(current, value);
  });
}
function update(row: Row, data: Row) {
  for (const [key, value] of Object.entries(data)) row[key] = value && typeof value === "object" && "increment" in value ? row[key] + value.increment : value;
  return row;
}

function pilotFixture() {
  const now = new Date(), current = new Date(now.getTime() - 2 * 3600000), historical = new Date(now.getTime() - 60 * 86400000);
  const users: Row[] = Array.from({ length: 50 }, (_, i) => ({ id: `pilot-${i}`, timezone: ["UTC", "America/New_York", "Asia/Tokyo"][i % 3], profile: null }));
  const connectors = users.map((user, i) => ({ id: `connection-${i}`, userId: user.id, provider: "whoop", externalRef: String(1000 + i), tokenEnc: user.id, refreshEnc: `refresh-${i}`, status: "connected", expiresAt: null, syncStartedAt: null, lastSyncAt: null }));
  const jobs: Row[] = [], ledger: Row[] = [], calls: Row[] = [], writes: Row[] = [];
  const workouts: Row[] = users.map(user => ({ id: `plan-${user.id}`, userId: user.id, source: "plan", sport: "run", durationMin: 30, date: dates.dayBounds(user.timezone, current).start, planned: true, completed: false, matchedPlanId: null, feedbackStatus: null }));
  let rateLimited = false, revoked = false;
  const bulk = (rows: Row[], where: Row, data: Row) => { let count = 0; for (const row of rows) if (matches(row, where)) { update(row, data); count++; } return { count }; };
  const db: Row = {
    syncJob: {
      upsert: async ({ where, create }: Row) => {
        const prior = jobs.find(row => row.dedupeKey === where.dedupeKey);
        if (prior) return { ...prior };
        const row = { id: `job-${jobs.length}`, status: "pending", availableAt: new Date(0), attempts: 0, leaseToken: null, leasedUntil: null, ...create };
        jobs.push(row); return { ...row };
      },
      findMany: async ({ where, take }: Row) => jobs.filter(row => matches(row, where)).sort((a, b) => a.availableAt - b.availableAt).slice(0, take).map(row => ({ ...row })),
      updateMany: async ({ where, data }: Row) => bulk(jobs, where, data),
    },
    connector: {
      findFirst: async ({ where }: Row) => { const row = connectors.find(row => matches(row, where)); return row ? { ...row } : null; },
      findMany: async ({ where }: Row) => connectors.filter(row => matches(row, where)).map(row => ({ ...row })),
      updateMany: async ({ where, data }: Row) => { assert.ok(where.userId, "Every lifecycle mutation is owner-bound"); return bulk(connectors, where, data); },
    },
    user: { findUniqueOrThrow: async ({ where }: Row) => { const user = users.find(row => row.id === where.id); assert.ok(user); return user; } },
    webhookEvent: {
      createMany: async ({ data }: Row) => { const row = data[0]; if (ledger.some(x => x.provider === row.provider && x.eventId === row.eventId)) return { count: 0 }; ledger.push({ ...row, processedAt: null }); return { count: 1 }; },
      findUnique: async ({ where }: Row) => ledger.find(row => matches(row, where.provider_eventId)) ?? null,
      updateMany: async ({ where, data }: Row) => bulk(ledger, where, data),
    },
    $transaction: async (callback: (tx: Row) => Promise<unknown>) => {
      let owner: string | undefined;
      const owned = (where: Row) => { assert.equal(where.userId, owner, "Read/link cannot cross the transaction's athlete lock"); };
      return callback({
        $executeRaw: async (_query: TemplateStringsArray, userId: string) => { assert.ok(users.some(row => row.id === userId)); owner = userId; return 1; },
        athleteProfile: { findUnique: async ({ where }: Row) => { owned(where); return null; } },
        workout: {
          findFirst: async ({ where }: Row) => { owned(where); return workouts.find(row => matches(row, where)) ?? null; },
          findMany: async ({ where }: Row) => { owned(where); return workouts.filter(row => matches(row, where)).map(row => ({ ...row })); },
          create: async ({ data }: Row) => { assert.equal(data.userId, owner); const row = { id: `actual-${workouts.length}`, ...data }; workouts.push(row); writes.push({ owner, kind: "create", id: row.id }); return row; },
          update: async ({ where, data }: Row) => { const row = workouts.find(row => row.id === where.id); assert.ok(row); assert.equal(row.userId, owner, "A link/update cannot select another athlete's row"); writes.push({ owner, kind: "update", id: row.id }); return update(row, data); },
          updateMany: async ({ where, data }: Row) => { owned(where); return bulk(workouts, where, data); },
        },
      });
    },
  };
  const imports: Row = {
    whoopGetDaily: async (token: string) => {
      calls.push({ owner: token, kind: "daily" });
      if (token === "pilot-0" && !rateLimited) { rateLimited = true; throw Object.assign(Error("Synthetic WHOOP 429; retry later"), { status: 429 }); }
      if (token === "pilot-49" && !revoked) { revoked = true; Object.assign(connectors[49], { status: "disconnected", tokenEnc: null, refreshEnc: null, syncStartedAt: null }); }
      return [];
    },
    whoopGetWorkouts: async (token: string, _days: number, window: { start: Date; end: Date }) => {
      calls.push({ owner: token, kind: "workouts", ...window });
      return [
        { externalId: "whoop:shared-history-id", start: historical, durationMin: 20, sport: "bike", title: "Synthetic history" },
        { externalId: "whoop:shared-new-id", start: current, durationMin: 30, sport: "run", title: "Synthetic recent activity" },
      ].filter(row => row.start >= window.start && row.start < window.end);
    },
  };
  const deps: Row = {
    "node:crypto": crypto, "./db": { prisma: db }, "./dates": dates, "next/server": { NextResponse: Response },
    "./crypto": { decryptSecret: (value: string) => value, encryptSecret: (value: string) => value },
    "./importers": imports,
    "./capabilities": { requireStravaConnector: () => { throw Error("Strava disabled"); }, stravaConnectorEnabled: () => false, intervalsConnectorEnabled: () => false },
    "./strava-privacy-event": { isStravaPrivacyEvent: () => false },
    "./activity-report": { generateAndDeliverActivityReport: async () => {} },
    "./sport-measurements": { mergeProviderMeasurements },
    "./telemetry": { meterUsage: async (userId: string) => assert.ok(users.some(user => user.id === userId)) },
    "./device-metric-snapshot": {}, "./manual-workout-calendar": {}, "./manual-workout-email-locale": {},
    "./manual-workout-email": {}, "./manual-workout-email-content": {}, "./effective-prescription": {}, "./canonical-session": {}, "./calendar-workouts": {},
  };
  const sourceModules = new Set(["./background-jobs", "./webhook-queue", "./worker-whoop", "./sync", "./activity-store"]);
  const load = (id: string): any => {
    if (id in deps) return deps[id];
    if (!sourceModules.has(id)) throw Error(`Unmocked boundary: ${id}`);
    const vmModule = { exports: {} }; deps[id] = vmModule.exports;
    const compiled = ts.transpileModule(fs.readFileSync(`src/lib/${id.slice(2)}.ts`, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(compiled, { module: vmModule, exports: vmModule.exports, Date, console, Request, Response, Buffer, process: { env: {} }, require: load });
    return vmModule.exports;
  };
  const background = load("./background-jobs");
  return { users, connectors, jobs, workouts, calls, writes, ledger, queue: load("./webhook-queue").queueVerifiedProviderEvent, worker: load("./worker-whoop").processVerifiedEvent,
    enqueueSyncJob: background.enqueueSyncJob as (userId: string, kind: string, dedupeKey: string, payload: unknown) => Promise<Row>,
    processSyncJob: background.processSyncJob as (job: Row) => Promise<void>,
    runSyncJobs: background.runSyncJobs as (limit: number, processor: (job: Row) => Promise<void>) => Promise<Row[]>,
    sync: load("./sync").syncUserConnectors as (userId: string, provider: string) => Promise<Row>,
  };
}

test("50 synthetic athletes use the real durable queue, WHOOP lifecycle and activity store without cross-owner links or duplicate imports", async () => {
  const f = pilotFixture();
  for (const [i, user] of f.users.entries()) {
    const event = { user_id: 1000 + i, event_id: `synthetic-event-${i}`, event_type: "workout.updated", data: { id: "shared-new-id" } };
    assert.equal((await f.queue("whoop", event)).status, 200);
    await f.queue("whoop", event);
    await f.enqueueSyncJob(user.id, "sync", `poll:${user.id}`, { provider: "whoop" });
    await f.enqueueSyncJob(user.id, "sync", `poll:${user.id}`, { provider: "whoop" });
  }
  assert.equal(f.connectors.length, 50); assert.equal(f.jobs.length, 100, "Duplicate webhooks and polling retries reuse durable jobs");
  Object.assign(f.connectors[48], { status: "disconnected", tokenEnc: null, refreshEnc: null });
  let active = 0, peak = 0;
  const process = async (job: Row) => { active++; peak = Math.max(peak, active); try { await f.processSyncJob(job); } finally { active--; } };
  let retries = 0;
  while (f.jobs.some(job => job.status === "pending" && job.availableAt <= new Date())) {
    const result = await f.runSyncJobs(4, process);
    retries += result.filter((row: Row) => row.status === "retrying").length;
  }
  assert.ok(peak > 1 && peak <= 4, `Worker batch concurrency stays bounded: ${peak}`);
  assert.ok(retries >= 1, "Simulated 429 is a retry, not successful sync");
  const limited = f.jobs.find(job => job.userId === "pilot-0" && job.status === "pending"); assert.ok(limited);
  assert.equal(limited.attempts, 1); assert.ok(limited.availableAt > new Date(), "Backoff prevents an immediate provider retry");
  assert.equal(f.ledger.find(row => row.eventId === "synthetic-event-0")?.processedAt, null, "Failed event is not falsely acknowledged as processed");
  for (let round = 0; round < 4 && f.jobs.some(job => job.status === "pending"); round++) {
    // Advance synthetic time between retries, including a webhook/poll lease collision.
    for (const job of f.jobs.filter(job => job.status === "pending")) job.availableAt = new Date(0);
    while (f.jobs.some(job => job.status === "pending" && job.availableAt <= new Date())) await f.runSyncJobs(4, process);
  }
  assert.ok(f.jobs.every(job => job.status === "done"), JSON.stringify({ remaining: f.jobs.filter(job => job.status !== "done"), connector: f.connectors[0], actuals: f.workouts.filter(row => !row.planned).length, calls: f.calls.slice(-3) }));
  assert.equal(f.workouts.filter(row => !row.planned).length, 96, "48 still-connected owners retain one history and one new activity each");
  for (const user of f.users.slice(0, 48)) {
    const rows = f.workouts.filter(row => row.userId === user.id), actuals = rows.filter(row => !row.planned);
    assert.equal(actuals.length, 2); assert.equal(new Set(actuals.map(row => row.externalId)).size, 2);
    const planned = rows.find(row => row.planned)!; assert.equal(planned.completed, true);
    const recent = actuals.find(row => row.id === planned.matchedPlanId)!;
    assert.equal(recent.externalId, "whoop:shared-new-id");
    const unknown = computeJMetrics(rows as JStressWorkout[], new Date(), user.timezone);
    assert.equal(unknown.totalJStress, null, "WHOOP duration/HR never fabricate subjective RPE or training load");
    assert.equal(unknown.eligibleSessions, 0); assert.equal(unknown.totalSessions, 2, "Linked plan is excluded from the performed denominator");
    // A deliberately supplied synthetic athlete answer; never inferred from device data.
    recent.rpe = 4; recent.feedbackStatus = "completed";
    const reported = computeJMetrics(rows as JStressWorkout[], new Date(), user.timezone);
    assert.equal(reported.totalJStress, 120, "30 actual minutes × explicitly reported RPE4; matched plan counts once");
    assert.equal(reported.eligibleSessions, 1); assert.equal(reported.coveragePct, 50, "Unknown historical effort stays unavailable");
    assert.equal((await f.sync(user.id, "whoop")).results[0].ok, true);
    assert.equal(computeJMetrics(f.workouts.filter(row => row.userId === user.id) as JStressWorkout[], new Date(), user.timezone).totalJStress, 120, "Polling preserves reported effort and does not duplicate load");
  }
  for (const i of [48, 49]) {
    assert.equal(f.connectors[i].status, "disconnected"); assert.equal(f.connectors[i].lastSyncAt, null);
    assert.ok(f.workouts.filter(row => row.userId === `pilot-${i}`).every(row => row.planned && !row.completed && row.matchedPlanId === null));
  }
  assert.equal(f.calls.some(row => row.owner === "pilot-48"), false, "Disconnected owner receives no provider request");
  assert.equal(f.calls.some(row => row.owner === "pilot-49" && row.kind === "workouts"), false, "Revocation during the daily fetch fences subsequent workout reads and writes");
  const beforeWrites = f.writes.length, beforeCalls = f.calls.length;
  const replay = await f.worker(new Request("http://local.invalid", { method: "POST", body: JSON.stringify({ user_id: 1001, event_id: "synthetic-event-1", event_type: "workout.updated" }) }), "pilot-1");
  assert.equal((await replay.json()).deduplicated, true); assert.equal(f.writes.length, beforeWrites); assert.equal(f.calls.length, beforeCalls);
  await f.worker(new Request("http://local.invalid", { method: "POST", body: JSON.stringify({ user_id: 1002, event_id: "synthetic-foreign-binding", event_type: "workout.updated" }) }), "pilot-1");
  assert.equal(f.writes.length, beforeWrites); assert.equal(f.calls.length, beforeCalls, "Foreign provider identity cannot invoke another athlete's sync");
});
