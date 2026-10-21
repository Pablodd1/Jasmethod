import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {createRequire} from "node:module";
import ts from "typescript";
import {dayBounds} from "./dates";
import {existingReviewResetHold,readExistingReviewResetAudits,type ExistingReviewResetAudit} from "./existing-review-reset-hold";
import {effectiveSessionFromRecords} from "./effective-prescription";

const require=createRequire(import.meta.url),now=new Date("2026-10-21T12:00Z"),date=new Date("2026-10-21T00:00Z");
const clearAnswers={sleep:4,soreness:1,motivation:4,energy:4,stress:1,sick:false,newPain:false,urgentSymptoms:false,availableMin:60};
const fullAdaptation={verdict:"full",durationFactor:1,intensityCap:"z7",safetyStatus:"clear"};
const snapshot=(answers:Record<string,unknown>={},adaptation:Record<string,unknown>={})=>({userId:"owner",date,answers:JSON.stringify(answers),adaptation:JSON.stringify(adaptation)});
const audit=(before=snapshot({sick:true}),extra:Partial<ExistingReviewResetAudit>={}):ExistingReviewResetAudit=>({id:"reset",subjectId:"owner",createdAt:new Date("2026-10-21T10:00Z"),before:JSON.stringify(before),...extra});
const assess=(extra:Record<string,any>={})=>existingReviewResetHold({athleteId:"owner",timezone:"UTC",now,pendingMinutes:30,workoutMinutes:30,audits:[audit()],...extra});
const full=(recordedAt="2026-10-21T11:00Z",extra:Record<string,unknown>={})=>snapshot({...clearAnswers,inputMetadata:{version:"checkin-safety-v1",source:"athlete-reported",observedOn:"2026-10-21",recordedAt,...extra}},fullAdaptation);

test("reset retains only known same-day symptoms, full recovery reductions and known time limits",()=>{
  for(const answers of [{sick:true},{newPain:true},{urgentSymptoms:true},{painAffectsMovement:true}])assert.equal(assess({audits:[audit(snapshot(answers))]}).required,true);
  for(const adaptation of [{...fullAdaptation,verdict:"trim",durationFactor:.5},{...fullAdaptation,verdict:"easy",intensityCap:"z2"},{...fullAdaptation,verdict:"rest",durationFactor:0}])assert.equal(assess({audits:[audit(snapshot(clearAnswers,adaptation))]}).required,true);
  assert.equal(assess({audits:[audit(snapshot({...clearAnswers,availableMin:0},fullAdaptation))]}).required,true);
  assert.equal(assess({audits:[audit(snapshot({...clearAnswers,availableMin:29},fullAdaptation))]}).required,true);
  for(const before of [snapshot(),snapshot({sick:null,urgentSymptoms:"true"},{verdict:"rest",safetyStatus:"unknown"}),snapshot(clearAnswers,fullAdaptation),snapshot({availableMin:null})])assert.equal(assess({audits:[audit(before)]}).required,false);
});

test("only later complete server-stamped full review resolves a reset; short, stale, missing and unknown answers cannot",()=>{
  const old=assess();assert.equal(old.required,true);assert.ok(old.revision);
  assert.equal(assess({checkin:full()}).required,false);
  for(const current of [full("2026-10-21T10:00Z"),full("2026-10-21T09:59Z"),full("2026-10-22T01:00Z"),
    full(undefined,{version:"existing-workout-review-v1",source:"athlete-confirmed-existing"}),
    full(undefined,{existingReview:{version:"existing-workout-review-v1"}}),full(undefined,{recordedAt:null}),full(undefined,{source:"unverified"}),full(undefined,{observedOn:"2026-10-20"}),
    snapshot({...clearAnswers,sleep:null,inputMetadata:{version:"checkin-safety-v1",source:"athlete-reported",observedOn:"2026-10-21",recordedAt:"2026-10-21T11:00Z"}},fullAdaptation)])assert.equal(assess({checkin:current}).required,true);
  assert.equal(assess({checkin:full(undefined,{source:"athlete-confirmed-voice"})}).required,false);
  assert.equal(assess({checkin:full(undefined,{source:"coach-entered"})}).required,false);
});

test("repeat resets cannot erase an unresolved hold; a later full review captured by reset can resolve the older marker",()=>{
  const unknown=audit(snapshot(),{id:"unknown-reset",createdAt:new Date("2026-10-21T11:30Z")});
  const empty=audit(snapshot(),{id:"empty-reset",createdAt:new Date("2026-10-21T11:31Z"),before:null});
  assert.equal(assess({audits:[empty,unknown,audit()]}).required,true);
  const cleared=audit(full(),{id:"reviewed-reset",createdAt:new Date("2026-10-21T11:30Z")});
  assert.equal(assess({audits:[cleared,audit()]}).required,false);
  const reduced=audit({...full(),adaptation:JSON.stringify({...fullAdaptation,verdict:"trim",durationFactor:.5})},{id:"reduced-reset",createdAt:new Date("2026-10-21T11:30Z")});
  assert.equal(assess({audits:[reduced,audit()]}).required,true,"newer reduction remains authoritative despite resolution of the older symptom marker");
});

test("reset holds are owner/day scoped and their revision participates in the selected session context",()=>{
  for(const row of [audit(undefined,{subjectId:"foreign"}),audit(undefined,{createdAt:new Date("2026-10-20T23:00Z")}),audit(snapshot({sick:true}),{before:JSON.stringify({...snapshot({sick:true}),date:new Date("2026-10-20T00:00Z")})}),audit(undefined,{createdAt:new Date("2026-10-21T13:00Z")})])assert.equal(assess({audits:[row]}).required,false);
  assert.equal(assess({audits:[audit({...snapshot({sick:true}),userId:"foreign"})]}).required,false);
  assert.notEqual(assess().revision,assess({checkin:full()}).revision);
  assert.equal(existingReviewResetHold({athleteId:"owner",timezone:"America/New_York",now:new Date("2026-10-21T02:00Z"),audits:[audit({...snapshot({sick:true}),date:new Date("2026-10-20T04:00Z")},{createdAt:new Date("2026-10-21T01:00Z")})],pendingMinutes:30,workoutMinutes:30}).required,true,"a late UTC timestamp belongs to the athlete's previous local date");
});

test("bounded reset reader scopes owner, local date, action and non-null snapshots; overflow requests full review without inferring illness",async()=>{
  let query:any;const db:any={auditLog:{findMany:async(q:any)=>{query=q;return [];}}};
  await readExistingReviewResetAudits("owner","America/New_York",db,now);
  assert.equal(query.where.subjectId,"owner");assert.equal(query.where.action,"checkin.undo");assert.equal(query.where.before.not,null);assert.equal(query.where.createdAt.gte.toISOString(),"2026-10-21T04:00:00.000Z");assert.equal(query.where.createdAt.lt.toISOString(),"2026-10-22T04:00:00.000Z");assert.equal(query.take,101);assert.equal(query.select.before,true);
  const overflow=assess({audits:Array.from({length:101},(_,i)=>audit(snapshot(),{id:String(i)}))});assert.equal(overflow.required,true);assert.match(overflow.reason!,/no symptoms.*inferred/);assert.equal(assess({audits:Array.from({length:101},(_,i)=>audit(snapshot(),{id:String(i)})),checkin:full()}).required,false);
});

function load(file:string,deps:Record<string,unknown>){const mod={exports:{}as any};const code=ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(code,{module:mod,exports:mod.exports,require:(id:string)=>id in deps?deps[id]:id.startsWith("@/lib/")?require(path.resolve("src/lib",id.slice(6)+".ts")):id.startsWith("./")?require(path.resolve(path.dirname(file),id+".ts")):require(id),Date,Response,Request,URL,console,setTimeout,clearTimeout});return mod.exports;}

test("actual DELETE cannot erase urgent history and turn a surviving prescription into a short-review executable workout",async()=>{
  const day=dayBounds("UTC"),audits:any[]=[];
  const workout:any={id:"saved",userId:"owner",source:"plan",date:day.start,planned:true,completed:false,approved:false,originalPlan:null,sport:"bike",type:"endurance",intensity:"z2",title:"Synthetic unchanged easy ride",durationMin:30,prescription:JSON.stringify({sport:"bike",verdict:"full",durationMin:30,steps:[{name:"Easy",seconds:1800,zone:"z2",phase:"active",target:{type:"open"}}]})};
  let checkin:any={id:"checkin",userId:"owner",date:day.start,answers:JSON.stringify({urgentSymptoms:true,sick:false,newPain:false}),adaptation:JSON.stringify({verdict:"rest",durationFactor:0,intensityCap:"z1",safetyStatus:"urgent"})};
  let writes=0;
  const resolve=()=>effectiveSessionFromRecords({userId:"owner",timezone:"UTC",now:new Date(),workout,profile:{ftp:200},checkin,planning:{ready:true,missing:[],review:[],ruleId:"synthetic"},maxDailyMinutes:60,currentPrescription:true,sameDaySessions:[workout],resetAudits:audits,revisionContext:{setupRevision:"synthetic-reviewed"}});
  const tx:any={trainingPlan:{findFirst:async()=>({id:"current"})},workout:{findMany:async(q:any)=>{assert.equal(q.where.originalPlan.not,null);return [];},update:async()=>{throw Error("Unexpected rewrite");},updateMany:async()=>({count:1})},dailyCheckin:{findUnique:async()=>checkin,deleteMany:async()=>{checkin=null;return{count:1};},upsert:async({create}:any)=>{writes++;return checkin={id:"new-checkin",...create};}},auditLog:{create:async({data}:any)=>{const row={id:String(audits.length),createdAt:new Date(Date.now()-1),...data};audits.push(row);return row;}}};
  class ApiError extends Error{constructor(message:string,public status=400){super(message);}}
  const prisma={$transaction:async(fn:any,options:any)=>{assert.equal(options.isolationLevel,"Serializable");return fn(tx);}};
  const route=load("src/app/api/checkin/route.ts",{"next/server":{NextResponse:Response},"@/lib/db":{prisma},"@/lib/access":{ApiError,trainingAccess:async()=>({actor:{id:"owner"},athlete:{id:"owner",timezone:"UTC"}}),errorResponse:(e:ApiError)=>Response.json({error:e.message},{status:e.status||500})}});
  assert.equal(resolve().existingReview.eligible,false);
  assert.equal((await route.DELETE(new Request("https://example.invalid/api/checkin",{method:"DELETE"}))).status,200);
  const after=resolve();assert.equal(after.existingReview.eligible,false);assert.notEqual(after.canonical.verdict,"ready");assert.match(after.canonical.reason,/restriction was reset/);assert.ok(workout.prescription);assert.equal(audits.length,1);assert.match(audits[0].before,/urgentSymptoms/);
  const service=load("src/lib/checkin-review-service.ts",{"./db":{prisma},"./access":{ApiError},"./effective-prescription":{effectivePrescription:async()=>resolve()}});
  await assert.rejects(service.reviewExistingWorkout("owner",{id:"owner",timezone:"UTC"},{sessionId:"saved",expectedRevision:after.canonical.revision,contextRevision:after.existingReview.contextRevision,noSymptoms:true,recoveryUnchanged:true,timeConfirmed:true,confirmed:true}),(error:any)=>error.status===422);
  assert.equal(writes,0);assert.equal(checkin,null);assert.equal(audits.length,1);
  checkin={userId:"owner",date:day.start,answers:JSON.stringify({...clearAnswers,inputMetadata:{version:"checkin-safety-v1",source:"athlete-reported",observedOn:day.key,recordedAt:new Date().toISOString()}}),adaptation:JSON.stringify(fullAdaptation)};
  const reviewed=resolve();assert.equal(reviewed.existingReview.eligible,true);assert.equal(reviewed.canonical.verdict,"ready");assert.notEqual(reviewed.existingReview.contextRevision,after.existingReview.contextRevision);
});
