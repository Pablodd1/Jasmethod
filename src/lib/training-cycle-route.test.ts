import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as crypto from "node:crypto";
import * as cycle from "./training-cycle";
import * as bounds from "./planning-bounds";
import * as setupHelpers from "./planning-setup";
import * as target from "./planning-target";
import * as dates from "./dates";
import * as science from "./science";
import * as adaptive from "./adaptive";
import * as doubleDay from "./double-day";
import * as anchors from "./anchor-evidence";
import * as cycleEvents from "./cycle-events";
import * as cycleReview from "./cycle-review";
function fixture(timezone="UTC") {
  const today=dates.dateKey(new Date(),timezone);
  const profile={goal:"run-only",experience:"beginner",weeklyHours:3,trainingWindow:"any"};
  const setup=setupHelpers.parsePlanningSetup({adultConfirmed:true,profileConfirmed:true,goalDescription:"Comfortable running",baselineWeeklyMinutes:120,baselineObservedAt:today,interruptions:"none",restrictions:"none",qualifiedReview:"none_needed",trainingDays:[0,1,2,3,4,5,6],maxSessionMinutes:45,equipmentAccess:"Running shoes and a path",planWeeks:12},new Date(),timezone);
  const state:any={plans:[],activity:[],races:[],created:[],superseded:[],audits:[],txActivity:null,txRaces:null,transactionConflict:false};
  class ApiError extends Error {constructor(message:string,public status=400){super(message)}}
  const tx={
    race:{findMany:async()=>state.txRaces??state.races},
    athleteProfile:{findUnique:async()=>profile},
    workout:{findMany:async()=>state.txActivity??state.activity,updateMany:async(query:any)=>{state.superseded.push(query);return{count:0}}},
    benchmarkTest:{findMany:async()=>[]},
    auditLog:{findMany:async()=>[],create:async({data}:any)=>{state.audits.push(data);return data}},
    trainingPlan:{findMany:async()=>state.plans,updateMany:async()=>({count:state.plans.length}),create:async({data}:any)=>{state.created.push(data);state.plans=[{id:"saved-cycle"}];return {...data,id:"saved-cycle",days:data.days.create.map((day:any)=>({...day,sessions:day.sessions.create}))}}}};
  const deps:Record<string,any>={"@/lib/training-cycle":cycle,"@/lib/cycle-events":cycleEvents,"@/lib/cycle-review":cycleReview,"@/lib/planning-bounds":bounds,"@/lib/planning-setup":setupHelpers,"@/lib/planning-target":target,"@/lib/dates":dates,"@/lib/science":science,"@/lib/adaptive":adaptive,"@/lib/double-day":doubleDay,"@/lib/anchor-evidence":anchors,"node:crypto":crypto,
    "next/server":{NextResponse:Response},"@/lib/profile-service":{profileRevision:(p:any)=>JSON.stringify(p)},"@/lib/planning-setup-store":{readPlanningSetup:async()=>({setup,revision:"setup-v1"})},
    "@/lib/access":{ApiError,trainingAccess:async()=>({athlete:{id:"athlete",timezone,profile},actor:{id:"athlete"}}),errorResponse:(error:any)=>Response.json({error:error.message},{status:error.status??500})},
    "@/lib/db":{prisma:{...tx,race:{findMany:async()=>state.races},workout:{...tx.workout,findMany:async()=>state.activity},$transaction:async(fn:any)=>{if(state.transactionConflict)throw {code:"P2034"};return fn(tx)}}}};
  const source=ts.transpileModule(fs.readFileSync("src/app/api/plan/generate/route.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const output:any={exports:{}};
  vm.runInNewContext(source,{module:output,exports:output.exports,require:(name:string)=>{if(name in deps)return deps[name];throw Error(`Unmocked ${name}`)},Response,Request,console:{error:()=>{}}});
  const run=(extra:object={})=>output.exports.POST(new Request("https://example.test/api/plan/generate",{method:"POST",body:JSON.stringify({distance:profile.goal,startDate:today,weeks:12,preview:true,...extra})}));
  return{state,run,today,profile};
}
test("preview makes no writes; confirmation persists structured cycle and repeated old confirmation cannot duplicate it",async()=>{
  const {state,run}=fixture();const preview=await run();assert.equal(preview.status,200);const draft=await preview.json();assert.equal(state.created.length,0);assert.ok(draft.preview.weeksPreview[0].sessions[0].steps.length);
  const saved=await run({preview:false,previewToken:draft.previewToken});assert.equal(saved.status,200);assert.equal(state.created.length,1);
  const rows=state.created[0].days.create.flatMap((day:any)=>day.sessions.create);
  assert.ok(rows.length>0);for(const row of rows){const p=JSON.parse(row.prescription);assert.equal(p.planningStatus,"provisional");assert.ok(p.steps.length);assert.equal(JSON.parse(row.originalPlan).cycleVersion,cycle.TRAINING_CYCLE_VERSION);assert.equal(row.completed,false)}
  assert.equal(JSON.parse(state.audits[0].after).cycle.baseline.source,"athlete_reported");
  assert.equal((await run({preview:false,previewToken:draft.previewToken})).status,409);assert.equal(state.created.length,1);
});
test("past start cannot reset history, and performed dates never receive duplicate replacement workouts",async()=>{
  const {state,run,today}=fixture();assert.equal((await run({startDate:dates.addDaysKey(today,-1)})).status,422);
  state.plans=[{id:"old-cycle"}];state.activity=[{id:"done",date:dates.localDate(today,"UTC"),completed:true,actualDurationMin:25,feedbackStatus:"completed",rpe:3,matchedPlanId:null}];
  const draft=await(await run()).json();const response=await run({preview:false,previewToken:draft.previewToken});assert.equal(response.status,200);
  const first=state.created[0].days.create.find((day:any)=>dates.dateKey(day.date,"UTC")===today);assert.equal(first.sessions.create.length,0);
  assert.equal(state.activity[0].actualDurationMin,25);assert.equal(state.superseded[0].where.completed,false);assert.equal(state.superseded[0].where.userId,"athlete");
});
test("new actual training between preview and commit rejects the stale schedule",async()=>{
  const {state,run,today}=fixture();const draft=await(await run()).json();state.txActivity=[{id:"new",date:dates.localDate(today,"UTC"),completed:true,actualDurationMin:20,feedbackStatus:"completed",rpe:3}];
  assert.equal((await run({preview:false,previewToken:draft.previewToken})).status,409);assert.equal(state.created.length,0);
});
test("stored UTC calendar-day race and explicitly entered race keep the intended Miami date",async()=>{
  for(const source of ["stored","explicit"]){const {state,run,today}=fixture("America/New_York");const key=dates.addDaysKey(today,42);if(source==="stored")state.races=[{id:"race",priority:1,date:new Date(`${key}T00:00:00Z`)}];const response=await run(source==="explicit"?{raceDate:key}:{});assert.equal(response.status,200);const result=await response.json();assert.equal(dates.dateKey(new Date(result.preview.raceDate),"America/New_York"),key);assert.ok(result.preview.weeksPreview[6].restDaySlots.includes(0));}
});

test("swimming cycle provenance is a field-test reference, not measured lactate threshold",()=>{
  const source=fs.readFileSync("src/app/api/plan/generate/route.ts","utf8");
  assert.match(source,/label:"Swimming CSS reference", value:profile.swimPaceBase, source:anchors.swimPaceBase \? "swim_field_test_reference"/);
});

test("event edits invalidate preview and transactional event changes cannot commit",async()=>{
  for (const duringTransaction of [false,true]) {
    const {state,run,today}=fixture();
    state.races=[{id:"race",name:"A event",priority:1,date:new Date(`${dates.addDaysKey(today,42)}T00:00:00Z`)}];
    const draft=await(await run()).json();
    const changed=[{...state.races[0],name:"Changed event",priority:2}];
    if(duringTransaction) state.txRaces=changed; else state.races=changed;
    const response=await run({preview:false,previewToken:draft.previewToken});
    assert.equal(response.status,409);assert.equal(state.created.length,0);
  }
});
test("all event days protected, recent race retained, close event tradeoff needs athlete agreement",async()=>{
  const {state,run,today}=fixture("America/New_York");
  state.races=[[-2,3],[35,1],[39,2],[65,3]].map(([offset,priority],i)=>({id:`event-${i}`,name:`Event ${i}`,priority,date:new Date(`${dates.addDaysKey(today,offset)}T00:00:00Z`)}));
  const response=await run();assert.equal(response.status,200);const draft=await response.json();
  assert.equal(draft.preview.cycle.events.events.length,4);
  assert.equal(draft.eventTradeoffAgreementRequired,true);
  for(const row of state.races.filter((r:any)=>r.date.toISOString().slice(0,10)>=today)) {
    const key=row.date.toISOString().slice(0,10);
    assert.ok(!draft.preview.weeksPreview.some((week:any,index:number)=>week.sessions.some((s:any)=>dates.addDaysKey(today,index*7+s.daySlot)===key)));
  }
  assert.equal((await run({preview:false,previewToken:draft.previewToken})).status,422);
  assert.equal(state.created.length,0);
  assert.equal((await run({preview:false,previewToken:draft.previewToken,confirmEventTradeoffs:true})).status,200);
  for(const day of state.created[0].days.create.filter((day:any)=>day.focus==="event")) { assert.equal(day.dayOff,false);assert.equal(day.sessions.create.length,0);assert.match(day.notes,/Participation and recovery are not assumed/); }
});

test("distinct profile, saved and explicit event dates all remain protected",async()=>{
 const {state,run,today,profile}=fixture();
 (profile as any).raceDate=dates.localDate(dates.addDaysKey(today,60),"UTC");
 state.races=[{id:"stored",name:"Saved race",priority:3,date:new Date(`${dates.addDaysKey(today,35)}T00:00:00Z`)}];
 const response=await run({raceDate:dates.addDaysKey(today,80)});assert.equal(response.status,200);const draft=await response.json();
 assert.deepEqual(draft.preview.cycle.events.events.map((event:any)=>event.dateKey),[35,60,80].map(n=>dates.addDaysKey(today,n)));
 assert.equal(draft.preview.cycle.events.events[0].priority,"C");
});

test("serialization conflict reports actionable preview conflict without retrying or fabricated success",async()=>{
 const {state,run}=fixture();const draft=await(await run()).json();state.transactionConflict=true;
 const response=await run({preview:false,previewToken:draft.previewToken});assert.equal(response.status,409);assert.match((await response.json()).error,/fresh preview/);assert.equal(state.created.length,0);
});
