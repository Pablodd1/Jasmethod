import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as draft from "./first-plan";
import * as dates from "./dates";
import * as adaptive from "./adaptive";
import * as evidence from "./activity-evidence";
import * as calendarWorkouts from "./calendar-workouts";
function fixture(){
  const state={plans:[] as any[],days:[] as any[],workouts:[] as any[],audits:[] as any[],queries:[] as any[],records:[] as any[],races:[] as any[],failAudit:false,conflicts:0};
  let owner="athlete-a",tail=Promise.resolve();
  const tx={
    $executeRaw:async(strings:TemplateStringsArray,id:string)=>{assert.equal(id,owner);assert.match(strings.join("?"),/pg_advisory_xact_lock/);return 1;},
    user:{findUnique:async({where}:any)=>{assert.equal(where.id,owner);return {id:owner,timezone:"UTC",language:"en",profile:{goal:"half",birthYear:1990}};}},
    trainingPlan:{findFirst:async({where}:any)=>state.plans.find(p=>p.userId===where.userId&&p.status==="active")??null,create:async({data}:any)=>{const row={...data,id:`p${state.plans.length}`,status:"active"};state.plans.push(row);return row;}},
    planDay:{create:async({data}:any)=>{const row={...data,id:`d${state.days.length}`};state.days.push(row);return row;}},
    workout:{findMany:async(query:any)=>{state.queries.push(query);assert.equal(query.where.userId,owner);return state.records;},create:async({data}:any)=>{state.workouts.push(data);return data;}},
    race:{findMany:async(query:any)=>{assert.equal(query.where.userId,owner);return state.races;}},
    auditLog:{create:async({data}:any)=>{if(state.failAudit)throw Error("Synthetic receipt failure");state.audits.push(data);return data;}},
  };
  const db={$transaction:async(fn:any,options:any)=>{
    assert.equal(options.isolationLevel,"Serializable");
    if(state.conflicts-->0)throw {code:"P2034"};
    // Synthetic serialization, not proof of PostgreSQL locking behavior.
    const prior=tail;let release!:()=>void;tail=new Promise(resolve=>release=resolve);await prior;
    const before={plans:[...state.plans],days:[...state.days],workouts:[...state.workouts],audits:[...state.audits]};
    try{return await fn(tx);}catch(error){Object.assign(state,before);throw error;}finally{release();}
  }};
  const deps:Record<string,any>={"./calendar-workouts":calendarWorkouts,"./db":{prisma:db},"./first-plan":draft,"./dates":dates,"./adaptive":adaptive,"./activity-evidence":evidence,"./planning-setup-store":{readPlanningSetup:async(id:string,transaction:any)=>{assert.equal(id,owner);assert.equal(transaction,tx);return{setup:null,revision:null};}}};
  const mod:any={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/first-plan-store.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,Date,require:(name:string)=>{if(!(name in deps))throw Error(name);return deps[name];}});
  return {state,run:()=>mod.exports.ensureFirstPlan(owner),setOwner:(id:string)=>{owner=id;}};
}
test("concurrent and repeated first entry produce one plan with seven days and held owner-only prescriptions",async()=>{
  const {state,run}=fixture();
  const responses=await Promise.all([run(),run(),run()]);
  assert.equal(responses.filter(r=>r.created).length,1);assert.equal(new Set(responses.map(r=>r.planId)).size,1);
  assert.equal(state.plans.length,1);assert.equal(state.days.length,7);assert.equal(state.audits.length,1);
  assert.equal(state.workouts.length,3);
  assert.equal(JSON.stringify(state.queries[0].where.AND),JSON.stringify([calendarWorkouts.currentOrReportedWorkoutWhere("athlete-a",null)]),"unperformed archived prescriptions are excluded; actual reports stay eligible");
  for(const row of state.workouts){assert.equal(row.userId,"athlete-a");assert.equal(row.approved,false);assert.equal(row.completed,false);assert.equal(JSON.parse(row.prescription).verdict,"rest");}
  assert.equal((await run()).created,false);
});
test("existing active plans including expired plans are retained without any creation",async()=>{
  const {state,run}=fixture();
  state.plans.push({id:"old-plan",userId:"athlete-a",distance:"cycle",status:"active",startDate:new Date("2020-01-01"),weeks:1});
  const result=await run();assert.equal(result.planId,"old-plan");assert.equal(result.created,false);
  assert.equal(state.days.length,0);assert.equal(state.queries.length,0);
});
test("receipt failure rolls back plan and workouts; bounded serializable retry rechecks existing state",async()=>{
  const {state,run}=fixture();state.failAudit=true;
  await assert.rejects(run(),/receipt failure/);assert.equal(state.plans.length,0);assert.equal(state.workouts.length,0);
  state.failAudit=false;state.conflicts=2;assert.equal((await run()).created,true);
  state.conflicts=3;await assert.rejects(run(),(error:any)=>error.code==="P2034");
});
test("another athlete never reuses the first athlete's plan or audit",async()=>{
  const {state,run,setOwner}=fixture();const first=await run();setOwner("athlete-b");const second=await run();
  assert.notEqual(first.planId,second.planId);assert.equal(state.plans.length,2);
  assert.equal(state.audits[1].actorId,"athlete-b");assert.equal(state.audits[1].subjectId,"athlete-b");
});
test("an occupied current workout date is preserved without duplicate work or a contradictory planned-rest flag",async()=>{
  const {state,run}=fixture(),today=dates.dayBounds("UTC");
  state.records.push({id:"saved-easy-run",userId:"athlete-a",date:today.start,source:"manual",sport:"run",planned:true,completed:false,actualDurationMin:null,feedbackStatus:null,rpe:null});
  const before=JSON.stringify(state.records);await run();
  const occupied=state.days.find(row=>dates.dateKey(row.date,"UTC")===today.key);
  assert.equal(occupied.dayOff,false);assert.equal(occupied.focus,"run");assert.equal(JSON.stringify(state.records),before);
  assert.ok(state.workouts.every(row=>dates.dateKey(row.date,"UTC")!==today.key),"No second workout assigned to occupied day");
  assert.ok(state.days.some(row=>row.dayOff===true),"Ordinary unassigned days retain rest semantics");
});
test("a protected race date and explicit starter rest do not become recorded training",async()=>{
  for(const explicitRest of [false,true]){
    const {state,run}=fixture(),today=dates.dayBounds("UTC");
    if(explicitRest)state.records.push({id:"known-rest",userId:"athlete-a",date:today.start,source:"starter-rest",sport:"recovery",planned:true,completed:false,actualDurationMin:null,feedbackStatus:null,rpe:null});
    else state.races.push({id:"race",name:"Synthetic event",date:today.start,priority:1,distance:"sprint"});
    await run();const day=state.days.find(row=>dates.dateKey(row.date,"UTC")===today.key);assert.equal(day.dayOff,true);assert.equal(day.focus,"recovery");
  }
});
