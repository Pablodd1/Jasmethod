/** Real PostgreSQL acceptance. Refuses every database except disposable CI. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
  const url = new URL(process.env[key] || "");
  assert.equal(url.protocol, "postgresql:"); assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432");
  assert.equal(url.pathname, "/jmm_launch_integration_test"); assert.equal(url.search, "");
}
assert.notEqual(process.env.VERCEL_ENV, "production");
const results: string[] = [], prefix = `garmin-fixture-${randomUUID()}`;
async function main() {
  process.env.TOKEN_ENCRYPTION_KEY = "SYNTHETIC_GARMIN_CI_ENCRYPTION_KEY_32_CHARACTERS";
  const { prisma } = await import("../src/lib/db");
  const { garminOAuthStore: store } = await import("../src/lib/garmin-oauth");
  const { createGarminOAuthService } = await import("../src/lib/garmin-oauth-service");
  const { encryptSecret, decryptSecret } = await import("../src/lib/crypto");
  const { hashPassword } = await import("../src/lib/auth");
  const ids: string[] = []; let exchanges = 0, remote = `${prefix}-remote-A`, revocations = 0;
  const env = { APP_URL: "https://app.example", ENABLE_GARMIN_CONNECTOR: "true", GARMIN_PROCESSING_APPROVED: "true", GARMIN_CLIENT_ID: "fixture-client", GARMIN_CLIENT_SECRET: "fixture-secret", TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY };
  const protocol = { token: async () => { exchanges++; return { accessToken: `fixture-private-${exchanges}`, refreshToken: `fixture-refresh-${exchanges}`, expiresIn: 86400, refreshExpiresIn: 7_776_000 }; },
    identity: async () => remote, permissions: async () => ["ACTIVITY_EXPORT" as const,"HEALTH_EXPORT" as const,"WORKOUT_IMPORT" as const], revoke: async () => { revocations++; } };
  const service = createGarminOAuthService({ store, protocol, encrypt: encryptSecret, decrypt: decryptSecret, env });
  try {
    for (const suffix of ["A", "B"]) ids.push((await prisma.user.create({ data: { email: `${prefix}-${suffix}@example.invalid`, name: "Synthetic Garmin athlete", passwordHash: hashPassword(randomUUID()) } })).id);
    const start = await service.begin(ids[0]), state = new URL(start.authorizationUrl).searchParams.get("state")!;
    const params = new URLSearchParams({ state, code: "fixture-code" });
    await assert.rejects(service.complete(ids[1], params, start.browserBinding)); assert.equal(exchanges, 0);
    const race = await Promise.allSettled([service.complete(ids[0], params, start.browserBinding), service.complete(ids[0], params, start.browserBinding)]);
    assert.equal(race.filter(r => r.status === "fulfilled").length, 1); assert.equal(exchanges, 1); results.push("single durable state claim; another athlete cannot consume it");
    const saved = await prisma.connector.findUniqueOrThrow({ where: { userId_provider: { userId: ids[0], provider: "garmin_direct" } } });
    assert.equal(saved.status, "connected"); assert.equal(saved.externalRef, remote); assert.ok(saved.tokenEnc!.startsWith("enc:v1:")); assert.ok(!saved.tokenEnc!.includes("fixture-private"));
    assert.equal((await service.authorization(ids[0], ["ACTIVITY_EXPORT"])).userId, remote); results.push("encrypted credentials persist and reload for the owner");
    const second = await service.begin(ids[1]), secondParams = new URLSearchParams({ state: new URL(second.authorizationUrl).searchParams.get("state")!, code: "fixture-code-B" });
    await assert.rejects(service.complete(ids[1], secondParams, second.browserBinding), /already connected/);
    assert.equal((await store.get(ids[0]))!.status, "connected"); assert.equal((await store.get(ids[1]))!.status, "disconnected"); results.push("provider identity cannot be attached to a second athlete");
    Object.assign(process.env,env,{ENABLE_GARMIN_IMPORTS:"true"});
    const {garminPushSink,processGarminInbox}=await import("../src/lib/garmin-inbox");
    const {parseGarminPush}=await import("../src/lib/garmin-ingest");
    const {garminDeliveryStore,reserveGarminRequest}=await import("../src/lib/garmin-delivery");
    const {createGarminPushReceiver}=await import("../src/lib/garmin-ingest");
    const activityRecord={userId:remote,summaryId:"activity-A",activityType:"RUNNING",startTimeInSeconds:Math.floor(Date.now()/1000),durationInSeconds:1800,distanceInMeters:5000};
    const summaries=parseGarminPush({activities:[activityRecord]});
    assert.deepEqual(await garminPushSink.persist(summaries),{stored:1,duplicates:0,ignored:0});
    assert.deepEqual(await garminPushSink.persist(summaries),{stored:0,duplicates:1,ignored:0});
    assert.equal((await garminPushSink.persist(parseGarminPush({activities:[{...activityRecord,userId:"unregistered-owner"}]}))).ignored,1);
    const queued=await prisma.syncJob.findFirstOrThrow({where:{userId:ids[0],kind:"garmin.data.v1"}});
    assert.ok(queued.payload.startsWith("enc:v1:"));assert.ok(!queued.payload.includes(remote));
    const fakeAuthorization=async(userId:string)=>{assert.equal(userId,ids[0]);return {accessToken:"SYNTHETIC",userId:remote,connectorId:saved.id};};
    assert.equal((await processGarminInbox(ids[0],10,fakeAuthorization)).processed,1);
    assert.equal(await prisma.workout.count({where:{userId:ids[0],source:"garmin_direct"}}),1);
    assert.equal(await prisma.workout.count({where:{userId:ids[1],source:"garmin_direct"}}),0);
    assert.equal((await prisma.workout.findFirstOrThrow({where:{userId:ids[0],source:"garmin_direct"}})).insights,null);
    results.push("encrypted durable inbox deduplicates, rejects unknown owners, imports locally and never writes activity-report insights");
    await garminPushSink.persist(parseGarminPush({dailies:[{userId:remote,summaryId:"daily-A",calendarDate:"2026-10-26",restingHeartRateInBeatsPerMinute:48}]}));
    assert.equal((await processGarminInbox(ids[0],10,fakeAuthorization)).processed,1);
    assert.equal((await prisma.dailyMetrics.findFirstOrThrow({where:{userId:ids[0],source:"garmin_direct"}})).restingHr,48);
    const denied=createGarminPushReceiver(async()=>false,garminPushSink);
    await assert.rejects(denied(new Request("https://app.example/garmin",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({activities:[activityRecord]})})));
    results.push("health projection is owner scoped; unverified transport cannot enqueue real PostgreSQL jobs");
    const seed={version:1 as const,athleteId:ids[0],sessionId:`${prefix}-session`,revision:"fixture-revision",date:"2026-10-27",providerUserId:remote,status:"working" as const,lease:"fixture-lease",leaseUntil:Date.now()+120000,stage:"claimed",deviceReceived:false as const};
    const claims=await Promise.all([garminDeliveryStore.claim(seed),garminDeliveryStore.claim({...seed,lease:"other-lease"})]);
    assert.equal(claims.filter(Boolean).length,1);
    const claimed=claims.find(Boolean)!;
    await garminDeliveryStore.save(claimed,{...claimed,status:"published",stage:"schedule_verified",workoutId:123,scheduleId:456,leaseUntil:0});
    const reloaded=await garminDeliveryStore.claim({...seed,lease:"reload-lease"});assert.equal(reloaded!.status,"published");assert.equal(reloaded!.workoutId,123);
    results.push("durable publication lease admits one worker and reloads provider IDs after restart");
    assert.ok(process.env.NODE_OPTIONS?.includes("jmm-test-egress-guard.cjs"));
    const {hashToken}=await import("../src/lib/auth");
    const browserToken=randomUUID()+randomUUID();
    await prisma.authSession.create({data:{userId:ids[1],tokenHash:hashToken(browserToken),expiresAt:new Date(Date.now()+3600000)}});
    const base="http://127.0.0.1:3220";
    const http=async(path:string,body?:unknown)=>fetch(base+path,{method:body?"PUT":"GET",headers:{cookie:`jmm_session=${browserToken}`,origin:base,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
    assert.equal((await fetch(base+"/api/connectors/garmin/data")).status,401);
    const empty=await http("/api/connectors/garmin/data");assert.equal(empty.status,200);assert.deepEqual((await empty.json()).records,[]);
    assert.equal((await http(`/api/connectors/garmin/data?cursor=${queued.id}`)).status,400);
    assert.equal((await http("/api/connectors/garmin/preferences",{enabled:true})).status,400);
    assert.equal((await http("/api/connectors/garmin/preferences",{enabled:true,consent:"garmin-auto-publish-v1"})).status,503);
    assert.equal((await http("/api/connectors/garmin/preferences",{enabled:false,userId:ids[0]})).status,403);
    const stopped=await http("/api/connectors/garmin/preferences",{enabled:false});assert.equal(stopped.status,200);assert.equal((await stopped.json()).enabled,false);
    results.push("real HTTP denies missing consent, foreign athlete controls/cursors and unconfigured publication; opt-out stays available");
    await prisma.auditLog.createMany({data:Array.from({length:90},()=>({actorId:ids[0],subjectId:ids[0],action:"garmin.api",note:"Synthetic budget fixture"}))});
    await assert.rejects(reserveGarminRequest(ids[0]),/budget/);results.push("rolling app budget is enforced by shared PostgreSQL state");
    await service.disconnect(ids[1]); assert.equal(revocations, 0); await service.disconnect(ids[0]); assert.equal(revocations, 1);
    assert.equal((await store.get(ids[0]))!.tokenEnc, null); assert.equal((await store.get(ids[1]))!.tokenEnc, null); results.push("duplicate grant never revokes the established owner; owner disconnect revokes registration");
  } finally {
    await prisma.oAuthTransaction.deleteMany({ where: { userId: { in: ids }, provider: "garmin_direct" } });
    await prisma.user.deleteMany({ where: { id: { in: ids }, email: { startsWith: prefix } } });
    await prisma.$disconnect();
    mkdirSync(".local/jmm-garmin-integration", { recursive: true });
    writeFileSync(".local/jmm-garmin-integration/report.json", JSON.stringify({ results, realGarminRequests: 0 }, null, 2));
  }
}
main().catch(error => { console.error(error instanceof assert.AssertionError ? error.message : "Isolated Garmin integration failed; no production connection was attempted."); process.exitCode = 1; });
