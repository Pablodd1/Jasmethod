import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as crypto from "node:crypto";
import * as privacy from "./strava-privacy-event";

const deletion = { subscription_id: "synthetic-subscription", owner_id: 123, object_id: 456, object_type: "activity", aspect_type: "delete", event_time: 100 };
const deauth = { ...deletion, object_id: 123, object_type: "athlete", aspect_type: "update", updates: { authorized: "false" } };
const update = { ...deletion, aspect_type: "update" };
const NextResponse = { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) };
function load(path: string, deps: Record<string, unknown>, env: Record<string, string> = {}) {
  const mod: any = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module: mod, exports: mod.exports, Request, Response, URL, Date, console, process: { env }, require: (key: string) => {
    if (key in deps) return deps[key]; throw Error(`Unexpected external boundary: ${key}`);
  } });
  return mod.exports;
}
function fixture(enabled = false) {
  const capabilities = load("src/lib/capabilities.ts", {}, { ENABLE_STRAVA_CONNECTOR: enabled ? "true" : "false" });
  const state = { connection: { id: "connection", userId: "owner", provider: "strava", externalRef: "123", status: "disconnected", tokenEnc: "stopped", refreshEnc: "stopped" } as Record<string, any>, present: true,
    providerCalls: 0, lookups: [] as any[], deleted: [] as any[], changes: [] as any[], jobs: [] as any[], claimed: new Map<string, boolean>(), audit: [] as any[] };
  const forbidden = async () => { state.providerCalls++; throw Error("Provider calls forbidden"); };
  const match = (where: any) => state.present && Object.entries(where).every(([key, value]: [string, any]) => value && typeof value === "object" && "in" in value ? value.in.includes(state.connection[key]) : state.connection[key] === value);
  const prisma = {
    connector: {
      findFirst: async ({ where }: any) => { state.lookups.push(where); return match(where) ? { ...state.connection } : null; },
      updateMany: async ({ where, data }: any) => { if (!match(where)) return { count: 0 }; state.changes.push({ where, data }); Object.assign(state.connection, data); return { count: 1 }; },
    },
    syncJob: { upsert: async ({ create }: any) => { state.jobs.push(create); return { id: "job", ...create }; } },
    webhookEvent: {
      createMany: async ({ data }: any) => { const id = data[0].eventId; if (state.claimed.has(id)) return { count: 0 }; state.claimed.set(id, false); return { count: 1 }; },
      findUnique: async ({ where }: any) => ({ processedAt: state.claimed.get(where.provider_eventId.eventId) ? new Date() : null }),
      updateMany: async ({ where }: any) => { state.claimed.set(where.eventId, true); return { count: 1 }; },
    },
    auditLog: { create: async (args: any) => { state.audit.push(args); return {}; } },
    user: { findUnique: forbidden },
  };
  const worker = load("src/lib/worker-strava.ts", {
    "next/server": { NextResponse }, "./db": { prisma }, "./capabilities": capabilities, "./strava-privacy-event": privacy,
    "./sync": { syncUserConnectors: forbidden }, "./crypto": { decryptSecret: forbidden }, "./importers": { stravaGetActivity: forbidden },
    "./activity-store": { storeActivity: forbidden, deleteImportedActivities: async (...args: any[]) => { state.deleted.push(args); return { count: 1 }; } },
  });
  const jobs = load("src/lib/background-jobs.ts", { "node:crypto": crypto, "./db": { prisma }, "./capabilities": capabilities, "./strava-privacy-event": privacy, "./worker-strava": worker });
  const queue = load("src/lib/webhook-queue.ts", { "node:crypto": crypto, "./db": { prisma }, "./capabilities": capabilities, "./strava-privacy-event": privacy, "./background-jobs": jobs });
  const route = load("src/app/api/connectors/strava/webhook/route.ts", { "next/server": { NextResponse }, "@/lib/capabilities": capabilities,
    "@/lib/strava-privacy-event": privacy, "@/lib/webhook-queue": queue }, { STRAVA_SUBSCRIPTION_ID: "synthetic-subscription", STRAVA_WEBHOOK_SECRET: "synthetic-key" });
  const request = (body: any, key = true) => new Request(`https://app.example/webhook${key ? "?key=synthetic-key" : ""}`, { method: "POST", body: JSON.stringify(body) });
  return { state, jobs, queue, post: (body: any, key = true) => route.POST(request(body, key)), worker: (body: any, owner = "owner") => worker.processVerifiedEvent(request(body), owner) };
}

test("Strava privacy classifier admits only explicit activity delete or matching athlete deauthorization", () => {
  assert.equal(privacy.isStravaPrivacyEvent(deletion), true); assert.equal(privacy.isStravaPrivacyEvent(deauth), true);
  for (const value of [null, [], update, { ...deletion, owner_id: 0 }, { ...deletion, object_id: "" }, { ...deletion, owner_id: "123junk" },
    { ...deauth, object_id: 999 }, { ...deauth, aspect_type: "create" }, { ...deauth, updates: { authorized: true } }, { ...deauth, updates: { authorized: false } }, { ...deauth, updates: { authorized: "true" } }])
    assert.equal(privacy.isStravaPrivacyEvent(value), false, JSON.stringify(value));
});

for (const body of [deletion, deauth]) test(`paused Strava honors authenticated ${body.object_type} privacy through queue and old job on disconnected connection`, async () => {
  const f = fixture(); assert.equal((await f.post(body)).status, 200); assert.equal(f.state.jobs.length, 1);
  assert.equal("status" in f.state.lookups[0], false, "late privacy events must also find disconnected bindings");
  assert.equal(f.state.jobs[0].userId, "owner"); await f.jobs.processSyncJob(f.state.jobs[0]);
  assert.equal(f.state.providerCalls, 0);
  if (body.object_type === "activity") {
    assert.deepEqual(f.state.deleted.map(args => Array.from(args.slice(0, 2))), [["owner", "strava"]]);
    assert.equal(JSON.stringify(f.state.deleted[0][2]), JSON.stringify(["strava:456", "456"]));
    assert.equal(f.state.changes.length, 0);
    assert.equal((await f.worker(body)).status, 200); assert.equal(f.state.deleted.length, 1, "duplicate processed event remains idempotent");
  } else {
    assert.equal(f.state.connection.status, "disconnected"); assert.equal(f.state.connection.tokenEnc, null); assert.equal(f.state.connection.refreshEnc, null);
    assert.equal(f.state.deleted.length, 0); assert.equal(f.state.changes[0].where.userId, "owner");
  }
});

test("paused Strava create/update, forged privacy and malformed deauthorization enqueue nothing", async () => {
  const f = fixture();
  for (const body of [update, { ...update, aspect_type: "create" }, { ...deauth, object_id: 999 }, { ...deauth, updates: { authorized: "true" } }])
    assert.equal((await f.post(body)).status, 503);
  for (const body of [deletion, deauth]) {
    assert.equal((await f.post({ ...body, subscription_id: "forged" }, false)).status, 401);
    const pinnedOnly = await f.post(body, false);
    assert.equal(pinnedOnly.status, 503); assert.equal((await pinnedOnly.json()).code, "privacy_auth_required");
  }
  assert.equal(f.state.lookups.length, 0); assert.equal(f.state.jobs.length, 0); assert.equal(f.state.providerCalls, 0);
  await assert.rejects(f.jobs.enqueueSyncJob("owner", "sync", "synthetic", { ...deletion, provider: "strava" }), /paused/);
  await assert.rejects(f.jobs.processSyncJob({ userId: "owner", kind: "sync", payload: JSON.stringify({ ...deauth, provider: "strava" }) }), /paused/);
});

test("enabled Strava also rejects subscription-only destructive events before queue or owner lookup", async () => {
  for (const body of [deletion, deauth]) {
    const f = fixture(true), rejected = await f.post(body, false);
    assert.equal(rejected.status, 503); assert.equal((await rejected.json()).code, "privacy_auth_required");
    assert.equal(f.state.lookups.length, 0); assert.equal(f.state.jobs.length, 0); assert.equal(f.state.changes.length, 0); assert.equal(f.state.deleted.length, 0);
    assert.equal((await f.post(body, true)).status, 200);
    await f.jobs.processSyncJob(f.state.jobs[0]);
    assert.equal(f.state.providerCalls, 0);
  }
});

test("privacy worker rejects cross-athlete/unlinked events and malformed deauthorization without mutation", async () => {
  const f = fixture();
  for (const body of [deletion, deauth]) {
    assert.equal((await f.worker(body, "different-athlete")).status, 403);
    assert.equal((await f.worker({ ...body, owner_id: 999, ...(body.object_type === "athlete" ? { object_id: 999 } : {}) })).status, 403);
  }
  assert.equal((await f.worker({ ...deauth, object_id: 999 })).status, 400);
  assert.equal((await f.worker({ ...deauth, updates: { authorized: false } })).status, 400);
  f.state.present = false;
  assert.equal((await f.worker(deletion)).status, 403); assert.equal((await f.worker(deauth)).status, 403);
  assert.equal(f.state.deleted.length, 0); assert.equal(f.state.changes.length, 0); assert.equal(f.state.claimed.size, 0); assert.equal(f.state.providerCalls, 0);
});

test("Strava privacy ingress byte-bounds multibyte/stream bodies and rejects malformed JSON before queue", async () => {
  for (const value of ["{", "[]", "null"]) await assert.rejects(privacy.readStravaEvent(new Request("https://app.example", { method: "POST", body: value })), (error: any) => error.status === 400);
  const huge = JSON.stringify({ ...deletion, extra: "é".repeat(17000) });
  await assert.rejects(privacy.readStravaEvent(new Request("https://app.example", { method: "POST", body: huge })), (error: any) => error.status === 413);
  await assert.rejects(privacy.readStravaEvent(new Request("https://app.example", { method: "POST", headers: { "content-length": "99999" }, body: "{}" })), (error: any) => error.status === 413);
  const f = fixture(); const unlinked = { ...deletion, owner_id: 999 };
  assert.equal((await f.post(unlinked)).status, 200); assert.equal(f.state.jobs.length, 0);
});

function inFlightFixture(fallback=false) {
  const state={connection:{id:"connection",userId:"owner",provider:"strava",externalRef:"123",status:"connected",tokenEnc:"token-v1",refreshEnc:"refresh-v1"} as Record<string,any>,enabled:true,fetches:0,syncs:0,writes:0,processed:false};
  let release!:()=>void,started!:()=>void;
  const fetched=new Promise<void>(resolve=>{started=resolve;}),resume=new Promise<void>(resolve=>{release=resolve;});
  const matches=(where:any)=>Object.entries(where).every(([key,value]:[string,any])=>{
    if(value&&typeof value==="object")return "in" in value?value.in.includes(state.connection[key]):"not" in value?state.connection[key]!==value.not:false;
    return state.connection[key]===value;
  });
  const prisma={connector:{findFirst:async({where}:any)=>matches(where)?{...state.connection}:null,
    updateMany:async({where,data}:any)=>{if(!matches(where))return {count:0};Object.assign(state.connection,data);return {count:1};}},
    user:{findUnique:async()=>({timezone:"UTC"})},
    webhookEvent:{createMany:async()=>({count:1}),updateMany:async()=>{state.processed=true;return {count:1};}}};
  const worker=load("src/lib/worker-strava.ts",{"next/server":{NextResponse},"./db":{prisma},"./strava-privacy-event":privacy,
    "./capabilities":{stravaConnectorEnabled:()=>state.enabled},"./crypto":{decryptSecret:(value:string)=>value},
    "./sync":{syncUserConnectors:async()=>{state.syncs++;state.connection.tokenEnc="token-v2";state.connection.refreshEnc="refresh-v2";return {results:[{ok:true}]};}},
    "./importers":{stravaGetActivity:async()=>{state.fetches++;if(fallback&&state.fetches===1)return null;started();await resume;return {id:456};},stravaActivityToWorkout:()=>({externalId:"strava:456"})},
    "./activity-store":{storeActivity:async()=>{state.writes++;}}});
  return {state,fetched,release,run:()=>worker.processVerifiedEvent(new Request("https://app.example/internal",{method:"POST",body:JSON.stringify(update)}),"owner")};
}

for(const fallback of [false,true]) test(`Strava ${fallback?"refreshed fallback":"direct"} fetch cannot persist after connection or capability changes`,async()=>{
  for(const change of ["disconnect","deauthorize","reconnect","owner","pause"]) {
    const f=inFlightFixture(fallback),pending=f.run();await f.fetched;
    if(change==="disconnect")f.state.connection.status="disconnected";
    if(change==="deauthorize")Object.assign(f.state.connection,{status:"disconnected",tokenEnc:null,refreshEnc:null});
    if(change==="reconnect")Object.assign(f.state.connection,{tokenEnc:"new-authorization",refreshEnc:"new-refresh"});
    if(change==="owner")f.state.connection.externalRef="other-provider-owner";
    if(change==="pause")f.state.enabled=false;
    f.release();assert.equal((await pending).status,503,change);
    assert.equal(f.state.writes,0,change);assert.equal(f.state.processed,false,change);
    assert.equal(f.state.syncs,fallback?1:0,"stale direct fetch must not start a fallback sync");
    assert.equal(f.state.fetches,fallback?2:1);
  }
});

test("Strava direct and refreshed fallback retain successful owner-bound processing",async()=>{
  for(const fallback of [false,true]) {
    const f=inFlightFixture(fallback),pending=f.run();await f.fetched;f.release();
    assert.equal((await pending).status,200);assert.equal(f.state.writes,1);assert.equal(f.state.processed,true);
    assert.equal(f.state.connection.tokenEnc,fallback?"token-v2":"token-v1");
  }
});
