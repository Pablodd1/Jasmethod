import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as crypto from "node:crypto";
import * as stravaPrivacy from "./strava-privacy-event";

// Real boundary modules; every DB/provider effect is replaced and counted.
function load(path: string, deps: Record<string, unknown>, env: Record<string, string | undefined> = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod: any = { exports: {} };
  vm.runInNewContext(compiled, { module: mod, exports: mod.exports, Response, Request, URL, Date, process: { env }, require: (id: string) => {
    if (id in deps) return deps[id]; throw Error(`Unexpected boundary: ${id}`);
  } });
  return mod.exports;
}
const capabilities = load("src/lib/capabilities.ts", {});
const NextResponse = { json: (data: unknown, init?: ResponseInit) => Response.json(data, init) };

test("disabled Strava blocks webhook validation, ingress, durable enqueue and old job execution", async () => {
  let effects = 0;
  const unexpected = async () => { effects++; throw Error("Unexpected external effect"); };
  const prisma = { syncJob: { upsert: unexpected }, connector: { findFirst: unexpected } };
  const jobs = load("src/lib/background-jobs.ts", { "node:crypto": crypto, "./db": { prisma }, "./capabilities": capabilities, "./strava-privacy-event": stravaPrivacy });
  for (const kind of ["strava", "sync"]) {
    await assert.rejects(jobs.enqueueSyncJob("owner", kind, "synthetic", { provider: "strava" }), /paused/);
    await assert.rejects(jobs.processSyncJob({ userId: "owner", kind, payload: JSON.stringify({ provider: "strava" }) }), /paused/);
  }
  const queue = load("src/lib/webhook-queue.ts", { "node:crypto": crypto, "./db": { prisma }, "./background-jobs": jobs, "./capabilities": capabilities, "./strava-privacy-event": stravaPrivacy });
  assert.equal((await queue.queueVerifiedProviderEvent("strava", { owner_id: 1 })).status, 503);
  const route = load("src/app/api/connectors/strava/webhook/route.ts", {
    "next/server": { NextResponse }, "@/lib/capabilities": capabilities, "@/lib/webhook-queue": { queueVerifiedProviderEvent: unexpected }, "@/lib/strava-privacy-event": stravaPrivacy,
  }, { STRAVA_SUBSCRIPTION_ID: "synthetic" });
  assert.equal((await route.GET(new Request("https://app.example/webhook?hub.mode=subscribe&hub.challenge=synthetic"))).status, 503);
  assert.equal((await route.POST(new Request("https://app.example/webhook", { method: "POST", body: JSON.stringify({ subscription_id: "synthetic", object_type: "activity", aspect_type: "create", owner_id: 1, object_id: 2 }) }))).status, 503);
  const sync = load("src/app/api/connectors/sync/route.ts", {
    "next/server": { NextResponse }, "@/lib/capabilities": capabilities, "@/lib/auth": { getCurrentUser: async () => ({ id: "owner" }) }, "@/lib/sync": { syncUserConnectors: unexpected },
  });
  assert.equal((await sync.POST(new Request("https://app.example/sync", { method: "POST", body: JSON.stringify({ provider: "strava" }) }))).status, 503);
  assert.equal(effects, 0);
});

test("disabled Strava still exposes the owner's saved connection status, without offering new imports", async () => {
  const saved = { provider: "strava", status: "connected", lastSyncAt: "2026-10-01", lastSyncCount: 12 };
  const route = load("src/app/api/connectors/route.ts", {
    "@/lib/capabilities": capabilities, "@/lib/auth": { getCurrentUser: async () => ({ id: "owner" }) },
    "@/lib/db": { prisma: { connector: { findMany: async (args: any) => { assert.equal(args.where.userId, "owner"); return [saved]; } } } },
    "@/lib/intervals-oauth": { intervalsOAuthConfigured: () => false }, "@/lib/athlinks": { athlinksConfigured: () => false }, "@/lib/athlinks-availability": { ATHLINKS_DEFERRED: true },
  }, { STRAVA_CLIENT_ID: "synthetic", STRAVA_CLIENT_SECRET: "synthetic" });
  const result = await (await route.GET()).json();
  const strava = result.providers.find((row: any) => row.id === "strava");
  assert.equal(strava.status, "connected"); assert.equal(strava.lastSyncCount, 12);
  assert.equal(strava.configured, false); assert.equal(strava.connectUrl, null); assert.equal(strava.capabilities.imports, false);
  assert.equal(result.connectors[0].provider, "strava"); assert.equal(result.capabilities.stravaConnector, false);
});
