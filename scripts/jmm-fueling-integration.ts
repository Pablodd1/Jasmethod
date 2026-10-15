/** Disposable loopback-only actual-fueling acceptance. No provider traffic. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashToken, hashPassword } from "../src/lib/auth";
import { actualFuelingRates, readActualFueling } from "../src/lib/actual-fueling";
import { isDailyTraining } from "../src/components/daily-training/training-contract";
import { mkdirSync, writeFileSync } from "node:fs";
for(const key of ["DATABASE_URL","DIRECT_URL"]){const value=new URL(process.env[key]||"");assert.equal(value.hostname,"127.0.0.1");assert.equal(value.port,"55432");assert.equal(value.pathname,"/jmm_launch_integration_test");assert.equal(value.search,"");}
assert.notEqual(process.env.VERCEL_ENV,"production");assert.ok(process.env.NODE_OPTIONS?.includes("jmm-test-egress-guard.cjs"));
const db=new PrismaClient(),base="http://127.0.0.1:3220",ids:string[]=[],checks:string[]=[];
async function main(){
  async function user(){const row=await db.user.create({data:{name:"Synthetic actual fueling",email:`fueling-${randomUUID()}@example.invalid`,passwordHash:hashPassword(randomBytes(24).toString("hex")),timezone:"UTC",onboarded:false,profile:{create:{goal:"cycle",experience:"amateur",birthYear:1990}}}});ids.push(row.id);const token=randomBytes(32).toString("hex");await db.authSession.create({data:{userId:row.id,tokenHash:hashToken(token),expiresAt:new Date(Date.now()+3600000)}});return {...row,cookie:`jmm_session=${token}`};}
  const athlete=await user(),outsider=await user();
  async function api(path:string,body?:unknown,method="GET",expected=200,cookie=athlete.cookie){const response=await fetch(base+path,{method,headers:{cookie,"Content-Type":"application/json",origin:base},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(120000)});const text=await response.text();assert.equal(response.status,expected,`${path}: ${text.slice(0,500)}`);return JSON.parse(text);}
  await api("/api/onboard",{},"POST");await api("/api/checkin",{sleep:4,soreness:1,motivation:4,energy:4,stress:1,sick:false,newPain:false,urgentSymptoms:false,availableMinutes:30},"POST");
  const today=await api("/api/today"),sessionId=today.sessions[0].id;
  await api("/api/plan",{sessionId,actualDetails:{distanceKm:42}},"PUT");
  const get=()=>api(`/api/v1/training/today?sessionId=${sessionId}`);
  let daily=await get();
  assert.equal(daily.completion.actual.status,"unknown");assert.equal(isDailyTraining(daily),true,"Quantity-only feedback must remain a valid Daily response without inventing completion");
  await api(`/api/v1/training/sessions/${sessionId}/completion`,{expectedRevision:daily.session.sourceRevision,actual:{status:"completed",actualSport:"bike",durationMinutes:90,sessionRpe:4,comments:"Synthetic reported intake",actualFueling:{carbsG:90,fluidMl:1000,giSymptoms:"mild"}}},"POST");
  daily=await get();assert.equal(daily.completion.actual.durationMinutes,90);assert.equal(daily.completion.actual.status,"completed");assert.deepEqual(daily.completion.actual.actualFueling,{schemaVersion:1,carbsG:90,fluidMl:1000,giSymptoms:"mild"});
  let saved=await db.workout.findUniqueOrThrow({where:{id:sessionId}});assert.equal(JSON.parse(saved.actualDetails!).values.distanceKm,42);assert.equal(actualFuelingRates(readActualFueling(saved.actualDetails),saved.actualDurationMin).carbsGPerHour,60);assert.equal(saved.durationMin,20);checks.push("HTTP completion saves and reloads 90g/1000mL/mild symptoms with 90 actual minutes; 60g/h arithmetic never uses 20 planned minutes");
  const originalProfile=await db.athleteProfile.findUniqueOrThrow({where:{userId:athlete.id}});
  await api("/api/plan",{sessionId,actualDetails:{distanceKm:43}},"PUT");saved=await db.workout.findUniqueOrThrow({where:{id:sessionId}});assert.equal(readActualFueling(saved.actualDetails)?.carbsG,90);checks.push("Existing quantity editor preserves fueling sibling");
  await api("/api/plan",{sessionId,actualFueling:{carbsG:0}},"PUT");daily=await get();assert.equal(daily.completion.actual.actualFueling.carbsG,0);assert.equal(daily.completion.actual.actualFueling.fluidMl,1000);checks.push("Explicit zero persists while omitted fluid remains 1000mL");
  await api("/api/plan",{sessionId,actualDurationMin:null},"PUT");saved=await db.workout.findUniqueOrThrow({where:{id:sessionId}});assert.equal(actualFuelingRates(readActualFueling(saved.actualDetails),saved.actualDurationMin).carbsGPerHour,null);checks.push("Unknown actual duration removes hourly arithmetic without substituting planned minutes");
  await api("/api/plan",{sessionId,actualFueling:{carbsG:"100"}},"PUT",400);await api("/api/plan",{sessionId,actualFueling:{carbsG:100}},"PUT",404,outsider.cookie);checks.push("Wrong units/coercion rejected400; foreign athlete cannot save404");
  await api("/api/plan",{sessionId,actualFueling:null},"PUT");saved=await db.workout.findUniqueOrThrow({where:{id:sessionId}});assert.equal(readActualFueling(saved.actualDetails),null);assert.equal(JSON.parse(saved.actualDetails!).values.distanceKm,43);checks.push("Explicit intake clear retains separately reported distance");
  const after=await db.athleteProfile.findUniqueOrThrow({where:{userId:athlete.id}});assert.equal(after.gutTrained,originalProfile.gutTrained);assert.equal(after.nutritionContext,originalProfile.nutritionContext);checks.push("Adherence never changes gut-trained status or reviewed nutrition context");
  mkdirSync(".local/athlete-qa",{recursive:true});writeFileSync(".local/athlete-qa/fueling-report.json",JSON.stringify({status:"passed",synthetic:true,checks},null,2));console.log("ACTUAL_FUELING_ACCEPTANCE_PASSED",JSON.stringify({checks:checks.length}));
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await db.user.deleteMany({where:{id:{in:ids}}});await db.$disconnect();});
