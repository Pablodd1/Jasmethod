import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./db";
import { canonicalSession } from "./canonical-session";
import { createCoachingPrompt, saveCommunicationSettings, runMockCoachingSchedule } from "./coaching-service";
import { TELEGRAM_CONSENT_VERSION, promptKey } from "./coaching-communication";
import { sendTelegramCoaching } from "./telegram-coaching-transport";
const now = new Date("2026-10-11T12:00:00Z");
const actor = { id: "athlete", email: "athlete@example.invalid", timezone: "UTC" };
const env = { ENABLE_TELEGRAM_COACHING: "true", ENABLE_AUTOMATED_DELIVERY: "true", COACHING_TRANSPORT: "telegram", TELEGRAM_BOT_TOKEN: "SYNTHETIC_ONLY", TELEGRAM_COACHING_WEBHOOK_SECRET: "SYNTHETIC_ONLY" };
const basePreference = { userId: actor.id, primaryChannel: "telegram", paused: false, dailyPlan: true, sessionFeedback: false, missingData: false, consentVersion: TELEGRAM_CONSENT_VERSION, consentAt: now, timezone: "UTC", quietStart: 1380, quietEnd: 420, minuteOfDay: 600, declinedOptional: "[]", verifiedChatId: "123", verifiedActorId: "123", verifiedAt: now, verificationTransport: "telegram" };
async function fixture(mode: "accepted" | "revoke" | "changed" | "approval" | "held" | "old-consent" | "partial" | "preflight" | "unapproved" | "missing-approval" | "stale-approval" | "started" | "approval-preflight" | "approval-before-request" | "refresh-incomplete" | "upgrade" | "legacy-unknown" | "legacy-sent" | "legacy-partial" | "legacy-preview-unknown" | "mock-approved" | "mock-cancelled" | "mock-preview" | "retired" | "retire-preflight" | "retire-before-request") {
  const saved = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]])); Object.assign(process.env, env);
  const original = prisma.$transaction, originalUpdate = prisma.coachingPrompt.updateMany;
  let pref = { ...basePreference, ...(mode === "old-consent" ? { consentVersion: "telegram-coaching-v1" } : {}) }, row: any = null, calls = 0, approval = "", audit: any[] = [];
  const rows:any[]=[];
  let current = mode !== "retired";
  const canonical = canonicalSession({ athleteId: actor.id, workout: { id: "session", sport: "bike", title: "Fixture", durationMin: 10 }, prescription: { sport: "bike", durationMin: 10, verdict: "full", steps: [{ name: "Steady", seconds: 600, zone: "z2", phase: "active" }] }, profile: { ftp: 200 }, dateLocal: "2026-10-11", timezone: "UTC" });
  const mockSeed=mode.startsWith("mock-");
  if(mode.startsWith("legacy-")||mockSeed)rows.push({id:"legacy",idempotencyKey:promptKey(actor.id,"dailyPlan","session","2026-10-11"),sourceRevision:canonical.revision,message:mode.endsWith("preview")||mode==="legacy-preview-unknown"?"Saved plan preview — not cleared to execute":"During: follow the selected session's exact blocks; stop if unwell or in pain.",status:mockSeed?(mode==="mock-cancelled"?"cancelled":"simulated"):mode==="legacy-sent"?"sent":mode==="legacy-partial"?"partial":"unknown",transport:mockSeed?"mock":"telegram",questions:"[]",candidate:null,attempts:1});
  if(mockSeed)for(let i=1;i<=2;i++)rows.push({...rows[0],id:`other-mock-${i}`,idempotencyKey:`other-mock-key-${i}`});
  approval = mode === "missing-approval" ? "" : mode === "stale-approval" ? "stale" : canonical.revision;
  let resolved: any = { canonical: ["held","upgrade","mock-preview","legacy-preview-unknown"].includes(mode) ? { ...canonical, verdict: "blocked" } : canonical, targetProfile: { ftp: 200 }, workout: { id: "session", date: new Date("2026-10-11T00:00Z"), approved: !["unapproved","upgrade"].includes(mode), planned: true, completed: false, feedbackStatus: null, startTime: mode === "started" ? "11:00" : "15:00", sport: "bike",durationMin:10,type:"endurance",title:"PRIVATE_MEDICAL_TITLE",notes:"PRIVATE_MEDICAL_NOTE" } };
  const tx: any = {
    communicationPreference: { findUnique: async () => pref },
    trainingPlan: { findFirst: async () => ({id:"current-plan"}) },
    workout: { findFirst: async ({where}:any) => {assert.equal(where.AND[0].userId,actor.id);return current ? resolved.workout : null;} },
    coachingPrompt: { findUnique: async ({ where }: any) => where.idempotencyKey ? rows.find(p=>p.idempotencyKey===where.idempotencyKey)??null : rows.find(p=>p.id===where.id)??null, count: async ({where}:any) => {assert.equal(where.transport,"telegram");return mockSeed?rows.filter(p=>p.transport===where.transport).length:0;},
      create: async ({ data }: any) => { row = { id: `prompt-${rows.length}`, replyStatus: "none", ...data };rows.push(row); if (mode === "preflight") pref = { ...pref, paused: true }; if (mode === "approval-preflight") approval = "revoked"; if(mode==="retire-preflight")current=false; return row; },
      findFirst: async () => row, findUniqueOrThrow: async () => row,
      updateMany: async ({ where, data }: any) => { if (where.status && row?.status !== where.status) return { count: 0 }; Object.assign(row, data); return { count: 1 }; } },
    dailyCheckin: { findUnique: async () => null }, athleteProfile: { findUnique: async () => null },
    auditLog: { findFirst: async ({ where }: any) => where.action === "workout.approved" ? { after: JSON.stringify({ revision: approval }) } : null, create: async (data: any) => { audit.push(data); return {}; } },
  };
  (prisma as any).$transaction = async (fn: any) => fn(tx);
  (prisma.coachingPrompt as any).updateMany = tx.coachingPrompt.updateMany;
  const texts: string[] = [];
  const fetcher = (async (_url, init) => { calls++;
    if (typeof init?.body === "string") texts.push(JSON.parse(init.body).text);
    if (calls === 1) {
      if (mode === "revoke") pref = { ...pref, paused: true };
      if (mode === "changed") resolved = { ...resolved, canonical: { ...canonical, revision: "changed" } };
      if (mode === "approval") approval = "old";
    }
    if (calls === 2 && mode === "partial") return new Response(JSON.stringify({ ok: false, error_code: 400 }));
    return new Response(JSON.stringify({ ok: true, result: { message_id: calls, chat: { id: 123 } } }));
  }) as typeof fetch;
  const dependencies = { refreshIncomplete: mode === "refresh-incomplete", resolve: (async () => resolved) as any, clock: () => now, sendTelegram: ((chat, text, options) => { if (mode === "approval-before-request") approval = "revoked"; if(mode==="retire-before-request")current=false; return sendTelegramCoaching(chat, text, { ...options, env, fetcher }); }) as typeof sendTelegramCoaching };
  try {
    if(mode==="retired"){await assert.rejects(createCoachingPrompt(actor,{sessionId:"session",purpose:"dailyPlan"},now,dependencies),/current plan/);assert.equal(calls,0);assert.equal(rows.length,0);return;}
    if (mode === "old-consent") { await assert.rejects(createCoachingPrompt(actor, { sessionId: "session", purpose: "dailyPlan" }, now, dependencies), /Opt in/); assert.equal(calls, 0); return; }
    if (mode === "preflight" || mode === "approval-preflight" || mode === "retire-preflight") { await assert.rejects(createCoachingPrompt(actor, { sessionId: "session", purpose: "dailyPlan" }, now, dependencies), /cancelled before sending/); assert.equal(calls, 0); assert.equal(row.status, "cancelled"); assert.equal(row.nextAttemptAt, null); return; }
    const result = await createCoachingPrompt(actor, { sessionId: "session", purpose: "dailyPlan" }, now, dependencies);
    if(mode.startsWith("legacy-")){assert.equal(result.duplicate,true);assert.equal(result.prompt.status,rows[0].status);assert.equal(calls,0);return;}
    if(mockSeed){
      assert.equal(result.duplicate,false);assert.equal(result.prompt.transport,"telegram");assert.equal(result.prompt.status,"sent");assert.equal(calls,mode==="mock-preview"?1:3);assert.equal(rows.length,4);assert.notEqual(rows[0].idempotencyKey,rows[3].idempotencyKey);
      await createCoachingPrompt(actor,{sessionId:"session",purpose:"dailyPlan"},now,dependencies);assert.equal(calls,mode==="mock-preview"?1:3);return;
    }
    if(mode==="upgrade"){
      assert.equal(calls,1);assert.match(texts[0],/Saved plan preview.*not cleared to execute/);assert.match(texts[0],/planned duration 10 min/);assert.doesNotMatch(texts[0],/PRIVATE_MEDICAL|200 W|During:/);
      resolved={...resolved,canonical,workout:{...resolved.workout,approved:true}};
      const approved=await createCoachingPrompt(actor,{sessionId:"session",purpose:"dailyPlan"},now,dependencies);assert.equal(approved.duplicate,false);assert.equal(calls,4);assert.equal(rows.length,2);assert.notEqual(rows[0].idempotencyKey,rows[1].idempotencyKey);assert.equal(approved.prompt.status,"sent");
      await createCoachingPrompt(actor,{sessionId:"session",purpose:"dailyPlan"},now,dependencies);assert.equal(calls,4);return;
    }
    if (mode === "approval-before-request" || mode === "retire-before-request") { assert.equal(calls, 0); assert.equal(result.prompt.status, "failed"); assert.equal(result.prompt.externallySent, false); return; }
    assert.equal(result.prompt.status, ["revoke", "changed", "approval", "partial"].includes(mode) ? "partial" : "sent");
    assert.equal(calls, mode === "accepted" ? 3 : mode === "partial" ? 2 : 1);
    assert.equal(result.prompt.receiptId, "telegram:1"); assert.equal(result.prompt.nextAttemptAt, null);
    assert.equal(result.prompt.externallySent, true);
    if (["unapproved", "missing-approval", "stale-approval", "started", "held", "refresh-incomplete"].includes(mode)) {
      assert.match(texts[0], /No cleared workout/);
      assert.doesNotMatch(texts[0], /1\. active|During:|After:| W|RPE/);
    }
    const outcome = audit.find(a => a.data.action === "communication.telegram-outcome");
    assert.ok(outcome); assert.equal(JSON.parse(outcome.data.after).deviceTransferVerified, false);
    // Repeated invocation cannot resend a partially or fully accepted bundle.
    if (!["revoke", "changed", "approval"].includes(mode)) { const prior = calls; assert.equal((await createCoachingPrompt(actor, { sessionId: "session", purpose: "dailyPlan" }, now, dependencies)).duplicate, true); assert.equal(calls, prior); }
  } finally { (prisma as any).$transaction = original; (prisma.coachingPrompt as any).updateMany = originalUpdate; for (const key of Object.keys(env)) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } }
}
for (const mode of ["accepted", "revoke", "changed", "approval", "held", "old-consent", "partial", "preflight", "unapproved", "missing-approval", "stale-approval", "started", "approval-preflight", "approval-before-request", "refresh-incomplete"] as const) test(`synthetic end-to-end dispatch: ${mode}`, async () => fixture(mode));
test("morning preview may upgrade once to a newly approved current FIT, with separate revision-bound receipts",()=>fixture("upgrade"));
test("deployment key upgrade never resends a legacy same-revision workout with uncertain acceptance",()=>fixture("legacy-unknown"));
for(const mode of ["legacy-sent","legacy-partial","legacy-preview-unknown"] as const)test(`real Telegram legacy terminal attempt remains protected: ${mode}`,()=>fixture(mode));
for(const mode of ["mock-approved","mock-cancelled","mock-preview"] as const)test(`prior simulated transport cannot block actual Telegram delivery: ${mode}`,()=>fixture(mode));
for(const mode of ["retired","retire-preflight","retire-before-request"] as const)test(`retired approved workout is blocked at Telegram boundary: ${mode}`,()=>fixture(mode));
test("scheduled guidance waits for refresh and excludes imported/completed sessions", async () => {
  const saved = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]])); Object.assign(process.env, env);
  const originalPrefs = prisma.communicationPreference.findMany, originalFind = prisma.connector.findMany,
    originalUpdate = prisma.coachingPrompt.updateMany, originalWorkouts = prisma.workout.findMany, originalPlan = prisma.trainingPlan.findFirst;
  const order: string[] = []; let prepared = false;
  (prisma.communicationPreference as any).findMany = async () => [{ ...basePreference, sessionFeedback: true, user: actor }];
  (prisma.connector as any).findMany = async () => [{ status: "connected", syncStartedAt: null,
    lastSyncAt: prepared ? now : null }];
  (prisma.coachingPrompt as any).updateMany = async () => ({ count: 0 });
  (prisma.trainingPlan as any).findFirst = async () => null;
  (prisma.workout as any).findMany = async () => {
    order.push("read-workouts");
    return [
      { id: "report", date: new Date("2026-10-10T12:00:00Z"), planned: false, completed: true },
      { id: "plan", date: now, planned: true, completed: false },
      { id: "import", date: now, planned: false, completed: true },
      { id: "done-plan", date: now, planned: true, completed: true },
      { id: "skipped-plan", date: now, planned: true, completed: false, feedbackStatus: "skipped" },
    ].map(w=>({...w,userId:actor.id}));
  };
  const dependencies = {
    sync: async () => { order.push("sync-start"); await Promise.resolve(); order.push("sync-end"); return { results: [{ ok: true }], total: 1 }; },
    prompt: (async (_actor: any, input: any) => { order.push(`prompt:${input.sessionId}`); return { duplicate: false, prompt: { status: "sent" } }; }) as any,
  };
  try {
    const result = await runMockCoachingSchedule(now, dependencies);
    assert.deepEqual(order, ["sync-start", "sync-end", "read-workouts", "prompt:plan", "prompt:report"]);
    assert.equal(result.externallySent, 2);
    prepared = true; order.length = 0;
    await runMockCoachingSchedule(now, dependencies);
    assert.deepEqual(order, ["read-workouts", "prompt:plan", "prompt:report"]);
  } finally {
    (prisma.communicationPreference as any).findMany = originalPrefs;
    (prisma.connector as any).findMany = originalFind;
    (prisma.coachingPrompt as any).updateMany = originalUpdate;
    (prisma.workout as any).findMany = originalWorkouts;
    (prisma.trainingPlan as any).findFirst = originalPlan;
    for (const key of Object.keys(env)) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
  }
});
test("pausing old consent never silently renews permission for workout files", async () => {
  const original = prisma.$transaction, saved = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]])); Object.assign(process.env, env);
  let written: any;
  (prisma as any).$transaction = async (fn: any) => fn({ communicationPreference: { findUnique: async () => ({ ...basePreference, consentVersion: "telegram-coaching-v1" }), upsert: async ({ update }: any) => { written = update; return update; } }, coachingPrompt: { updateMany: async () => ({ count: 0 }) }, auditLog: { create: async () => ({}) } });
  try {
    const { primaryChannel, dailyPlan, sessionFeedback, missingData, timezone, minuteOfDay, quietStart, quietEnd } = basePreference;
    await saveCommunicationSettings(actor, { primaryChannel, paused: true, dailyPlan, sessionFeedback, missingData, timezone, minuteOfDay, quietStart, quietEnd, declinedOptional: [], consentVersion: TELEGRAM_CONSENT_VERSION });
    assert.equal(written.consentVersion, "telegram-coaching-v1"); assert.equal(written.paused, true);
  } finally { (prisma as any).$transaction = original; for (const key of Object.keys(env)) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } }
});

test("five a.m. New York reminders track DST offsets and never use yesterday's catch-up for today's early workout",async()=>{
 const saved=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));Object.assign(process.env,env);
 const originals={prefs:prisma.communicationPreference.findMany,update:prisma.coachingPrompt.updateMany,workout:prisma.workout.findMany,connector:prisma.connector.findMany,plan:prisma.trainingPlan.findFirst};
 let evaluated=new Date('2026-11-01T09:59:00Z'),reads=0;let timezone='America/New_York';const calls:string[]=[];
 const nyActor={...actor,timezone:'America/New_York'};
 (prisma.communicationPreference as any).findMany=async()=>[{...basePreference,timezone,minuteOfDay:300,quietStart:1380,quietEnd:0,missingData:true,user:nyActor}];
 (prisma.coachingPrompt as any).updateMany=async()=>({count:0});(prisma.connector as any).findMany=async()=>[];
 (prisma.trainingPlan as any).findFirst=async()=>null;
 (prisma.workout as any).findMany=async()=>{reads++;return[{id:'morning',userId:actor.id,date:evaluated,planned:true,completed:false,feedbackStatus:null}];};
 const dependencies={prompt:(async(_actor:any,input:any)=>{calls.push(input.purpose);return{duplicate:false,prompt:{status:'sent'}};}) as any};
 try{
  await runMockCoachingSchedule(evaluated,dependencies);assert.equal(reads,0);assert.equal(calls.length,0);
  evaluated=new Date('2026-11-01T10:00:00Z');await runMockCoachingSchedule(evaluated,dependencies);assert.deepEqual(calls,['dailyPlan']);
  evaluated=new Date('2026-03-08T09:00:00Z');calls.length=0;await runMockCoachingSchedule(evaluated,dependencies);assert.deepEqual(calls,['dailyPlan']);
  timezone='UTC';reads=0;calls.length=0;const blocked=await runMockCoachingSchedule(evaluated,dependencies);assert.equal(reads,0);assert.equal(calls.length,0);assert.match(blocked.results[0].error!,/timezones differ/);
 }finally{(prisma.communicationPreference as any).findMany=originals.prefs;(prisma.coachingPrompt as any).updateMany=originals.update;(prisma.workout as any).findMany=originals.workout;(prisma.connector as any).findMany=originals.connector;(prisma.trainingPlan as any).findFirst=originals.plan;for(const key of Object.keys(env)){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
});

test("changing a delivery schedule to another timezone requires changing the athlete profile first",async()=>{
 const {primaryChannel,dailyPlan,sessionFeedback,missingData,minuteOfDay,quietStart,quietEnd}=basePreference;
 await assert.rejects(saveCommunicationSettings({...actor,timezone:'America/New_York'},{primaryChannel,dailyPlan,sessionFeedback,missingData,minuteOfDay,quietStart,quietEnd,timezone:'UTC',declinedOptional:[],paused:true}),/profile timezone/);
});
