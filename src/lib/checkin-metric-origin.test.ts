import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {createRequire} from "node:module";
import ts from "typescript";
import {dayBounds} from "./dates";
import {buildDailyInputContext} from "./daily-input-context";

const require=createRequire(import.meta.url);
function fixture(source:string,currentHrv=80,contaminatingSource?:string) {
  const day=dayBounds("UTC"),user={id:"owner",timezone:"UTC",language:"en"},writes:any[]=[],shadow:any[]=[],queries:any[]=[];
  const metrics=[currentHrv,71,70,69].map((hrv,index)=>({userId:user.id,date:new Date(day.start.getTime()-index*86400000),hrv,hrvType:"rmssd",restingHr:52,source}));
  if(contaminatingSource)metrics.push({...metrics[0],date:new Date(day.start.getTime()-4*86400000),source:contaminatingSource});
  const answers={sleep:5,soreness:1,motivation:5,energy:5,stress:1,sick:false,newPain:false,urgentSymptoms:false,availableMin:120};
  const checkin={id:"saved",userId:user.id,date:day.start,answers:JSON.stringify(answers),adaptation:JSON.stringify({ruleId:"checkin-safety-v1:reviewed-input",verdict:"full",score:80,scoreAvailable:true,durationFactor:1,intensityCap:"z7",safetyStatus:"clear"})};
  const inputContext=buildDailyInputContext({athleteId:user.id,timezone:user.timezone,observations:[{id:"current",userId:user.id,observedAt:day.start,createdAt:new Date(),metricType:"hrv_rmssd",value:currentHrv,unit:"ms",source,measurementMethod:"optical_sensor",qualityFlag:"ok"}]});
  const tx={trainingPlan:{findFirst:async(q:any)=>{assert.equal(q.where.userId,user.id);return null;}},workout:{findMany:async()=>[],update:async()=>{throw Error("Unexpected workout mutation");}},dailyCheckin:{upsert:async(q:any)=>{assert.equal(q.where.userId_date.userId,user.id);writes.push(q.create);return q.create;}},dailyMetrics:{upsert:async(q:any)=>{assert.equal(q.where.userId_date.userId,user.id);return q.create;}},auditLog:{create:async()=>({})}};
  const prisma={...tx,dailyCheckin:{...tx.dailyCheckin,findUnique:async(q:any)=>{assert.equal(q.where.userId_date.userId,user.id);return checkin;}},dailyMetrics:{findMany:async(q:any)=>{queries.push(q);assert.equal(q.where.userId,user.id);return [...metrics].sort((a,b)=>q.orderBy.date==="asc"?a.date.getTime()-b.date.getTime():b.date.getTime()-a.date.getTime());}},calendarEvent:{findMany:async()=>[]},workout:{...tx.workout,findFirst:async()=>null},athleteProfile:{findUnique:async()=>({goal:"cycle",experience:"advanced",weeklyHours:6,birthYear:1990})},supplementProfile:{findUnique:async()=>null},connector:{findMany:async()=>[]},$transaction:async(fn:any,options:any)=>{assert.equal(options.isolationLevel,"Serializable");return fn(tx);}};
  class ApiError extends Error {constructor(message:string,public status=400){super(message);}}
  const deps:Record<string,any>={"next/server":{NextResponse:Response},"@/lib/db":{prisma},"@/lib/access":{ApiError,trainingAccess:async()=>({actor:user,athlete:user}),errorResponse:(error:ApiError)=>Response.json({error:error.message},{status:error.status||500})},"@/lib/planning-setup-store":{readPlanningSetup:async()=>({setup:{maxSessionMinutes:120},revision:"synthetic"})},"@/lib/planning-setup":{assessPlanningSetup:()=>({ready:true,missing:[],review:[],ruleId:"synthetic"})},"@/lib/daily-input-context":{readDailyInputContext:async()=>inputContext},"@/lib/activity-reconciliation":{readActivityDecisions:async()=>[]},"@/lib/starter-session-store":{ensureStarterWorkout:async()=>({created:false})},"@/lib/athlete-state-v2":{compareShadow:(_score:any,_verdict:any,input:any)=>{shadow.push(input);return null;}},"@/lib/background-jobs":{enqueueSyncJob:async()=>{throw Error("Unexpected provider job");}}};
  const mod={exports:{}as any},code=ts.transpileModule(fs.readFileSync("src/app/api/checkin/route.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{module:mod,exports:mod.exports,require:(id:string)=>id in deps?deps[id]:id.startsWith("@/lib/")?require(path.resolve("src/lib",id.slice(6)+".ts")):require(id),Response,Request,URL,Date,setTimeout,clearTimeout,console});
  return {get:()=>mod.exports.GET(new Request("https://example.invalid/api/checkin")),post:(extra:Record<string,unknown>={})=>mod.exports.POST(new Request("https://example.invalid/api/checkin",{method:"POST",body:JSON.stringify({...answers,availableMin:undefined,availableMinutes:120,...extra})})),writes,shadow,queries};
}

test("actual checkin GET withholds restricted and unknown legacy HRV readiness while retaining raw input context",async()=>{
  for(const source of ["strava","unknown-importer","intervals"]) {
    const f=fixture(source),response=await f.get(),result=await response.json();assert.equal(response.status,200);
    assert.equal(result.readiness,null);assert.match(result.readinessUnavailableReason,/Strava-origin|unknown-origin/);assert.equal(result.inputContext.metrics.hrvRmssd.selected,null);assert.equal(result.inputContext.metrics.hrvRmssd.latest.value,80);assert.equal(result.inputContext.metrics.hrvRmssd.status,"invalid");assert.equal(f.writes.length,0);
  }
});

test("actual checkin GET preserves permitted same-source HRV comparison and remains read only",async()=>{
  const f=fixture("oura"),response=await f.get(),result=await response.json();assert.equal(response.status,200);assert.equal(result.readiness.hrvStatus,"high");assert.equal(result.readiness.deltaPct,14.3);assert.equal(result.readinessUnavailableReason,null);assert.equal(result.inputContext.metrics.hrvRmssd.selected.value,80);assert.equal(f.writes.length,0);
});

test("actual checkin POST cannot derive a low-HRV adjustment or shadow from restricted and unknown numeric history",async()=>{
  for(const source of ["strava","unknown-importer","intervals"]) {
    const f=fixture(source,20),response=await f.post(),result=await response.json();assert.equal(response.status,200);
    assert.notEqual(result.adaptation.ruleId,"checkin-safety-v1:low-hrv");assert.equal(result.hydration?.hrvNote ?? null,null);assert.match(result.biometricAnalysisUnavailableReason,/Strava-origin|unknown-origin/);assert.equal(result.hydration?.weightTrend ?? null,null);
    assert.ok(f.shadow.every(input=>input.hrvToday==null&&(!input.hrvBaseline7d||input.hrvBaseline7d.length===0)&&input.hrvStatus==null));
    assert.equal(f.writes.length,1);assert.equal(JSON.parse(f.writes[0].answers).hrv,null);
  }
});
test("a restricted raw legacy contributor cannot be dropped to derive a manual-source baseline or shadow",async()=>{
  for(const origin of ["strava","unknown-importer"]) {
    const f=fixture("manual",20,origin),response=await f.post({hrv:20,rhr:70}),result=await response.json();assert.equal(response.status,200);
    assert.notEqual(result.adaptation.ruleId,"checkin-safety-v1:low-hrv");assert.match(result.biometricAnalysisUnavailableReason,/Strava-origin|unknown-origin/);assert.equal(result.hydration?.weightTrend ?? null,null);assert.equal(result.hydration?.hrvNote ?? null,null);assert.equal(f.shadow.length,0);assert.equal(f.writes.length,1);
    const saved=JSON.parse(f.writes[0].answers);assert.equal(saved.hrv,20);assert.equal(saved.rhr,70);assert.equal(saved.rhrBaseline,undefined);assert.equal(f.writes[0].shadowV2,null);
  }
});

test("actual checkin POST retains permitted source numeric comparison without inventing extra measurements",async()=>{
  const f=fixture("oura",20),response=await f.post(),result=await response.json();assert.equal(response.status,200);assert.equal(result.adaptation.ruleId,"checkin-safety-v1:low-hrv");assert.equal(result.adaptation.durationFactor,.85);assert.equal(f.writes.length,1);assert.equal(JSON.parse(f.writes[0].answers).hrv,20);
});
