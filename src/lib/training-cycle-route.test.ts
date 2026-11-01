import * as commanderProvenance from "./coach-commander-provenance";
import * as activityEvidence from "./activity-evidence";
import {readActivityDecisions} from "./activity-reconciliation";
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
import * as calendarWorkouts from "./calendar-workouts";
import * as targetPreview from "./plan-target-preview";
import * as sportCoverage from "./cycle-sport-coverage";
import * as raceDistances from "./race-distances";
import { normalizeSteps } from "./canonical-session";
function fixture(timezone="UTC",actorId="athlete") {
  const today=dates.dateKey(new Date(),timezone);
  const profile={goal:"run-only",experience:"beginner",weeklyHours:3,trainingWindow:"any"};
  const setup=setupHelpers.parsePlanningSetup({adultConfirmed:true,profileConfirmed:true,goalDescription:"Comfortable running",baselineWeeklyMinutes:120,baselineObservedAt:today,interruptions:"none",restrictions:"none",qualifiedReview:"none_needed",trainingDays:[0,1,2,3,4,5,6],maxSessionMinutes:45,equipmentAccess:"Running shoes and a path",planWeeks:12},new Date(),timezone);
  const state:any={plans:[],activity:[],races:[],benchmarks:[],appliedAnchors:[],created:[],superseded:[],audits:[],txActivity:null,txRaces:null,txPlans:null,txBenchmarks:null,txAnchors:null,planReads:[],transactionCalls:0,transactionConflict:false};
  class ApiError extends Error {constructor(message:string,public status=400){super(message)}}
  const tx={
    race:{findMany:async()=>state.txRaces??state.races},
    athleteProfile:{findUnique:async()=>profile},
    workout:{findMany:async()=>state.txActivity??state.activity,updateMany:async(query:any)=>{state.superseded.push(query);return{count:0}}},
    benchmarkTest:{findMany:async()=>state.txBenchmarks??state.benchmarks},
    auditLog:{findMany:async(query:any)=>query?.where?.action==="baseline.fromTest"?(state.txAnchors??state.appliedAnchors):[],create:async({data}:any)=>{state.audits.push(data);return data}},
    trainingPlan:{findMany:async(query:any)=>{assert.equal(query.where.userId,"athlete");state.planReads.push(query);return state.txPlans??state.plans;},updateMany:async()=>({count:state.plans.length}),create:async({data}:any)=>{state.created.push(data);state.plans=[{id:"saved-cycle",easyPct:data.easyPct}];return {...data,id:"saved-cycle",days:data.days.create.map((day:any)=>({...day,sessions:day.sessions.create}))}}}};
  const deps:Record<string,any>={"@/lib/plan-target-preview":targetPreview,"@/lib/cycle-sport-coverage":sportCoverage,"@/lib/coach-commander-provenance":commanderProvenance,"@/lib/activity-evidence":activityEvidence,"@/lib/activity-reconciliation":{readActivityDecisions:(id:string,db:any)=>{assert.equal(id,"athlete");return readActivityDecisions(id,db||{auditLog:tx.auditLog} as any);}},"@/lib/training-cycle":cycle,"@/lib/cycle-events":cycleEvents,"@/lib/cycle-review":cycleReview,"@/lib/planning-bounds":bounds,"@/lib/planning-setup":setupHelpers,"@/lib/planning-target":target,"@/lib/dates":dates,"@/lib/science":science,"@/lib/adaptive":adaptive,"@/lib/double-day":doubleDay,"@/lib/anchor-evidence":anchors,"node:crypto":crypto,
    "next/server":{NextResponse:Response},"@/lib/profile-service":{profileRevision:(p:any)=>JSON.stringify(p)},"@/lib/planning-setup-store":{readPlanningSetup:async()=>({setup,revision:"setup-v1"})},
    "@/lib/access":{ApiError,trainingAccess:async()=>({athlete:{id:"athlete",timezone,profile},actor:{id:actorId}}),errorResponse:(error:any)=>Response.json({error:error.message},{status:error.status??500})},
    "@/lib/db":{prisma:{...tx,trainingPlan:{...tx.trainingPlan,findMany:async(query:any)=>{assert.equal(query.where.userId,"athlete");state.planReads.push(query);return state.plans;}},race:{findMany:async()=>state.races},workout:{...tx.workout,findMany:async()=>state.activity},benchmarkTest:{findMany:async()=>state.benchmarks},auditLog:{...tx.auditLog,findMany:async(query:any)=>query?.where?.action==="baseline.fromTest"?state.appliedAnchors:[]},$transaction:async(fn:any)=>{state.transactionCalls++;if(state.transactionConflict)throw {code:"P2034"};return fn(tx)}}}};
  deps["@/lib/calendar-workouts"]=calendarWorkouts;
  deps["@/lib/race-distances"]=raceDistances;
  const source=ts.transpileModule(fs.readFileSync("src/app/api/plan/generate/route.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const output:any={exports:{}};
  vm.runInNewContext(source,{module:output,exports:output.exports,require:(name:string)=>{if(name in deps)return deps[name];throw Error(`Unmocked ${name}`)},Response,Request,console:{error:()=>{}}});
  const run=(extra:object={})=>output.exports.POST(new Request("https://example.test/api/plan/generate",{method:"POST",body:JSON.stringify({distance:profile.goal,startDate:today,weeks:12,preview:true,...extra})}));
  return{state,run,today,profile,setup};
}
test("preview makes no writes; confirmation persists structured cycle and repeated old confirmation cannot duplicate it",async()=>{
  const {state,run}=fixture();const preview=await run();assert.equal(preview.status,200);const draft=await preview.json();assert.equal(state.created.length,0);assert.ok(draft.preview.weeksPreview[0].sessions[0].steps.length);
  const saved=await run({preview:false,previewToken:draft.previewToken});assert.equal(saved.status,200);assert.equal(state.created.length,1);
  const rows=state.created[0].days.create.flatMap((day:any)=>day.sessions.create);
  assert.ok(rows.length>0);for(const row of rows){const p=JSON.parse(row.prescription);assert.equal(p.planningStatus,"provisional");assert.ok(p.steps.length);assert.equal(JSON.parse(row.originalPlan).cycleVersion,cycle.TRAINING_CYCLE_VERSION);assert.equal(row.completed,false)}
  assert.equal(JSON.parse(state.audits[0].after).cycle.baseline.source,"athlete_reported");
  assert.equal((await run({preview:false,previewToken:draft.previewToken})).status,409);assert.equal(state.created.length,1);
});

test('custom triathlon preview preserves the owned matching event legs and saved coaching recipes',async()=>{
  const {state,run,today,profile,setup}=fixture();
  profile.goal='half';profile.experience='advanced';
  setup.baselineWeeklyMinutes=480;setup.maxSessionMinutes=150;
  state.races=[{id:'custom-race',name:'Custom triathlon',priority:1,date:new Date(`${dates.addDaysKey(today,42)}T00:00:00Z`),distance:raceDistances.formatCustomTriathlonDistance({swimM:1609.344,bikeM:56327.04,runM:14484.096})}];
  const response=await run();assert.equal(response.status,200);const draft=await response.json();
  assert.equal(draft.preview.distance,'custom');assert.equal(draft.preview.raceTarget.raceId,'custom-race');
  assert.deepEqual(draft.preview.raceTarget.legs,{swimM:1609.344,bikeM:56327.04,runM:14484.096});
  const saved=await run({preview:false,previewToken:draft.previewToken});assert.equal(saved.status,200);
  const rows=state.created[0].days.create.flatMap((day:any)=>day.sessions.create);
  assert.ok(rows.length>0);assert.ok(rows.every((row:any)=>JSON.parse(row.originalPlan).coaching?.recipe));
  assert.ok(rows.some((row:any)=>JSON.parse(row.originalPlan).coaching?.recipe==='brick'));
  const audit=JSON.parse(state.audits.find((row:any)=>row.action==='plan.generate').after);
  assert.equal(audit.cycle.raceTarget.distance,'custom');
});

test('custom event from a different date or sport does not silently reclassify the selected goal',async()=>{
  for(const goal of ['run-only','half']){
    const {state,run,today,profile}=fixture();profile.goal=goal;
    state.races=[{id:'other-date',priority:1,date:new Date(`${dates.addDaysKey(today,42)}T00:00:00Z`),distance:raceDistances.formatCustomTriathlonDistance({swimM:1600,bikeM:56000,runM:14500})}];
    const response=await run(goal==='half'?{raceDate:dates.addDaysKey(today,50)}:{});
    assert.equal(response.status,200);const draft=await response.json();
    assert.equal(draft.preview.distance,goal);assert.equal(draft.preview.raceTarget,null);
  }
});

test("easy-training preference changes invalidate the actual route preview before or during its transaction",async()=>{
  for(const duringTransaction of [false,true]) {
    const {state,run}=fixture();state.plans=[{id:"existing-cycle",easyPct:70}];
    const draft=await(await run({easyPct:80})).json();assert.equal(state.created.length,0);
    if(duringTransaction)state.txPlans=[{id:"existing-cycle",easyPct:75}];else state.plans[0].easyPct=75;
    const response=await run({preview:false,easyPct:80,previewToken:draft.previewToken});
    assert.equal(response.status,409);assert.equal(state.created.length,0);assert.equal(state.audits.length,0);assert.equal(state.superseded.length,0);
    assert.ok(state.planReads.every((query:any)=>query.select.id===true&&query.select.easyPct===true),"both current and transactional reads bind the preference");
  }
});

test("actual confirmed plan audit preserves actor, athlete, old preference and saved preference/revision identity",async()=>{
  for(const actorId of ["athlete","assigned-coach"]) {
    const {state,run}=fixture("UTC",actorId);state.plans=[{id:"existing-cycle",easyPct:65}];
    const draft=await(await run({easyPct:80})).json();const response=await run({preview:false,easyPct:80,previewToken:draft.previewToken});assert.equal(response.status,200);
    const audit=state.audits.find((row:any)=>row.action==="plan.generate");assert.equal(audit.actorId,actorId);assert.equal(audit.subjectId,"athlete");assert.equal(audit.entityId,"saved-cycle");
    assert.deepEqual(JSON.parse(audit.before),{activePlans:[{id:"existing-cycle",easyPct:65}]});
    const after=JSON.parse(audit.after);assert.equal(after.planId,"saved-cycle");assert.equal(after.easyPct,80);assert.equal(after.previewToken,draft.previewToken);assert.deepEqual(after.previousPlanIds,["existing-cycle"]);
    assert.equal(state.created[0].easyPct,80);assert.equal(state.created.length,1);
  }
});
test("past start cannot reset history, and performed dates never receive duplicate replacement workouts",async()=>{
  const {state,run,today}=fixture();assert.equal((await run({startDate:dates.addDaysKey(today,-1)})).status,422);
  state.plans=[{id:"old-cycle"}];state.activity=[{id:"done",source:"manual",date:dates.localDate(today,"UTC"),completed:true,actualDurationMin:25,feedbackStatus:"completed",rpe:3,matchedPlanId:null}];
  const draft=await(await run()).json();const response=await run({preview:false,previewToken:draft.previewToken});assert.equal(response.status,200);
  const first=state.created[0].days.create.find((day:any)=>dates.dateKey(day.date,"UTC")===today);assert.equal(first.sessions.create.length,0);
  assert.equal(state.activity[0].actualDurationMin,25);assert.equal(state.superseded[0].where.completed,false);assert.equal(state.superseded[0].where.userId,"athlete");
});
test("new actual training between preview and commit rejects the stale schedule",async()=>{
  const {state,run,today}=fixture();const draft=await(await run()).json();state.txActivity=[{id:"new",source:"manual",date:dates.localDate(today,"UTC"),completed:true,actualDurationMin:20,feedbackStatus:"completed",rpe:3}];
  assert.equal((await run({preview:false,previewToken:draft.previewToken})).status,409);assert.equal(state.created.length,0);
});
test("stored UTC calendar-day race and explicitly entered race keep the intended Miami date",async()=>{
  for(const source of ["stored","explicit"]){const {state,run,today}=fixture("America/New_York");const key=dates.addDaysKey(today,42);if(source==="stored")state.races=[{id:"race",priority:1,date:new Date(`${key}T00:00:00Z`)}];const response=await run(source==="explicit"?{raceDate:key}:{});assert.equal(response.status,200);const result=await response.json();assert.equal(dates.dateKey(new Date(result.preview.raceDate),"America/New_York"),key);assert.ok(result.preview.weeksPreview[6].restDaySlots.includes(0));}
});

test("swimming cycle provenance is a field-test reference, not measured lactate threshold",()=>{
  const source=fs.readFileSync("src/app/api/plan/generate/route.ts","utf8");
  assert.match(source,/label:"Swimming CSS reference", value:profile.swimPaceBase, observedAt:anchors.referenceEvidence.swimPaceBase\?\.observedAt\?\?null, source:anchors.swimPaceBase \? anchors.referenceEvidence.swimPaceBase\?\.source\?\?"swim_field_test_reference"/);
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

test("restricted or unknown performed history blocks cycle generation without writes or invented zero capacity",async()=>{
 for(const origin of [{source:"strava"},{source:"uploaded_unknown"},{source:"garmin",notes:"Original source: STRAVA"}]) {
  const {state,run,today}=fixture();
  state.activity=[{id:"reported",userId:"athlete",date:dates.localDate(today,"UTC"),completed:true,planned:false,actualDurationMin:45,durationMin:45,feedbackStatus:"completed",rpe:4,...origin}];
  const before=JSON.stringify(state.activity),response=await run();
  assert.equal(response.status,409); assert.match((await response.json()).error,/origin|understate training/);
  assert.equal(state.created.length,0);assert.equal(state.superseded.length,0);assert.equal(state.audits.length,0);assert.equal(JSON.stringify(state.activity),before);
 }
});

test("persistent missing triathlon legs return actionable 422 before preview confirmation or any writes",async()=>{
 for(const trainingDays of [[0]]) {
  const {state,run,profile,setup}=fixture();profile.goal="olympic";profile.experience="amateur";setup.trainingDays=trainingDays;
  for(const preview of [true,false]) {
   const response=await run({preview});assert.equal(response.status,422);
   const data=await response.json();assert.equal(data.sportCoverage.canSaveCompleteCycle,false);
   assert.ok(data.sportCoverage.planningBasisWeeks.every((w:any)=>w.missingComponents.length>0));
   assert.match(data.error,/available schedule|available days/);assert.match(data.nextStep,/initial assessment/);
   assert.equal(state.created.length,0);assert.equal(state.audits.length,0);assert.equal(state.superseded.length,0);assert.equal(state.transactionCalls,0);
  }
 }
 const {run,profile,setup}=fixture();profile.goal="olympic";profile.experience="amateur";setup.trainingDays=[0,2,4];
 assert.equal((await run()).status,200,"Three available slots retain separate swim, bike and run coverage.");
});

test("the actual route projects dated numeric targets and kJ for review without freezing numbers into saved source prescriptions",async()=>{
 const {state,run,profile,today}=fixture();profile.goal="cycle";profile.experience="amateur";
 Object.assign(profile,{ftp:200,units:"metric"});
 const observed=dates.localDate(dates.addDaysKey(today,-1),"UTC");
 state.benchmarks=[{id:"applied-ftp",date:observed,type:"ftp",result:200,completed:true,skipped:false}];
 state.appliedAnchors=[{entityId:"applied-ftp"}];
 const response=await run({weeks:20});assert.equal(response.status,200);const draft=await response.json();
 const first=draft.preview.weeksPreview[0].sessions.find((session:any)=>session.sport==="bike");
 assert.ok(first.targetPreview.steps.some((step:any)=>/ W/.test(step.targetLabel)));
 assert.ok(first.targetPreview.steps.every((step:any)=>step.reference.value===200&&step.reference.source==="applied_field_test"&&step.reference.observedAt===observed.toISOString()));
 const evidenced=anchors.evidencedTargetProfile(profile,state.benchmarks,["applied-ftp"],new Date());
 const resolved=normalizeSteps(first.steps,"bike",evidenced);
 assert.deepEqual(first.targetPreview.steps.map((step:any)=>step.targetLabel),resolved.map(step=>step.target.label));
 const highKj=resolved.reduce((sum,step)=>sum+step.target.high!*step.seconds/1000,0);
 assert.ok(Math.abs(first.targetPreview.mechanicalWork.highKj-highKj)<.000001);
 const future=draft.preview.weeksPreview.at(-1).sessions.filter((session:any)=>session.sport==="bike");
 assert.ok(future.length>0);for(const session of future){assert.equal(session.targetPreview.mechanicalWork,null);assert.ok(session.targetPreview.steps.every((step:any)=>step.reference===null&&/RPE/.test(step.targetLabel)));}
 assert.equal(state.created.length,0);
 const saved=await run({weeks:20,preview:false,previewToken:draft.previewToken});assert.equal(saved.status,200);
 const rows=state.created[0].days.create.flatMap((day:any)=>day.sessions.create);
 for(const row of rows){
  const p=JSON.parse(row.prescription);assert.equal(p.targetPreview,undefined);
  // Structured strength/rest carries an explicit open target. Numerical
  // physiology still resolves from current references rather than freezing.
  assert.ok(p.steps.every((step:any)=>(step.target===undefined||JSON.stringify(step.target)==='{"type":"open"}')&&!step.targets?.power&&!step.targets?.pace&&!step.targets?.hr));
  assert.equal(JSON.parse(row.originalPlan).ftp,undefined);
 }
});

test("unverified profile numbers never become route preview targets or measured training evidence",async()=>{
 const {state,run,profile}=fixture();profile.goal="cycle";Object.assign(profile,{ftp:200});
 const response=await run();assert.equal(response.status,200);const data=await response.json();
 const bikes=data.preview.weeksPreview.flatMap((week:any)=>week.sessions.filter((session:any)=>session.sport==="bike"));
 assert.ok(bikes.length>0);
 for(const session of bikes){assert.equal(session.targetPreview.mechanicalWork,null);assert.ok(session.targetPreview.steps.every((step:any)=>step.reference===null&&/RPE/.test(step.targetLabel)));}
 assert.equal(state.created.length,0);assert.equal(state.benchmarks.length,0);assert.equal(state.appliedAnchors.length,0);
});
