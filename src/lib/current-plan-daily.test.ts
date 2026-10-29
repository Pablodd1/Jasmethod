import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import { dayBounds } from "./dates";
import { parsePlanningSetup } from "./planning-setup";
import { effectivePrescription } from "./effective-prescription";
import { hasWorkoutReport, isCurrentWorkout } from "./calendar-workouts";

const require = createRequire(import.meta.url);
function matches(row:any, where:any):boolean {
  return Object.entries(where).every(([key,value]:any)=>{
    if(key==="AND")return value.every((part:any)=>matches(row,part));
    if(key==="OR")return value.some((part:any)=>matches(row,part));
    if(value===null)return row[key]==null;
    if(value&&typeof value==="object"&&!(value instanceof Date)) {
      if("not" in value)return value.not===null?row[key]!=null:row[key]!=null&&row[key]!==value.not;
      if("notIn" in value)return row[key]!=null&&!value.notIn.includes(row[key]);
      if("in" in value)return value.in.includes(row[key]);
      if("gte" in value||"lt" in value)return (value.gte===undefined||row[key]>=value.gte)&&(value.lt===undefined||row[key]<value.lt);
      return row[key]!=null&&matches(row[key],value);
    }
    return row[key]===value;
  });
}
const day=dayBounds("UTC");
const profile={goal:"olympic",experience:"advanced",weeklyHours:411/60};
const setup=parsePlanningSetup({adultConfirmed:true,profileConfirmed:true,goalDescription:"Familiar triathlon practice",baselineWeeklyMinutes:411,baselineObservedAt:day.key,interruptions:"none",restrictions:"none",qualifiedReview:"none_needed",trainingDays:[0,1,2,3,4,5,6],restPreference:"no_fixed_rest",maxSessionMinutes:120,equipmentAccess:"Familiar safe equipment",planWeeks:8});
function row(id:string, planId="current", extra:any={}) {
  const base={sport:"bike",type:"endurance",intensity:"z2",title:id,durationMin:30,cycleVersion:"bounded-cycle-v1"};
  return {...base,id,userId:"owner",date:day.start,planned:true,completed:false,source:"plan",feedbackAt:null,feedbackStatus:null,
    prescription:JSON.stringify({...base,verdict:"full",steps:[{name:"Familiar easy work",phase:"active",zone:"z2",seconds:1800}]}),
    originalPlan:JSON.stringify(base),planDay:{dayOff:false,plan:{id:planId,status:"active",userId:"owner"}},createdAt:new Date(Date.now()-100000),...extra};
}
function checkinFixture(rows:any[], latest="current") {
  const updates:any[]=[],queries:any[]=[], planReads:any[]=[],deletions:any[]=[],audits:any[]=[];
  const tx={
    trainingPlan:{findFirst:async(q:any)=>{planReads.push(q);return {id:latest};}},
    workout:{findMany:async(q:any)=>{queries.push(q);return rows.filter(w=>matches(w,q.where));},update:async({where,data}:any)=>{updates.push({id:where.id,...data});const saved=rows.find(w=>w.id===where.id);Object.assign(saved,data);return saved;}},
    dailyCheckin:{findUnique:async()=>null,upsert:async({create}:any)=>create,deleteMany:async(q:any)=>{deletions.push(q);return {count:1};}},auditLog:{findMany:async()=>[],create:async({data}:any)=>{audits.push(data);return data;}},
  };
  let serializationConflict=false;
  const prisma={...tx,trainingPlan:{findFirst:async()=>({id:"stale-outer-snapshot"})},connector:{findMany:async()=>[]},metricObservation:{findMany:async()=>[]},workout:{findMany:async()=>[],findFirst:async()=>null},dailyMetrics:{findMany:async()=>[]},athleteProfile:{findUnique:async()=>profile},calendarEvent:{findMany:async()=>[]},supplementProfile:{findUnique:async()=>null},$transaction:async(fn:any,options:any)=>{assert.equal(options?.isolationLevel,"Serializable");if(serializationConflict)throw {code:"P2034"};return fn(tx);}};
  class ApiError extends Error {constructor(message:string,public status=400){super(message);}}
  const deps:Record<string,any>={
    "next/server":{NextResponse:Response},"@/lib/db":{prisma},
    "@/lib/access":{ApiError,trainingAccess:async()=>({actor:{id:"owner"},athlete:{id:"owner",timezone:"UTC",profile}}),errorResponse:(e:ApiError)=>Response.json({error:e.message},{status:e.status||500})},
    "@/lib/planning-setup-store":{readPlanningSetup:async()=>({setup,revision:"setup"})},"@/lib/activity-reconciliation":{readActivityDecisions:async()=>[]},
    "@/lib/effective-prescription":{effectivePrescription:async(_owner:string,id:string)=>{const update=updates.find((u:any)=>u.id===id);const prescription=typeof update?.prescription==="string"?JSON.parse(update.prescription):null;return prescription?{prescription,canonical:{id,revision:"fixture-current",verdict:prescription.verdict==="rest"?"rest":"ready"},nutrition:null}:null;}},
    "@/lib/starter-session-store":{ensureStarterWorkout:async()=>({created:false})},"@/lib/athlete-state-v2":{compareShadow:()=>null},"@/lib/background-jobs":{enqueueSyncJob:async()=>{throw Error("Unexpected provider job");}},
  };
  const mod={exports:{} as any};
  const source=ts.transpileModule(fs.readFileSync("src/app/api/checkin/route.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(source,{module:mod,exports:mod.exports,require:(id:string)=>id in deps?deps[id]:id.startsWith("@/lib/")?require(path.resolve("src/lib",id.slice(6)+".ts")):require(id),Response,Request,URL,Date,setTimeout,clearTimeout,console});
  const run=(extra={})=>mod.exports.POST(new Request("https://example.invalid/api/checkin",{method:"POST",body:JSON.stringify({sleep:5,soreness:1,motivation:5,energy:5,stress:1,sick:false,newPain:false,urgentSymptoms:false,availableMinutes:120,...extra})}));
  const reset=()=>mod.exports.DELETE(new Request("https://example.invalid/api/checkin",{method:"DELETE"}));
  return {run,reset,updates,queries,planReads,deletions,audits,conflict:()=>{serializationConflict=true;}};
}
test("85 older active-plan suggestions never spend the current plan's check-in budget or get rewritten",async()=>{
  const old=Array.from({length:85},(_,i)=>row(`old-${i}`,"older"));
  const current=[row("current-run"),row("current-bike")];
  const reported=row("actual-old","older",{actualDurationMin:25,rpe:3,feedbackStatus:"completed",feedbackAt:new Date()});
  const f=checkinFixture([...old,reported,...current]);
  const response=await f.run(); assert.equal(response.status,200);
  assert.deepEqual(f.updates.map(w=>[w.id,w.durationMin]),[["current-run",30],["current-bike",30]]);
  assert.equal(f.planReads.length,1,"budget uses a fresh plan read inside the transaction");
  assert.ok(f.queries.every(q=>q.where.AND));
  assert.ok(hasWorkoutReport(reported));assert.equal(reported.actualDurationMin,25);
});
test("current reported work is preserved and illness still holds both current sessions",async()=>{
  const reported=row("reported-current","current",{actualDurationMin:12});
  const f=checkinFixture([reported,row("first"),row("second")]);
  assert.equal((await f.run({sick:true})).status,200);
  assert.deepEqual(f.updates.map(w=>[w.id,w.durationMin]),[["first",0],["second",0]]);
});
test("a concurrent plan change rejects the check-in instead of claiming allocation succeeded",async()=>{
  const f=checkinFixture([row("current")]);f.conflict();
  const response=await f.run();assert.equal(response.status,409);assert.match((await response.json()).error,/plan changed/);assert.equal(f.updates.length,0);
});
test("check-in reset restores only current unreported sessions and preserves retired and actual history",async()=>{
  const oldPending=row("old-pending","older",{durationMin:5});
  const retired=row("retired","current",{source:"superseded-plan",durationMin:5});
  const oldReported=row("old-reported","older",{feedbackStatus:"partial",actualDurationMin:0,rpe:0});
  const currentReported=row("current-reported","current",{feedbackStatus:"partial",actualDurationMin:0,rpe:0});
  const current=row("current","current",{durationMin:5,approved:true});
  const protectedRows=[oldPending,retired,oldReported,currentReported];
  const before=JSON.stringify(protectedRows);
  const f=checkinFixture([...protectedRows,current]);
  const response=await f.reset();assert.equal(response.status,200);assert.equal((await response.json()).ok,true);
  assert.deepEqual(f.updates.map(w=>w.id),["current"]);
  assert.equal(current.durationMin,30);assert.equal(current.prescription,null);assert.equal(current.approved,false);
  assert.equal(JSON.stringify(protectedRows),before,"old and reported records remain unchanged, including explicit zero effort");
  assert.equal(f.planReads.length,1,"reset reads the authoritative latest plan inside its transaction");
  assert.equal(f.deletions.length,1);assert.equal(f.deletions[0].where.userId,"owner");assert.equal(f.deletions[0].where.date.getTime(),day.start.getTime());
  assert.equal(f.audits.length,1);assert.equal(f.audits[0].action,"checkin.undo");assert.deepEqual(JSON.parse(f.audits[0].after).sessions,["current"]);
});
test("a concurrent plan change rejects check-in reset without deleting the check-in or claiming success",async()=>{
  const f=checkinFixture([row("current")]);f.conflict();
  const response=await f.reset();assert.equal(response.status,409);assert.match((await response.json()).error,/plan changed while resetting/);
  assert.equal(f.updates.length,0);assert.equal(f.deletions.length,0);assert.equal(f.audits.length,0);
});
function readerFixture(workout:any, peers:any[]=[]) {
  const queries:any[]=[];
  const db:any={trainingPlan:{findFirst:async()=>({id:"current"})},workout:{findFirst:async({where}:any)=>workout.userId===where.userId&&workout.id===where.id?workout:null,findMany:async(q:any)=>{queries.push(q);return peers.filter(w=>matches(w,q.where));}},
    athleteProfile:{findUnique:async()=>profile},user:{findUnique:async()=>({timezone:"UTC",language:"en"})},supplementProfile:{findUnique:async()=>null},benchmarkTest:{findMany:async()=>[]},race:{findMany:async()=>[]},
    auditLog:{findFirst:async(q:any)=>q.where.action==="profile.setup"?{id:"setup",after:JSON.stringify(setup)}:null,findMany:async()=>[]},
    dailyCheckin:{findUnique:async()=>({date:day.start,answers:JSON.stringify({sleep:5,soreness:1,motivation:5,energy:5,stress:1,sick:false,newPain:false,urgentSymptoms:false,availableMin:120,inputMetadata:{recordedAt:new Date().toISOString()}}),adaptation:JSON.stringify({verdict:"full",durationFactor:1,intensityCap:"z7"})})},
  };
  return {queries,run:()=>effectivePrescription("owner",workout.id,db)};
}
test("direct replaced pending links are unavailable, while old reported history is readable and cannot become executable",async()=>{
  for(const workout of [row("old","older"),row("retired","current",{source:"superseded-plan"}),row("foreign","current",{userId:"other"})]) assert.equal(await readerFixture(workout).run(),null);
  const reported=row("old-report","older",{actualDurationMin:25,rpe:3,feedbackStatus:"completed",feedbackAt:new Date(Date.now()-10000)});
  const saved=await readerFixture(reported).run();assert.ok(saved);assert.equal(saved.workout.actualDurationMin,25);assert.equal(saved.canonical.verdict,"blocked");assert.equal(saved.canonical.steps.length,0);assert.match(saved.canonical.reason,/retained as history/);
});
test("same-day demand ignores older active-plan suggestions and retains actual history and both current sessions",async()=>{
  const current=row("current"), second=row("second"), old=row("old","older",{intensity:"z4"}), reported=row("reported","older",{completed:true,actualDurationMin:20});
  const f=readerFixture(current,[current,second,old,reported]);const result=await f.run();assert.ok(result);
  const query=f.queries.find(q=>q.where.AND);assert.ok(query);
  assert.deepEqual([current,second,old,reported].filter(w=>matches(w,query.where)).map(w=>w.id),["current","second","reported"]);
  assert.equal(isCurrentWorkout(old,"owner","current"),false);
});
