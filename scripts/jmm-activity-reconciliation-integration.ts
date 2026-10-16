/** Owner-scoped HTTP acceptance under the loopback-only egress guard. */
import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {mkdirSync,writeFileSync} from "node:fs";
import {PrismaClient} from "@prisma/client";
import {hashPassword,hashToken} from "../src/lib/auth";
import {dayBounds,addDaysKey} from "../src/lib/dates";
for(const key of ["DATABASE_URL","DIRECT_URL"]){const u=new URL(process.env[key]||"");assert.equal(u.hostname,"127.0.0.1");assert.equal(u.port,"55432");assert.equal(u.pathname,"/jmm_launch_integration_test");}
assert.ok(process.env.NODE_OPTIONS?.includes("jmm-test-egress-guard.cjs"));assert.notEqual(process.env.VERCEL_ENV,"production");
const db=new PrismaClient(),ids:string[]=[],checks:string[]=[],base="http://127.0.0.1:3220";
async function main(){
 const timezone=new Date().getUTCHours()<4?"America/New_York":"UTC";
 const day=dayBounds(timezone);
 async function actor(){const u=await db.user.create({data:{name:"Synthetic reconciliation",email:`reconcile-${randomUUID()}@example.invalid`,passwordHash:hashPassword(randomBytes(24).toString("hex")),timezone,onboarded:true,profile:{create:{birthYear:1990,goal:"cycle",experience:"advanced"}}}});ids.push(u.id);const token=randomBytes(24).toString("hex");await db.authSession.create({data:{userId:u.id,tokenHash:hashToken(token),expiresAt:new Date(Date.now()+3600000)}});return {id:u.id,cookie:`jmm_session=${token}`};}
 const owner=await actor(),other=await actor();
 async function api(path:string,body?:unknown,status=200,who=owner,method=body===undefined?"GET":"POST"){const r=await fetch(base+path,{method,headers:{cookie:who.cookie,origin:base,"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(120000)});if(path==="/api/activities/reconcile")assert.match(r.headers.get("cache-control")||"",/no-store/);const text=await r.text();assert.equal(r.status,status,`${path}: ${text.slice(0,500)}`);return JSON.parse(text);}
 const p=await api("/api/profile");await api("/api/profile",{expectedRevision:p.revision,expectedSetupRevision:p.setupRevision,experience:"advanced",setup:{adultConfirmed:true,profileConfirmed:true,goalDescription:"Synthetic comfortable cycling",baselineWeeklyMinutes:360,baselineObservedAt:addDaysKey(day.key,-1),interruptions:"none",restrictions:"none",qualifiedReview:"none_needed",trainingDays:[0,1,2,3,4,5],maxSessionMinutes:120,equipmentAccess:"Familiar bicycle and safe indoor trainer",planWeeks:8}},200,owner,"PUT");
 const baseWorkout={userId:owner.id,sport:"bike",type:"endurance",completed:true,planned:false,feedbackStatus:"completed",feedbackAt:new Date(Date.now()-60000),actualSport:"bike",rpe:4,intensity:"z2"};
 const start=new Date(Math.max(day.start.getTime(),Date.now()-2*3600000));
 const provider=(name:string,source:string,minutes:number,offset:number,distanceKm:number|null)=>db.workout.create({data:{...baseWorkout,title:`Synthetic ${name}`,source,externalId:`${source}:${randomUUID()}`,date:new Date(start.getTime()+offset),durationMin:minutes,actualDurationMin:minutes,distanceKm}});
 const a=await provider("corroborated Garmin","garmin",40,0,20),b=await provider("corroborated Strava","strava",40,20000,20.02);
 const c=await provider("ambiguous Garmin","garmin",30,3600000,15),d=await provider("ambiguous Whoop","whoop",20,3620000,null);
 const workout=await db.workout.create({data:{userId:owner.id,date:day.start,sport:"bike",title:"Synthetic pending easy ride",type:"endurance",durationMin:20,intensity:"z1",planned:true,completed:false,source:"plan",originalPlan:JSON.stringify({title:"Synthetic pending easy ride",sport:"bike",type:"endurance",durationMin:20,intensity:"z1"})}});
 const snapshots=await db.workout.findMany({where:{id:{in:[a.id,b.id,c.id,d.id]}},orderBy:{id:"asc"}});
 let review=await api("/api/activities/reconcile");assert.equal(review.rawRecords,4);assert.equal(review.groupedCopies,1);assert.equal(review.unresolvedGroups,1);checks.push("Four immutable provider records expose one corroborated copy and one unresolved group");
 let fitness=await api("/api/fitness");assert.equal(fitness.jMetrics.totalJStress,160);assert.equal(fitness.jMetrics.totalSessions,3);assert.equal(fitness.jMetrics.reconciliation.unresolvedGroups,1);assert.equal(fitness.pmc,null);assert.equal(fitness.execution,null);assert.match(fitness.executionUnavailableReason,/copies/);checks.push("Load counts corroborated record once and leaves ambiguous load/PMC/execution unknown");
 const answer={sleep:4,soreness:1,motivation:4,energy:4,stress:1,sick:false,newPain:false,urgentSymptoms:false,availableMinutes:120};
 let checkin=await api("/api/checkin",answer);assert.equal(checkin.adaptation.verdict,"rest");checks.push("Ambiguous same-day evidence holds added training instead of spending unknown budget");
 const group=review.pending[0],request={kind:"same_session",ids:group.records.map((r:any)=>r.id),primaryId:d.id,revision:group.revision,confirmed:true};
 await api("/api/activities/reconcile",{...request,revision:"invalid"},400);
 await api("/api/activities/reconcile",{...request,kind:"different_sessions",primaryId:123},400);
 await api("/api/activities/reconcile",{...request,extra:"x".repeat(8200)},413);
 const csrf=await fetch(base+"/api/activities/reconcile",{method:"POST",headers:{cookie:owner.cookie,origin:"https://foreign.example.invalid","Content-Type":"application/json"},body:JSON.stringify(request)});assert.equal(csrf.status,403);assert.match(csrf.headers.get("cache-control")||"",/no-store/);
 checks.push("Mutation rejects invalid revisions, non-null separate primary, oversized bodies and foreign origin with no-store errors");
 await api("/api/activities/reconcile",{...request,confirmed:false},400);await api("/api/activities/reconcile",request,409,other);assert.equal(await db.auditLog.count({where:{subjectId:other.id,action:"activity.reconcile"}}),0);checks.push("Unchecked confirmation rejected400; foreign owner cannot reconcile409 or write an audit");
 await api("/api/activities/reconcile",request);await api("/api/activities/reconcile",request,409);review=await api("/api/activities/reconcile");assert.equal(review.unresolvedGroups,0);assert.equal(review.groupedCopies,2);checks.push("Explicit same-session decision persists, repeats conflict409, and selected source counts once");
 assert.deepEqual(await db.workout.findMany({where:{id:{in:[a.id,b.id,c.id,d.id]}},orderBy:{id:"asc"}}),snapshots);checks.push("Reconciliation never modifies or deletes provider rows");
 checkin=await api("/api/checkin",answer);assert.notEqual(checkin.adaptation.verdict,"rest");fitness=await api("/api/fitness");assert.equal(fitness.jMetrics.totalJStress,240);assert.equal(fitness.jMetrics.totalSessions,2);checks.push("Fresh check-in releases bounded easy plan; chosen20min source gives80AU instead of max/average/double counting");
 const currentChoice=review.reviewedDecisions.find((choice:any)=>choice.records.some((r:any)=>r.id===d.id));
 const reopenRequest={kind:"review_again",ids:currentChoice.records.map((r:any)=>r.id),primaryId:null,revision:currentChoice.revision,confirmed:true};
 await api("/api/activities/reconcile",{...reopenRequest,confirmed:false},400);await api("/api/activities/reconcile",reopenRequest,409,other);
 await api("/api/activities/reconcile",{...reopenRequest,ids:[a.id,b.id]},409); // corroborated grouping is not an explicit decision
 await api("/api/activities/reconcile",reopenRequest);await api("/api/activities/reconcile",reopenRequest,409);await api("/api/activities/reconcile",request,409);
 review=await api("/api/activities/reconcile");assert.equal(review.unresolvedGroups,1);fitness=await api("/api/fitness");assert.equal(fitness.execution,null);assert.equal(fitness.pmc,null);checkin=await api("/api/checkin",answer);assert.equal(checkin.adaptation.verdict,"rest");
 const reopened=review.pending.find((p:any)=>p.records.some((r:any)=>r.id===d.id));
 await api("/api/activities/reconcile",{kind:"different_sessions",ids:reopened.records.map((r:any)=>r.id),primaryId:null,revision:reopened.revision,confirmed:true});
 review=await api("/api/activities/reconcile");assert.equal(review.unresolvedGroups,0);fitness=await api("/api/fitness");assert.equal(fitness.jMetrics.totalJStress,360);assert.equal(fitness.jMetrics.totalSessions,3);
 const differentChoice=review.reviewedDecisions.find((choice:any)=>choice.kind==="different_sessions"&&choice.records.some((r:any)=>r.id===d.id));
 await api("/api/activities/reconcile",{kind:"review_again",ids:differentChoice.records.map((r:any)=>r.id),primaryId:null,revision:differentChoice.revision,confirmed:true});
 review=await api("/api/activities/reconcile");assert.equal(review.unresolvedGroups,1);const rechoose=review.pending.find((p:any)=>p.records.some((r:any)=>r.id===d.id));
 await api("/api/activities/reconcile",{kind:"same_session",ids:rechoose.records.map((r:any)=>r.id),primaryId:d.id,revision:rechoose.revision,confirmed:true});
 assert.deepEqual(await db.workout.findMany({where:{id:{in:[a.id,b.id,c.id,d.id]}},orderBy:{id:"asc"}}),snapshots);
 const auditTrail=await db.auditLog.findMany({where:{subjectId:owner.id,action:"activity.reconcile"}});assert.equal(auditTrail.length,5);assert.equal(auditTrail.filter(row=>JSON.parse(row.after!).kind==="review_again").length,2);
 checkin=await api("/api/checkin",answer);assert.notEqual(checkin.adaptation.verdict,"rest");fitness=await api("/api/fitness");assert.equal(fitness.jMetrics.totalJStress,240);
 checks.push("Both same and separate decisions reopen with no primary, hold training/load until explicit replacement, preserve all five audits and unchanged provider rows, reject stale/foreign/arbitrary reopen requests");
 await db.workout.update({where:{id:d.id},data:{actualDurationMin:21}});review=await api("/api/activities/reconcile");assert.equal(review.unresolvedGroups,1);await api("/api/activities/reconcile",request,409);checks.push("Corrected provider evidence invalidates its old choice and rejects stale confirmation409");
 const fresh=review.pending[0];await api("/api/activities/reconcile",{kind:"different_sessions",ids:fresh.records.map((r:any)=>r.id),primaryId:null,revision:fresh.revision,confirmed:true});fitness=await api("/api/fitness");assert.equal(fitness.jMetrics.totalSessions,3);assert.equal(fitness.jMetrics.totalJStress,364);checks.push("Explicit separate-sessions decision retains each actual session and its own effort");
 assert.equal((await db.athleteProfile.findUniqueOrThrow({where:{userId:owner.id}})).weeklyHours,p.profile.weeklyHours);assert.equal((await db.workout.findUniqueOrThrow({where:{id:workout.id}})).completed,false);checks.push("No profile capacity increase or invented activity completion");
 const [e,f,g]=await Promise.all([provider("subset Garmin","garmin",30,5400000,null),provider("subset Strava","strava",31,5410000,null),provider("subset Whoop","whoop",20,5420000,null)]);
 review=await api("/api/activities/reconcile");const triple=review.pending.find((p:any)=>p.records.some((r:any)=>r.id===e.id));assert.equal(triple.records.length,3);
 await api("/api/activities/reconcile",{kind:"same_session",ids:[e.id,f.id],primaryId:f.id,revision:triple.revision,confirmed:true});
 const subsetDecision=JSON.parse((await db.auditLog.findFirstOrThrow({where:{subjectId:owner.id,action:"activity.reconcile",entityId:f.id},orderBy:{createdAt:"desc"}})).after!);assert.deepEqual(subsetDecision.members.map((m:any)=>m.id).sort(),[e.id,f.id].sort());
 assert.equal((await db.workout.findMany({where:{id:{in:[e.id,f.id,g.id]}}})).length,3);checks.push("Three-record displayed revision permits an explicitly selected two-record subset and audits only those fingerprints");
 review=await api("/api/activities/reconcile");const subsetPending=review.pending.find((p:any)=>p.records.some((r:any)=>r.id===g.id));
 const tripleIds=[e.id,f.id,g.id];const tripleSnapshots=await db.workout.findMany({where:{id:{in:tripleIds}},orderBy:{id:"asc"}});
 await api("/api/activities/reconcile",{kind:"same_session",ids:tripleIds,primaryId:e.id,revision:subsetPending.revision,confirmed:true});
 review=await api("/api/activities/reconcile");const tripleChoice=review.reviewedDecisions.find((choice:any)=>choice.records.length===3);
 await api("/api/activities/reconcile",{kind:"review_again",ids:tripleIds,primaryId:null,revision:tripleChoice.revision,confirmed:true});
 review=await api("/api/activities/reconcile");const reopenedTriple=review.pending.find((p:any)=>p.records.some((r:any)=>r.id===g.id));
 await api("/api/activities/reconcile",{kind:"same_session",ids:[e.id,f.id],primaryId:f.id,revision:reopenedTriple.revision,confirmed:true});
 review=await api("/api/activities/reconcile");assert.ok(review.decisions.some((choice:any)=>choice.records.some((r:any)=>r.id===e.id)&&choice.records.some((r:any)=>r.id===f.id)&&choice.primaryId===f.id),"accepted reopened subset actually groups the chosen records");assert.equal(review.unresolvedGroups,1);
 const remaining=review.pending.find((p:any)=>p.records.some((r:any)=>r.id===g.id));
 await api("/api/activities/reconcile",{kind:"same_session",ids:[e.id,g.id],primaryId:g.id,revision:remaining.revision,confirmed:true});
 review=await api("/api/activities/reconcile");assert.equal(review.unresolvedGroups,0);const finalTriple=review.decisions.find((choice:any)=>choice.records.some((r:any)=>r.id===g.id));assert.equal(finalTriple.records.length,3);assert.equal(finalTriple.primaryId,g.id);
 fitness=await api("/api/fitness");assert.equal(fitness.jMetrics.totalJStress,444); // original40min + separate30/21min + newest20min, each RPE4
 assert.deepEqual(await db.workout.findMany({where:{id:{in:tripleIds}},orderBy:{id:"asc"}}),tripleSnapshots);
 checks.push("Reopened three-source review accepts and actually applies subset AB, leaves C pending, then overlapping AC resolves the remainder using newest selected20min primary without touching source rows");
 mkdirSync(".local/athlete-qa",{recursive:true});writeFileSync(".local/athlete-qa/activity-reconciliation-report.json",JSON.stringify({status:"passed",synthetic:true,checks},null,2));console.log("ACTIVITY_RECONCILIATION_ACCEPTANCE_PASSED",JSON.stringify({checks:checks.length}));
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await db.user.deleteMany({where:{id:{in:ids}}});await db.$disconnect();});
